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
import { resolverEstados, resolverEstadosPecas, tituloSemNumeros, type ResolucaoVersao } from "./motorVersoes";

const RE_ATO = /^\s*(despacho|parecer|of[ií]cio|notifica[çc][ãa]o)\b/;

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tipoAto(titulo: string): string | null {
  const m = RE_ATO.exec(normalizar(titulo));
  return m ? m[1] : null;
}

/**
 * SHA-256 da identidade + conteúdo do documento — estável entre reuploads do mesmo documento.
 *
 * BUG REAL corrigido em 07/09/2026 (auditoria): o hash era só sobre o TEXTO das páginas. Página
 * digitalizada não tem camada de texto, então o texto extraído vem VAZIO — e todo documento sem
 * texto acabava com o MESMO hash, independentemente do conteúdo. Não é caso de borda: o §11 do
 * plano mediu 48% das páginas como histórico digitalizado, e num dos processos reais só 12,5%
 * das páginas tinham texto nativo. Consequências, todas silenciosas: `acharOuCriarConteudo`
 * reaproveitava a linha do PRIMEIRO documento sem atualizar `dados`, então a procedência (idSei +
 * páginas de origem — o argumento central do projeto) passava a apontar pro documento errado; o
 * alerta de integridade nunca disparava; e um digitalizado trocado por OUTRO digitalizado do mesmo
 * papel era tratado como "inalterado", sem versão nova e sem aviso.
 *
 * O hash agora inclui a identidade estável do documento:
 * - `idSei` — permanente no SEI, o mesmo em qualquer reupload do processo (nunca a posição da
 *   página, que ESCORREGA quando um documento novo entra antes dela e quebraria a dedup);
 * - `papel` — determinístico, vem do título/classificação;
 * - número de páginas — discrimina de graça duas peças distintas do mesmo papel dentro do mesmo
 *   contêiner (que compartilham o `idSei` do contêiner) quando têm tamanhos diferentes;
 * - o texto normalizado, como antes.
 *
 * LIMITE CONHECIDO que permanece: duas peças do MESMO papel, no MESMO contêiner, com o MESMO
 * número de páginas e ambas sem texto continuam indistinguíveis neste nível — não há sinal para
 * separá-las sem ler a imagem (Fase 8). Fica registrado em vez de escondido.
 */
export function hashConteudo(
  identidade: { idSei: string; papel: string },
  paginas: Pick<PaginaTexto, "texto">[],
): string {
  const normalizado = paginas.map((p) => p.texto.trim().replace(/\s+/g, " ").toLowerCase()).join("\n");
  const base = `sei:${identidade.idSei}\npapel:${identidade.papel}\npaginas:${paginas.length}\n${normalizado}`;
  return createHash("sha256").update(base, "utf8").digest("hex");
}

