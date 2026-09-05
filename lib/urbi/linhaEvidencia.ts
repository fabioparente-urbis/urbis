/**
 * lib/urbi/linhaEvidencia.ts — Camada 3 da arquitetura mestra do URBI (05/09/2026): a "linha de
 * evidência" — cadeia MDP (cobrança) → análise → retorno → resultado MAC, por despacho/parecer
 * emitido. Gravada, versionada, dentro de cada retrato do Radar (urbi_radar_retratos.linha_evidencia).
 *
 * ── O QUE A AUDITORIA (ETAPA 1, mesma data) PROVOU, COM DADO REAL, NOS 3 SLOTS ────────────────
 * 1. `mdp_registros` NÃO TEM `checklist_item_id` nem `analise_id` — nenhuma FK liga um despacho a
 *    um item específico do MAC. O ÚNICO vínculo despacho→análise que é de fato estrutural é
 *    `analises_mac.numero_despacho`/`numero_parecer` == `mdp_registros.numero` (confirmado, nos 4
 *    processos reais testados, como IDÊNTICO em 100% dos casos — é a MESMA coluna que já
 *    alimenta `d.fluxo.documentos_emitidos`, reaproveitada aqui, nunca recalculada).
 * 2. "A próxima análise começou" (retorno) é resolvido pela PRÓPRIA sequência de
 *    `analises_mac.numero_analise` (existe uma linha nº N+1 pra este processo?) — estrutural,
 *    do mesmo jeito que o vínculo despacho→análise, e SEM depender de `urbis_numeracao_uso`.
 *    ACHADO REAL (24.28.000005986-4): o ledger de numeração às vezes não tem linha nenhuma pro
 *    despacho, ou tem linha com `numero_analise` NULO — isso faz `vw_bdi_aguardando_retorno`
 *    cair em "base insuficiente" mesmo quando `analises_mac` e `vw_bdi_retrabalho_por_passada`
 *    (que usa `checklist_item_id`, nunca a numeração) têm dado limpo. Por isso a view entra só
 *    como CROSS-CHECK leve (dias aguardando, alerta de divergência) — nunca como trava.
 * 3. `vw_bdi_retrabalho_por_passada` já liga uma transição de status de UM MESMO item
 *    (`checklist_item_id`, um JOIN real, mesmo que a view não exponha o id) entre duas passadas
 *    consecutivas — reaproveitada via `d.fluxo.retrabalho_entre_passadas`. Provado com dado real
 *    (script de auditoria, 44 linhas reais) que o autosave de observação livre do Aceite SEI
 *    (`checklist_item_id IS NULL` sempre nesses casos) nunca aparece nesta view: o JOIN por
 *    `checklist_item_id` já exclui automaticamente NULL = NULL. Por isso ESTA é a única fonte
 *    usada para "resultado" — nunca mac_historico bruto.
 * 4. `mdp_registros.conteudo.pendencias_mac[].texto` (quando existe — não é sempre) é cópia
 *    EXATA do texto de um item de `mac_checklist_itens` no momento da emissão, mas SEM guardar o
 *    id do item — só reconstruível por igualdade exata de texto, escopada pelo `modelo_id` da
 *    análise que gerou aquele despacho. Isso é MAIS forte que "texto parecido" (é o mesmo texto,
 *    não uma aproximação), mas nunca é uma prova estrutural permanente: o catálogo pode mudar.
 * 5. Slot 5: `processos.tags` (tipo despacho) grava `numero_analise`+`numero_despacho` de forma
 *    estruturada — usado aqui como CONFIRMAÇÃO CRUZADA do vínculo despacho→análise no Slot 5,
 *    nunca como fonte única. `mhd_eventos.compatibilizacao` (documento novo → itens candidatos)
 *    só entra como CANDIDATO de retorno, nunca como resultado — e só é citado se o texto em
 *    `afetadas` bater EXATO contra o catálogo do modelo certo.
 * 6. `mhd_versoes.rodada` NUNCA é usado aqui como número de análise (provado divergente com dado
 *    real: rodada 2/3/4 num processo cuja análise vigente era nº 1).
 *
 * REGRAS RÍGIDAS (do Fábio, ETAPA 2) — aplicadas em código, não só em texto:
 * - `confirmado_atendido` só existe com item MAC específico + passada posterior + mudança
 *   determinística pra atendido — sempre via `vw_bdi_retrabalho_por_passada` (checklist_item_id).
 * - Texto idêntico e único ao catálogo nunca vira "confirmado" — trava em "parcial".
 * - Texto sem match ou ambíguo trava em "base_insuficiente".
 * - Nunca expõe UUID, chave técnica, texto de observação pessoal ou caminho interno.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MetodoRelacao = "vinculo_estruturado" | "texto_identico_unico" | "texto_ambiguo" | "sem_correspondencia" | "nao_aplicavel";
export type GrauFactualExigencia = "confirmado" | "parcial" | "pendente" | "base_insuficiente";
export type ResultadoExigencia = "confirmado_atendido" | "permanece_pendente" | "reincidiu" | "sem_marcacao_posterior" | "sem_vinculo_estruturado";

export type ItemRelacionadoEvidencia = { rotulo: string; grupo: string | null };

export type RegistroLinhaEvidencia = {
  processo_codigo: string;
  tipo_processo: string | null;
  analise_relacionada: number | null;
  documento_mdp: { tipo: string; numero: string; data_emissao: string | null } | null;
  retorno_identificado: { data: string | null; fonte: string } | null;
  evento_mac_posterior: { data: string; descricao: string } | null;
  itens_relacionados: ItemRelacionadoEvidencia[];
  metodo_relacao: MetodoRelacao;
  grau_factual: GrauFactualExigencia;
  resultado: ResultadoExigencia;
  fontes: string[];
  cobertura: string;
  limitacoes: string[];
  atualizado_em: string;
};

export type BlocoLinhaEvidencia = {
  versao_bloco: 1;
  registros: RegistroLinhaEvidencia[];
};

const STATUS_ATENDIDO = new Set(["conforme", "nao_aplica"]);

function truncar(texto: string, limite: number): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

/** Igualdade exata (não fuzzy) contra o catálogo — nunca "parecido". Retorna 0/1/2+ matches. */
function contarMatchesExatos(texto: string, catalogo: { texto: string }[]): number {
  const alvo = texto.trim();
  return catalogo.filter((c) => c.texto.trim() === alvo).length;
}

