import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { montarDossieFactual } from "@/lib/urbi/montarDossie";

/**
 * Dossiê factual do URBI — somente leitura.
 *
 * Esta rota é a base do Co-Analista. Ela não chama IA, não escreve no
 * processo, não altera LIP/MAC, não emite documento e não consome numeração.
 * Cada bloco informa a fonte real; falha de fonte vira cobertura indisponível,
 * nunca conclusão positiva por ausência de dado.
 *
 * A lógica de montagem mora em lib/urbi/montarDossie.ts (extraída em
 * 05/09/2026) — o mesmo código que app/api/urbi/chat/route.ts chama
 * DIRETAMENTE, no mesmo processo, sem passar por esta rota via rede. Esta
 * rota continua existindo com o mesmo comportamento externo, pro uso direto
 * (ex.: diagnóstico manual, ou um futuro cliente HTTP de verdade).
 */
export async function GET(req: NextRequest) {
  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo é obrigatório." }, { status: 400 });

  const usuario = await usuarioDaRequisicao(req);
  const resultado = await montarDossieFactual(codigo, usuario);
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: resultado.status });
  return NextResponse.json({ ok: true, data: resultado.data });
}
