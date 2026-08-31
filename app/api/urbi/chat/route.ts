import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { registrarChamadaIA } from "@/lib/iaUso";

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
    const { message, history, usuario, tipo, assunto_id, lei_id, buscar_em_todas, aguardando_lei, leis_disponiveis } =
      await req.json();

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

    // Se aguardando resposta de qual lei
    if (aguardando_lei && leis_disponiveis) {
      const leisIds: {id: string; nome: string}[] = leis_disponiveis;
      const t = message.toLowerCase();
      let leiEscolhida: string | null = null;
      if (t.includes("todas") || t.includes("pesquisa em todas")) {
        leiEscolhida = "TODAS";
      } else {
        for (const lei of leisIds) {
          const nomeNorm = lei.nome.toLowerCase();
          const numMatch = nomeNorm.match(/\d{3,}/);
          const palavrasLei = nomeNorm.split(/\s+/).filter((p: string) => p.length > 4);
          const matches = palavrasLei.filter((p: string) => t.includes(p));
          if (matches.length >= 1 || (numMatch && t.includes(numMatch[0]))) { leiEscolhida = lei.id; break; }
        }
      }
      if (!leiEscolhida) {
        return NextResponse.json({ ok: true, resposta: "Uai, não entendi qual lei, sô! Repete o nome ou número?", sair: false, aguardando_lei: true, leis_disponiveis });
      }
      const perguntaOriginal = history?.length > 0 ? history[history.length - 2]?.parts?.[0]?.text ?? message : message;
      const resultado = await buscarNoBip(perguntaOriginal, leiEscolhida === "TODAS" ? undefined : leiEscolhida);
      if (resultado.status === "ok") {
        const promptBip = `${systemPrompt}\n\nMODO BIP: Responda em 2-3 frases. Cite a referência (artigo/seção). Não transcreva.\n\nFRAGMENTOS:\n${resultado.contexto}\n\nFONTES: ${resultado.fontes.join(", ")}`;
        const contents = [...(history ?? []), { role: "user", parts: [{ text: perguntaOriginal }] }];
        const t0 = Date.now();
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: promptBip }] }, contents }) });
        if (!res.ok) {
          const err = await res.text();
          await registrarChamadaIA({ modulo: "URBI", operacao: "chat_bip_lei_selecionada", modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500) });
          return NextResponse.json({ ok: false, erro: err }, { status: 500 });
        }
        const data = await res.json();
        await registrarChamadaIA({
          modulo: "URBI", operacao: "chat_bip_lei_selecionada", modelo: GEMINI_MODEL, duracaoMs: Date.now() - t0, status: "ok",
          tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
          tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
        });
        const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "Não encontrei no BIP.";
        return NextResponse.json({ ok: true, resposta: texto, sair: false });
      } else if (resultado.status === "erro") {
        return NextResponse.json({ ok: true, resposta: "Uai, deu um problema técnico pesquisando no BIP agora, sô — não é que a lei não exista, foi falha na busca mesmo. Tenta de novo ou usa o menu BIP direto.", sair: false });
      } else {
        return NextResponse.json({ ok: true, resposta: "Pesquisei no BIP e não encontrei. Tenta consultar diretamente pelo menu BIP.", sair: false });
      }
    }

    const ehLei = detectarIntentLei(message);
    let systemPromptFinal = systemPrompt;

    if (ehLei) {
      const leiEspecificada = lei_id ?? null;
      if (!leiEspecificada && !buscar_em_todas) {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
        const { data: leisDisp } = await supabaseAdmin
          .from("bdi_documentos_lei")
          .select("id, titulo, numero, ano")
          .order("titulo", { ascending: true });
        const leisIds = (leisDisp ?? []).map((l: any) => ({ id: l.id, nome: `${l.titulo}${l.numero ? ` nº ${l.numero}` : ""}${l.ano ? `/${l.ano}` : ""}` }));
        const listaLeis = leisIds.map((l: any) => `• ${l.nome}`).join("\n");
        const resposta = `Uai, boa pergunta! 📋 Em qual lei pesquiso?\n\n${listaLeis}\n\nOu diga **"pesquisa em todas"**!`;
        return NextResponse.json({ ok: true, resposta, sair: false, aguardando_lei: true, leis_disponiveis: leisIds });
      }
      const resultado = await buscarNoBip(message, leiEspecificada ?? undefined);
      if (resultado.status === "ok") {
        systemPromptFinal = `${systemPrompt}

MODO BIP ATIVO — USE APENAS OS FRAGMENTOS ABAIXO:
Responda exclusivamente com base nos fragmentos das leis goianas fornecidos. Não use conhecimento externo.
Cite a lei e a referência específica ao responder. Se a resposta não estiver nos fragmentos, diga claramente.

FRAGMENTOS DO BIP:
${resultado.contexto}

FONTES: ${resultado.fontes.join(", ")}`;
      } else if (resultado.status === "erro") {
        systemPromptFinal = `${systemPrompt}

MODO BIP ATIVO — FALHA TÉCNICA NA BUSCA:
Houve um problema técnico ao consultar o BIP agora — isso NÃO significa que a lei não preveja o assunto.
Informe isso claramente ao analista (é uma falha de busca, não ausência de previsão legal), sem inventar
conteúdo, e sugira tentar de novo ou usar o menu Biblioteca de Leis diretamente.`;
      } else {
        systemPromptFinal = `${systemPrompt}

MODO BIP ATIVO — SEM RESULTADO:
Pesquisei no BIP e não encontrei fragmentos sobre essa consulta.
Informe ao analista que não encontrou no BIP e sugira acessar o menu Biblioteca de Leis diretamente.
Não invente legislação.`;
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

    const operacao = ehLei ? "chat_bip" : "chat_geral";

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
