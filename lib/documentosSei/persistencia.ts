/**
 * lib/documentosSei/persistencia.ts — Passo 0 das Fases 6/7 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §20). Até aqui o Organizador de PDF SEI só gravava 1
 * evento por organização em `mhd_eventos` (JSON solto) — este módulo passa a criar
 * `mhd_documentos`/`mhd_versoes` DE VERDADE, por documento, reaproveitando o modelo que o MHD já
 * tem para o Slot 5 (`acharOuCriarDocumento`/`acharOuCriarConteudo`, agora exportadas de
 * `lib/mhd.ts`) — sem tocar `registrarLeitura` (Slot 5, outro slot, sem pedido pra mexer nele).
 *
 * IDENTIDADE DOS DOCUMENTOS DO SEI:
 * - Atos (despacho/parecer/ofício/notificação — nunca versionam, cada um é permanente):
 *   `papel = <tipo>`, `escopo = idSei`. Reimportar o mesmo PDF gera o mesmo idSei + mesmo hash de
 *   conteúdo → dedup de `acharOuCriarConteudo` → zero versão nova.
 * - Demais papéis (projeto, art_levantamento, art_caixa, matrícula, laudo, vistoria, foto,
 *   certidão, levantamento, memorial, procuração, embargo — `lib/documentosSei/pecas.ts`):
 *   `papel = <papel>`, `escopo = ""` — um "slot" por papel por processo (como o LIP já consome:
 *   1 campo, 1 valor). Documento corrigido (idSei novo, mesmo papel) vira VERSÃO nova do mesmo
 *   `mhd_documentos`. Caso raro de dois documentos reais do mesmo papel na mesma remessa cai em
 *   `pendente` (`lib/documentosSei/motorVersoes.ts`) — limitação conhecida, registrada no plano.
 *
 * HASH ESTÁVEL: sobre o TEXTO extraído normalizado das páginas (não sobre bytes de PDF recortado —
 * recortar de novo no cliente com pdf-lib gera bytes diferentes a cada vez, quebraria a dedup).
 *
 * ALERTA DE INTEGRIDADE (parte do portão da Fase 7): mesmo idSei + mesmo papel com hash diferente
 * de uma vez já visto nunca sobrescreve em silêncio — vira aviso na tela.
 */
import { createHash } from "crypto";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { acharOuCriarConteudo, acharOuCriarDocumento } from "@/lib/mhd";
import { lerPaginasIntervalo, type EventoSei, type LeitorPdf, type PaginaTexto } from "./fatiar";
import { ehContainerGenerico, classificarTitulo, type PecaSei } from "./pecas";
import { resolverEstados, resolverEstadosPecas, type ResolucaoVersao } from "./motorVersoes";

const RE_ATO = /^\s*(despacho|parecer|of[ií]cio|notifica[çc][ãa]o)\b/;

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tipoAto(titulo: string): string | null {
  const m = RE_ATO.exec(normalizar(titulo));
  return m ? m[1] : null;
}

/** SHA-256 sobre o texto das páginas, normalizado — estável entre reuploads do mesmo conteúdo. */
export function hashConteudo(paginas: Pick<PaginaTexto, "texto">[]): string {
  const normalizado = paginas.map((p) => p.texto.trim().replace(/\s+/g, " ").toLowerCase()).join("\n");
  return createHash("sha256").update(normalizado, "utf8").digest("hex");
}

type ItemParaPersistir = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  papel: string;
  escopo: string;
  estadoResolucao?: Pick<ResolucaoVersao, "estado" | "motivo" | "confianca">;
};

export type ResumoPersistencia = {
  documentosNovos: number;
  versoesNovas: number;
  inalterados: number;
  alertasIntegridade: { idSei: string; papel: string; motivo: string }[];
  problemas: string[];
};

/**
 * Monta a lista de itens a persistir a partir dos eventos já fatiados (Fase 1) e abertos em peças
 * (Fase 3). Contêineres em si NUNCA são persistidos como documento — só as peças de dentro deles
 * (o contêiner é só um bolso, não um documento com identidade própria).
 */
function construirItens(eventos: (EventoSei & { pecas?: PecaSei[] })[]): ItemParaPersistir[] {
  const eventosNaoContainer = eventos.filter((ev) => !ehContainerGenerico(ev.titulo));
  const estadosEventos = resolverEstados(eventosNaoContainer);
  const estadoPorIdSei = new Map(estadosEventos.map((r) => [r.idSei, r]));

  const itens: ItemParaPersistir[] = [];
  for (const ev of eventosNaoContainer) {
    const ato = tipoAto(ev.titulo);
    const papel = ato ?? classificarTitulo(ev.titulo) ?? "outro";
    const escopo = ato || papel === "outro" ? ev.idSei : "";
    itens.push({
      idSei: ev.idSei, titulo: ev.titulo, paginaIni: ev.paginaIni, paginaFim: ev.paginaFim,
      papel, escopo, estadoResolucao: estadoPorIdSei.get(ev.idSei),
    });
  }

  // peças de TODOS os contêineres do fatiamento, agrupadas por papel (família cruza contêineres)
  const pecasParaResolver: { chave: string; idSei: string; paginaIni: number; paginaFim: number }[] = [];
  const origemPeca = new Map<string, { idSei: string; tituloContainer: string; peca: PecaSei }>();
  for (const ev of eventos) {
    if (!ehContainerGenerico(ev.titulo)) continue;
    for (const peca of ev.pecas ?? []) {
      if (peca.papel === "classificacao_pendente") continue; // nunca inventa identidade pra pendência
      const chaveAlvo = `${peca.papel}#${peca.paginaIni}`;
      pecasParaResolver.push({ chave: peca.papel, idSei: ev.idSei, paginaIni: peca.paginaIni, paginaFim: peca.paginaFim });
      origemPeca.set(chaveAlvo, { idSei: ev.idSei, tituloContainer: ev.titulo, peca });
    }
  }
  const estadosPecas = resolverEstadosPecas(pecasParaResolver);
  for (const res of estadosPecas) {
    const origem = origemPeca.get(`${res.chave}#${res.paginaIni}`);
    if (!origem) continue;
    itens.push({
      idSei: origem.idSei,
      titulo: `${origem.tituloContainer} — peça (${res.chave})`,
      paginaIni: origem.peca.paginaIni, paginaFim: origem.peca.paginaFim,
      papel: res.chave, escopo: "",
      estadoResolucao: { estado: res.estado, motivo: res.motivo, confianca: res.confianca },
    });
  }

  return itens;
}

