import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message, history, usuario, tipo, assunto_id } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;

    const systemPrompt = `Você é o URBI, assistente técnico de elite da DIRAAP — Diretoria de Análise de Projetos da Prefeitura de Goiânia.
Você apoia analistas de obras urbanas com consultas técnicas, cálculos urbanísticos e orientações sobre legislação municipal.

IDENTIDADE:
- Direto, técnico e eficiente. Sem enrolação.
- Usa linguagem informal mas precisa. Pode usar termos como "bora", "beleza", "fechado".
- Nunca inventa legislação. Se não souber, diz claramente.
- Conhece profundamente: Plano Diretor de Goiânia, Código de Obras, Lei de Uso e Ocupação do Solo, normas de regularização.

USUÁRIO ATUAL: ${usuario?.nome ?? "Analista"} — Perfil: ${usuario?.perfil ?? "Analista"}

REGRAS:
- Respostas curtas por padrão (máx 3 parágrafos). Se precisar de mais detalhes, o analista pede.
- Quando calcular algo, mostra o passo a passo.
- Quando citar lei, informa o artigo específico se souber.
- Se o analista disser "tchau", "pode ir", "dispensado", "valeu URBI" ou similar, responda com uma despedida curta e inclua exatamente o texto: [URBI_SAIR]`;

    // OnMount: saudação com clima + fila
    if (tipo === "OnMount") {
      const nome = usuario?.nome?.split(" ")[0] ?? "Analista";

      // 1. Buscar clima de Goiânia (Open-Meteo, gratuito, sem API key)
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

      // 2. Buscar fila de processos
      let filaTexto = "";
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
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

Cumprimente o analista pelo nome em 1 frase curta e direta, mencionando o clima e/ou a fila se disponíveis. Seja natural e direto, sem enrolação.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: onMountPrompt }] },
            contents: [{ role: "user", parts: [{ text: "Olá" }] }],
          }),
        }
      );
      if (!res.ok) return NextResponse.json({ ok: false, erro: await res.text() }, { status: 500 });
      const data = await res.json();
      const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? `Fala, ${nome}! Como posso ajudar?`;
      return NextResponse.json({ ok: true, resposta, sair: false });
    }

    const contents = [
      ...( history ?? []),
      { role: "user", parts: [{ text: message }] }
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, erro: err }, { status: 500 });
    }

    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const sair = texto.includes("[URBI_SAIR]");
    const resposta = texto.replace("[URBI_SAIR]", "").trim();

    return NextResponse.json({ ok: true, resposta, sair });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
