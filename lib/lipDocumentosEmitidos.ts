/**
 * lib/lipDocumentosEmitidos.ts — os números e datas que o próprio URBIS gera.
 *
 * 16 campos do LIP guardam número e data de documentos que o URBIS EMITE: despacho da 1ª à 5ª
 * análise, laudo, parecer de indeferimento e parecer de arquivamento. Hoje ficam vazios esperando
 * digitação — ou, pior, esperando que a IA ache num PDF um número que o próprio sistema gerou.
 *
 * ── O QUE A AUDITORIA DE 28/07/2026 ESTABELECEU ─────────────────────────────────
 * O registro de documentos emitidos (`mdp_registros`) está VIVO e em produção: 20 registros, os
 * dois últimos de 27/07/2026. Não é legado e não foi absorvido pelo MHD — o MHD registra o que
 * ENTRA (leitura), este registro guarda o que SAI (emissão). Nenhum cobre o outro.
 *
 * A cadeia é: `urbis_numeracao_faixas` reserva o número → a tela emite o documento → o registro
 * grava o que saiu. O registro é o REGISTRO, não a origem do número.
 *
 * ── POR QUE ISTO NÃO ENCHE O LIP HOJE ───────────────────────────────────────────
 * Nenhum dos 20 registros é do slot 5: a Aprovação de Projeto nunca emitiu despacho. Então o
 * mecanismo abaixo funciona e não preenche nada ainda. Isso é correto, e é a diferença entre
 * "não implementado" e "aguardando o fato": no dia em que o primeiro despacho do slot 5 sair,
 * estes campos se preenchem sozinhos, inclusive retroativamente.
 *
 * A ordem das análises vem da ORDEM DE EMISSÃO, não de um campo que diga "sou a 2ª": o 1º
 * despacho do processo é a 1ª análise, o 2º é a 2ª, e assim por diante — que é como
 * `analises_mac.numero_analise` já conta, e bate com os 5 campos do LIP.
 */

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export type CampoEmitido = {
  valor: string;
  fonte: string;
  /** true = o mecanismo rodou e não há documento emitido ainda */
  aguardandoFato?: boolean;
};

const CAMPOS_POR_ANALISE = [
  ["numeroDeDespachoDa1Analise", "dataDa1Analise"],
  ["numeroDeDespachoDa2Analise", "dataDa2Analise"],
  ["numeroDeDespachoDa3Analise", "dataDa3Analise"],
  ["numeroDeDespachoDa4Analise", "dataDa4Analise"],
  ["numeroDeDespachoDa5Analise", "dataDa5Analise"],
] as const;

/** Os 16 campos, para quem precisa saber quais são sem repetir a lista. */
export const CAMPOS_EMITIDOS = [
  ...CAMPOS_POR_ANALISE.flat(),
  "numeroDoLaudo5", "dataDoLaudo5",
  "numeroDoParecerDeIndeferimento", "dataDoParecerDeIndeferimento",
  "numeroDoParecerDeArquivamento", "dataDoParecerDeArquivamento",
];

/**
 * Lê o registro de documentos emitidos do processo e devolve os 16 campos.
 *
 * NUNCA lança: se a consulta falhar, devolve vazio e a leitura da pasta segue. Um número de
 * despacho ausente é um campo vazio; uma leitura derrubada é o trabalho do analista perdido.
 */
export async function camposDeDocumentosEmitidos(
  processoCodigo: string,
): Promise<{ campos: Record<string, CampoEmitido>; totalEmitidos: number; erro?: string }> {
  const campos: Record<string, CampoEmitido> = {};
  if (!processoCodigo?.trim()) return { campos, totalEmitidos: 0 };

  const { data, error } = await supabase
    .from("mdp_registros")
    .select("tipo, numero, data_despacho, criado_em")
    .eq("processo_codigo", processoCodigo)
    .order("criado_em", { ascending: true });

  if (error) return { campos, totalEmitidos: 0, erro: error.message };
  const registros = data ?? [];
  if (!registros.length) return { campos, totalEmitidos: 0 };

  // a ordem de emissão É a ordem das análises; "interno" não é análise
  const despachos = registros.filter((r) => r.tipo === "despacho");
  despachos.slice(0, 5).forEach((r, i) => {
    const [chaveNumero, chaveData] = CAMPOS_POR_ANALISE[i];
    const ordinal = `${i + 1}ª análise`;
    if (r.numero) campos[chaveNumero] = { valor: String(r.numero), fonte: `despacho da ${ordinal}` };
    if (r.data_despacho) campos[chaveData] = { valor: String(r.data_despacho), fonte: `despacho da ${ordinal}` };
  });

  const ultimoDe = (tipo: string) => [...registros].reverse().find((r) => r.tipo === tipo);
  const mapa: [string, string, string][] = [
    ["laudo", "numeroDoLaudo5", "dataDoLaudo5"],
    ["indeferimento", "numeroDoParecerDeIndeferimento", "dataDoParecerDeIndeferimento"],
    ["arquivamento", "numeroDoParecerDeArquivamento", "dataDoParecerDeArquivamento"],
  ];
  for (const [tipo, chaveNumero, chaveData] of mapa) {
    const r = ultimoDe(tipo);
    if (!r) continue;
    if (r.numero) campos[chaveNumero] = { valor: String(r.numero), fonte: `${tipo} emitido` };
    if (r.data_despacho) campos[chaveData] = { valor: String(r.data_despacho), fonte: `${tipo} emitido` };
  }

  return { campos, totalEmitidos: registros.length };
}

/**
 * O analista mudou ao longo do processo?
 *
 * Compara quem emitiu cada documento. Sem emissão nenhuma, não há como saber — e "NÃO" seria
 * chute, não resposta.
 */
export async function houveMudancaDeAnalista(
  processoCodigo: string,
): Promise<{ valor: string; fonte: string } | null> {
  const { data } = await supabase
    .from("mdp_registros").select("usuario_id")
    .eq("processo_codigo", processoCodigo);
  const ids = [...new Set((data ?? []).map((r) => r.usuario_id).filter(Boolean))];
  if (ids.length === 0) return null;
  return {
    valor: ids.length > 1 ? "SIM" : "NÃO",
    fonte: `${ids.length} analista(s) emitiram documento neste processo`,
  };
}