export async function persistirDocumentosVivos(args: {
  /** o mesmo `leitor` já devolvido por `fatiarPdfSei` — NUNCA abrir o PDF de novo aqui (ver
   *  comentário de `LeitorPdf` em fatiar.ts: `getDocument` só roda uma vez por requisição). */
  leitor: LeitorPdf;
  processoCodigo: string;
  assuntoId: string | null;
  usuarioId: string | null;
  eventos: (EventoSei & { pecas?: PecaSei[] })[];
}): Promise<ResumoPersistencia> {
  const resumo: ResumoPersistencia = { documentosNovos: 0, versoesNovas: 0, inalterados: 0, alertasIntegridade: [], problemas: [] };
  const itens = construirItens(args.eventos);

  for (const item of itens) {
    const paginas = await lerPaginasIntervalo(args.leitor, item.paginaIni, item.paginaFim);
    const hash = hashConteudo(paginas);

    // alerta de integridade: mesmo idSei + mesmo papel já visto com hash diferente
    const { data: jaVisto } = await supabase
      .from("mhd_conteudos").select("hash")
      .filter("dados->>idSei", "eq", item.idSei)
      .contains("papeis", [item.papel]);
    if (jaVisto?.some((c: any) => c.hash !== hash)) {
      resumo.alertasIntegridade.push({
        idSei: item.idSei, papel: item.papel,
        motivo: `SEI ${item.idSei} (${item.papel}) já apareceu antes com conteúdo diferente — nada foi sobrescrito, confira`,
      });
    }

    const conteudo = await acharOuCriarConteudo({
      hash, nome: item.titulo, rodada: 1, bytes: 0, paginas: paginas.length,
      papeis: [item.papel], escopo: item.escopo,
      dados: { idSei: item.idSei, paginaIni: item.paginaIni, paginaFim: item.paginaFim },
      origem: "texto",
    });
    if (conteudo.erro) { resumo.problemas.push(conteudo.erro); continue; }
    if (!conteudo.id) continue;

    const doc = await acharOuCriarDocumento(args.processoCodigo, args.assuntoId, item.papel, item.escopo);
    if (doc.erro) { resumo.problemas.push(doc.erro); continue; }
    if (!doc.id) continue;

    const estado = item.estadoResolucao?.estado ?? "vigente";
    const motivoEstado = item.estadoResolucao?.motivo ?? null;
    const confiancaEstado = item.estadoResolucao?.confianca ?? null;
    const vigente = estado === "vigente";

    const { data: anteriores } = await supabase
      .from("mhd_versoes").select("id,versao,conteudo_id")
      .eq("documento_id", doc.id).order("versao", { ascending: false }).limit(1);
    const anterior = anteriores?.[0] ?? null;

    if (anterior?.conteudo_id === conteudo.id) {
      // mesmo conteúdo já registrado — nunca cria versão nova, só sincroniza estado/vigência
      // (pode ter mudado: um documento que era vigente sozinho pode virar substituído se, nesta
      // mesma remessa, apareceu quem substitui)
      await supabase.from("mhd_versoes")
        .update({ estado, motivo_estado: motivoEstado, confianca_estado: confiancaEstado, vigente })
        .eq("id", anterior.id);
      if (vigente) await supabase.from("mhd_versoes").update({ vigente: false }).eq("documento_id", doc.id).neq("id", anterior.id);
      resumo.inalterados++;
      continue;
    }

    if (vigente) await supabase.from("mhd_versoes").update({ vigente: false }).eq("documento_id", doc.id);
    const versao = (anterior?.versao ?? 0) + 1;
    const { error: errVersao } = await supabase.from("mhd_versoes").insert({
      documento_id: doc.id, conteudo_id: conteudo.id, versao, vigente,
      hash, nome_arquivo: item.titulo, rodada: 1, usuario_id: args.usuarioId,
      estado, motivo_estado: motivoEstado, confianca_estado: confiancaEstado,
    });
    if (errVersao) { resumo.problemas.push(`versão de "${item.titulo}": ${errVersao.message}`); continue; }
    if (anterior) resumo.versoesNovas++; else resumo.documentosNovos++;
  }

  return resumo;
}
