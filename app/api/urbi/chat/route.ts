import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { registrarChamadaIA } from "@/lib/iaUso";
import { autenticar } from "@/lib/auth";

export const maxDuration = 60;

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
  const { data: frags, error: erroFrags } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .select("id, documento_id, referencia, texto")
    .in("documento_id", idsAlvo)
    .ilike("texto", `%${palavrasChave[0]}%`)
    .limit(8);
  if (erroFrags) {
    console.error("[urbi:buscarNoBip] falha ao consultar bdi_lei_fragmentos:", erroFrags.message);
    return { status: "erro", contexto: "", fontes: [] };
  }
  if (!frags || frags.length === 0)
    return { status: "sem_resultado", contexto: "", fontes: [] };

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

export async function POST(req: NextRequest) {
  try {
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const { message, history, usuario, tipo, assunto_id, modo_bip } = await req.json();

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
      return NextResponse.json({ ok: true, resposta, sair: false });
    }

    // Modo é sempre explícito, escolhido pelo usuário no botão BIP do chat —
    // nunca inferido/trocado aqui. Palavra-chave jurídica no modo Assistente
    // só rende uma sugestão de texto para ligar o BIP; não muda o modo nem
    // o comportamento da resposta.
    const modoBipAtivo = modo_bip === true;
    let systemPromptFinal = systemPrompt;
    const operacao = modoBipAtivo ? "chat_bip" : "chat_geral";

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

    return NextResponse.json({ ok: true, resposta, sair });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
