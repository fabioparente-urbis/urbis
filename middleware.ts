import { NextResponse, type NextRequest } from "next/server";

/**
 * Renovação silenciosa da sessão — 08/09/2026, pedido do Fábio: "deixa esse trem logado de vez...
 * passo o dia trabalhando e toda hora tenho que parar pra resolver algo e voltar, e aí nem tá
 * logado e nem deslogado".
 *
 * O QUE ESTAVA ACONTECENDO: o login guardava o `access_token` do Supabase num cookie de 8h, mas o
 * token em si vence em ~1 HORA, e o `refresh_token` era descartado — nada renovava nada. Passada
 * a hora, `autenticar()` (lib/auth.ts) passava a devolver 401 em toda rota: o nome sumia do
 * rodapé, os módulos sumiam da Home, mas nenhuma tela mandava pro login. Exatamente o limbo
 * descrito: nem logado, nem deslogado.
 *
 * POR QUE AQUI E NÃO NAS ROTAS: 89 rotas chamam `autenticar()`. Cookie novo só pode ser gravado
 * na resposta, então consertar rota por rota significaria tocar nas 89 e confiar que nenhuma nova
 * esqueça. O middleware roda antes de todas, num lugar só.
 *
 * QUEM MANDA CONTINUA SENDO `autenticar()`: aqui o JWT é apenas DECODIFICADO (sem verificar
 * assinatura) para ler o `exp` e decidir se vale renovar. Nada é autorizado com base nisso —
 * a validação de verdade segue no servidor de Auth do Supabase, a cada requisição, como sempre.
 * Um token adulterado no cookie no máximo provoca uma tentativa de renovação que falha.
 */

/** Renova quando falta menos que isto pro token vencer (ou se já venceu). */
const MARGEM_SEGUNDOS = 120;
const TRINTA_DIAS = 60 * 60 * 24 * 30;

/** Lê o `exp` do JWT sem verificar assinatura — decisão de renovar, nunca de autorizar. */
function expDoToken(token: string): number | null {
  const payloadB64 = token.split(".")[1];
  if (!payloadB64) return null;
  try {
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(preenchido));
    return typeof payload?.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("urbis_token")?.value;
  const refresh = req.cookies.get("urbis_refresh")?.value;
  // Sem token não há o que renovar; sem refresh (sessão aberta antes desta mudança) o analista
  // segue no fluxo antigo até o próximo login — nada quebra, só não renova ainda.
  if (!token || !refresh) return NextResponse.next();

  const exp = expDoToken(token);
  if (exp === null) return NextResponse.next();
  if (exp - Math.floor(Date.now() / 1000) > MARGEM_SEGUNDOS) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) return NextResponse.next();
    const sessao = await r.json();
    if (!sessao?.access_token || !sessao?.refresh_token) return NextResponse.next();

    const res = NextResponse.next();
    const opcoes = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: TRINTA_DIAS, path: "/" };
    res.cookies.set("urbis_token", sessao.access_token, opcoes);
    res.cookies.set("urbis_refresh", sessao.refresh_token, opcoes);
    return res;
  } catch {
    // Rede/Auth fora do ar não pode derrubar a navegação: segue com o token atual e, se ele já
    // tiver vencido, a rota responde 401 como responderia de qualquer jeito.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /**
     * Tudo, menos: estáticos do Next, imagens do URBI, a própria tela de login e as rotas de
     * auth (login/logout gravam os cookies eles mesmos — o middleware não pode competir por
     * esses nomes na mesma resposta).
     */
    "/((?!_next/static|_next/image|favicon.ico|urbi/|login|api/auth).*)",
  ],
};
