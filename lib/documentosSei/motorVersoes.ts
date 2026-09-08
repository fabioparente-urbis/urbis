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
import { ehContainerGenerico } from "./pecas";

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

/**
 * Título sem números — mesma técnica já usada nas telas para "só última versão de cada tipo", e a
 * CHAVE DE FAMÍLIA deste motor: "Processo digital - 42135097" e "Processo digital - 42135097-1"
 * caem os dois em "processo digital -", que é como o portão da Fase 4 os reconhece como a mesma
 * família.
 *
 * Exportada em 07/09/2026 (§23.5) para `lib/documentosSei/persistencia.ts` usar a MESMA chave ao
 * gravar o estado de um contêiner — se cada lado calculasse a sua, tela e banco voltariam a
 * divergir, que é exatamente o problema que aquela seção resolveu.
 */
export function tituloSemNumeros(titulo: string): string {
  return normalizar(titulo)
    .replace(/\b\d+([./-]\d+)*\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_ATO = /^(despacho|parecer|of[ií]cio|notifica[çc][ãa]o)\b/;

/**
 * Título genérico demais pra sustentar parentesco entre documentos (ver `agruparFamilias`).
 * Dois casos, o mesmo motivo:
 * (a) contêiner genérico do SEI — "Documentação", "Processo", "Solicitação", "Anexo": rótulo de
 *     lote, não de documento; dois lotes diferentes não são versões um do outro;
 * (b) título que, tirando os números, sobra UMA palavra ("Relatório") — não dá pra afirmar que
 *     dois "Relatório" são o mesmo documento em versões diferentes (no processo medido, um era
 *     registro fotográfico do fiscal e o outro a vistoria).
 */
function ehTituloGenerico(titulo: string): boolean {
  if (ehContainerGenerico(titulo)) return true;
  return tituloSemNumeros(titulo).split(/\s+/).filter(Boolean).length < 2;
}
const RE_SEM_EFEITO = /\bsem\s+efeito\b/;
const RE_SUBSTITUI = /\b(substitui|corrigid[oa]|retifica[çc][ãa]o|retifica)\b/;
const RE_VISTORIA = /\bvistoria\b/;

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * `EventoSei.data` é TEXTO em português, do jeito que o SEI escreve na página ("13 de abril de
 * 2026", às vezes com hora: "13 de abril de 2026, às 10:06") — ver `acharData` em `fatiar.ts`.
 *
 * BUG REAL corrigido em 07/09/2026 (auditoria): o tier 5 comparava essas strings DIRETAMENTE com
 * `>`, o que é ordem alfabética, não cronológica — "2 de dezembro de 2026" ganhava de "10 de
 * janeiro de 2027" porque "2" > "1". O efeito era eleger o documento MAIS ANTIGO como `vigente`,
 * com confiança "media" e o motivo escrito na tela dizendo "data mais recente da família" — o
 * oposto do que tinha acontecido. Passava despercebido sempre que os dias do mês por acaso
 * ordenassem junto com a cronologia (2 vs 9), que é o caso dos testes feitos até aqui.
 *
 * Devolve uma chave "AAAAMMDDHHMM" ordenável, ou `null` quando a data não casa o formato. `null`
 * NUNCA é tratado como "data antiga": quem chama desiste do tier 5 inteiro e cai pro tier 6
 * (ordem de página, confiança "baixa") — melhor admitir que não sabe do que ordenar no escuro.
 */
export function chaveOrdenavelData(texto: string | undefined): string | null {
  if (!texto) return null;
  const m = /\b(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+((?:19|20)\d{2})\b/i.exec(normalizar(texto));
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  const hora = /\bas\s+(\d{1,2})[:h](\d{2})\b/i.exec(normalizar(texto));
  return [
    m[3],
    String(mes).padStart(2, "0"),
    m[1].padStart(2, "0"),
    hora ? hora[1].padStart(2, "0") : "00",
    hora ? hora[2] : "00",
  ].join("");
}

/** Mesmo texto que `fatiar.ts` usa quando a página foi anexada sem carimbo próprio. */
const TITULO_HERDADO = "(herdado por continuidade)";

/**
 * Um mesmo documento do SEI pode chegar aqui em MAIS DE UM pedaço: quando uma página do meio dele
 * cai em revisão (rodapé contraditório, ou vizinhos discordando), `fatiarPdfSei` corta o evento no
 * buraco e recomeça depois — dois eventos, o MESMO `idSei`. São fragmentos do mesmo documento, não
 * duas versões dele: sem unificar, a família enxergaria "dois documentos iguais" e marcaria um
 * como `substituido` pelo outro, que é falso e apareceria assim na tela do analista.
 *
 * Unifica pelo `idSei` (a identidade real do documento no SEI), somando o intervalo de páginas e
 * aproveitando o primeiro título/setor/data/assinante de verdade que aparecer — fragmento herdado
 * por continuidade não tem título próprio.
 */
function unificarFragmentos(eventos: EventoSei[]): EventoSei[] {
  const porId = new Map<string, EventoSei>();
  for (const ev of eventos) {
    const existente = porId.get(ev.idSei);
    if (!existente) { porId.set(ev.idSei, { ...ev }); continue; }
    existente.paginaIni = Math.min(existente.paginaIni, ev.paginaIni);
    existente.paginaFim = Math.max(existente.paginaFim, ev.paginaFim);
    if (existente.titulo === TITULO_HERDADO && ev.titulo !== TITULO_HERDADO) existente.titulo = ev.titulo;
    existente.setor ??= ev.setor;
    existente.data ??= ev.data;
    existente.assinante ??= ev.assinante;
  }
  return [...porId.values()];
}

/**
 * Agrupa eventos em famílias (mesmo tipo de documento). Atos numerados (despacho/parecer/
 * ofício/notificação) NUNCA agrupam entre si — "despachos sucessivos são atos, não versões"
 * (plano §6 Fase 4) — cada um é sua própria família de 1.
 */
export function agruparFamilias(eventosBrutos: EventoSei[]): EventoSei[][] {
  const eventos = unificarFragmentos(eventosBrutos);
  const familias = new Map<string, EventoSei[]>();
  const avulsos: EventoSei[][] = [];
  for (const ev of eventos) {
    const norm = normalizar(ev.titulo);
    if (RE_ATO.test(norm)) {
      avulsos.push([ev]);
      continue;
    }
    /**
     * BUG REAL corrigido em 08/09/2026 (medido no processo 24.5.000024350-0, contra a lista de
     * documentos que o analista monta à mão): título GENÉRICO não é família.
     *
     * As cinco "Documentação" do processo caíam todas na mesma chave e quatro eram declaradas
     * `substituido` — só que cada "Documentação" é um LOTE DIFERENTE, entregue em data diferente:
     * a de pg. 4-37 traz ART/certidão/embargo, a de pg. 110-129 traz o laudo. Nenhuma substitui a
     * outra. O estrago era triplo: a tela mostrava "⚫ Substituído" em documento válido, o
     * "pacote vigente" deixava esses documentos de fora, e o cache do navegador (que descarta o
     * superado) apagaria justamente o que o analista mais precisa.
     *
     * Mesmo princípio do módulo ("nunca declarar vigente no escuro") aplicado ao outro lado:
     * nunca declarar SUBSTITUÍDO no escuro. Sem sinal textual que sustente parentesco, cada
     * documento é sua própria família de 1 — e família de 1 é sempre vigente.
     */
    if (ehTituloGenerico(ev.titulo)) {
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
  } else if (ordenada.every((ev) => chaveOrdenavelData(ev.data) !== null)) {
    // tier 5: data — só quando TODA a família tem data que o parser entendeu de verdade. Uma data
    // ilegível na família derruba o tier inteiro (cai pro tier 6, confiança "baixa"), em vez de
    // comparar contra `undefined` e fingir que decidiu.
    const chaves = ordenada.map((ev) => chaveOrdenavelData(ev.data)!);
    const maisRecente = chaves.reduce((acc, chave, i) => (chave > chaves[acc] ? i : acc), 0);
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
