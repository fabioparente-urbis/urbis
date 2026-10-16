/**
 * scripts/clonar_slots_3_4_ped.mts — Fase 0 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md.
 *
 * Copia a CONFIGURAÇÃO de um slot para outro, 100%, tabela por tabela:
 *   · Slot 3 — Regularização PED (`slot_03`)  ←  Slot 1 — Regularização SEI (`regularizacao`)
 *   · Slot 4 — Aceite PED        (`slot_04`)  ←  Slot 2 — Aceite SEI        (`aceite_sei`)
 *
 * Copia: assuntos (nome, nome_documento, numeracao), lip_abas + lip_campos, lip_prompts,
 * mac_checklist_modelos + mac_checklist_itens, mac_lip_vinculos, mac_bip_vinculos, despacho_padroes.
 * NUNCA copia trabalho real: processos, analises_mac, mrp/mdp, mhd, histórico.
 *
 * Por que não usar o botão "ativar" do admin (app/api/admin/assuntos/route.ts):
 *   1. ele clona SEMPRE da Regularização: o Slot 4 sairia cópia do Slot 1, não do 2;
 *   2. ele copia só parte das colunas (ex.: itens do MAC perdem fundamento_legal,
 *      gera_indeferimento, condicao_aplicabilidade...).
 * Aqui toda coluna é copiada (`select *`), menos as chaves que precisam ser novas.
 *
 * Depois da cópia, cada slot é DONO das suas linhas: nada no Slot 3/4 aponta para linha do
 * Slot 1/2. Editar uma não muda a outra.
 *
 * Guardas (aborta sem gravar nada se qualquer um falhar):
 *   · destino com slug esperado, INATIVO e VAZIO (nenhuma config e nenhum trabalho real);
 *   · origem encontrada e com conteúdo.
 * Se der erro no meio da gravação, apaga tudo o que gravou no destino e devolve o nome antigo.
 * O slot continua INATIVO no fim: ativar é ação do Fábio pela tela.
 *
 *   npx tsx --env-file=.env.local scripts/clonar_slots_3_4_ped.mts            # só simula
 *   npx tsx --env-file=.env.local scripts/clonar_slots_3_4_ped.mts --aplicar  # grava
 *   (opcional) --so=slot_03  ou  --so=slot_04
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin as db } from "../lib/supabaseAdmin";

const APLICAR = process.argv.includes("--aplicar");
const SO = process.argv.find((a) => a.startsWith("--so="))?.slice(5) ?? null;

type Par = {
  destino: string;
  origem: string;
  nomeDestino: string;
  /** Troca de texto LITERAL, só no nome do modelo do MAC e no conteúdo dos prompts. */
  trocas: [string, string][];
};

const PARES: Par[] = [
  {
    destino: "slot_03",
    origem: "regularizacao",
    nomeDestino: "Regularização PED",
    trocas: [["Regularização SEI", "Regularização PED"], ["REGULARIZAÇÃO SEI", "REGULARIZAÇÃO PED"]],
  },
  {
    destino: "slot_04",
    origem: "aceite_sei",
    nomeDestino: "Aceite PED",
    trocas: [["Aceite SEI", "Aceite PED"], ["ACEITE SEI", "ACEITE PED"]],
  },
];

const LIMITE = 1000; // PostgREST devolve no máximo isso; se bater, aborta em vez de copiar pela metade

function sem<T extends Record<string, any>>(linha: T, chaves: string[]): Record<string, any> {
  const r: Record<string, any> = { ...linha };
  for (const k of chaves) delete r[k];
  return r;
}

function trocar(texto: string | null, trocas: [string, string][]): { texto: string | null; n: number } {
  if (texto == null) return { texto, n: 0 };
  let n = 0;
  let t = texto;
  for (const [de, para] of trocas) {
    const partes = t.split(de);
    n += partes.length - 1;
    t = partes.join(para);
  }
  return { texto: t, n };
}

async function ler(tabela: string, coluna: string, valores: string[]): Promise<any[]> {
  if (valores.length === 0) return [];
  const { data, error } = await db.from(tabela).select("*").in(coluna, valores).limit(LIMITE);
  if (error) throw new Error(`ler ${tabela}: ${error.message}`);
  if ((data ?? []).length >= LIMITE) throw new Error(`${tabela}: ${LIMITE}+ linhas, a cópia ficaria incompleta`);
  return data ?? [];
}

async function contar(tabela: string, coluna: string, valores: string[]): Promise<number> {
  if (valores.length === 0) return 0;
  const { count, error } = await db.from(tabela).select("*", { count: "exact", head: true }).in(coluna, valores);
  if (error) throw new Error(`contar ${tabela}: ${error.message}`);
  return count ?? 0;
}

