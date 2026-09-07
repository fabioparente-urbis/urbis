/**
 * scripts/conferir_interruptores_ia.mts — responde numa tela só: **o que está ligado agora, e o
 * que disso gasta dinheiro?**
 *
 * Existe por causa de um incidente real (07/09/2026): `documentos_vivos_gemini_ativo` estava
 * LIGADO em produção enquanto o §22 do plano de Documentos Vivos afirmava por escrito que estava
 * desligado, e `chat_gemini_ativo` estava ligado havia 3 dias sem ninguém notar. Nenhum dos dois
 * chegou a gastar valor relevante — mas nenhum dos dois era sabido, e essa é a falha: o sistema
 * tem interruptor, teto, cache e registro em todo lugar, e mesmo assim ninguém conseguia responder
 * "o que está ligado?" sem abrir o banco à mão.
 *
 * CUIDADO — são DUAS tabelas de configuração com nomes quase idênticos:
 *   · `urbis_config` (com S): uma linha, uma COLUNA por interruptor (visao_ligada, documentos_vivos_*)
 *   · `urbi_config`  (sem S): tabela CHAVE/VALOR (chat_gemini_ativo, urbi_ativo, tom, max_tokens...)
 * Olhar só uma delas dá falsa sensação de segurança — foi exatamente o que aconteceu.
 *
 *   npx tsx --env-file=.env.local scripts/conferir_interruptores_ia.mts
 *
 * Só LÊ. Não liga nada, não desliga nada, não chama IA. Ligar ou desligar é sempre ato humano
 * deliberado, por SQL — os comandos saem impressos no fim, prontos para copiar.
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

type Interruptor = {
  rotulo: string;
  /** true = ligado aqui significa chamada PAGA possível */
  paga: boolean;
  ligado: boolean;
  desde?: string | null;
  sqlDesligar: string;
};

const EM_URBIS_CONFIG: { coluna: string; rotulo: string; paga: boolean }[] = [
  { coluna: "visao_ligada", rotulo: "Visão — leitura de PDF por imagem (lib/visao)", paga: true },
  { coluna: "documentos_vivos_gemini_ativo", rotulo: "Gemini — páginas ambíguas do Organizador (Fase 8)", paga: true },
  { coluna: "documentos_vivos_regularizacao_ativo", rotulo: "Organizador de PDF SEI — Regularização (Slot 1)", paga: false },
  { coluna: "documentos_vivos_aceite_sei_ativo", rotulo: "Organizador de PDF SEI — Aceite SEI (Slot 2)", paga: false },
];

const EM_URBI_CONFIG: { chave: string; rotulo: string; paga: boolean }[] = [
  { chave: "chat_gemini_ativo", rotulo: "Chat do URBI responde com Gemini", paga: true },
  { chave: "urbi_ativo", rotulo: "URBI disponível para os analistas", paga: false },
];

async function coletar(): Promise<Interruptor[]> {
  const fora: Interruptor[] = [];

  const { data: linha, error: e1 } = await supabaseAdmin
    .from("urbis_config").select(EM_URBIS_CONFIG.map((c) => c.coluna).join(",")).eq("id", 1).maybeSingle();
  if (e1) throw new Error(`urbis_config: ${e1.message}`);
  for (const c of EM_URBIS_CONFIG) {
    fora.push({
      rotulo: c.rotulo, paga: c.paga, ligado: (linha as any)?.[c.coluna] === true,
      sqlDesligar: `UPDATE urbis_config SET ${c.coluna} = false WHERE id = 1;`,
    });
  }

  const { data: chaves, error: e2 } = await supabaseAdmin
    .from("urbi_config").select("chave,valor,atualizado_em")
    .in("chave", EM_URBI_CONFIG.map((c) => c.chave));
  if (e2) throw new Error(`urbi_config: ${e2.message}`);
  for (const c of EM_URBI_CONFIG) {
    const achado = (chaves ?? []).find((k: any) => k.chave === c.chave) as any;
    fora.push({
      rotulo: c.rotulo, paga: c.paga, ligado: String(achado?.valor) === "true",
      desde: achado?.atualizado_em ?? null,
      sqlDesligar: `UPDATE urbi_config SET valor = 'false' WHERE chave = '${c.chave}';`,
    });
  }
  return fora;
}

async function gasto(): Promise<{ operacao: string; chamadas: number; usd: number }[]> {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("urbis_api_calls").select("operacao,custo_estimado_usd").gte("criado_em", desde);
  if (error) return [];
  const porOp = new Map<string, { chamadas: number; usd: number }>();
  for (const r of (data ?? []) as any[]) {
    const at = porOp.get(r.operacao) ?? { chamadas: 0, usd: 0 };
    at.chamadas++;
    at.usd += Number(r.custo_estimado_usd ?? 0);
    porOp.set(r.operacao, at);
  }
  return [...porOp.entries()].map(([operacao, v]) => ({ operacao, ...v })).sort((a, b) => b.usd - a.usd);
}

async function principal(): Promise<void> {
  const itens = await coletar();
  const pagosLigados = itens.filter((i) => i.paga && i.ligado);

  console.log("\n  INTERRUPTORES DE IA — estado agora\n  " + "─".repeat(72));
  for (const i of itens) {
    const marca = i.ligado ? (i.paga ? "🔴 LIGADO " : "🟢 ligado ") : "⚪ desligado";
    const desde = i.desde ? `  (desde ${new Date(i.desde).toLocaleString("pt-BR")})` : "";
    console.log(`  ${marca}  ${i.rotulo}${i.paga ? "  💲" : ""}${desde}`);
  }

  const g = await gasto();
  const total = g.reduce((s, r) => s + r.usd, 0);
  console.log("\n  GASTO REAL — últimos 30 dias\n  " + "─".repeat(72));
  if (g.length === 0) {
    console.log("  nenhuma chamada registrada.");
  } else {
    for (const r of g) console.log(`  US$ ${r.usd.toFixed(4).padStart(8)}  ${String(r.chamadas).padStart(4)} chamadas   ${r.operacao}`);
    console.log(`  ${"─".repeat(70)}\n  US$ ${total.toFixed(4).padStart(8)}  TOTAL`);
  }

  console.log("\n  " + "─".repeat(72));
  if (pagosLigados.length === 0) {
    console.log("  ✓ Nenhum interruptor pago está ligado. Custo novo hoje: zero.");
  } else {
    console.log(`  ⚠️  ${pagosLigados.length} interruptor(es) PAGO(S) ligado(s) agora:\n`);
    for (const i of pagosLigados) console.log(`      ${i.rotulo}\n      desligar:  ${i.sqlDesligar}\n`);
    console.log("  Se algum deles foi ligado só para um teste e ficou, este é o momento de desligar.");
  }
  console.log("");
}

principal().catch((e) => { console.error(`\n✗ ${e?.message ?? e}\n`); process.exit(1); });
