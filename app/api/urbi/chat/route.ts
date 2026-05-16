import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { message, history, usuario } = await req.json();

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
