/**
 * lib/offline/armazem.ts — URBIS OFFLINE, Etapa 1 (estudo em docs/URBIS_OFFLINE_ESTUDO_VIABILIDADE.md).
 *
 * Infraestrutura GENÉRICA, sem regra de slot: guarda no IndexedDB do navegador
 *   - `copias`: cópia de consulta do que já foi baixado (vale 180 dias — decisão R4, 22/09/2026);
 *   - `fila`: o que o analista salvou sem o servidor responder. NÃO vence (R4: "pendência não vence");
 *   - `descartados`: o que o analista mandou descartar num conflito. Fica guardado para a Lixeira
 *     do admin (aba "Offline" — ainda a construir; nada é destruído enquanto isso).
 * Tudo indexado por usuário: um analista nunca enxerga o que é de outro no mesmo computador.
 * Falha de IndexedDB (quota, modo privado) nunca derruba a tela — o pior caso é não ter offline.
 */

const DB_NOME = "urbis_offline";
const DB_VERSAO = 1;
export const VALIDADE_COPIA_MS = 180 * 24 * 60 * 60 * 1000;

export type Campos = Record<string, { valor?: unknown; origem?: unknown; fonte?: unknown } | undefined>;

export type CopiaLocal = {
  chave: string;
  usuarioId: string;
  dados: unknown;
  guardadoEm: number;
};

export type EstadoItem = "pendente" | "aguarda_login" | "conflito" | "recusado";

export type ConflitoCampo = { campo: string; local: unknown; servidor: unknown };

export type ItemFila = {
  chave: string;
  usuarioId: string;
  /** rota que recebe o POST (a MESMA de sempre — a fila guarda a ação, não uma cópia da tabela) */
  rota: string;
  /** POST (padrão, ficha do LIP) ou PUT (checklist do MAC) */
  metodo?: "POST" | "PUT";
  /** como achar, na resposta de `rotaConferir`, o que o servidor tem hoje: "ficha" = data.dados;
   * "mac" = data[].itens da análise cujo id é `corpo.id` */
  conferir?: "ficha" | "mac";
  /** nome curto para o selo ("Processo X", "Checklist do processo X") */
  rotulo?: string;
  /** rota GET que devolve o estado atual do servidor, para detectar mudança no meio do caminho */
  rotaConferir: string;
  corpo: { dados?: Campos } & Record<string, unknown>;
  /** valor de cada campo quando foi baixado (a "base" do aviso de conflito — decisão R2) */
  base: Record<string, unknown>;
  estado: EstadoItem;
  conflitos?: ConflitoCampo[];
  motivo?: string;
  /** momento do CLIQUE (não da sincronização) — para o MRP/MAP quando o servidor passar a aceitar */
  criadoEm: number;
  atualizadoEm: number;
};

export type Descartado = { id?: number; usuarioId: string; item: ItemFila; descartadoEm: number; motivo: string };

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("sem indexedDB"));
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("copias")) db.createObjectStore("copias", { keyPath: "chave" });
      if (!db.objectStoreNames.contains("fila")) db.createObjectStore("fila", { keyPath: "chave" });
      if (!db.objectStoreNames.contains("descartados")) db.createObjectStore("descartados", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(loja: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(loja, modo);
      const r = fn(t.objectStore(loja));
      t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const chaveCopia = (uid: string, tipo: string, id: string) => `${uid}|${tipo}|${id}`;

export function avisarMudanca() {
  try { window.dispatchEvent(new Event("urbis-offline-mudou")); } catch { /* SSR */ }
}

// ---------- cópias de consulta ----------
export async function guardarCopia(uid: string, tipo: string, id: string, dados: unknown): Promise<void> {
  try {
    const reg: CopiaLocal = { chave: chaveCopia(uid, tipo, id), usuarioId: uid, dados, guardadoEm: Date.now() };
    await tx("copias", "readwrite", (s) => s.put(reg));
  } catch { /* melhor esforço */ }
}

export async function lerCopia(uid: string, tipo: string, id: string): Promise<CopiaLocal | null> {
  try {
    const r = (await tx<CopiaLocal>("copias", "readonly", (s) => s.get(chaveCopia(uid, tipo, id)))) ?? null;
    if (!r) return null;
    if (Date.now() - r.guardadoEm > VALIDADE_COPIA_MS) return null; // 180 dias: só a cópia de consulta vence
    return r;
  } catch { return null; }
}

/** Logout (R4): apaga as cópias de consulta DESTE usuário. A fila NÃO é tocada — pendência não se perde. */
export async function apagarCopiasDoUsuario(uid: string): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("copias", "readwrite");
      const s = t.objectStore("copias");
      const cur = s.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        if ((c.value as CopiaLocal).usuarioId === uid) c.delete();
        c.continue();
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  } catch { /* melhor esforço */ }
}

// ---------- fila ----------
export async function lerItem(chave: string): Promise<ItemFila | null> {
  try { return (await tx<ItemFila>("fila", "readonly", (s) => s.get(chave))) ?? null; } catch { return null; }
}

export async function gravarItem(item: ItemFila): Promise<void> {
  await tx("fila", "readwrite", (s) => s.put(item));
  avisarMudanca();
}

export async function removerItem(chave: string): Promise<void> {
  try { await tx("fila", "readwrite", (s) => s.delete(chave)); } catch { /* */ }
  avisarMudanca();
}

export async function listarFila(uid: string): Promise<ItemFila[]> {
  try {
    const todos = (await tx<ItemFila[]>("fila", "readonly", (s) => s.getAll())) ?? [];
    return todos.filter((i) => i.usuarioId === uid).sort((a, b) => a.criadoEm - b.criadoEm);
  } catch { return []; }
}

export async function guardarDescartado(uid: string, item: ItemFila, motivo: string): Promise<void> {
  const reg: Descartado = { usuarioId: uid, item, descartadoEm: Date.now(), motivo };
  await tx("descartados", "readwrite", (s) => s.add(reg));
}
