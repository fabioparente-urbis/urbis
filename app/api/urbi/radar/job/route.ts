import { NextRequest, NextResponse } from "next/server";
import { executarJobRadar } from "@/lib/urbi/radarJob";

/**
 * POST /api/urbi/radar/job — disparado pelo pg_cron (via pg_net, dentro do próprio Postgres),
 * NUNCA por sessão humana. Autenticação é por SEGREDO COMPARTILHADO
 * (`URBI_RADAR_CRON_SECRET`, comparação em tempo constante), inteiramente separada de
 * `lib/auth.ts`/cookie de sessão — não afrouxa nem contorna login/logout/expiração/RLS de
 * nenhum jeito, é um caminho de autenticação NOVO e paralelo, só pra chamada servidor→servidor.
 *
 * Sem o segredo certo (ou sem a variável configurada), sempre 401. Nunca recebe nem precisa de
 * conteúdo de processo no corpo — todo trabalho é lido do banco por dentro de
 * lib/urbi/radarJob.ts.
 */
function segredoConfere(req: NextRequest): boolean {
  const esperado = process.env.URBI_RADAR_CRON_SECRET;
  if (!esperado) return false;
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (recebido.length !== esperado.length) return false;
  // Comparação em tempo constante — evita vazar, por timing, quantos caracteres já bateram.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  if (!segredoConfere(req)) {
    return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }
  const resultado = await executarJobRadar();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
