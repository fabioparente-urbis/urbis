// Prova: usuário inativado é barrado por autenticar(), resolverUsuarioIdPorCookie() e usuarioDaRequisicao().
// Mocka o Supabase (sem rede). Rodar: npx tsx scripts/testar_autenticar_inativo.mts
// @ts-nocheck
import Module from "node:module";
let status = "Ativo";
const fake = { auth: { getUser: async () => ({ data: { user: { email: "a@b.c" } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1", perfil: "Analista", perfis: ["Analista"], gerencia: null, status }, error: null }) }) }) }) };
const orig = (Module as any)._load;
(Module as any)._load = function (req: string, ...a: any[]) {
  if (req.endsWith("supabaseAdmin")) return { supabaseAdmin: fake };
  return orig.call(this, req, ...a);
};
const { autenticar, resolverUsuarioIdPorCookie } = await import("../lib/auth.ts");
const { usuarioDaRequisicao } = await import("../lib/autorizacao.ts");
const req: any = { headers: new Headers({ cookie: "urbis_token=x" }), nextUrl: { pathname: "/t" } };
let ok = 0, bad = 0; const t = (n: string, c: boolean) => { c ? ok++ : bad++; console.log(c ? "OK " : "XX ", n); };
status = "Ativo";
t("ativo passa em autenticar", !(await autenticar(req) as any).status);
t("ativo passa em resolverUsuarioIdPorCookie", (await resolverUsuarioIdPorCookie("urbis_token=x")) === "u1");
t("ativo passa em usuarioDaRequisicao", (await usuarioDaRequisicao(req))?.id === "u1");
for (const st of ["Inativo", null, "ativo"]) {
  status = st as any;
  const r: any = await autenticar(req);
  t(`status ${st}: autenticar devolve 401`, r.status === 401);
  t(`status ${st}: resolverUsuarioIdPorCookie nulo`, (await resolverUsuarioIdPorCookie("urbis_token=x")) === null);
  t(`status ${st}: usuarioDaRequisicao nulo`, (await usuarioDaRequisicao(req)) === null);
}
console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
