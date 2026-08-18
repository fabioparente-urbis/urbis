/**
 * Mede, com o MESMO código da tela (avaliarFiltros/textoCitaAlgum), quantos dos itens ATIVOS do
 * MAC Slot 5 têm vínculo com o LIP e quantos os filtros cadastrados conseguem resolver, contra um
 * processo real. Não reimplementa a lógica — importa e chama exatamente o que a rota
 * app/api/mac/slot-05/preencher-automatico usa.
 *
 *   npx tsx --env-file=.env.local scripts/medir_cobertura_mac_slot5.mts <codigo>
 */
import { createClient } from "@supabase/supabase-js";
import { avaliarFiltros, type FiltroSlot5 } from "../lib/mac-motor/slot5/filtrosDoBanco";
import { textoCitaAlgum } from "../lib/mac-motor/slot5/aplicabilidade";

const codigo = process.argv[2] ?? "50724";
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function carregarTextosDaPasta(codigo: string): Promise<Record<string, string>> {
  const { data: docs } = await sb.from("mhd_documentos").select("id, papel").eq("processo_codigo", codigo).limit(200);
  if (!docs?.length) return {};
  const papelPorDoc = new Map(docs.map((d: any) => [d.id, d.papel as string]));
  const { data: versoes } = await sb.from("mhd_versoes")
    .select("documento_id, conteudo_id, vigente").in("documento_id", docs.map((d: any) => d.id))
    .eq("vigente", true).limit(500);
  if (!versoes?.length) return {};
  const conteudoIds = [...new Set(versoes.map((v: any) => v.conteudo_id).filter(Boolean))];
  if (!conteudoIds.length) return {};
  const { data: conteudos } = await sb.from("mhd_conteudos").select("id, texto").in("id", conteudoIds).limit(500);
  const textoPorConteudo = new Map((conteudos ?? []).map((c: any) => [c.id, (c.texto ?? "") as string]));
  const acc: Record<string, string[]> = {};
  for (const v of versoes) {
    const papel = papelPorDoc.get((v as any).documento_id);
    const texto = textoPorConteudo.get((v as any).conteudo_id);
    if (!papel || !texto) continue;
    (acc[papel] ??= []).push(texto);
  }
  return Object.fromEntries(Object.entries(acc).map(([p, partes]) => [p, partes.join("\n")]));
}

async function main() {
  const { data: processo } = await sb.from("processos").select("dados").eq("codigo", codigo).eq("tipo_processo", "slot_05").maybeSingle();
  if (!processo) throw new Error(`processo ${codigo} (slot_05) não encontrado`);
  const lip = (processo.dados ?? {}) as Record<string, any>;

  const textos = await carregarTextosDaPasta(codigo);

  const { data: catalogoBruto } = await sb.from("mac_checklist_itens")
    .select("id, grupo, texto").eq("modelo_id", MODELO_SLOT5).eq("ativo", true).limit(2000);
  const catalogo = (catalogoBruto ?? []) as { id: string; grupo: string; texto: string }[];
  console.log(`itens ATIVOS no modelo do Slot 5: ${catalogo.length}`);

  // ── 1. Quantos itens têm vínculo com o LIP (mac_lip_vinculos) ──────────────
  const { data: lipVinc } = await sb.from("mac_lip_vinculos").select("mac_item_id, lip_chave, obrigatorio");
  const idsAtivos = new Set(catalogo.map((c) => c.id));
  const vincAtivos = (lipVinc ?? []).filter((v) => idsAtivos.has(v.mac_item_id));
  const itensComVinculoLip = new Set(vincAtivos.map((v) => v.mac_item_id));
  console.log(`\n=== VÍNCULO COM O LIP (mac_lip_vinculos) ===`);
  console.log(`itens ativos com pelo menos 1 vínculo LIP: ${itensComVinculoLip.size}`);
  console.log(`  (${vincAtivos.length} vínculos no total, alguns itens têm mais de um campo)`);

  // ── 2. Quantos itens os FILTROS cadastrados conseguem resolver, contra este processo ──
  const { data: filtrosBanco } = await sb.from("mac_slot5_filtros").select("*").eq("ativo", true).order("ordem").limit(200);
  const filtros = (filtrosBanco ?? []) as FiltroSlot5[];
  const { acionados, naoAcionados, indecisos, manuais } = avaliarFiltros(filtros, lip, textos);

  const itensDoFiltro = (f: FiltroSlot5) => {
    const grupos = new Set(f.grupos ?? []);
    const avulsos = new Set(f.itens_ids ?? []);
    const termos = f.termos_item ?? [];
    return catalogo.filter((it) => grupos.has(it.grupo) || avulsos.has(it.id) || !!textoCitaAlgum(it.texto ?? "", termos));
  };

  const porNome = new Map(filtros.map((f) => [f.nome, f]));
  const idsResolvidos = new Set<string>();
  console.log(`\n=== FILTROS CADASTRADOS, contra o processo ${codigo} ===`);
  console.log(`${filtros.length} filtros ativos · ${acionados.length} acionados · ${naoAcionados.length} não acionados · ${indecisos.length} indecisos (sem dado) · ${manuais.length} manuais`);
  console.log(`\nacionados (retiram item da análise):`);
  for (const a of acionados) {
    const f = porNome.get(a.nome);
    const itens = f ? itensDoFiltro(f) : [];
    for (const it of itens) idsResolvidos.add(it.id);
    console.log(`  ${a.nome.padEnd(20)} ${String(itens.length).padStart(4)} itens  — ${a.justificativa.slice(0, 70)}`);
  }
  console.log(`\nTOTAL de itens ativos que os filtros resolvem sozinhos: ${idsResolvidos.size}`);

  // ── 3. Sobreposição e o resto ──────────────────────────────────────────────
  const sobrepoe = [...itensComVinculoLip].filter((id) => idsResolvidos.has(id)).length;
  const orfaos = catalogo.length - new Set([...itensComVinculoLip, ...idsResolvidos]).size;
  console.log(`\n=== RESUMO (base: ${catalogo.length} itens ativos) ===`);
  console.log(`resolvidos por filtro                         : ${idsResolvidos.size}`);
  console.log(`têm vínculo com o LIP (dado/pista disponível)  : ${itensComVinculoLip.size}`);
  console.log(`  (dos quais também saem por filtro            : ${sobrepoe})`);
  console.log(`sem filtro E sem vínculo LIP (100% manual hoje): ${orfaos}`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