type ItemParaPersistir = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  papel: string;
  escopo: string;
  estadoResolucao?: Pick<ResolucaoVersao, "estado" | "motivo" | "confianca">;
  /**
   * Melhor esforço, herdados do EVENTO (`fatiar.ts`) que originou o item — inclusive para peças
   * de dentro de um contêiner, que não têm setor/data/assinante próprios: usar os do contêiner é
   * a mesma lógica de "melhor esforço, nunca bloqueia" do resto do módulo. Fase 1 do plano de
   * leitura de PDF (10/09/2026) — antes eram calculados e descartados na gravação (achado §5.4).
   */
  setor?: string;
  data?: string;
  assinante?: string;
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
  /**
   * Estado resolvido sobre TODOS os eventos, contêineres inclusive — exatamente a mesma chamada
   * que as duas telas fazem (`resolverEstados(resultado.eventos)`).
   *
   * Corrigido em 07/09/2026 (§23.5 do plano, decisão sua): antes isto resolvia só os
   * NÃO-contêineres, então a tela e o banco discordavam. E não era divergência acadêmica —
   * `ehContainerGenerico("Processo digital - 42135097")` é `true` (o título começa com
   * "Processo"), ou seja, a família 42135097/42135097-1, que é METADE do portão declarado da
   * Fase 4, é um contêiner: o estado dela aparecia na tela e nunca era gravado em lugar nenhum.
   */
  const estadosEventos = resolverEstados(eventos);
  const estadoPorIdSei = new Map(estadosEventos.map((r) => [r.idSei, r]));

  const itens: ItemParaPersistir[] = [];
  for (const ev of eventos) {
    if (ehContainerGenerico(ev.titulo)) continue; // tratados logo abaixo, com identidade própria
    const ato = tipoAto(ev.titulo);
    const papel = ato ?? classificarTitulo(ev.titulo) ?? "outro";
    const escopo = ato || papel === "outro" ? ev.idSei : "";
    itens.push({
      idSei: ev.idSei, titulo: ev.titulo, paginaIni: ev.paginaIni, paginaFim: ev.paginaFim,
      papel, escopo, estadoResolucao: estadoPorIdSei.get(ev.idSei),
      setor: ev.setor, data: ev.data, assinante: ev.assinante,
    });
  }

  /**
   * O CONTÊINER em si, agora com identidade própria (§23.5). Continua valendo que ele "é um bolso,
   * não um documento" — as peças de dentro seguem sendo persistidas separadamente, logo abaixo —
   * mas o bolso precisa existir no MHD para que a duplicata que o analista vê na tela
   * ("Processo digital - 42135097" substituído por "-1") seja visível pro resto do sistema.
   *
   * `papel = "container"`: fora de `CAMPO_POR_PAPEL_PECA` (`compararLip.ts`) de propósito — nunca
   * vira sugestão de campo do LIP, porque um contêiner genérico não é documento de nada.
   * `escopo = tituloSemNumeros(...)`: a MESMA chave de família do motor, importada de lá em vez de
   * recalculada aqui. Uma família de contêiner por escopo — sem isso, "Documentação" e "Processo
   * digital" cairiam no mesmo `mhd_documentos` e virariam versões um do outro, que é falso.
   */
  const containersVistos = new Set<string>();
  for (const ev of eventos) {
    if (!ehContainerGenerico(ev.titulo)) continue;
    if (containersVistos.has(ev.idSei)) continue; // fragmentos do mesmo contêiner, um item só
    containersVistos.add(ev.idSei);
    itens.push({
      idSei: ev.idSei, titulo: ev.titulo, paginaIni: ev.paginaIni, paginaFim: ev.paginaFim,
      papel: "container", escopo: tituloSemNumeros(ev.titulo),
      estadoResolucao: estadoPorIdSei.get(ev.idSei),
      setor: ev.setor, data: ev.data, assinante: ev.assinante,
    });
  }

  // peças de TODOS os contêineres do fatiamento, agrupadas por papel (família cruza contêineres)
  const pecasParaResolver: { chave: string; idSei: string; paginaIni: number; paginaFim: number }[] = [];
  const origemPeca = new Map<string, { idSei: string; tituloContainer: string; peca: PecaSei; eventoContainer: EventoSei }>();
  for (const ev of eventos) {
    if (!ehContainerGenerico(ev.titulo)) continue;
    for (const peca of ev.pecas ?? []) {
      if (peca.papel === "classificacao_pendente") continue; // nunca inventa identidade pra pendência
      const chaveAlvo = `${peca.papel}#${peca.paginaIni}`;
      pecasParaResolver.push({ chave: peca.papel, idSei: ev.idSei, paginaIni: peca.paginaIni, paginaFim: peca.paginaFim });
      origemPeca.set(chaveAlvo, { idSei: ev.idSei, tituloContainer: ev.titulo, peca, eventoContainer: ev });
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
      // a peça em si não tem setor/data/assinante próprios (só texto+dimensões, ver PaginaTexto)
      // — herda do contêiner que a contém, mesma lógica de melhor esforço do resto do módulo.
      setor: origem.eventoContainer.setor, data: origem.eventoContainer.data, assinante: origem.eventoContainer.assinante,
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
    const hash = hashConteudo({ idSei: item.idSei, papel: item.papel }, paginas);

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
      dataDocumento: item.data ?? null, setor: item.setor ?? null, assinante: item.assinante ?? null,
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

    /**
     * TODAS as versões, não só a última (§23.6 / B5 da auditoria). Antes isto era `.limit(1)`:
     * reimportar um PDF mais antigo, cujo conteúdo já estava gravado como versão 1, criava uma
     * versão 3 idêntica à 1 — "documento novo" que não era novo nenhum. O portão da Fase 7
     * ("reimportar processa zero") só valia para o último upload, não para qualquer um.
     */
    const { data: anteriores } = await supabase
      .from("mhd_versoes").select("id,versao,conteudo_id")
      .eq("documento_id", doc.id).order("versao", { ascending: false });
    const anterior = anteriores?.[0] ?? null;
    const jaGravada = anteriores?.find((v: any) => v.conteudo_id === conteudo.id) ?? null;

    if (jaGravada) {
      // mesmo conteúdo já registrado — nunca cria versão nova, só sincroniza estado/vigência NA
      // VERSÃO QUE DE FATO CASOU (não na última: com a busca em todas as versões, a que tem este
      // conteúdo pode ser uma antiga, e escrever na última marcaria o documento errado).
      // O estado pode ter mudado desde então: um documento que era vigente sozinho vira
      // substituído se, nesta remessa, apareceu quem o substitui.
      await supabase.from("mhd_versoes")
        .update({ estado, motivo_estado: motivoEstado, confianca_estado: confiancaEstado, vigente })
        .eq("id", jaGravada.id);
      if (vigente) await supabase.from("mhd_versoes").update({ vigente: false }).eq("documento_id", doc.id).neq("id", jaGravada.id);
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
