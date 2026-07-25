// ============================================================
// Marcadores de prompt resolvidos a partir do banco.
//
// Problema que isto resolve: o prompt de extração precisa listar os
// campos que a IA deve preencher. Escrever essa lista à mão dentro do
// prompt significa que toda mudança na estrutura do LIP exige reescrever
// o prompt — e foi exatamente o que aconteceu em 25/07/2026: a Aprovação
// de Projeto ganhou 124 campos novos e o prompt seguiu falando das
// chaves da Regularização, então a IA não preencheria nada.
//
// Aqui o prompt passa a ter marcadores; o conteúdo vem do banco na hora
// da chamada:
//
//   {{CAMPOS_DO_ASSUNTO}}  -> lista de todos os campos do LIP do assunto,
//                             por aba, com chave, rótulo, tipo e dica
//   {{ESQUELETO_JSON}}     -> o JSON exato que a IA deve devolver
//   {{CAMPOS_VAZIOS}}      -> só as chaves que AINDA estão em branco no
//                             processo (extração incremental: cada fonte
//                             já lida encolhe o pedido seguinte)
//
// Prompt que não tem marcador não é tocado — o comportamento de hoje
// continua idêntico até alguém decidir usar isto.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CampoLip = {
  chave: string;
  label: string;
  tipo: string;
  placeholder: string | null;
  valor_padrao: string | null;
  opcoes: string[] | null;
  aba: string;
  ordem: number;
};

/** Campos do LIP de um assunto, na ordem em que aparecem na tela. */
export async function camposDoAssunto(assunto_id: string): Promise<CampoLip[]> {
  const { data: abas } = await supabaseAdmin
    .from("lip_abas").select("id, nome, ordem").eq("assunto_id", assunto_id).order("ordem");
  if (!abas?.length) return [];
  const { data: campos } = await supabaseAdmin
    .from("lip_campos")
    .select("chave, label, tipo, placeholder, valor_padrao, opcoes, aba_id, ordem, ativo")
    .in("aba_id", abas.map((a: any) => a.id));

  const nomeAba: Record<string, string> = {};
  const ordemAba: Record<string, number> = {};
  for (const a of abas as any[]) { nomeAba[a.id] = a.nome; ordemAba[a.id] = a.ordem; }

  return ((campos ?? []) as any[])
    .filter((c) => c.ativo !== false)
    .map((c) => ({
      chave: c.chave, label: c.label, tipo: c.tipo,
      placeholder: c.placeholder, valor_padrao: c.valor_padrao,
      opcoes: c.opcoes, aba: nomeAba[c.aba_id] ?? "",
      ordem: (ordemAba[c.aba_id] ?? 0) * 1000 + (c.ordem ?? 0),
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

/** Lista legível por aba — é o que vai no lugar de {{CAMPOS_DO_ASSUNTO}}. */
export function blocoCampos(campos: CampoLip[]): string {
  const linhas: string[] = [];
  let abaAtual = "";
  for (const c of campos) {
    if (c.aba !== abaAtual) { abaAtual = c.aba; linhas.push(`\n## ${abaAtual}`); }
    const partes = [`- ${c.chave}: ${c.label}`];
    if (c.opcoes?.length) partes.push(`(opções: ${c.opcoes.join(" | ")})`);
    else if (c.tipo === "textarea") partes.push("(texto longo)");
    if (c.placeholder) partes.push(`— ${c.placeholder}`);
    linhas.push(partes.join(" "));
  }
  return linhas.join("\n").trim();
}

/** O JSON exato esperado de volta — evita a IA inventar formato. */
export function esqueletoJson(campos: CampoLip[]): string {
  const corpo = campos
    .map((c) => `    "${c.chave}": {"valor": null, "fonte": null}`)
    .join(",\n");
  return `{\n  "campos": {\n${corpo}\n  }\n}`;
}

/**
 * Chaves ainda sem valor no processo. É o que permite a extração
 * incremental: depois de ler os prints do sistema, o pedido seguinte só
 * pergunta o que sobrou — prompt menor, mais barato e mais preciso.
 * Valor padrão NÃO conta como preenchido: ele é chute de fábrica, é
 * justamente o que a leitura deve confirmar ou corrigir.
 */
export async function chavesVazias(codigo: string, campos: CampoLip[]): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("processos").select("dados").eq("codigo", codigo).maybeSingle();
  const dados = (data?.dados ?? {}) as Record<string, { valor?: string; origem?: string }>;
  return campos
    .filter((c) => {
      const v = dados[c.chave];
      if (!v) return true;
      if (!String(v.valor ?? "").trim()) return true;
      return v.origem === "padrao";
    })
    .map((c) => c.chave);
}

/**
 * Troca os marcadores pelo conteúdo do banco. Prompt sem marcador volta
 * inalterado — nada muda até alguém optar por usar.
 */
export async function aplicarMarcadores(
  prompt: string,
  opts: { assunto_id?: string | null; codigo?: string | null },
): Promise<string> {
  if (!prompt.includes("{{")) return prompt;
  const id = opts.assunto_id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return prompt;

  const campos = await camposDoAssunto(id);
  if (campos.length === 0) return prompt;

  let saida = prompt;
  if (saida.includes("{{CAMPOS_DO_ASSUNTO}}")) {
    saida = saida.replaceAll("{{CAMPOS_DO_ASSUNTO}}", blocoCampos(campos));
  }
  if (saida.includes("{{ESQUELETO_JSON}}")) {
    saida = saida.replaceAll("{{ESQUELETO_JSON}}", esqueletoJson(campos));
  }
  if (saida.includes("{{CAMPOS_VAZIOS}}")) {
    const vazias = opts.codigo ? await chavesVazias(opts.codigo, campos) : campos.map((c) => c.chave);
    const subset = campos.filter((c) => vazias.includes(c.chave));
    saida = saida.replaceAll(
      "{{CAMPOS_VAZIOS}}",
      subset.length ? blocoCampos(subset) : "(nenhum campo pendente — todos já preenchidos)",
    );
  }
  return saida;
}
