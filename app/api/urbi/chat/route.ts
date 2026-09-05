import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { registrarChamadaIA } from "@/lib/iaUso";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { derivarSugestoesAutomaticas, registrarSugestoesAutomaticas } from "@/lib/urbi/sugestoes";
import { gerarEmbeddingConsulta } from "@/lib/bdi/embeddingConsulta";
import { LIMITE_CHAMADAS_CHAT_HORA, OPERACOES_CHAT_URBI } from "@/lib/urbi/limites";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { montarDossieFactual } from "@/lib/urbi/montarDossie";
import { blocoContratoResposta, nomeHumanoDoSlot } from "@/lib/urbi/contratoResposta";
import { montarManifestoFontes, type ManifestoFontes } from "@/lib/urbi/manifestoFontes";
import { removerCaminhosTecnicos } from "@/lib/urbi/sanitizarResposta";
import { textoFontesConsultadas, removerSecaoFontesConsultadas } from "@/lib/urbi/fontesConsultadas";

export const maxDuration = 60;

// Trava de budget do chat livre do URBI — mesmo mecanismo do LIP
// (app/api/lip/s3/route.ts), balde PRÓPRIO (modulo="URBI" + só operações de
// chat): sem isolar por operação, uma sessão de leitura de PDF no LIP
// consumiria o mesmo teto do chat, e vice-versa. Limite intencionalmente
// mais alto que o do LIP (50/h): é conversa curta, não leitura de PDF —
// ajustar aqui se o uso real mostrar que está errado. Valor em
// lib/urbi/limites.ts (Fase V) — fonte única com o painel de prontidão.
const LIMITE_CHAMADAS_HORA = LIMITE_CHAMADAS_CHAT_HORA;

async function chatDentroDoBudget(): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("urbis_api_calls")
    .select("*", { count: "exact", head: true })
    .eq("modulo", "URBI")
    .in("operacao", OPERACOES_CHAT_URBI)
    .gte("criado_em", umaHoraAtras)
    .eq("status", "ok");
  if (error) {
    // Mesma regra do LIP: falha na consulta nunca vira "orçamento liberado".
    console.error("[urbi/chat] falha ao consultar trava de budget:", error);
    return { ok: false, status: 503, body: { ok: false, erro: "BUDGET_INDISPONIVEL", detalhe: "Não foi possível verificar o limite de uso agora. Tenta de novo em instantes." } };
  }
  if ((count ?? 0) >= LIMITE_CHAMADAS_HORA) {
    return { ok: false, status: 429, body: { ok: false, erro: "BUDGET_EXCEDIDO", detalhe: `Limite de ${LIMITE_CHAMADAS_HORA} chamadas/hora do chat atingido — muita gente conversando comigo agora. Tenta de novo daqui a pouco.` } };
  }
  return { ok: true };
}

// Cache da saudação de abertura (OnMount) por usuário — abrir e fechar o
// widget repetidas vezes na mesma sessão de trabalho não deveria custar um
// Gemini novo por abertura. Em memória (reinicia no deploy, aceitável para
// uma saudação): TTL curto porque clima/fila mudam ao longo do dia.
const CACHE_ONMOUNT_TTL_MS = 10 * 60 * 1000;
const cacheOnMount = new Map<string, { resposta: string; ts: number }>();

function detectarIntentLei(texto: string): boolean {
  const t = texto.toLowerCase();
  const palavras = [
    "lei", "artigo", "art.", "inciso", "parágrafo", "§",
    "lc ", "lc-", "decreto", "nbr", "norma", "código de obras",
    "plano diretor", "uso e ocupação", "zoneamento", "recuo",
    "gabarito", "taxa de ocupação", "coeficiente", "afastamento",
    "regularização", "alvará", "habite-se", "aeis", "zpa", "zpam",
    "macroárea", "testada", "lote mínimo", "remembramento",
    "desmembramento", "acessibilidade", "nbr 9050", "coletânea",
    "índice urbanístico", "aprovação", "análise", "conformidade",
    "legislação", "dispositivo legal", "fundamentação", "base legal",
  ];
  return palavras.some(p => t.includes(p));
}

type ResultadoBip = {
  // "ok": achou fragmento(s). "sem_resultado": busca rodou, nada relevante.
  // "erro": a busca em si falhou (banco/schema) — não é ausência de previsão legal.
  status: "ok" | "sem_resultado" | "erro";
  contexto: string;
  fontes: string[];
};

async function buscarNoBip(
  pergunta: string,
  leiId?: string
): Promise<ResultadoBip> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

  const { data: leis, error: erroLeis } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("id, titulo, tipo, numero, ano")
    .order("titulo", { ascending: true });
  if (erroLeis) {
    console.error("[urbi:buscarNoBip] falha ao ler bdi_documentos_lei:", erroLeis.message);
    return { status: "erro", contexto: "", fontes: [] };
  }
  if (!leis || leis.length === 0)
    return { status: "sem_resultado", contexto: "", fontes: [] };

  const leisAlvo = leiId ? leis.filter((l: any) => l.id === leiId) : leis;
  if (leisAlvo.length === 0)
    return { status: "sem_resultado", contexto: "", fontes: [] };
  const idsAlvo = leisAlvo.map((l: any) => l.id);

  // Busca vetorial primeiro (semântica, sobre a pergunta inteira — usa o índice HNSW que já
  // existia mas nunca era chamado, ver migration 2026_09_03_buscar_bip_fragmentos_similares).
  // Cai pra busca textual (ilike, como sempre foi) se não houver chave, o embedding falhar, a
  // RPC falhar, ou não achar nada — nunca vira erro só por isso, é degradação silenciosa e
  // segura. Gasto real de Gemini aqui é 1 embedding pequeno por pergunta em modo BIP — já
  // coberto pelo mesmo kill switch (chat_gemini_ativo) e teto por hora do resto do chat.
  let frags: { id: string; documento_id: string; referencia: string | null; texto: string }[] | null = null;
  let viaVetor = false;
  const apiKeyEmbedding = process.env.GEMINI_API_KEY;
  if (apiKeyEmbedding) {
    const t0Embed = Date.now();
    const embedding = await gerarEmbeddingConsulta(pergunta, apiKeyEmbedding);
    if (embedding.status === "ok") {
      const { data: vetorResultado, error: erroVetor } = await supabaseAdmin.rpc("buscar_bip_fragmentos_similares", {
        query_embedding: embedding.vetor,
        match_count: 8,
        filtro_documento_ids: idsAlvo,
      });
      await registrarChamadaIA({
        modulo: "URBI", operacao: "bip_embedding_consulta", modelo: "gemini-embedding-001",
        duracaoMs: Date.now() - t0Embed, status: erroVetor ? "erro" : "ok",
        motivoErro: erroVetor?.message?.slice(0, 500),
      });
      if (erroVetor) {
        console.error("[urbi:buscarNoBip] RPC de busca vetorial falhou, caindo pra busca textual:", erroVetor.message);
      } else if (vetorResultado && vetorResultado.length > 0) {
        frags = vetorResultado;
        viaVetor = true;
      }
    } else {
      await registrarChamadaIA({
        modulo: "URBI", operacao: "bip_embedding_consulta", modelo: "gemini-embedding-001",
        duracaoMs: Date.now() - t0Embed, status: "erro", motivoErro: embedding.motivo.slice(0, 500),
      });
      console.error("[urbi:buscarNoBip] embedding de consulta falhou, caindo pra busca textual:", embedding.motivo);
    }
  }

  if (!frags) {
    const stopwords = new Set(["o","a","os","as","de","do","da","em","no","na","que","para","com","por","se","um","uma","é","e","ou","ao","às","dos","das"]);
    const palavrasChave = pergunta
      .toLowerCase()
      .replace(/[^a-záéíóúãõâêîôûç\s]/g, " ")
      .split(/\s+/)
      .filter(p => p.length > 3 && !stopwords.has(p))
      .slice(0, 5);
    if (palavrasChave.length === 0)
      return { status: "sem_resultado", contexto: "", fontes: [] };

    // Schema real de bdi_lei_fragmentos (confirmado em app/api/bdi/indexar-lei/route.ts
    // e em todos os demais consumidores do BIP): id, documento_id, referencia, texto, embedding.
    const { data, error: erroFrags } = await supabaseAdmin
      .from("bdi_lei_fragmentos")
      .select("id, documento_id, referencia, texto")
      .in("documento_id", idsAlvo)
      .ilike("texto", `%${palavrasChave[0]}%`)
      .limit(8);
    if (erroFrags) {
      console.error("[urbi:buscarNoBip] falha ao consultar bdi_lei_fragmentos:", erroFrags.message);
      return { status: "erro", contexto: "", fontes: [] };
    }
    frags = data;
  }
  if (!frags || frags.length === 0)
    return { status: "sem_resultado", contexto: "", fontes: [] };
  console.log(`[urbi:buscarNoBip] resultado via ${viaVetor ? "busca vetorial" : "busca textual (fallback)"} — ${frags.length} fragmento(s).`);

  const fontes: string[] = [];
  const parts: string[] = [];
  for (const frag of frags) {
    const lei = leis.find((l: any) => l.id === (frag as any).documento_id);
    const nomeLei = lei
      ? `${lei.titulo}${lei.numero ? ` nº ${lei.numero}` : ""}${lei.ano ? `/${lei.ano}` : ""}`
      : "Lei não identificada";
    const referencia = (frag as any).referencia ? ` — ${(frag as any).referencia}` : "";
    parts.push(`[${nomeLei}${referencia}]: ${(frag as any).texto}`);
    const fonte = `${nomeLei}${referencia}`;
    if (!fontes.includes(fonte)) fontes.push(fonte);
  }
  return { status: "ok", contexto: parts.join("\n\n"), fontes };
}