type PendenciaMdp = { grupo: string | null; texto: string };

type AnaliseInfo = {
  numero_analise: number;
  criado_em: string | null;
  modelo_id: string | null;
};

/**
 * Monta o bloco inteiro a partir do MESMO dossiê (`d`, de `montarDossieFactual`) — reaproveita
 * `d.fluxo.documentos_emitidos`, `d.fluxo.aguardando_retorno` e `d.fluxo.retrabalho_entre_passadas`
 * sem recalcular nada. Faz só 2 consultas próprias, pequenas e read-only: `mdp_registros.conteudo`
 * (o dossiê não expõe isso) e `analises_mac.modelo_id` (idem) — mais `mac_checklist_itens`,
 * SÓ quando há pendências pra validar, e `mhd_eventos.compatibilizacao`, SÓ no Slot 5.
 */
export async function montarLinhaEvidenciaExigencias(
  codigo: string,
  d: Record<string, any>,
  tagsProcesso: { tipo: string; numero_analise?: number | null; numero_despacho?: string | null }[],
): Promise<BlocoLinhaEvidencia> {
  const tipoProcesso: string | null = d.processo?.tipo_processo ?? null;
  const documentosEmitidos: any[] = Array.isArray(d.fluxo?.documentos_emitidos) ? d.fluxo.documentos_emitidos : [];
  const aguardandoRetorno: any[] = Array.isArray(d.fluxo?.aguardando_retorno) ? d.fluxo.aguardando_retorno : [];
  const retrabalho: any[] = Array.isArray(d.fluxo?.retrabalho_entre_passadas) ? d.fluxo.retrabalho_entre_passadas : [];
  const analisesFluxo: any[] = Array.isArray(d.fluxo?.analises) ? d.fluxo.analises : [];

  const relevantes = documentosEmitidos.filter((doc) => doc?.tipo === "despacho" || doc?.tipo === "parecer");
  const agora = new Date().toISOString();

  if (relevantes.length === 0) {
    return { versao_bloco: 1, registros: [] };
  }

  const [{ data: mdpBruto }, { data: analisesBrutas }] = await Promise.all([
    supabaseAdmin.from("mdp_registros").select("tipo, numero, data_despacho, criado_em, conteudo").eq("processo_codigo", codigo),
    supabaseAdmin.from("analises_mac").select("numero_analise, criado_em, modelo_id").eq("processo_codigo", codigo).is("excluido_em", null),
  ]);

  const mdpPorNumero = new Map<string, { data_despacho: string | null; criado_em: string; conteudo: any }>();
  for (const m of (mdpBruto ?? []) as any[]) {
    if (m.numero) mdpPorNumero.set(String(m.numero), { data_despacho: m.data_despacho, criado_em: m.criado_em, conteudo: m.conteudo });
  }
  const analisesPorNumero = new Map<number, AnaliseInfo>();
  for (const a of (analisesBrutas ?? []) as any[]) {
    analisesPorNumero.set(a.numero_analise, { numero_analise: a.numero_analise, criado_em: a.criado_em, modelo_id: a.modelo_id });
  }
  const analiseFluxoPorNumero = new Map<number, any>(analisesFluxo.map((a) => [a.numero_analise, a]));
  const aguardandoPorAnalise = new Map<number, any>(aguardandoRetorno.filter((r) => typeof r.analise === "number").map((r) => [r.analise, r]));
  const tagsDespacho = tagsProcesso.filter((t) => t.tipo === "despacho");

  // ── catálogo scoped por modelo — só busca se existir pendência textual a validar ────────────
  const modelosUsados = new Set<string>();
  for (const doc of relevantes) {
    const mdp = mdpPorNumero.get(String(doc.numero));
    const pendencias: PendenciaMdp[] = Array.isArray(mdp?.conteudo?.pendencias_mac) ? mdp.conteudo.pendencias_mac : [];
    if (pendencias.length === 0) continue;
    const analise = analisesPorNumero.get(doc.numero_analise);
    if (analise?.modelo_id) modelosUsados.add(analise.modelo_id);
  }
  const catalogoPorModelo = new Map<string, { texto: string; grupo: string | null }[]>();
  if (modelosUsados.size > 0) {
    const { data: itensCatalogo } = await supabaseAdmin
      .from("mac_checklist_itens")
      .select("texto, grupo, modelo_id")
      .in("modelo_id", [...modelosUsados]);
    for (const item of (itensCatalogo ?? []) as any[]) {
      const lista = catalogoPorModelo.get(item.modelo_id) ?? [];
      lista.push({ texto: item.texto, grupo: item.grupo });
      catalogoPorModelo.set(item.modelo_id, lista);
    }
  }

  // ── candidatos de retorno via documento (Slot 5) — nunca vira resultado por si só ───────────
  let compatEventos: { criado_em: string }[] = [];
  if (tipoProcesso === "slot_05") {
    const { data } = await supabaseAdmin
      .from("mhd_eventos")
      .select("criado_em")
      .eq("processo_codigo", codigo)
      .eq("tipo", "compatibilizacao")
      .order("criado_em", { ascending: true });
    compatEventos = (data ?? []) as any[];
  }

  const registros: RegistroLinhaEvidencia[] = [];

  for (const doc of relevantes) {
    const mdp = mdpPorNumero.get(String(doc.numero));
    const fontes: string[] = ["MAC — analises_mac (numero_despacho/numero_parecer)"];
    const limitacoes: string[] = [];
    let metodoRelacao: MetodoRelacao = "nao_aplicavel";
    let itensRelacionados: ItemRelacionadoEvidencia[] = [];
    let resultado: ResultadoExigencia;
    let grau: GrauFactualExigencia;
    let retornoIdentificado: RegistroLinhaEvidencia["retorno_identificado"] = null;
    let eventoMacPosterior: RegistroLinhaEvidencia["evento_mac_posterior"] = null;

    // Slot 5: confirmação cruzada por processos.tags (regra explícita do Fábio) — não derruba o
    // vínculo se a tag simplesmente não existir (nem toda análise tem tag), só relata divergência.
    if (tipoProcesso === "slot_05") {
      const tagCorrespondente = tagsDespacho.find((t) => String(t.numero_despacho ?? "") === String(doc.numero));
      if (tagCorrespondente && tagCorrespondente.numero_analise !== doc.numero_analise) {
        limitacoes.push("processos.tags registra um número de análise diferente de analises_mac para este despacho — vínculo não confirmado, tratado como base insuficiente.");
        registros.push({
          processo_codigo: codigo, tipo_processo: tipoProcesso, analise_relacionada: null,
          documento_mdp: mdp ? { tipo: doc.tipo, numero: String(doc.numero), data_emissao: mdp.data_despacho ?? mdp.criado_em } : null,
          retorno_identificado: null, evento_mac_posterior: null, itens_relacionados: [],
          metodo_relacao: "sem_correspondencia", grau_factual: "base_insuficiente", resultado: "sem_vinculo_estruturado",
          fontes: [...fontes, "Processo — tags (numero_analise/numero_despacho)"], cobertura: "despacho sem confirmação cruzada", limitacoes, atualizado_em: agora,
        });
        continue;
      }
      if (tagCorrespondente) fontes.push("Processo — tags (numero_analise/numero_despacho, confirmado)");
    }

    // Despacho→análise é SEMPRE estrutural aqui: `analiseRelacionada` vem direto de
    // `analises_mac` (mesma linha que gerou `documentosEmitidos`) — não depende do ledger de
    // numeração. ACHADO REAL (24.28.000005986-4): `urbis_numeracao_uso` às vezes não tem linha
    // nenhuma pro despacho, ou tem linha com `numero_analise` NULO — isso faz
    // `vw_bdi_aguardando_retorno` cair em "base insuficiente" mesmo quando `analises_mac` e
    // `vw_bdi_retrabalho_por_passada` (que usa `checklist_item_id`, não a numeração) têm dado
    // limpo e completo. Por isso a view entra só como CROSS-CHECK leve (dias, e um alerta se
    // ela detectar divergência), nunca como trava que descarta um vínculo já estrutural.
    const analiseRelacionada = doc.numero_analise as number;
    const aguardando = aguardandoPorAnalise.get(analiseRelacionada);
    const proximaAnalise = analiseRelacionada + 1;
    const proximaAnaliseInfo = analisesPorNumero.get(proximaAnalise);

    if (aguardando?.situacao === "base insuficiente") {
      limitacoes.push("BDI — vw_bdi_aguardando_retorno não confirma este despacho contra a numeração oficial (registro de numeração incompleto ou divergente) — retorno avaliado direto pela sequência de analises_mac.");
    }

    if (proximaAnaliseInfo) {
      retornoIdentificado = { data: proximaAnaliseInfo.criado_em, fonte: "próxima análise iniciada (MAC — analises_mac)" };
      fontes.push("MAC — analises_mac (sequência de análises)");

      const transicoes = retrabalho.filter((r) => r.passada_anterior === analiseRelacionada && r.passada_atual === proximaAnalise);
      if (transicoes.length === 0) {
        resultado = "sem_marcacao_posterior";
        grau = "parcial";
        metodoRelacao = "nao_aplicavel";
        limitacoes.push("BDI — vw_bdi_retrabalho_por_passada não registra transição de item entre essas duas passadas (uma marcação nova sem transição anterior não aparece nesta fonte).");
        fontes.push("BDI — vw_bdi_retrabalho_por_passada");
      } else {
        // ACHADO REAL (25.5.000054511-1, análise 2→3): a mesma passada pode ter UM item que
        // foi atendido e OUTRO que regrediu ao mesmo tempo — usar "some() atendido" pra decidir
        // o resultado inteiro escondia a regressão atrás de um "confirmado_atendido" otimista.
        // Regra: havendo qualquer item não atendido no conjunto, o registro inteiro é
        // "reincidiu" (o sinal mais cauteloso) — nunca misturar as duas situações num rótulo só.
        const atendidas = transicoes.filter((r) => STATUS_ATENDIDO.has(r.status_depois_da_volta));
        const naoAtendidas = transicoes.filter((r) => !STATUS_ATENDIDO.has(r.status_depois_da_volta));
        resultado = naoAtendidas.length > 0 ? "reincidiu" : "confirmado_atendido";
        grau = "confirmado";
        metodoRelacao = "vinculo_estruturado";
        fontes.push("BDI — vw_bdi_retrabalho_por_passada");
        itensRelacionados = transicoes.map((r) => ({ rotulo: truncar(r.exigencia, 90), grupo: r.aba ?? null }));
        const maisRecente = transicoes.reduce((a, b) => (a.voltou_em > b.voltou_em ? a : b));
        eventoMacPosterior = {
          data: maisRecente.voltou_em,
          descricao: naoAtendidas.length > 0 && atendidas.length > 0
            ? `${atendidas.length} item(ns) atendido(s) e ${naoAtendidas.length} item(ns) voltou(aram) a não conforme na análise seguinte`
            : naoAtendidas.length > 0
              ? "item permanece não conforme na análise seguinte"
              : "item marcado como conforme/não se aplica na análise seguinte",
        };
      }
    } else {
      // Ainda não há próxima análise — mas Slot 5 pode ter um candidato de retorno por documento.
      let candidatoCompat: { criado_em: string } | null = null;
      const ancoraEmissao = aguardando?.despacho_emitido_em ?? mdp?.data_despacho ?? mdp?.criado_em ?? null;
      if (tipoProcesso === "slot_05" && ancoraEmissao) {
        candidatoCompat = compatEventos.find((e) => e.criado_em > ancoraEmissao) ?? null;
      }
      if (candidatoCompat) {
        retornoIdentificado = { data: candidatoCompat.criado_em, fonte: "documento recebido — compatibilização automática (candidato, não é nova análise MAC)" };
        resultado = "sem_marcacao_posterior";
        grau = "parcial";
        limitacoes.push("Retorno detectado só por chegada de documento (mhd_eventos.compatibilizacao) — ainda não há nova análise MAC que confirme resultado.");
        fontes.push("MHD — mhd_eventos (compatibilizacao, candidato)");
      } else {
        resultado = "permanece_pendente";
        grau = "pendente";
      }
      metodoRelacao = "nao_aplicavel";
    }

    const analiseCriadaEm = analisesPorNumero.get(analiseRelacionada)?.criado_em ?? null;
    const diasAguardando = resultado === "permanece_pendente"
      ? (typeof aguardando?.dias === "number" ? aguardando.dias : analiseCriadaEm ? Math.round((Date.now() - new Date(analiseCriadaEm).getTime()) / 86400000 * 10) / 10 : null)
      : null;

    // ── enriquecimento por texto (mdp.pendencias_mac) — só quando ainda não há itens estruturais ──
    if (itensRelacionados.length === 0 && mdp) {
      const pendencias: PendenciaMdp[] = Array.isArray(mdp.conteudo?.pendencias_mac) ? mdp.conteudo.pendencias_mac : [];
      if (pendencias.length > 0) {
        const analiseInfo = analisesPorNumero.get(analiseRelacionada);
        const catalogo = analiseInfo?.modelo_id ? catalogoPorModelo.get(analiseInfo.modelo_id) ?? [] : [];
        if (catalogo.length === 0) {
          metodoRelacao = "sem_correspondencia";
          grau = "base_insuficiente";
          limitacoes.push("Não foi possível carregar o catálogo do modelo desta análise para validar os itens cobrados por texto.");
        } else {
          let algumAmbiguo = false, algumSemMatch = false;
          const itensPorTexto: ItemRelacionadoEvidencia[] = [];
          for (const p of pendencias) {
            const n = contarMatchesExatos(p.texto, catalogo);
            if (n === 1) itensPorTexto.push({ rotulo: truncar(p.texto, 90), grupo: p.grupo ?? null });
            else if (n === 0) algumSemMatch = true;
            else algumAmbiguo = true;
          }
          if (itensPorTexto.length > 0) {
            itensRelacionados = itensPorTexto;
            metodoRelacao = "texto_identico_unico";
            grau = "parcial"; // regra rígida: nunca "confirmado" quando a origem é texto, mesmo único.
            fontes.push("MDP — mdp_registros.conteudo.pendencias_mac (texto idêntico ao catálogo do modelo)");
            limitacoes.push("Item relacionado por igualdade exata de texto ao catálogo do modelo — não é um vínculo estrutural (não há checklist_item_id salvo no despacho).");
          } else if (algumAmbiguo || algumSemMatch) {
            metodoRelacao = algumAmbiguo ? "texto_ambiguo" : "sem_correspondencia";
            grau = "base_insuficiente";
            limitacoes.push(algumAmbiguo
              ? "Texto da cobrança bate com mais de um item do catálogo — base insuficiente para provar qual item originou esta cobrança."
              : "Texto da cobrança não bate com nenhum item do catálogo vigente do modelo — base insuficiente para provar qual item originou esta cobrança.");
          }
        }
      }
    }

    registros.push({
      processo_codigo: codigo,
      tipo_processo: tipoProcesso,
      analise_relacionada: analiseRelacionada,
      documento_mdp: mdp ? { tipo: doc.tipo, numero: String(doc.numero), data_emissao: mdp.data_despacho ?? mdp.criado_em } : { tipo: doc.tipo, numero: String(doc.numero), data_emissao: null },
      retorno_identificado: retornoIdentificado,
      evento_mac_posterior: eventoMacPosterior,
      itens_relacionados: itensRelacionados,
      metodo_relacao: metodoRelacao,
      grau_factual: grau,
      resultado,
      fontes,
      cobertura: [
        mdp ? "documento MDP localizado" : "documento MDP não localizado (só analises_mac)",
        diasAguardando !== null ? `aguardando retorno há ${diasAguardando} dia(s)` : null,
      ].filter(Boolean).join("; "),
      limitacoes,
      atualizado_em: agora,
    });
  }

  return { versao_bloco: 1, registros };
}

