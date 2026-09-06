/**
 * lib/documentosSei/motorVersoes.ts — Fase 4 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6). Resolve o ESTADO de cada evento fatiado (Fase 1)
 * dentro de uma família de documentos do mesmo tipo — vigente, substituído, sem efeito, histórico
 * — seguindo a ordem de confiança do plano.
 *
 * ESCOPO DESTA VERSÃO (decisão de implementação, registrada aqui em vez de silenciosa): o plano
 * original desenhava isto como extensão de `mhd_versoes` (banco), mas o Organizador de PDF SEI
 * hoje NÃO cria uma linha de `mhd_documentos`/`mhd_versoes` por documento — grava só 1 evento por
 * organização em `mhd_eventos` (§16.3), com o índice inteiro no `detalhe` (jsonb). Criar
 * identidade de documento persistente por peça (across múltiplos uploads do mesmo processo, dias
 * depois) é decisão de arquitetura nova, do mesmo tipo das D1-D4 do plano (§4) — não tomada aqui.
 * Este módulo resolve o estado DENTRO DE UM ÚNICO fatiamento (uma sessão, um PDF), que já cobre os
 * dois casos do portão da fase (§6): o despacho "SEM EFEITO" e a família 42135097/42135097-1 são
 * ambos do MESMO PDF. Persistir o estado entre sessões fica para quando a Fase 7 (retorno
 * incremental) decidir como uma versão sobrevive entre uploads diferentes.
 *
 * `resolverEstados` opera sobre EVENTOS (nível 1, `fatiar.ts`). Peças (nível 2, `pecas.ts`) têm
 * resolução própria em `resolverEstadosPecas`, mais simples: a identidade agora existe (Fase 6,
 * `lib/documentosSei/persistencia.ts` — papel é o "escopo" da família, compartilhado entre
 * contêineres e entre uploads), mas peças não têm título próprio nem "sem efeito"/"substitui"
 * explícito pra usar como sinal — só a ordem de página (tier 6), por isso a confiança nunca passa
 * de "baixa" quando há mais de uma peça do mesmo papel no fatiamento.
 *
 * Implementa os níveis 1-3, 5 e 6 da ordem de confiança do plano (sem efeito explícito, substitui
 * explícito, referência ao anterior, data, ordem do evento SEI). Níveis 4 (mesmo número com
 * revisão posterior) e 7 (hash idêntico) exigem dado que não existe neste nível (número de revisão
 * do documento, conteúdo de página) — ficam para quando a Fase 3/7 expuserem isso. Níveis 8-9
 * (visual, humano) NUNCA são implementados por design — a regra é "nunca declarar vigente no
 * escuro": quando só resta a ordem do evento (tier 6, o mais fraco usado aqui), a confiança
 * devolvida é "baixa", nunca "alta", para a tela sinalizar ao analista que aquilo pede conferência.
 *
 * Zero IA, zero rede, puro — roda igual no servidor ou no navegador (Fase 5 usa isto no cliente).
 */
import type { EventoSei } from "./fatiar";

export type EstadoVersao =
  | "vigente"
  | "substituido"
  | "complementar"
  | "sem_efeito"
  | "historico"
  | "duplicado"
  | "pendente";

