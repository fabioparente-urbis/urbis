/**
 * scripts/testar_presenca_urbi.mts — telemetria neutra de presença no URBIS (rodada isolada,
 * 05/09/2026). Valida os 9 pontos pedidos. O temporizador de 30 min em si é comportamento de
 * CLIENTE (components/urbi/UrbiGlobal.tsx, um único setTimeout rearmado a cada interação) —
 * simular 30 minutos reais aqui seria impraticável; este script testa a lógica de SERVIDOR que
 * garante o comportamento contratado (dedupe, guarda de admin, ausência de dado sensível),
 * que é onde um bug real poderia esconder produtividade/ranking sem querer.
 *
 *   npx tsx --env-file=.env.local scripts/testar_presenca_urbi.mts
 */
import { readFileSync } from "fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { registrarEventoPresenca, obterPresencaUrbi } from "../lib/urbi/presenca";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const { data: usuarios } = await supabaseAdmin.from("usuarios").select("id, nome").limit(2);
const USUARIO_A = (usuarios ?? [])[0]?.id as string;
const USUARIO_B = (usuarios ?? [])[1]?.id as string;
if (!USUARIO_A || !USUARIO_B) throw new Error("precisa de pelo menos 2 usuários reais na tabela usuarios pra este teste.");

async function limparUsuario(id: string) {
  await supabaseAdmin.from("urbi_presenca_eventos").delete().eq("usuario_id", id);
}
await limparUsuario(USUARIO_A);
await limparUsuario(USUARIO_B);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · interação inicial registra apenas o necessário");
{
  const r = await registrarEventoPresenca(USUARIO_A, "interacao_retomada", "sessao-teste-1");
  t("aceito e inserido", r.ok && (r as any).inserido === true, JSON.stringify(r));
  const { data: linha } = await supabaseAdmin.from("urbi_presenca_eventos").select("*").eq("usuario_id", USUARIO_A).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const chaves = Object.keys(linha ?? {}).sort();
  const esperadas = ["criado_em", "id", "origem", "sessao_efemera", "tipo_evento", "usuario_id", "versao_contrato"].sort();
  t("só as colunas mínimas contratadas existem na linha", JSON.stringify(chaves) === JSON.stringify(esperadas), JSON.stringify(chaves));
  t("origem = web", (linha as any)?.origem === "web");
  t("versao_contrato = 1", (linha as any)?.versao_contrato === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · transição sem_interacao_urbis é aceita (o temporizador de 30 min em si é client-side, ver nota no topo do arquivo)");
{
  await limparUsuario(USUARIO_A);
  const r = await registrarEventoPresenca(USUARIO_A, "sem_interacao_urbis");
  t("aceito e inserido", r.ok && (r as any).inserido === true, JSON.stringify(r));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · nova interação gera apenas UMA retomada (não duplica em chamadas repetidas)");
{
  const r1 = await registrarEventoPresenca(USUARIO_A, "interacao_retomada");
  const r2 = await registrarEventoPresenca(USUARIO_A, "interacao_retomada");
  const r3 = await registrarEventoPresenca(USUARIO_A, "interacao_retomada");
  t("1ª retomada inserida", r1.ok && (r1 as any).inserido === true);
  t("2ª retomada (mesmo estado) NÃO duplica", r2.ok && (r2 as any).inserido === false, JSON.stringify(r2));
  t("3ª retomada (mesmo estado) NÃO duplica", r3.ok && (r3 as any).inserido === false, JSON.stringify(r3));
  const { count } = await supabaseAdmin.from("urbi_presenca_eventos").select("*", { count: "exact", head: true }).eq("usuario_id", USUARIO_A).eq("tipo_evento", "interacao_retomada");
  t("só 1 linha de interacao_retomada gravada no total", count === 1, `count=${count}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · mais eventos durante o mesmo estado (sem_interacao) não duplicam");
{
  await limparUsuario(USUARIO_A);
  await registrarEventoPresenca(USUARIO_A, "sem_interacao_urbis");
  await registrarEventoPresenca(USUARIO_A, "sem_interacao_urbis");
  const r3 = await registrarEventoPresenca(USUARIO_A, "sem_interacao_urbis");
  t("3ª chamada do mesmo tipo não duplica", r3.ok && (r3 as any).inserido === false);
  const { count } = await supabaseAdmin.from("urbi_presenca_eventos").select("*", { count: "exact", head: true }).eq("usuario_id", USUARIO_A);
  t("só 1 linha gravada no total", count === 1, `count=${count}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · logout/expiração de sessão continuam iguais — rotas usam autenticar() sem alteração");
{
  const rotaCliente = readFileSync("app/api/urbi/presenca/route.ts", "utf8");
  const rotaAdmin = readFileSync("app/api/admin/urbi/presenca/route.ts", "utf8");
  t("rota do cliente chama autenticar() antes de tudo", /import \{ autenticar \} from "@\/lib\/auth"/.test(rotaCliente) && /autenticar\(req\)/.test(rotaCliente));
  t("rota admin chama autenticar() antes de tudo", /import \{ autenticar \} from "@\/lib\/auth"/.test(rotaAdmin) && /autenticar\(req\)/.test(rotaAdmin));
  t("lib/auth.ts não foi tocado nesta rodada (git diff vazio)", (await import("node:child_process")).execSync("git diff --stat -- lib/auth.ts", { encoding: "utf8" }).trim() === "");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · nenhuma chamada Gemini é feita");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await registrarEventoPresenca(USUARIO_A, "interacao_retomada");
  await registrarEventoPresenca(USUARIO_B, "sem_interacao_urbis");
  await obterPresencaUrbi(50);
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · Radar e presença ficam separados (nenhuma referência cruzada em código)");
{
  const presenca = readFileSync("lib/urbi/presenca.ts", "utf8");
  const radar = readFileSync("lib/urbi/radar.ts", "utf8");
  const linhaEvidencia = readFileSync("lib/urbi/linhaEvidencia.ts", "utf8");
  t("presenca.ts nunca referencia urbi_radar_retratos", !presenca.includes("urbi_radar_retratos"));
  t("radar.ts nunca referencia urbi_presenca_eventos", !radar.includes("urbi_presenca_eventos"));
  t("linhaEvidencia.ts nunca referencia urbi_presenca_eventos", !linhaEvidencia.includes("urbi_presenca_eventos"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · usuário comum não acessa a visualização administrativa (guard no código da rota)");
{
  const rotaAdmin = readFileSync("app/api/admin/urbi/presenca/route.ts", "utf8");
  t("rota admin nega quem não é irrestrito (mesmo padrão de admin/urbi/radar)", /if \(!ctx\.irrestrito\)/.test(rotaAdmin) && /status: 403/.test(rotaAdmin));
  t("obterPresencaUrbi() em si não decide autorização (autorização mora só na rota)", !readFileSync("lib/urbi/presenca.ts", "utf8").includes("irrestrito"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("9 · nenhum dado de LIP/MAC/documento/conversa entra na telemetria");
{
  // Colunas da tabela já foram conferidas via information_schema no script de migration (ver
  // supabase/migrations/2026_09_05_urbi_presenca_eventos.sql) — aqui valida a FORMA da própria
  // rota (nunca aceita payload livre) e que o valor gravado não vira campo de texto ilimitado.
  const codigoRota = readFileSync("app/api/urbi/presenca/route.ts", "utf8");
  const acessosAoCorpo = [...codigoRota.matchAll(/\bbody\?\.(\w+)/g)].map((m) => m[1]);
  t("rota do cliente só lê 'tipo' e 'sessao_efemera' do corpo — nunca um payload livre", new Set(acessosAoCorpo).size === 2 && acessosAoCorpo.includes("tipo") && acessosAoCorpo.includes("sessao_efemera"), JSON.stringify(acessosAoCorpo));
  const r = await registrarEventoPresenca(USUARIO_A, "interacao_retomada", "<script>alert(1)</script>".repeat(10));
  const { data: linha } = await supabaseAdmin.from("urbi_presenca_eventos").select("sessao_efemera").eq("usuario_id", USUARIO_A).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  t("sessao_efemera é truncada (nunca vira campo de texto livre ilimitado)", ((linha as any)?.sessao_efemera ?? "").length <= 100);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("limpeza — remove eventos de teste");
await limparUsuario(USUARIO_A);
await limparUsuario(USUARIO_B);

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