async function inventario(assunto_id: string) {
  const abas = (await ler("lip_abas", "assunto_id", [assunto_id])).map((x) => x.id);
  const modelos = (await ler("mac_checklist_modelos", "assunto_id", [assunto_id])).map((x) => x.id);
  const itens = (await ler("mac_checklist_itens", "modelo_id", modelos)).map((x) => x.id);
  return {
    lip_abas: abas.length,
    lip_campos: await contar("lip_campos", "aba_id", abas),
    lip_prompts: await contar("lip_prompts", "assunto_id", [assunto_id]),
    mac_modelos: modelos.length,
    mac_itens: itens.length,
    mac_lip_vinculos: await contar("mac_lip_vinculos", "mac_item_id", itens),
    mac_bip_vinculos: await contar("mac_bip_vinculos", "mac_item_id", itens),
    despacho_padroes: await contar("despacho_padroes", "assunto_id", [assunto_id]),
  };
}

async function trabalhoReal(assunto_id: string) {
  return {
    processos: await contar("processos", "assunto_id", [assunto_id]),
    analises_mac: await contar("analises_mac", "assunto_id", [assunto_id]),
    mrp_registros: await contar("mrp_registros", "assunto_id", [assunto_id]),
    mdp_registros: await contar("mdp_registros", "assunto_id", [assunto_id]),
  };
}

const soma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

async function inserir(tabela: string, linhas: Record<string, any>[]) {
  if (linhas.length === 0) return;
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await db.from(tabela).insert(linhas.slice(i, i + 200));
    if (error) throw new Error(`inserir ${tabela}: ${error.message}`);
  }
}

/** Desfaz uma cópia que falhou no meio. Só toca no destino, que estava vazio no começo. */
async function desfazer(destino_id: string, assuntoAntes: Record<string, any>) {
  const abas = (await ler("lip_abas", "assunto_id", [destino_id])).map((x) => x.id);
  const modelos = (await ler("mac_checklist_modelos", "assunto_id", [destino_id])).map((x) => x.id);
  const itens = (await ler("mac_checklist_itens", "modelo_id", modelos)).map((x) => x.id);
  const passos: [string, string, string[]][] = [
    ["mac_lip_vinculos", "mac_item_id", itens],
    ["mac_bip_vinculos", "mac_item_id", itens],
    ["mac_checklist_itens", "modelo_id", modelos],
    ["mac_checklist_modelos", "id", modelos],
    ["lip_campos", "aba_id", abas],
    ["lip_abas", "id", abas],
    ["lip_prompts", "assunto_id", [destino_id]],
    ["despacho_padroes", "assunto_id", [destino_id]],
  ];
  for (const [t, c, v] of passos) {
    if (v.length === 0) continue;
    const { error } = await db.from(t).delete().in(c, v);
    if (error) console.error(`   ✗ desfazer ${t}: ${error.message}`);
  }
  await db.from("assuntos").update({
    nome: assuntoAntes.nome, nome_documento: assuntoAntes.nome_documento, numeracao: assuntoAntes.numeracao,
  }).eq("id", destino_id);
}