export type ResolucaoVersao = {
  idSei: string;
  titulo: string;
  estado: EstadoVersao;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
  /** idSei do documento que este substitui, quando aplicável */
  substitui?: string;
};

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Título sem números — mesma técnica já usada nas telas para "só última versão de cada tipo". */
function tituloSemNumeros(titulo: string): string {
  return normalizar(titulo)
    .replace(/\b\d+([./-]\d+)*\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_ATO = /^(despacho|parecer|of[ií]cio|notifica[çc][ãa]o)\b/;
const RE_SEM_EFEITO = /\bsem\s+efeito\b/;
const RE_SUBSTITUI = /\b(substitui|corrigid[oa]|retifica[çc][ãa]o|retifica)\b/;
const RE_VISTORIA = /\bvistoria\b/;

/**
 * Agrupa eventos em famílias (mesmo tipo de documento). Atos numerados (despacho/parecer/
 * ofício/notificação) NUNCA agrupam entre si — "despachos sucessivos são atos, não versões"
 * (plano §6 Fase 4) — cada um é sua própria família de 1.
 */
export function agruparFamilias(eventos: EventoSei[]): EventoSei[][] {
  const familias = new Map<string, EventoSei[]>();
  const avulsos: EventoSei[][] = [];
  for (const ev of eventos) {
    const norm = normalizar(ev.titulo);
    if (RE_ATO.test(norm)) {
      avulsos.push([ev]);
      continue;
    }
    const chave = tituloSemNumeros(ev.titulo);
    const grupo = familias.get(chave);
    if (grupo) grupo.push(ev);
    else familias.set(chave, [ev]);
  }
  return [...familias.values(), ...avulsos];
}

/**
 * Resolve o estado de uma família já agrupada (ordem: como veio, tipicamente por posição no PDF —
 * quem chama normalmente já recebe em ordem de página, que é a ordem do evento SEI, tier 6).
 */
function resolverFamilia(familia: EventoSei[]): ResolucaoVersao[] {
  if (familia.length === 1) {
    const ev = familia[0];
    const norm = normalizar(ev.titulo);
    if (RE_SEM_EFEITO.test(norm)) {
      return [{ idSei: ev.idSei, titulo: ev.titulo, estado: "sem_efeito", confianca: "alta", motivo: "\"sem efeito\" explícito no título do documento" }];
    }
    return [{ idSei: ev.idSei, titulo: ev.titulo, estado: "vigente", confianca: "alta", motivo: "documento único da família, sem sinal de substituição" }];
  }

  const ordenada = [...familia].sort((a, b) => a.paginaFim - b.paginaFim);
  const ehVistoria = RE_VISTORIA.test(normalizar(ordenada[0].titulo));

  const resultado: ResolucaoVersao[] = [];
  let indiceVigente = ordenada.length - 1; // tier 6 (ordem do evento): o último por padrão
  let confiancaVigente: "alta" | "media" | "baixa" = "baixa"; // tier 6 sozinho nunca é "alta"
  let motivoVigente = "último da família na ordem do PDF (nenhum sinal textual mais forte encontrado)";

  // tier 1: sem efeito explícito marca ESSE item, não decide o vigente sozinho
  const semEfeito = new Set<number>();
  ordenada.forEach((ev, i) => { if (RE_SEM_EFEITO.test(normalizar(ev.titulo))) semEfeito.add(i); });

  // tier 2: "substitui"/"corrigido"/"retificação" explícito — o que traz a palavra vira o vigente
  const idxSubstitui = ordenada.findIndex((ev) => RE_SUBSTITUI.test(normalizar(ev.titulo)));
  if (idxSubstitui >= 0 && !semEfeito.has(idxSubstitui)) {
    indiceVigente = idxSubstitui;
    confiancaVigente = "alta";
    motivoVigente = "traz \"substitui\"/\"corrigido\"/\"retificação\" explícito no título";
  } else if (ehVistoria) {
    // "vistorias sucessivas são histórico" — a mais recente é vigente, confiança média (é regra
    // de negócio explícita do plano, não só ordem de página)
    confiancaVigente = "media";
    motivoVigente = "vistoria mais recente da família (vistorias sucessivas nunca são \"a mesma versão\", mas a última é a que vale)";
  } else if (ordenada.every((ev) => ev.data)) {
    // tier 5: data, quando toda a família tem data extraída
    const maisRecente = ordenada.reduce((acc, ev, i) => (i === 0 || (ev.data ?? "") > (ordenada[acc].data ?? "") ? i : acc), 0);
    indiceVigente = maisRecente;
    confiancaVigente = "media";
    motivoVigente = "data de assinatura mais recente da família";
  }

  // o candidato a vigente não pode ser um item marcado "sem efeito" — recua pro anterior que não
  // esteja; se todos estiverem, a família inteira fica pendente (sinal contraditório, nunca chuta)
  while (indiceVigente >= 0 && semEfeito.has(indiceVigente)) indiceVigente--;
  if (indiceVigente < 0) {
    return ordenada.map((ev) => ({
      idSei: ev.idSei, titulo: ev.titulo, estado: "pendente" as const, confianca: "baixa" as const,
      motivo: "todos os documentos da família estão marcados \"sem efeito\" — sinal contraditório, analista decide",
    }));
  }

  ordenada.forEach((ev, i) => {
    if (semEfeito.has(i)) {
      resultado.push({ idSei: ev.idSei, titulo: ev.titulo, estado: "sem_efeito", confianca: "alta", motivo: "\"sem efeito\" explícito no título do documento" });
      return;
    }
    if (i === indiceVigente) {
      resultado.push({ idSei: ev.idSei, titulo: ev.titulo, estado: "vigente", confianca: confiancaVigente, motivo: motivoVigente });
      return;
    }
    const vigenteAtual = ordenada[indiceVigente];
    resultado.push({
      idSei: ev.idSei,
      titulo: ev.titulo,
      estado: ehVistoria ? "historico" : "substituido",
      confianca: confiancaVigente,
      motivo: ehVistoria ? "vistoria anterior da mesma família" : `substituído por ${vigenteAtual.idSei} (${vigenteAtual.titulo})`,
    });
  });
  // `substitui` só faz sentido no vigente, apontando pra quem ficou pra trás na família
  const vigenteFinal = resultado[indiceVigente];
  if (vigenteFinal.estado === "vigente") {
    vigenteFinal.substitui = ordenada.filter((_, i) => i !== indiceVigente).map((ev) => ev.idSei).join(", ") || undefined;
  }
  return resultado;
}

/** Agrupa e resolve todas as famílias de uma vez — função de conveniência para as telas. */
export function resolverEstados(eventos: EventoSei[]): ResolucaoVersao[] {
  return agruparFamilias(eventos).flatMap(resolverFamilia);
}

/** Uma peça de contêiner (`pecas.ts`), com o suficiente pra resolver estado por família de papel. */
export type AlvoPeca = { chave: string; idSei: string; paginaIni: number; paginaFim: number };

/**
 * Resolve estado de PEÇAS agrupadas por papel (`chave`) — todas as peças do mesmo papel no
 * fatiamento inteiro (podem vir de contêineres diferentes) formam uma família. Só o tier 6 (ordem
 * de página) está disponível — peça não carrega título/data próprios — por isso a confiança nunca
 * passa de "baixa" quando a família tem mais de um membro.
 */
export function resolverEstadosPecas(pecas: AlvoPeca[]): (ResolucaoVersao & { chave: string; paginaIni: number; paginaFim: number })[] {
  const porPapel = new Map<string, AlvoPeca[]>();
  for (const p of pecas) {
    const grupo = porPapel.get(p.chave);
    if (grupo) grupo.push(p); else porPapel.set(p.chave, [p]);
  }

  const resultado: (ResolucaoVersao & { chave: string; paginaIni: number; paginaFim: number })[] = [];
  for (const [chave, grupo] of porPapel) {
    const ordenado = [...grupo].sort((a, b) => a.paginaFim - b.paginaFim);
    ordenado.forEach((p, i) => {
      const vigente = i === ordenado.length - 1;
      resultado.push({
        chave, idSei: p.idSei, titulo: chave, paginaIni: p.paginaIni, paginaFim: p.paginaFim,
        estado: vigente ? "vigente" : "substituido",
        confianca: ordenado.length > 1 ? "baixa" : "alta",
        motivo: ordenado.length === 1
          ? "única ocorrência deste papel no fatiamento"
          : vigente
            ? "última ocorrência deste papel na ordem do PDF (peça não tem título/data próprios pra sinal mais forte)"
            : "substituída pela ocorrência mais recente deste mesmo papel no PDF",
      });
    });
  }
  return resultado;
}