type ResultadoDossie =
  | { status: "ok"; contexto: string; truncado: boolean; tipoProcesso: string | null; nomeSlot: string; manifesto: ManifestoFontes; recorte: Record<string, unknown> }
  | { status: "indisponivel"; motivo: string };

// Palavras curtas demais para funcionar como palavra-chave de busca nos itens
// do checklist — ficariam batendo em quase todo texto.
const PARADAS_PERGUNTA = new Set([
  "para", "como", "onde", "quando", "desse", "dessa", "deste", "desta",
  "aquele", "aquela", "sobre", "porque", "pode", "posso", "preciso",
  "gostaria", "fazer", "esse", "essa", "isso", "aqui", "ainda", "alguma",
  "algum", "alguns", "algumas", "muito", "pouco", "apenas", "também",
  "depois", "antes", "agora", "assim", "então", "qual", "quais", "está",
  "estão", "processo", "analise", "análise",
]);

function palavrasChaveDaPergunta(pergunta: string): string[] {
  const normalizada = pergunta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return [...new Set(
    normalizada.split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PARADAS_PERGUNTA.has(p))
  )];
}

/**
 * O chat só recebe o dossiê já autorizado e redigido pela mesma lógica da rota própria
 * (lib/urbi/montarDossie.ts) — chamada DIRETAMENTE, no mesmo processo, nunca por autochamada
 * HTTP. Achado real de 05/09/2026 (piloto humano controlado): a versão anterior fazia
 * `fetch(new URL("/api/urbi/dossie...", req.url))` — o servidor buscando sua própria API pela
 * rede — e essa autochamada falhava sempre em produção (Railway), mesmo a mesma rota
 * respondendo perfeitamente quando chamada direto pelo navegador com a mesma sessão. Nunca
 * tinha sido percebido porque, até este piloto, nenhuma conversa real tinha processo em
 * contexto (achado da Fase P — 0 chamadas "chat_coanalista" na história do produto).
 */