/**
 * ETAPA 3 — alertas operacionais curtos, derivados só do bloco já montado (nunca um cálculo
 * novo). Sem texto longo, sem conclusão jurídica — só o que acelera a ação do analista. Ordem:
 * mais urgente/acionável primeiro.
 */
export function alertasLinhaEvidencia(bloco: BlocoLinhaEvidencia): string[] {
  const alertas: string[] = [];
  for (const r of bloco.registros) {
    if (r.resultado === "reincidiu") {
      alertas.push("Item voltou a não conforme após análise posterior.");
    } else if (r.resultado === "confirmado_atendido") {
      // informativo, não bloqueante — só entra se não houver alerta mais urgente já cobrindo isto
    } else if (r.resultado === "permanece_pendente") {
      const matchDias = /aguardando retorno há (\d+(?:[.,]\d+)?) dia/.exec(r.cobertura);
      alertas.push(matchDias
        ? `O processo aguarda retorno há ${matchDias[1]} dia(s).`
        : "Despacho anterior emitido; retorno ainda não identificado.");
    } else if (r.resultado === "sem_marcacao_posterior") {
      alertas.push("Houve retorno posterior, mas não é possível atribuir o resultado a uma exigência específica.");
    }
    if (r.metodo_relacao === "texto_identico_unico") {
      alertas.push("Item relacionado por texto idêntico; confirme antes de concluir.");
    }
  }
  // Exigência recorrente entre passadas — mais de um registro com resultado "reincidiu".
  if (bloco.registros.filter((r) => r.resultado === "reincidiu").length > 1) {
    alertas.push("Exigência recorrente entre passadas.");
  }
  return [...new Set(alertas)];
}