async function clonar(par: Par) {
  console.log(`\n══════ ${par.destino} (${par.nomeDestino})  ←  ${par.origem} ══════`);

  const { data: assuntos, error } = await db.from("assuntos").select("*").in("slug", [par.destino, par.origem]);
  if (error) throw new Error(`assuntos: ${error.message}`);
  const origem = assuntos!.find((a) => a.slug === par.origem);
  const destino = assuntos!.find((a) => a.slug === par.destino);
  if (!origem) throw new Error(`origem ${par.origem} não encontrada`);
  if (!destino) throw new Error(`destino ${par.destino} não encontrado`);

  // ── Guardas ──────────────────────────────────────────────────────────
  if (destino.ativo) throw new Error(`${par.destino} está ATIVO — este script só grava em slot inativo`);
  const invDestino = await inventario(destino.id);
  const realDestino = await trabalhoReal(destino.id);
  if (soma(invDestino) > 0) throw new Error(`${par.destino} já tem configuração: ${JSON.stringify(invDestino)}`);
  if (soma(realDestino) > 0) throw new Error(`${par.destino} já tem trabalho real: ${JSON.stringify(realDestino)}`);
  const invOrigem = await inventario(origem.id);
  if (invOrigem.lip_abas === 0 || invOrigem.mac_itens === 0) throw new Error(`origem ${par.origem} sem conteúdo`);

  // ── Leitura completa da origem ───────────────────────────────────────
  const abas = await ler("lip_abas", "assunto_id", [origem.id]);
  const campos = await ler("lip_campos", "aba_id", abas.map((a) => a.id));
  const prompts = await ler("lip_prompts", "assunto_id", [origem.id]);
  const modelos = await ler("mac_checklist_modelos", "assunto_id", [origem.id]);
  const itens = await ler("mac_checklist_itens", "modelo_id", modelos.map((m) => m.id));
  const vincLip = await ler("mac_lip_vinculos", "mac_item_id", itens.map((i) => i.id));
  const vincBip = await ler("mac_bip_vinculos", "mac_item_id", itens.map((i) => i.id));
  const padroes = await ler("despacho_padroes", "assunto_id", [origem.id]);

  // ── Montagem das linhas novas (ids gerados aqui: o mapa velho→novo não depende da ordem) ──
  const idAba = new Map(abas.map((a) => [a.id, randomUUID()]));
  const idModelo = new Map(modelos.map((m) => [m.id, randomUUID()]));
  const idItem = new Map(itens.map((i) => [i.id, randomUUID()]));

  const novasAbas = abas.map((a) => ({ ...sem(a, ["id", "criado_em"]), id: idAba.get(a.id), assunto_id: destino.id }));
  const novosCampos = campos.map((c) => ({ ...sem(c, ["id", "criado_em"]), aba_id: idAba.get(c.aba_id) }));

  let trocasPrompts = 0;
  const novosPrompts = prompts.map((p) => {
    const t = trocar(p.conteudo, par.trocas);
    trocasPrompts += t.n;
    return {
      ...sem(p, ["id", "criado_em", "atualizado_em"]),
      conteudo: t.texto,
      versao: 1,
      versao_anterior: null,
      conteudo_backup: "",
      assunto_id: destino.id,
    };
  });

  const novosModelos = modelos.map((m) => ({
    ...sem(m, ["id", "criado_em"]),
    id: idModelo.get(m.id),
    nome: trocar(m.nome, par.trocas).texto,
    tipo_processo: par.destino,
    assunto_id: destino.id,
  }));
  const novosItens = itens.map((i) => ({ ...sem(i, ["id"]), id: idItem.get(i.id), modelo_id: idModelo.get(i.modelo_id) }));
  const novosVincLip = vincLip.map((v) => ({ ...sem(v, ["id", "criado_em"]), mac_item_id: idItem.get(v.mac_item_id) }));
  const novosVincBip = vincBip.map((v) => ({ ...sem(v, ["id", "criado_em"]), mac_item_id: idItem.get(v.mac_item_id) }));
  const novosPadroes = padroes.map((p) => ({
    ...sem(p, ["id", "criado_em", "atualizado_em"]),
    assunto_id: destino.id,
  }));

  const patchAssunto = { nome: par.nomeDestino, nome_documento: origem.nome_documento, numeracao: origem.numeracao };

  console.log("origem:", invOrigem);
  console.log("assuntos:", { de: { nome: destino.nome, nome_documento: destino.nome_documento, numeracao: destino.numeracao }, para: patchAssunto, ativo: "continua false" });
  console.log("modelos do MAC:", novosModelos.map((m) => m.nome));
  console.log(`trocas de texto nos prompts: ${trocasPrompts} (${par.trocas.map(([a, b]) => `"${a}"→"${b}"`).join(", ")})`);
  for (const p of prompts) {
    const n = trocar(p.conteudo, par.trocas).n;
    console.log(`   · ${p.chave} "${p.nome}" ${p.ativo ? "" : "(desativado) "}— ${n} troca(s)`);
  }

  if (!APLICAR) {
    console.log("SIMULAÇÃO — nada gravado. Rodar com --aplicar para gravar.");
    return;
  }

  // ── Gravação ─────────────────────────────────────────────────────────
  try {
    const { error: e1 } = await db.from("assuntos").update(patchAssunto).eq("id", destino.id).eq("ativo", false);
    if (e1) throw new Error(`assuntos: ${e1.message}`);
    await inserir("lip_abas", novasAbas);
    await inserir("lip_campos", novosCampos);
    await inserir("lip_prompts", novosPrompts);
    await inserir("mac_checklist_modelos", novosModelos);
    await inserir("mac_checklist_itens", novosItens);
    await inserir("mac_lip_vinculos", novosVincLip);
    await inserir("mac_bip_vinculos", novosVincBip);
    await inserir("despacho_padroes", novosPadroes);
  } catch (e: any) {
    console.error(`✗ FALHOU: ${e.message} — desfazendo o que foi gravado em ${par.destino}...`);
    await desfazer(destino.id, destino);
    throw e;
  }

  // ── Conferência ──────────────────────────────────────────────────────
  const invDepois = await inventario(destino.id);
  const diverge = Object.entries(invOrigem).filter(([k, v]) => (invDepois as any)[k] !== v);
  console.log("destino depois:", invDepois);
  console.log(diverge.length === 0 ? "✓ contagens idênticas à origem" : `✗ DIVERGE: ${JSON.stringify(diverge)}`);
  if (diverge.length > 0) process.exitCode = 1;
}

console.log(APLICAR ? "MODO: APLICAR (grava no banco)" : "MODO: SIMULAÇÃO (não grava nada)");
for (const par of PARES) {
  if (SO && par.destino !== SO) continue;
  await clonar(par);
}
