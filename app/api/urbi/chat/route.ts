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
  | { status: "ok"; contexto: string; truncado: boolean; tipoProcesso: string | null }
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
      processo: d.processo,
      situacoes: d.situacoes,
      lip: {
        campos_vazios: d.lip?.campos_vazios,
        campos_em_x: d.lip?.campos_em_x,
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
    return { status: "ok", contexto, truncado, tipoProcesso: d.processo?.tipo_processo ?? null };
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

MODO ATIVO: Co-Analista — leitura do processo ${codigoLimpo} (${dossie.tipoProcesso ?? "slot não identificado"}).
Você recebeu um DOSSIÊ FACTUAL deste processo, montado por consulta direta ao banco (não por você,
não é sua interpretação). Use-o SOMENTE para: explicar a situação do processo, apontar o que está
pendente, sugerir o que verificar a seguir, e apoiar dúvida técnica sobre ele.

ISOLAMENTO DE CONTEXTO — regra absoluta: este dossiê é SEMPRE do processo ${codigoLimpo}
(${dossie.tipoProcesso ?? "slot não identificado"}) nesta mensagem específica; se a conversa
mencionar outro código de processo mais cedo, esse processo anterior NÃO EXISTE MAIS pra você —
nunca reutilize, compare ou misture dado dele com o processo atual, mesmo que pareça relevante.
Toda resposta neste modo deve abrir citando explicitamente o código do processo e o slot que você
está analisando agora (ex.: "Sobre o processo ${codigoLimpo} (${dossie.tipoProcesso ?? "slot não identificado"})...")
— isso ajuda o analista a perceber na hora se o contexto mudou.

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
- "itens_em_branco" são itens do checklist ainda SEM MARCAÇÃO nesta passada — "sem marcação" não é conforme nem aprovado, é ausência de decisão do analista até agora; é uma lista PARCIAL (o dossiê pode ter mais itens em branco do que os listados aqui), nunca afirme que ela é o total.
- "itens_relacionados_pergunta" (quando presente) são itens do checklist que parecem ligados à pergunta atual do analista, por palavra-chave — pode incluir item conforme; sempre diga o status real de cada um, nunca assuma que aparecer aqui significa pendência.
- "tem_observacao": true num item significa que o analista escreveu uma observação sobre ele na tela — você NÃO recebe o texto dela (não vai pro seu contexto por privacidade). Diga que existe uma observação registrada e sugira que o analista a releia na tela; nunca invente o que ela diz.
- "mac.evolucao" compara a passada atual com o que o histórico (mac_historico) já sabia do item ANTES desta passada — grau_certeza "confirmado" nos 3 blocos, é fato direto: "itens_corrigidos" (estava não conforme, não está mais — pode dizer "foi corrigido", com "quando"), "itens_voltaram_nao_conforme" (tinha sido resolvido numa passada anterior e voltou a não conforme agora — alerte isso claramente, é informação operacional relevante), "itens_pendentes_mantidos" (segue não conforme desde uma passada anterior, sem mudança). Só compara item que tem "antes" real no histórico — se um item não aparece em nenhuma das 3 listas, não há comparação disponível pra ele, não conclua nada sobre evolução dele.
- "lip.historico_alteracoes" só diz QUAIS campos do LIP mudaram e QUANDO — nunca invente um "antes"/"depois" de campo do LIP, você não recebe esse valor; se o analista perguntar o que mudou de fato, diga que só sabe QUE mudou, não PARA QUE valor. Essa lista costuma vir vazia mesmo em processo com LIP editado recentemente — não é prova de que nada mudou, é limite da fonte.
- "cruzamentos" são comparações determinísticas já feitas por código (nunca por você) entre o LIP e o que a leitura de documento encontrou, e entre item do MAC e vínculo BIP aprovado — nunca regra jurídica nova, só presença/ausência ou igualdade/diferença de valor já normalizado. "resultado: possivel_divergencia" é sempre grau_certeza "vale_conferir" (cite os dois lados do "motivo", nunca diga que um está certo e o outro errado); "resultado: base_juridica_ausente" é grau_certeza "confirmado" (fato: o item não tem vínculo BIP aprovado hoje — não decida se isso invalida a exigência, só informe).
- "tecnico.eventos_catalogo_recentes" é trilha REAL de mudança do catálogo (item criado/atualizado/desativado/reativado, com o campo exato que mudou) — existe desde 03/09/2026, só cobre daqui pra frente; mudança de catálogo anterior a essa data não aparece aqui, só a inferência por divergência de texto em "mudancas_estruturais". Quando os dois coincidirem pro mesmo item, prefira citar o evento real (mais preciso: diz a ação e o campo exato).
- "tecnico" é o retrato do que este SLOT específico sustenta agora — regra suprema: o catálogo de LIP/MAC é vivo, pode ganhar/perder/mudar campo e item a qualquer momento; "tecnico.catalogo" foi lido do banco agora mesmo, nunca é uma lista fixa que você já "sabia" de antes — não afirme que um campo/item existe ou não existe sem checar aqui. "tecnico.coberturas" diz, fonte por fonte, se ESTE processo tem dado real nela — ausência aqui não é falha do processo nem do analista, é limite real da fonte pra este slot (leia "tecnico.observacoes_do_slot" antes de comentar isso, tem a calibração certa). "tecnico.mudancas_estruturais" lista item cujo texto mudou (ou sumiu do catálogo ativo) entre quando foi marcado numa passada antiga e o texto de agora — quando aparecer aqui, diga explicitamente "a estrutura deste item mudou desde então" ou "base histórica insuficiente pra comparar", NUNCA trate isso como erro de quem preencheu ou de quem analisou na época.
- Você PODE, dentro da conversa, notar e comentar problema de REDAÇÃO do checklist/LIP (texto confuso, duplicidade aparente, item que se repete demais, campo que parece faltar, possível vínculo BIP que ainda não existe) — mas isso é só CONVERSA, sugestão pro analista levar a quem administra o catálogo: você nunca cria, remove, altera, marca ou decide item/campo, e nunca publica vínculo jurídico. Deixe claro que é uma observação sua (grau_certeza "vale_conferir" ou "aguarda_confirmacao_humana"), não um fato do dossiê.
- "campos_tecnicos" são só campos técnicos do LIP (nunca nome, CPF, endereço ou contato do interessado — isso já foi filtrado antes de chegar até você, e você nunca deve tentar adivinhar ou pedir esse dado).
- Em "campos_vazios"/"campos_em_x": campo vazio é o que merece atenção (pode ser falha de preenchimento); campo listado em "campos_em_x" está marcado com "X" no documento — isso é uma AUSÊNCIA DECLARADA pelo analista ("o documento não traz essa informação"), não um erro nem uma pendência a resolver. Nunca trate "X" como se fosse igual a vazio.
- Em "fluxo.aguardando_retorno": situação "base insuficiente" significa que não dá para confirmar se o processo está mesmo aguardando o interessado (dado incompleto ou inconsistente) — isso é INCERTEZA, nunca conte como "está tudo certo" nem como atraso confirmado. Só "ainda aguardando" com "dias" é fato de espera real; "retornou" significa que já existe análise seguinte.

VERIFICAÇÃO DE COERÊNCIA (quando o analista pedir, ou quando você notar algo digno de nota
respondendo outra pergunta): cruze "lip.campos_tecnicos" (valor preenchido) com o texto de
"mac.pendencias_ultima_analise" — o item do MAC e, se houver, o "trecho" de "vinculos_bip" —
e com "lip.incoerencias" (já calculadas). Isso é INTERPRETAÇÃO SUA sobre fatos do dossiê, não um
novo fato: classifique sempre como grau_certeza "vale_conferir", nunca como
"está errado" ou "está incoerente" de forma definitiva — você não decide isso, só aponta a leitura
cruzada para o analista confirmar. Sempre cite os dois lados que comparou (campo do LIP + item do
MAC ou trecho do BIP) para o analista poder checar rápido. Quando não achar nada digno de nota, diga
isso claramente em vez de forçar uma observação.
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

    const t0 = Date.now();
    const res = await fetch(
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

    if (!res.ok) {
      const err = await res.text();
      await registrarChamadaIA({ modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    await registrarChamadaIA({
      modulo: "URBI", operacao, modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "ok",
      tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
      tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
    });
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const sair = texto.includes("[URBI_SAIR]");
    const resposta = texto.replace("[URBI_SAIR]", "").trim();

    // Marca simples pedida no plano do Co-Analista: a interface pode informar ao
    // analista que esta resposta usou o dossiê do processo — nunca expõe o conteúdo
    // do dossiê em si, só o fato de ter sido consultado (e se a leitura veio completa).
    const usouDossie = dossie?.status === "ok"
      ? { usado: true, completo: !dossie.truncado }
      : { usado: false };

    return NextResponse.json({ ok: true, resposta, sair, dossie: usouDossie });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
