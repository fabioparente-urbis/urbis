// ============================================================
// scripts/testar_autenticar_usuario_inativo.mts
//
// Prova da trava de 25/10/2026: usuário que não está "Ativo" é recusado por `autenticar()` e por
// `resolverUsuarioIdPorCookie()` (numeração, MDP, MRP), mesmo com token válido no Supabase.
// Não toca no banco nem no Auth: o `fetch` é trocado por um falso que faz o papel do Supabase e
// devolve o usuário que cada caso pede — a biblioteca do Supabase roda de verdade.
//
//   1. Ativo passa nas duas funções (nada muda para quem trabalha hoje);
//   2. Inativo, vazio, nulo, minúsculo ou com espaço são recusados nas duas;
//   3. sem cookie, token recusado pelo Auth e e-mail sem cadastro continuam recusados;
//   4. a recusa é o mesmo 401/SESSAO_EXPIRADA que as fichas já tratam.
//
// Rodar: npx tsx scripts/testar_autenticar_usuario_inativo.mts
// ============================================================
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname;
let total = 0;
let falhas = 0;
function t(nome: string, ok: boolean, detalhe = "") {
  total++;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"}  ${nome}${!ok && detalhe ? ` — ${detalhe}` : ""}`);
}

// Estado do falso: o que o Auth e a tabela `usuarios` devolvem no caso atual.
let authOk = true;
let usuarioDoBanco: Record<string, unknown> | null = null;
const selectsPedidos: string[] = [];

// O Supabase de verdade nunca é chamado: endereço falso + `fetch` falso, instalados ANTES de
// carregar `lib/auth.ts` (o cliente guarda o `fetch` e o endereço quando é criado). Qualquer
// chamada fora das duas esperadas derruba o teste.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://falso.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-falsa";
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "falso.supabase.test") throw new Error(`chamada de rede inesperada: ${url.href}`);
  if (url.pathname === "/auth/v1/user") {
    return authOk
      ? json({ id: "auth-1", email: "analista@teste.local", aud: "authenticated" })
      : json({ code: 401, msg: "invalid JWT" }, 401);
  }
  if (url.pathname === "/rest/v1/usuarios") {
    selectsPedidos.push(url.searchParams.get("select") ?? "");
    const accept = new Headers(init?.headers).get("accept") ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      return usuarioDoBanco ? json(usuarioDoBanco) : json({ code: "PGRST116", message: "0 rows" }, 406);
    }
    return json(usuarioDoBanco ? [usuarioDoBanco] : []);
  }
  throw new Error(`rota inesperada: ${url.pathname}`);
}) as typeof fetch;

const { autenticar, resolverUsuarioIdPorCookie, usuarioAtivo } = await import(
  pathToFileURL(join(raiz, "lib/auth.ts")).href
);
const { NextRequest, NextResponse } = await import("next/server");

const comCookie = () =>
  new NextRequest("https://urbis.test/api/qualquer", { headers: { cookie: "urbis_token=abc.def.ghi" } });
const semCookie = () => new NextRequest("https://urbis.test/api/qualquer");

// Silencia os console.error de propósito das recusas (o teste confere o resultado, não o log).
const erroOriginal = console.error;
console.error = () => {};

async function recusa(req: InstanceType<typeof NextRequest>) {
  const r = await autenticar(req);
  if (!(r instanceof NextResponse)) return { recusou: false, status: 0, erro: "" };
  const corpo = await r.json();
  return { recusou: true, status: r.status, erro: corpo?.erro };
}

const base = { id: "u-1", perfil: "Analista", perfis: ["Analista"], gerencia: "GERECCO" };

console.log("\n1. Ativo passa");
authOk = true;
usuarioDoBanco = { ...base, status: "Ativo" };
{
  const r = await autenticar(comCookie());
  t("autenticar() devolve o contexto do usuário Ativo", !(r instanceof NextResponse) && r.userId === "u-1");
  t("resolverUsuarioIdPorCookie() devolve o id do usuário Ativo",
    (await resolverUsuarioIdPorCookie("urbis_token=abc.def.ghi")) === "u-1");
}

console.log("\n2. Quem não está exatamente \"Ativo\" é recusado");
for (const status of ["Inativo", "", null, undefined, "ativo", "Ativo ", "ATIVO"]) {
  usuarioDoBanco = { ...base, status };
  const r = await recusa(comCookie());
  t(`autenticar() recusa status ${JSON.stringify(status)}`, r.recusou && r.status === 401 && r.erro === "SESSAO_EXPIRADA",
    JSON.stringify(r));
  t(`resolverUsuarioIdPorCookie() recusa status ${JSON.stringify(status)}`,
    (await resolverUsuarioIdPorCookie("urbis_token=abc.def.ghi")) === null);
}

console.log("\n3. Recusas que já existiam continuam");
usuarioDoBanco = { ...base, status: "Ativo" };
{
  const r = await recusa(semCookie());
  t("sem cookie → 401", r.recusou && r.status === 401);
  t("resolver sem cookie → null", (await resolverUsuarioIdPorCookie("")) === null);
}
authOk = false;
{
  const r = await recusa(comCookie());
  t("token recusado pelo Auth → 401", r.recusou && r.status === 401);
  t("resolver com token recusado → null", (await resolverUsuarioIdPorCookie("urbis_token=x")) === null);
}
authOk = true;
usuarioDoBanco = null;
{
  const r = await recusa(comCookie());
  t("e-mail sem cadastro em usuarios → 401", r.recusou && r.status === 401);
  t("resolver com e-mail sem cadastro → null", (await resolverUsuarioIdPorCookie("urbis_token=x")) === null);
}

console.log("\n4. Regra única e consulta certa");
t("as duas funções pedem a coluna status ao banco",
  selectsPedidos.length > 0 && selectsPedidos.every((s) => s.split(",").includes("status")), JSON.stringify(selectsPedidos));
t("usuarioAtivo(\"Ativo\") é true", usuarioAtivo("Ativo") === true);
t("usuarioAtivo(\"Inativo\") é false", usuarioAtivo("Inativo") === false);

console.error = erroOriginal;
console.log(`\n${total - falhas}/${total} ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
process.exitCode = falhas ? 1 : 0;