const ROTULO_RESULTADO: Record<ResultadoExigencia, string> = {
  confirmado_atendido: "atendida na análise seguinte",
  permanece_pendente: "ainda não retornou",
  reincidiu: "voltou a não conforme após retorno",
  sem_marcacao_posterior: "retornou, mas sem marcação MAC atribuível",
  sem_vinculo_estruturado: "sem vínculo estruturado com uma análise",
};
const ROTULO_METODO: Record<MetodoRelacao, string> = {
  vinculo_estruturado: "vínculo estrutural (checklist_item_id)",
  texto_identico_unico: "correspondência parcial — texto idêntico e único ao catálogo",
  texto_ambiguo: "texto ambíguo — bate com mais de um item do catálogo",
  sem_correspondencia: "sem correspondência no catálogo",
  nao_aplicavel: "não se aplica",
};
const ROTULO_GRAU: Record<GrauFactualExigencia, string> = {
  confirmado: "confirmado", parcial: "parcial", pendente: "pendente", base_insuficiente: "base insuficiente",
};

/**
 * Detalhe legível de toda a linha de evidência do processo — só quando o analista pede
 * explicitamente ("ver linha de evidência"). Sem UUID, sem texto de observação, sem caminho
 * técnico; cada afirmação carrega grau factual e fonte, nunca uma conclusão sem procedência.
 */