async function buscarDossieDoProcesso(req: NextRequest, codigo: string, pergunta: string): Promise<ResultadoDossie> {
  try {
    const usuario = await usuarioDaRequisicao(req);
    const resultado = await montarDossieFactual(codigo, usuario);
    if (!resultado.ok) {
      return { status: "indisponivel", motivo: resultado.erro };
    }
    const d = resultado.data as any;

    // Sugestões/alertas automáticas: derivadas só de fato (nunca de IA), registradas de forma
    // auditável em urbi_sugestoes — nunca bloqueia nem falha a resposta do chat (ver
    // lib/urbi/sugestoes.ts). Roda toda vez que o Co-Analista está ativo pra este processo; o
    // ON CONFLICT DO NOTHING evita duplicar a cada mensagem.
    try {
      await registrarSugestoesAutomaticas(codigo, derivarSugestoesAutomaticas(d), d?.processo?.tipo_processo ?? null);
    } catch (erroSugestao: any) {
      console.error("[urbi/chat] falha ao derivar/registrar sugestões automáticas:", erroSugestao?.message ?? erroSugestao);
    }

    // Redação pro Gemini: analista_nome (quem mudou o quê) e o texto livre de observação do MAC
    // nunca vão pro modelo — o dossiê guarda o fato completo pra uso interno/futura tela do URBI,
    // mas o Gemini só precisa do QUÊ e QUANDO, não de QUEM, nem do texto livre que um analista
    // pode ter digitado (pode conter nome/contato que não foi filtrado como campo estruturado).
    // item_id (Fase AA, 05/09/2026) também nunca vai pro modelo — é UUID interno, sem
    // significado nenhum pro analista; identificação continua por grupo/texto/campo_lip_relacionado,
    // que sobrevivem na cópia. As duas funções abaixo já eram usadas ANTES de o item_id ser
    // extraído pra idsJaSelecionados/itensRelacionadosPergunta, então tirar aqui não afeta essa
    // seleção (ver comentário logo abaixo).
    const semObservacaoTexto = (item: any) => {
      const { observacao, item_id, ...resto } = item ?? {};
      return observacao ? { ...resto, tem_observacao: true } : resto;
    };
    const semAnalista = (item: any) => {
      const { analista_nome, item_id, ...resto } = item ?? {};
      return resto;
    };

    const marcacoes: any[] = Array.isArray(d.mac?.marcacoes_ultima_analise) ? d.mac.marcacoes_ultima_analise : [];
    const pendencias = (d.mac?.pendencias_ultima_analise ?? []).slice(0, 20);
    // "em_branco": itens ativos do modelo que o analista ainda não marcou nesta
    // passada (ver app/api/urbi/dossie/route.ts) — é o que falta olhar, não é
    // conformidade nem pendência.
    const itensEmBranco = marcacoes.filter((m: any) => m.status === "em_branco").slice(0, 25);
    const idsJaSelecionados = new Set([
      ...pendencias.map((p: any) => p.item_id),
      ...itensEmBranco.map((i: any) => i.item_id),
    ]);
    // Seleção por pergunta: nunca despeja o inventário completo do checklist
    // (pode ter dezenas de itens e estourar o teto de contexto) — só os itens
    // cujo texto ou campo do LIP relacionado batem com palavra-chave da
    // pergunta atual do analista.
    const palavrasChave = palavrasChaveDaPergunta(pergunta);
    const itensRelacionadosPergunta = palavrasChave.length
      ? marcacoes
          .filter((m: any) => {
            if (idsJaSelecionados.has(m.item_id)) return false;
            const alvo = `${m.texto ?? ""} ${m.campo_lip_relacionado ?? ""}`.toLowerCase();
            return palavrasChave.some((p) => alvo.includes(p));
          })
          .slice(0, 15)
      : [];

    const evolucaoBruta = d.mac?.evolucao ?? {};
    const evolucao = {
      itens_corrigidos: (evolucaoBruta.itens_corrigidos ?? []).slice(0, 15).map(semAnalista),
      itens_voltaram_nao_conforme: (evolucaoBruta.itens_voltaram_nao_conforme ?? []).slice(0, 15).map(semAnalista),
      itens_pendentes_mantidos: (evolucaoBruta.itens_pendentes_mantidos ?? []).slice(0, 15).map(semAnalista),
    };
    const historicoAlteracoesLipRecorte = (d.lip?.historico_alteracoes ?? []).slice(0, 10);

    // Cruzamento determinístico (Fase B, lib/urbi/cruzamento.ts) — só os resultados que
    // merecem atenção do analista (divergência real, item sem base jurídica). "consistente" e
    // "dado_ausente" não vão pro modelo — não têm nada de novo pra dizer, só ruído de contexto.
    // "corrigido_entre_passadas"/"pendencia_mantida" também ficam de fora daqui: já estão em
    // "mac.evolucao" acima, mandar de novo seria duplicar.
    const cruzamentosRecorte = (d.cruzamentos ?? [])
      .filter((c: any) => c.resultado === "possivel_divergencia" || c.resultado === "base_juridica_ausente")
      .slice(0, 20)
      // "chave" aqui recebe o RÓTULO humano (c.rotulo, Fase AA), nunca o `chave` real de
      // ResultadoCruzamento — aquele é só a chave estável de dedupe interno (pode ser UUID de
      // item MAC), nunca deveria ir pro modelo.
      .map((c: any) => ({ tipo: c.tipo, chave: c.rotulo ?? c.chave, resultado: c.resultado, motivo: c.motivo, regra: c.regra }));

    // Adaptador técnico do slot (Fase C) — catálogo vigente, cobertura por fonte, mudança
    // estrutural do item entre histórico e catálogo atual. Nada pessoal aqui (é sobre o
    // checklist, não sobre pessoa), só limita mudancas_estruturais pra não estourar contexto.
    const tecnicoRecorte = d.tecnico
      ? {
          ...d.tecnico,
          mudancas_estruturais: (d.tecnico.mudancas_estruturais ?? []).slice(0, 10),
          eventos_catalogo_recentes: (d.tecnico.eventos_catalogo_recentes ?? []).slice(0, 10),
        }
      : null;

    const recorte = {
      // Fase AE (04/09/2026, achado real do reteste): "processo.area_construida" NUNCA vai pro
      // Gemini — é uma cópia redundante de lip.campos_tecnicos.areaTotal.valor (os 3 slots
      // gravam essa coluna a partir do MESMO campo do LIP, ver app/analise-*/[codigo]/page.tsx),
      // exposta sem rótulo nenhum. O Gemini, sem rótulo, inventou "área construída total" pra
      // ela — vocabulário de domínio do Slot 5, que não existe pra Regularização/Aceite SEI
      // (ver lib/urbi/catalogoSemantico.ts). O mesmo valor já chega rotulado certo via
      // "lip.campos_tecnicos.areaTotal" — nunca precisou de um segundo caminho sem rótulo.
      processo: {
        codigo: d.processo?.codigo, assunto: d.processo?.assunto, tipo_processo: d.processo?.tipo_processo,
        porte: d.processo?.porte, criado_em: d.processo?.criado_em, atualizado_em: d.processo?.atualizado_em,
        analise_iniciada_em: d.processo?.analise_iniciada_em, analise_concluida_em: d.processo?.analise_concluida_em,
      },
      situacoes: d.situacoes,
      lip: {
        campos_vazios: d.lip?.campos_vazios,
        campos_em_x: d.lip?.campos_em_x,
        campos_totais: d.lip?.campos_totais,
        campos_vazios_rotulos: d.lip?.campos_vazios_rotulos,
        campos_em_x_rotulos: d.lip?.campos_em_x_rotulos,
        incoerencias: d.lip?.incoerencias,
        campos_tecnicos: d.lip?.campos_tecnicos,
        historico_alteracoes: historicoAlteracoesLipRecorte,
      },
      mac: {
        numero_analises: d.mac?.numero_analises,
        ultima_analise: d.mac?.ultima_analise,
        resumo_ultima_analise: d.mac?.resumo_ultima_analise,
        pendencias_ultima_analise: pendencias.map(semObservacaoTexto),
        itens_em_branco: itensEmBranco.map(semObservacaoTexto),
        itens_relacionados_pergunta: itensRelacionadosPergunta.map(semObservacaoTexto),
        evolucao,
      },
      fluxo: {
        analises: d.fluxo?.analises,
        retrabalho_entre_passadas: (d.fluxo?.retrabalho_entre_passadas ?? []).slice(0, 20),
        documentos_emitidos: d.fluxo?.documentos_emitidos,
        documentos_mhd: d.fluxo?.documentos_mhd,
        aguardando_retorno: d.fluxo?.aguardando_retorno,
      },
      cruzamentos: cruzamentosRecorte,
      tecnico: tecnicoRecorte,
      cobertura: d.cobertura,
    };
    const serializado = JSON.stringify(recorte);
    const LIMITE_CONTEXTO = 18000;
    const truncado = serializado.length > LIMITE_CONTEXTO;
    // Não faz o modelo acreditar que recebeu o processo inteiro quando o
    // teto de contexto precisou cortar material. O aviso entra no próprio
    // texto e também volta para a interface como leitura parcial.
    const contexto = truncado
      ? `${serializado.slice(0, LIMITE_CONTEXTO)}\n[RECORTE INTERROMPIDO POR LIMITE DE CONTEXTO — não conclua sobre o que não apareceu.]`
      : serializado;

    const tipoProcesso = d.processo?.tipo_processo ?? null;
    const nomeSlot: string = d.tecnico?.nome_slot ?? nomeHumanoDoSlot(tipoProcesso);

    // Manifesto de fontes (Fase AB) — calculado do MESMO recorte enviado ao Gemini (nunca do
    // dossiê bruto não cortado), pra ser uma evidência verificável independente do texto de
    // resposta do modelo: mesmo que a prosa erre, o manifesto mostra o que realmente foi
    // carregado. Referências do BIP vêm só das pendências efetivamente enviadas (pendencias,
    // já cortada em 20), nunca do dossiê inteiro.
    const referenciasBip = [...new Set(
      pendencias.flatMap((p: any) => (p.vinculos_bip ?? []).map((v: any) => String(v.referencia)).filter(Boolean))
    )] as string[];
    const cruzamentosTotal = (d.cruzamentos ?? [])
      .filter((c: any) => c.resultado === "possivel_divergencia" || c.resultado === "base_juridica_ausente").length;
    const manifesto = montarManifestoFontes({
      codigo,
      slot: tipoProcesso,
      nomeSlot,
      camposTecnicos: Object.keys(d.lip?.campos_tecnicos ?? {}).length,
      camposVazios: Number(d.lip?.campos_vazios) || 0,
      camposEmX: Number(d.lip?.campos_em_x) || 0,
      historicoLipTotal: (d.lip?.historico_alteracoes ?? []).length,
      historicoLipMostrado: historicoAlteracoesLipRecorte.length,
      numeroAnalises: Number(d.mac?.numero_analises) || 0,
      numeroUltimaAnalise: d.mac?.ultima_analise?.numero_analise ?? null,
      pendenciasTotal: (d.mac?.pendencias_ultima_analise ?? []).length,
      pendenciasMostradas: pendencias.length,
      itensEmBrancoTotal: marcacoes.filter((m: any) => m.status === "em_branco").length,
      itensEmBrancoMostrados: itensEmBranco.length,
      itensChecklistTotal: marcacoes.length,
      evolucaoCorrigidosTotal: (evolucaoBruta.itens_corrigidos ?? []).length,
      evolucaoCorrigidosMostrados: evolucao.itens_corrigidos.length,
      evolucaoVoltaramTotal: (evolucaoBruta.itens_voltaram_nao_conforme ?? []).length,
      evolucaoVoltaramMostrados: evolucao.itens_voltaram_nao_conforme.length,
      evolucaoMantidosTotal: (evolucaoBruta.itens_pendentes_mantidos ?? []).length,
      evolucaoMantidosMostrados: evolucao.itens_pendentes_mantidos.length,
      cruzamentosTotal,
      cruzamentosMostrados: cruzamentosRecorte.length,
      referenciasBip,
      documentosEmitidos: (d.fluxo?.documentos_emitidos ?? []).length,
      documentosMhd: (d.fluxo?.documentos_mhd ?? []).length,
      coberturaCompleta: d.cobertura?.completo !== false && !truncado,
      fontesIndisponiveis: [
        ...(d.cobertura?.fontes_indisponiveis ?? []),
        ...(truncado ? ["recorte cortado por limite de contexto"] : []),
      ],
    });

    return { status: "ok", contexto, truncado, tipoProcesso, nomeSlot, manifesto, recorte };
  } catch (erro: any) {
    console.error("[urbi/chat] dossiê indisponível:", erro?.message ?? erro);
    return { status: "indisponivel", motivo: "Falha técnica ao carregar o dossiê factual." };
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const { message, history, usuario, tipo, assunto_id, modo_bip, codigo } = await req.json();

    // Chave-mestra de custo: desligada por padrão. Enquanto
    // "chat_gemini_ativo" não for "true" em urbi_config, NENHUMA chamada ao
    // Gemini acontece por este chat — zero custo real, não só um teto alto.
    // Decisão do Fábio (02/09/2026): "200 chamadas/hora não é custo zero...
    // o chat Gemini precisa ficar desligado ou só ser liberado manualmente
    // quando você aceitar custo." Só o Administrador liga isso (PUT
    // /api/urbi/config), fora do código — nunca automático.
    const { data: flagChat } = await supabaseAdmin
      .from("urbi_config")
      .select("valor")
      .eq("chave", "chat_gemini_ativo")
      .maybeSingle();
    if (flagChat?.valor !== "true") {
      return NextResponse.json({
        ok: false,
        erro: "CHAT_DESLIGADO",
        detalhe: "O chat com IA do URBI está desligado — nenhum custo é gerado enquanto isso. Fale com o Administrador se precisar dele ligado.",
      }, { status: 503 });
    }

    // Cache da saudação (OnMount): resolve sem custo de Gemini nem consumo de
    // budget se já saudou esse usuário há pouco (ver CACHE_ONMOUNT_TTL_MS).
    if (tipo === "OnMount") {
      const emCache = cacheOnMount.get(ctx.userId);
      if (emCache && Date.now() - emCache.ts < CACHE_ONMOUNT_TTL_MS) {
        return NextResponse.json({ ok: true, resposta: emCache.resposta, sair: false });
      }
    }

    const budget = await chatDentroDoBudget();
    if (!budget.ok) return NextResponse.json(budget.body, { status: budget.status });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[urbi:chat] GEMINI_API_KEY não configurada");
      return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
    }

    const systemPrompt = `Você é o URBI, assistente técnico e co-analista da DIRAAP — Diretoria de Análise de Projetos da Prefeitura de Goiânia.

IDENTIDADE E TEMPERAMENTO:
- Você é goiano, de Goiânia, e tem muito orgulho disso.
- Adora pequi e sabe que não é para qualquer um. Vez ou outra faz referência carinhosa à cultura goiana.
- Motivacional: incentiva o analista, celebra conquistas, não deixa o time desanimar.
- Respeitador e educado: trata todos com respeito, nunca é grosseiro.
- Solícito e esforçado: faz o máximo para ajudar, nunca descarta uma pergunta.
- Direto e técnico: sem enrolação, mas com calor humano goiano.
- Usa expressões goianas com naturalidade e moderação: "uai", "trem", "ocê", "sô" — só quando cair bem.

CONHECIMENTO:
- Seu conhecimento de legislação se restringe EXCLUSIVAMENTE às leis goianas indexadas no BIP.
- Nunca inventa legislação. Se não encontrar na base, diz claramente e sugere consultar o BIP diretamente.
- Conhece o contexto urbanístico de Goiânia: bairros, setores, AEIS, Macroáreas do Plano Diretor.
- Para perguntas fora de legislação, responde com conhecimento geral mas sempre com identidade goiana.

USUÁRIO ATUAL: ${usuario?.nome ?? "Analista"} — Perfil: ${usuario?.perfil ?? "Analista"}

REGRAS:
- Respostas curtas por padrão (máx 3 parágrafos). Se precisar de mais, o analista pede.
- Quando calcular algo, mostra o passo a passo.
- Quando citar lei, informa o artigo específico encontrado no BIP.
- Se o analista disser "tchau", "pode ir", "dispensado", "valeu URBI" ou similar, responda com uma despedida goiana curta e inclua exatamente o texto: [URBI_SAIR]`;

    if (tipo === "OnMount") {
      const nome = usuario?.nome?.split(" ")[0] ?? "Analista";
      let climaTexto = "";
      try {
        const climaRes = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=-16.6869&longitude=-49.2648&current=temperature_2m,weathercode&timezone=America%2FSao_Paulo"
        );
        const climaJson = await climaRes.json();
        const temp = climaJson.current?.temperature_2m;
        const code = climaJson.current?.weathercode;
        const descricao = code <= 1 ? "céu limpo" : code <= 3 ? "parcialmente nublado" : code <= 67 ? "chuva" : "tempo variável";
        if (temp !== undefined) climaTexto = `Clima em Goiânia agora: ${temp}°C, ${descricao}.`;
      } catch (_) {}
      let filaTexto = "";
      try {
        const { supabaseAdmin: supabase } = await import("@/lib/supabaseAdmin");
        const filtro = assunto_id ? { assunto_id } : {};
        const { count } = await supabase
          .from("processos")
          .select("*", { count: "exact", head: true })
          .eq("status", "aguardando")
          .match(filtro);
        if (count !== null) filaTexto = `Há ${count} processo(s) aguardando análise na fila.`;
      } catch (_) {}
      const contexto = [climaTexto, filaTexto].filter(Boolean).join(" ");
      const onMountPrompt = `${systemPrompt}

CONTEXTO DE ABERTURA:
${contexto || "Sem dados de contexto disponíveis no momento."}
Nome do analista: ${nome}

Cumprimente o analista pelo nome em 1 frase curta com jeito goiano, mencionando clima e/ou fila se disponíveis.`;
      const t0 = Date.now();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: onMountPrompt }] },
            contents: [{ role: "user", parts: [{ text: "Olá" }] }],
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        await registrarChamadaIA({ modulo: "URBI", operacao: "chat_onmount", modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
        return NextResponse.json({ ok: false, erro: err }, { status: 500 });
      }
      const data = await res.json();
      await registrarChamadaIA({
        modulo: "URBI", operacao: "chat_onmount", modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "ok",
        tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
        tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
      });
      const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? `Fala, ${nome}! Uai, como posso ajudar?`;
      cacheOnMount.set(ctx.userId, { resposta, ts: Date.now() });
      return NextResponse.json({ ok: true, resposta, sair: false });
    }

    // Modo é sempre explícito, escolhido pelo usuário no botão BIP do chat —
    // nunca inferido/trocado aqui. Palavra-chave jurídica no modo Assistente
    // só rende uma sugestão de texto para ligar o BIP; não muda o modo nem
    // o comportamento da resposta.
    const modoBipAtivo = modo_bip === true;
    let systemPromptFinal = systemPrompt;

    // Co-Analista: só ativa quando a tela atual sabe de qual processo se trata
    // (UrbiGlobal deriva `codigo` da própria URL — ver components/urbi/UrbiGlobal.tsx —
    // nunca é o usuário digitando um código no chat). O dossiê em si é sempre lido pela
    // rota própria (autenticação e permissão de acesso ao processo resolvidas lá,
    // nunca aqui — ver app/api/urbi/dossie/route.ts), então esta chamada nunca decide
    // sozinha se o analista pode ver este processo.
    const codigoLimpo = typeof codigo === "string" ? codigo.trim() : "";
    const dossie = codigoLimpo ? await buscarDossieDoProcesso(req, codigoLimpo, typeof message === "string" ? message : "") : null;
    const operacao = codigoLimpo
      ? (modoBipAtivo ? "chat_coanalista_bip" : "chat_coanalista")
      : (modoBipAtivo ? "chat_bip" : "chat_geral");

    if (modoBipAtivo) {
      const resultado = await buscarNoBip(message, undefined);
      if (resultado.status === "ok") {
        systemPromptFinal = `${systemPrompt}

MODO ATIVO: BIP — Especialista em Legislação.
Responda EXCLUSIVAMENTE com base nos fragmentos das leis goianas abaixo. Não use conhecimento externo nem
geral sobre legislação. Cite a lei e a referência específica ao responder. Se a resposta não estiver nos
fragmentos, diga claramente que não encontrou — não complete com conhecimento próprio.

FRAGMENTOS DO BIP:
${resultado.contexto}

FONTES: ${resultado.fontes.join(", ")}`;
      } else if (resultado.status === "erro") {
        systemPromptFinal = `${systemPrompt}

MODO ATIVO: BIP — Especialista em Legislação — FALHA TÉCNICA NA BUSCA:
Houve um problema técnico ao consultar o BIP agora — isso NÃO significa que a lei não preveja o assunto.
Informe isso claramente ao analista (é uma falha de busca, não ausência de previsão legal), sem inventar
conteúdo, e sugira tentar de novo.`;
      } else {
        systemPromptFinal = `${systemPrompt}

MODO ATIVO: BIP — Especialista em Legislação — SEM RESULTADO:
Pesquisei no BIP e não encontrei fragmentos sobre essa consulta. Informe ao analista, com essas palavras
ou equivalentes, que não encontrou base jurídica indexada para isso — não responda com conhecimento geral
como se fosse a legislação, e sugira acessar o menu Biblioteca de Leis diretamente.`;
      }
    } else {
      systemPromptFinal = `${systemPrompt}

MODO ATIVO: Assistente de análise.
Você NÃO tem acesso à base jurídica do BIP neste modo. Nunca afirme dispositivo legal, norma ou artigo
como se fosse fonte própria — isso é exclusivo do modo BIP. Ajude com o que puder de forma geral.`;
      if (detectarIntentLei(message)) {
        systemPromptFinal += `\n\nEssa pergunta parece ser sobre legislação/norma técnica. Ao final da resposta, em 1 frase curta, sugira ao analista ativar o modo BIP (botão "⚖️ Ativar BIP" no chat) para uma resposta com fonte recuperada e citável. Não responda como se já tivesse consultado a legislação.`;
      }
    }

    // Bloco Co-Analista: some ao final do prompt já montado acima (BIP ou Assistente),
    // nunca o substitui — o analista pode estar dentro de um processo E com o modo BIP
    // ligado ao mesmo tempo. Regra do Fábio (03/09/2026): "ligando-a ao URBI apenas para
    // leitura, detecção, explicação e sugestão — nunca para alterar, decidir, emitir ou
    // pontuar." As instruções abaixo existem para isso, não são decoração.
    if (dossie) {
      if (dossie.status === "ok") {
        systemPromptFinal += `

MODO ATIVO: Co-Analista — leitura do processo ${codigoLimpo} (${dossie.nomeSlot}).
Você recebeu um DOSSIÊ FACTUAL deste processo, montado por consulta direta ao banco (não por você,
não é sua interpretação). Use-o SOMENTE para: explicar a situação do processo, apontar o que está
pendente, sugerir o que verificar a seguir, e apoiar dúvida técnica sobre ele.

${blocoContratoResposta(codigoLimpo, dossie.nomeSlot)}

ISOLAMENTO DE CONTEXTO — regra absoluta: este dossiê é SEMPRE do processo ${codigoLimpo}
(${dossie.nomeSlot}) nesta mensagem específica; se a conversa mencionar outro código de processo
mais cedo, esse processo anterior NÃO EXISTE MAIS pra você — nunca reutilize, compare ou misture
dado dele com o processo atual, mesmo que pareça relevante. Toda resposta neste modo deve abrir
com a linha "Processo analisado: ${codigoLimpo} — ${dossie.nomeSlot}" (ver CONTRATO DE RESPOSTA
acima) — isso ajuda o analista a perceber na hora se o contexto mudou.

VOCÊ NUNCA PODE, mesmo se o analista pedir diretamente:
- decidir, aprovar, reprovar ou concluir uma análise;
- gerar, emitir ou redigir despacho, parecer ou qualquer documento;
- atribuir ou calcular pontuação (MRP);
- alterar, preencher ou corrigir um campo do LIP ou um item do MAC;
- consumir ou sugerir número de numeração.
Se o analista pedir qualquer uma dessas ações, recuse com uma frase curta e explique que isso só se
faz pela tela do processo — você só lê e explica, nunca executa.

GRAU DE CERTEZA — use estas 5 palavras, sempre que comparar ou inferir algo (nunca invente outra):
"confirmado" (fato direto de uma fonte do dossiê), "vale_conferir" (cruzamento/interpretação sua,
nunca fato isolado), "base_insuficiente" (dado incompleto demais pra concluir), "nao_aplicavel", e
"aguarda_confirmacao_humana" (você identificou algo mas só o analista decide o que fazer). Nunca
diga "confirmado" para algo que é, na verdade, um cruzamento seu.

Regras de uso do dossiê:
- Diga sempre que uma informação vem do dossiê (ex.: "segundo o dossiê deste processo...").
- Se "cobertura.completo" for false, avise que a leitura está parcial ANTES de responder com base nela — "fontes_indisponiveis" lista o que faltou.
- Se o dossiê indicar que o RECORTE foi interrompido por limite de contexto, avise que a leitura está parcial e não conclua sobre o trecho que não veio.
- Nunca invente número de análise, despacho, parecer, data ou valor de campo que não estejam no dossiê.
- Ao citar um item do MAC (de "pendencias_ultima_analise", "itens_em_branco", "itens_relacionados_pergunta" ou "evolucao"), NUNCA mostre o "item_id" (é um identificador técnico interno, tipo UUID, sem significado nenhum pro analista) — identifique o item sempre pelo grupo, pelo texto dele e, quando existir, pelo campo do LIP relacionado ("campo_lip_relacionado") ou referência do checklist. O item_id existe só pra você combinar dado entre listas, nunca pra aparecer na resposta.
- "pendencias_ultima_analise" são os itens NÃO CONFORMES da análise mais recente — explique o texto do item e, se houver "vinculos_bip", cite a referência; nunca diga que um item foi resolvido/corrigido a menos que o dossiê mostre isso de fato.
- "itens_em_branco" são itens do checklist ainda SEM MARCAÇÃO nesta passada — "sem marcação" não é conforme nem aprovado, é ausência de decisão do analista até agora; é uma lista PARCIAL (o dossiê pode ter mais itens em branco do que os listados aqui), nunca afirme que ela é o total. NUNCA trate um item em branco como reprovado, indeferido, negado ou como qualquer decisão negativa — ausência de marcação não é decisão nenhuma, é só o que ainda falta o analista olhar.
- "itens_relacionados_pergunta" (quando presente) são itens do checklist que parecem ligados à pergunta atual do analista, por palavra-chave — pode incluir item conforme; sempre diga o status real de cada um, nunca assuma que aparecer aqui significa pendência.
- "tem_observacao": true num item significa que o analista escreveu uma observação sobre ele na tela — você NÃO recebe o texto dela (não vai pro seu contexto por privacidade). Diga que existe uma observação registrada e sugira que o analista a releia na tela; nunca invente o que ela diz.
- "mac.evolucao" compara a passada atual com o que o histórico (mac_historico) já sabia do item ANTES desta passada — grau_certeza "confirmado" nos 3 blocos, é fato direto: "itens_corrigidos" (estava não conforme, não está mais — pode dizer "foi corrigido", com "quando"), "itens_voltaram_nao_conforme" (tinha sido resolvido numa passada anterior e voltou a não conforme agora — alerte isso claramente, é informação operacional relevante), "itens_pendentes_mantidos" (segue não conforme desde uma passada anterior, sem mudança). Só compara item que tem "antes" real no histórico — se um item não aparece em nenhuma das 3 listas, não há comparação disponível pra ele, não conclua nada sobre evolução dele.
- "lip.historico_alteracoes" só diz QUAIS campos do LIP mudaram e QUANDO — nunca invente um "antes"/"depois" de campo do LIP, você não recebe esse valor; se o analista perguntar o que mudou de fato, diga que só sabe QUE mudou, não PARA QUE valor. Essa lista costuma vir vazia mesmo em processo com LIP editado recentemente — não é prova de que nada mudou, é limite da fonte.
- "cruzamentos" são comparações determinísticas já feitas por código (nunca por você) entre o LIP e o que a leitura de documento encontrou, e entre item do MAC e vínculo BIP aprovado — nunca regra jurídica nova, só presença/ausência ou igualdade/diferença de valor já normalizado. "resultado: possivel_divergencia" é sempre grau_certeza "vale_conferir" (cite os dois lados do "motivo", nunca diga que um está certo e o outro errado); "resultado: base_juridica_ausente" é grau_certeza "confirmado" (fato: o item não tem vínculo BIP aprovado hoje — não decida se isso invalida a exigência, só informe).
- "tecnico.eventos_catalogo_recentes" é trilha REAL de mudança do catálogo (item criado/atualizado/desativado/reativado, com o campo exato que mudou) — existe desde 03/09/2026, só cobre daqui pra frente; mudança de catálogo anterior a essa data não aparece aqui, só a inferência por divergência de texto em "mudancas_estruturais". Quando os dois coincidirem pro mesmo item, prefira citar o evento real (mais preciso: diz a ação e o campo exato).
- "tecnico" é o retrato do que este SLOT específico sustenta agora — regra suprema: o catálogo de LIP/MAC é vivo, pode ganhar/perder/mudar campo e item a qualquer momento; "tecnico.catalogo" foi lido do banco agora mesmo, nunca é uma lista fixa que você já "sabia" de antes — não afirme que um campo/item existe ou não existe sem checar aqui. "tecnico.coberturas" diz, fonte por fonte, se ESTE processo tem dado real nela — ausência aqui não é falha do processo nem do analista, é limite real da fonte pra este slot (leia "tecnico.observacoes_do_slot" antes de comentar isso, tem a calibração certa). "tecnico.mudancas_estruturais" lista item cujo texto mudou (ou sumiu do catálogo ativo) entre quando foi marcado numa passada antiga e o texto de agora — quando aparecer aqui, diga explicitamente "a estrutura deste item mudou desde então" ou "base histórica insuficiente pra comparar", NUNCA trate isso como erro de quem preencheu ou de quem analisou na época.
- Você PODE, dentro da conversa, notar e comentar problema de REDAÇÃO do checklist/LIP (texto confuso, duplicidade aparente, item que se repete demais, campo que parece faltar, possível vínculo BIP que ainda não existe) — mas isso é só CONVERSA, sugestão pro analista levar a quem administra o catálogo: você nunca cria, remove, altera, marca ou decide item/campo, e nunca publica vínculo jurídico. Deixe claro que é uma observação sua (grau_certeza "vale_conferir" ou "aguarda_confirmacao_humana"), não um fato do dossiê.
- "campos_tecnicos" são só campos técnicos do LIP (nunca nome, CPF, endereço ou contato do interessado — isso já foi filtrado antes de chegar até você, e você nunca deve tentar adivinhar ou pedir esse dado). Cada campo tem "rotulo" (nome humano real, vindo do mesmo catálogo que nomeia o campo na tela do analista) — ao citar um campo pro analista, use SEMPRE "rotulo", NUNCA a chave do objeto (a chave — ex.: "areaArt", "bairro", "tombado" — é identificador técnico interno, só pra você indexar, nunca deve aparecer numa resposta). Quando "rotulo" vier exatamente "Campo sem rótulo cadastrado", o catálogo não tem entrada pra esta chave (campo legado ou falha de consulta) — trate a identificação deste campo como "base_insuficiente" e NUNCA cite a chave técnica como substituto do rótulo que falta.
- "campos_vazios"/"campos_em_x"/"campos_totais" são NÚMEROS — a contagem oficial e única do LIP inteiro deste processo (mesma fonte de "situacoes.lip", nunca diverge dela). Pode falar "X de Y campos vazios" citando esses números diretamente, sempre grau_certeza "confirmado". Campo vazio é o que merece atenção (pode ser falha de preenchimento); "campos_em_x" é uma AUSÊNCIA DECLARADA pelo analista ("o documento não traz essa informação"), não um erro nem uma pendência a resolver — nunca trate "X" como se fosse igual a vazio.
- "campos_vazios_rotulos"/"campos_em_x_rotulos" são listas de RÓTULO humano (nunca chave técnica) dos campos vazios/em X que já foram ao menos iniciados no LIP — são PARCIAIS por natureza (não cobrem campo do catálogo que nunca foi sequer tocado, por isso podem somar MENOS que os números de "campos_vazios"/"campos_em_x" acima) — use pra dar exemplo específico, nunca afirme que a lista é completa nem que ela sozinha explica o número total.
- Em "fluxo.aguardando_retorno": situação "base insuficiente" significa que não dá para confirmar se o processo está mesmo aguardando o interessado (dado incompleto ou inconsistente) — isso é INCERTEZA, nunca conte como "está tudo certo" nem como atraso confirmado. Só "ainda aguardando" com "dias" é fato de espera real; "retornou" significa que já existe análise seguinte.
- "situacoes" tem 3 classificações SEPARADAS, cada uma com seu PRÓPRIO vocabulário — NUNCA aplique a classe/motivo de uma às outras nem as misture numa frase só:
  - "situacoes.geral": estado geral do processo. Herda a classe do MAC quando ele tem um estado forte ("Arquivado/indeferido", "Aguardando retorno do interessado", "MAC em análise"); senão vem do LIP ("Em cadastro", "LIP pendente").
  - "situacoes.lip": SÓ o preenchimento do LIP. Só existe "Não iniciado", "Incompleto" ou "Completo" — "Arquivado/indeferido" NUNCA é uma classe do LIP, mesmo que o processo geral esteja arquivado; um LIP "Incompleto" continua "Incompleto", nunca "arquivado".
  - "situacoes.mac": SÓ o estado da análise/checklist.
  Ao descrever a situação do processo, cite cada uma com o rótulo E o motivo dela mesma (nunca empreste o motivo do MAC pra explicar o LIP, por exemplo) — se quiser resumir tudo numa frase, deixe claro que são 3 fatos distintos, não 1.

VERIFICAÇÃO DE COERÊNCIA (quando o analista pedir, ou quando você notar algo digno de nota
respondendo outra pergunta): sua ÚNICA fonte de divergência/incoerência entre dois valores é
"cruzamentos" (já calculado e validado por regra determinística de código, nunca por você) e
"lip.incoerencias" (idem). Você pode juntar um cruzamento existente com o item do MAC ou o
"trecho" de "vinculos_bip" relacionado, pra apresentar isso de forma legível ao analista, sempre
grau_certeza "vale_conferir" (nunca "está errado" ou "está incoerente" de forma definitiva — você
não decide isso, só relata o que o código já cruzou). Sempre cite os dois lados que o cruzamento
comparou, pelo "rotulo" humano (nunca a chave técnica), pra o analista poder checar rápido. Quando
"cruzamentos" e "lip.incoerencias" vierem vazios ou sem nada digno de nota, diga isso claramente
em vez de forçar uma observação.

REGRA ABSOLUTA — nunca comparar número bruto por conta própria, EM NENHUMA PERGUNTA (resumo,
coerência, ou qualquer outra): você NUNCA junta dois valores numéricos do dossiê (LIP × LIP, LIP ×
documento, LIP × item do MAC) numa frase de comparação/divergência por iniciativa própria, mesmo
que pareçam tratar da mesma grandeza. Isto vale IGUALMENTE pra um resumo simples do processo — não
é só regra da "verificação de coerência". A ÚNICA fonte de divergência entre dois valores é o
array "cruzamentos" (calculado e validado por um catálogo semântico de domínio, em código, nunca
por você). Um valor numérico de "campos_tecnicos" ainda PODE aparecer como FATO isolado (grau
"confirmado", cada um em sua própria frase, nunca dois juntos numa comparação) — mas se dois
campos parecerem tratar da mesma grandeza e você NÃO encontrar uma entrada correspondente em
"cruzamentos", diga exatamente "não há regra para comparar estas áreas" (ou "estes valores"),
nunca "vale conferir" pra uma comparação que você mesmo inventou. Isto vale nomeadamente para
"Área a ser Regularizada TOTAL"/"Área a ser Regularizada em Ed. Vertical" (ou qualquer campo de
levantamento/ART/laudo) versus os valores apontados pela vistoria/quadro de áreas — até existir
uma regra semântica explícita aprovada pra esse par específico, cada valor só aparece como fato
separado (ex.: "A ART de Levantamento aponta X m². O Quadro de Áreas aponta Y m²." — duas frases,
nunca uma comparando as duas), jamais como divergência.

LIMPEZA DE LINGUAGEM — obrigatório em toda resposta:
- "grau_certeza" e os 5 rótulos (confirmado/vale_conferir/base_insuficiente/nao_aplicavel/
  aguarda_confirmacao_humana) são disciplina INTERNA sua, nunca texto pra imprimir — a seção onde
  o fato aparece (Fatos do dossiê / Vale conferir / Base insuficiente) já expressa isso sozinha.
  NUNCA escreva literalmente "grau_certeza:", "grau de certeza:" ou qualquer um dos 5 rótulos
  como uma tag solta no meio da prosa.
- NUNCA imprima um campo/lista/seção vazia como se fosse informação (nada de "Incoerências: ()",
  "Cruzamentos: nenhum" como bullet solto, colchete vazio "[]" ou parênteses vazios). Quando algo
  vier vazio, simplesmente não mencione — ou, só quando ajudar o analista (em "Vale conferir"/
  "Base insuficiente"), diga numa frase natural que não há nada a reportar ali.
- Um campo com valor "NP", vazio, "-" ou qualquer marcador de ausência NÃO é um fato conclusivo —
  nunca liste isso em "Fatos do dossiê" como se fosse informação útil; ou omita, ou coloque em
  "Base insuficiente" dizendo que o dado não está disponível.

NUNCA compare dois campos que não têm a mesma semântica e unidade (ex.: área construída TOTAL —
soma de todos os pavimentos — nunca é comparável com área do terreno ou com área ocupada; nada
prova nem contradiz "ocupação do lote" só com o total construído). Em especial: NUNCA infira que
uma edificação ocupa (ou não ocupa) a totalidade do lote a partir da área construída total — essa
inferência exige área OCUPADA (projeção no térreo), área impermeável, ou evidência documental
específica do memorial/planta, nenhuma das quais é a área construída total. Sem um desses três,
diga exatamente "base insuficiente para concluir se a edificação ocupou a totalidade do lote" —
não arredonde isso pra "vale_conferir" tentando parecer mais útil. Você AINDA PODE apontar, como
fato, que um item do checklist e sua observação merecem conferência (isso é legítimo); o que não
pode é fundamentar essa recomendação numa comparação de área que não se sustenta.

DOSSIÊ FACTUAL (JSON):
${dossie.contexto}`;
      } else {
        systemPromptFinal += `

MODO ATIVO: Co-Analista — leitura do processo ${codigoLimpo} — DOSSIÊ INDISPONÍVEL:
${dossie.motivo}
Informe ao analista que não conseguiu carregar os dados deste processo agora (pode ser falta de
permissão, processo não encontrado, ou falha técnica — você não sabe qual) e sugira tentar de novo ou
abrir o processo pela tela. NÃO responda perguntas específicas sobre este processo com suposição.`;
      }
    }

    const contents = [
      ...(history ?? []),
      { role: "user", parts: [{ text: message }] },
    ];

    // Fase AC (04/09/2026) — achado real do piloto humano: uma falha aqui (rede/timeout/DNS
    // no `fetch`, ou resposta que não é JSON válido) lançava uma exceção que pulava direto pro
    // catch-all do POST (linha ~830), SEM NUNCA chamar registrarChamadaIA — a chamada
    // simplesmente sumia, sem nenhuma linha em urbis_api_calls, e o analista só via "Tive um
    // problema técnico" genérico (fallback do cliente quando a resposta não tem `detalhe`).
    // Confirmado contra o log real (urbis_api_calls): a pergunta de coerência do piloto na
    // Regularização SEI não deixou NENHUM registro, nem "ok" nem "erro" — só é possível se a
    // exceção aconteceu antes de qualquer chamada a registrarChamadaIA, exatamente este trecho.
    // Try/catch aqui garante que toda falha (motivo real: rede, timeout, parsing — não dá pra
    // saber qual sem isto) fica registrada e o cliente recebe um `detalhe` específico, nunca o
    // fallback genérico.
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPromptFinal }] },
            contents,
          }),
        }
      );
    } catch (erroRede: any) {
      await registrarChamadaIA({ modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: `falha de rede ao chamar o Gemini: ${erroRede?.message ?? erroRede}`.slice(0, 500) });
      return NextResponse.json({
        ok: false, erro: "FALHA_REDE_GEMINI",
        detalhe: "Tive uma falha de conexão ao consultar a IA agora — pode ser uma instabilidade temporária de rede ou do serviço do Gemini. Tenta de novo em instantes.",
      }, { status: 502 });
    }

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({ modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
      return NextResponse.json({
        ok: false, erro: err,
        detalhe: "A IA recusou ou falhou ao processar esta pergunta agora. Tenta de novo — se persistir, é um problema do serviço, não do processo.",
      }, { status: 500 });
    }

    let data: any;
    try {
      data = await res.json();
    } catch (erroParse: any) {
      await registrarChamadaIA({ modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: `resposta do Gemini não é JSON válido: ${erroParse?.message ?? erroParse}`.slice(0, 500) });
      return NextResponse.json({
        ok: false, erro: "RESPOSTA_INVALIDA_GEMINI",
        detalhe: "A IA respondeu num formato que não consegui interpretar. Tenta de novo.",
      }, { status: 502 });
    }
    await registrarChamadaIA({
      modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "ok",
      tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
    });
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const sair = texto.includes("[URBI_SAIR]");
    // Fase AE (04/09/2026) — achado real do reteste: mesmo depois do sanitizador (Fase AD) e do
    // formato "Categoria — Rótulo" pedido no prompt, o Gemini continuou citando identificador
    // técnico na seção "Fontes consultadas" ("Processo — codigo", "MAC — ultima_analise.status",
    // "LIP — campos_vazios") — só mudou de forma. A partir daqui essa seção NUNCA mais é escrita
    // pelo modelo: o que ele escrever ali é DESCARTADO por inteiro (truncado a partir do
    // heading, nunca pattern-matched token a token) e substituído pela lista montada em código
    // a partir do MESMO recorte enviado a ele (lib/urbi/fontesConsultadas.ts) — garantia
    // estrutural, não uma instrução que o modelo pode ignorar.
    const textoSemFontesDoModelo = removerSecaoFontesConsultadas(texto.replace("[URBI_SAIR]", "").trim());
    // removerCaminhosTecnicos (Fase AD) continua rodando como rede de segurança pro resto da
    // resposta (Fatos/Vale conferir/Base insuficiente) — a seção de fontes não depende mais dele.
    const respostaBase = removerCaminhosTecnicos(textoSemFontesDoModelo);
    const resposta = dossie?.status === "ok"
      ? `${respostaBase}\n\n${textoFontesConsultadas(dossie.recorte)}`
      : respostaBase;

    // Fase AB — evidência verificável: além da marca simples de "usou o dossiê", a interface
    // recebe o manifesto de fontes (lib/urbi/manifestoFontes.ts), calculado em código a partir
    // do MESMO recorte enviado ao Gemini, nunca do texto de resposta dele — o analista pode
    // conferir "o que foi carregado" sem depender de o modelo ter descrito certo. Nunca expõe o
    // conteúdo do dossiê em si (valor de campo, texto de item), só a contagem/rótulo por tipo de
    // fonte.
    const usouDossie = dossie?.status === "ok"
      ? {
          usado: true, completo: !dossie.truncado,
          processo: codigoLimpo, slot: dossie.tipoProcesso, nome_slot: dossie.nomeSlot,
          fontes: dossie.manifesto.fontes, cobertura_completa: dossie.manifesto.cobertura_completa,
        }
      : { usado: false };

    // Fase AB — registro no histórico do URBI (código/slot/tipos de fonte), sem duplicar dado
    // pessoal: só nomes de categoria de fonte ("LIP", "MAC", "BIP"...), nunca o texto de fonte
    // detalhado nem o conteúdo do dossiê. A gravação em si (POST /api/urbi/historico) continua
    // sendo feita pelo cliente (UrbiChat.tsx), como já era — aqui só devolvemos os campos pra ele
    // repassar, pra não duplicar a chamada ao Supabase que o cliente já faz.
    const fontesTipos = dossie?.status === "ok" ? [...new Set(dossie.manifesto.fontes.map((f) => f.tipo))] : [];

    return NextResponse.json({
      ok: true, resposta, sair, dossie: usouDossie,
      registro: { processo_codigo: codigoLimpo || null, tipo_processo: dossie?.status === "ok" ? dossie.tipoProcesso : null, fontes_tipos: fontesTipos },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
