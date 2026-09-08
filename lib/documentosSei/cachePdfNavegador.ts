/**
 * lib/documentosSei/cachePdfNavegador.ts — o PDF único do SEI que o analista solta no
 * Organizador passa a ficar guardado no PRÓPRIO NAVEGADOR (IndexedDB), não mais só na memória da
 * aba. Pedido do Fábio (08/09/2026): reabrir um processo não deveria perder o arquivo e
 * desabilitar "Abrir"/"Baixar" — mas o servidor continua NUNCA guardando o PDF (regra de
 * `docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md`, "MHD nunca guarda arquivo pesado").
 *
 * Prazo de validade: 180 dias (pedido dele). Depois disso, o arquivo é descartado — só o índice
 * (MHD) continua existindo. localStorage não serve aqui (limite de poucos MB; um PDF de processo
 * mesclado do SEI passa fácil de 100MB) — IndexedDB aceita Blob nativamente e tem quota de disco,
 * não de memória.
 *
 * Módulo compartilhado entre os dois Organizadores (Regularização e Aceite SEI), mesmo padrão de
 * lib/documentosSei/fatiar.ts: é infraestrutura técnica genérica (não conhece slot, não decide
 * nada de negócio), então a regra de isolamento entre slots não se aplica aqui.
 */

const DB_NOME = "urbis_documentos_sei";
const DB_VERSAO = 1;
const LOJA = "pdfs";
const VALIDADE_MS = 180 * 24 * 60 * 60 * 1000; // 180 dias

/**
 * Teto de processos guardados ao mesmo tempo. Um PDF mesclado do SEI tem ~100MB (medido:
 * 98MB/186 páginas, quase tudo digitalização), então guardar sem limite encheria o disco do
 * analista em algumas dezenas de processos. Ao passar do teto, sai o mais ANTIGO por data de
 * guarda — quem está sendo analisado agora é sempre o que fica.
 *
 * O que sai do cache não se perde: o índice continua no MHD e o PDF continua com o analista —
 * ele só precisa soltar o arquivo de novo se voltar a um processo antigo.
 */
const MAX_PROCESSOS = 5;

type RegistroPdf = {
  processoCodigo: string;
  nome: string;
  tipo: string;
  blob: Blob;
  guardadoEm: number;
  /**
   * Índice REMAPEADO para o PDF guardado (pedido do Fábio, 08/09/2026: "besteira guardar partes
   * do PDF substituídas... sempre manter apenas a última versão de cada um"). O que vai pro
   * navegador é só as páginas dos documentos vigentes, então a numeração de página muda — e o
   * índice tem que vir junto, senão "Abrir pg. 130" abriria outra página. Sem isso o cache seria
   * inutilizável; com isso, quem recupera do cache usa ESTE índice, não o do MHD.
   */
  indice?: unknown;
};

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        db.createObjectStore(LOJA, { keyPath: "processoCodigo" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Guarda o PDF deste processo, substituindo qualquer versão anterior guardada. `indice` é o
 * índice remapeado que corresponde EXATAMENTE ao PDF guardado (ver `RegistroPdf.indice`).
 */
export async function salvarPdfNavegador(processoCodigo: string, arquivo: File, indice?: unknown): Promise<void> {
  try {
    const db = await abrirDb();
    const registro: RegistroPdf = {
      processoCodigo, nome: arquivo.name, tipo: arquivo.type,
      blob: arquivo, guardadoEm: Date.now(), indice,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readwrite");
      tx.objectStore(LOJA).put(registro);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await podarAntigos();
  } catch {
    // Falha ao guardar (quota do navegador, modo privado, etc.) nunca deve quebrar o fluxo
    // normal — o Organizador simplesmente volta a pedir o PDF de novo na próxima abertura.
  }
}

/** Mantém no máximo `MAX_PROCESSOS` guardados; o mais antigo sai primeiro. */
async function podarAntigos(): Promise<void> {
  try {
    const db = await abrirDb();
    const registros = await new Promise<{ processoCodigo: string; guardadoEm: number }[]>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readonly");
      const req = tx.objectStore(LOJA).getAll();
      req.onsuccess = () =>
        resolve((req.result as RegistroPdf[]).map((r) => ({ processoCodigo: r.processoCodigo, guardadoEm: r.guardadoEm })));
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (registros.length <= MAX_PROCESSOS) return;
    const excedentes = registros
      .sort((a, b) => a.guardadoEm - b.guardadoEm)
      .slice(0, registros.length - MAX_PROCESSOS);
    for (const r of excedentes) await removerPdfNavegador(r.processoCodigo);
  } catch {
    // poda é higiene, não correção — falhar aqui nunca pode custar a gravação que acabou de dar certo.
  }
}

/**
 * Recupera o PDF deste processo, se ainda existir e estiver dentro do prazo de validade.
 * Expirado (>180 dias) é apagado e tratado como ausente — "depois disso fica só no MHD".
 */
export async function carregarPdfNavegador(
  processoCodigo: string,
): Promise<{ arquivo: File; indice?: unknown } | null> {
  try {
    const db = await abrirDb();
    const registro = await new Promise<RegistroPdf | undefined>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readonly");
      const req = tx.objectStore(LOJA).get(processoCodigo);
      req.onsuccess = () => resolve(req.result as RegistroPdf | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!registro) { db.close(); return null; }

    if (Date.now() - registro.guardadoEm > VALIDADE_MS) {
      await removerPdfNavegador(processoCodigo);
      db.close();
      return null;
    }
    db.close();
    return {
      arquivo: new File([registro.blob], registro.nome, { type: registro.tipo }),
      indice: registro.indice,
    };
  } catch {
    return null;
  }
}

export async function removerPdfNavegador(processoCodigo: string): Promise<void> {
  try {
    const db = await abrirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOJA, "readwrite");
      tx.objectStore(LOJA).delete(processoCodigo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // idem — remoção que falha não é motivo pra travar tela nenhuma.
  }
}