export function formatarLinhaEvidenciaDetalhada(bloco: BlocoLinhaEvidencia): string {
  if (bloco.registros.length === 0) {
    return "Linha de evidência: nenhum despacho ou parecer emitido neste processo ainda — nada para acompanhar.";
  }
  const partes = bloco.registros.map((r, i) => {
    const linhas: string[] = [];
    linhas.push(`${i + 1}. ${r.documento_mdp?.tipo === "parecer" ? "Parecer" : "Despacho"} nº ${r.documento_mdp?.numero ?? "?"}${r.documento_mdp?.data_emissao ? ` (${new Date(r.documento_mdp.data_emissao).toLocaleDateString("pt-BR")})` : ""}`);
    linhas.push(`   Análise relacionada: ${r.analise_relacionada !== null ? `nº ${r.analise_relacionada}` : "não confirmada"}`);
    if (r.itens_relacionados.length > 0) {
      linhas.push(`   Itens relacionados: ${r.itens_relacionados.map((it) => `${it.rotulo}${it.grupo ? ` (${it.grupo})` : ""}`).join("; ")}`);
    }
    linhas.push(`   Retorno: ${r.retorno_identificado?.data ? `${new Date(r.retorno_identificado.data).toLocaleDateString("pt-BR")} — ${r.retorno_identificado.fonte}` : "ainda não identificado"}`);
    if (r.evento_mac_posterior) linhas.push(`   Evento MAC posterior: ${r.evento_mac_posterior.descricao} (${new Date(r.evento_mac_posterior.data).toLocaleDateString("pt-BR")})`);
    linhas.push(`   Resultado: ${ROTULO_RESULTADO[r.resultado]} | Método: ${ROTULO_METODO[r.metodo_relacao]} | Grau factual: ${ROTULO_GRAU[r.grau_factual]}`);
    if (r.limitacoes.length > 0) linhas.push(`   Limitações: ${r.limitacoes.join(" ")}`);
    linhas.push(`   Fontes: ${r.fontes.join(", ")}`);
    return linhas.join("\n");
  });
  return `Linha de evidência (${bloco.registros.length} despacho/parecer):\n${partes.join("\n\n")}`;
}
