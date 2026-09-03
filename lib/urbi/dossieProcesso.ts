import { acharIncoerencias, resumirCampos } from "@/lib/bdi/vigia";

type CampoLipBruto = {
  valor?: unknown;
  fonte?: unknown;
  origem?: unknown;
};

export type CampoLipTecnico = {
  valor: string | number | boolean;
  fonte: string | null;
  origem: string | null;
};

export type ResumoChecklist = {
  total_marcado: number;
  conforme: number;
  nao_conforme: number;
  nao_aplica: number;
  em_branco: number;
  outros: number;
};

// O dossiê é a futura entrada do Gemini. Estes campos não precisam sair do
// URBIS para a IA conseguir conferir área, uso, zoneamento e checklist.
const CHAVE_PESSOAL = /(propriet|interessad|autor|responsavel|cpf|cnpj|email|telefone|celular|contato|matricula|endereco|logradouro)/i;

function textoCurto(valor: unknown, limite = 500): string | number | boolean | null {
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

/**
 * Mantém apenas os campos técnicos do LIP e preserva a procedência do valor.
 * O objeto original nunca é devolvido ao chat: nomes e contatos ficam fora.
 */
export function camposTecnicosDoLip(
  dados: Record<string, unknown> | null | undefined,
): Record<string, CampoLipTecnico> {
  const saida: Record<string, CampoLipTecnico> = {};
  for (const [chave, bruto] of Object.entries(dados ?? {})) {
    if (CHAVE_PESSOAL.test(chave) || !bruto || typeof bruto !== "object" || Array.isArray(bruto)) continue;
    const campo = bruto as CampoLipBruto;
    const valor = textoCurto(campo.valor);
    if (valor === null) continue;
    saida[chave] = {
      valor,
      fonte: typeof campo.fonte === "string" ? campo.fonte.slice(0, 120) : null,
      origem: typeof campo.origem === "string" ? campo.origem.slice(0, 120) : null,
    };
  }
  return saida;
}

export function resumoChecklist(itens: Record<string, unknown> | null | undefined): ResumoChecklist {
  const resumo: ResumoChecklist = { total_marcado: 0, conforme: 0, nao_conforme: 0, nao_aplica: 0, em_branco: 0, outros: 0 };
  for (const status of Object.values(itens ?? {})) {
    // "em_branco" é item ativo do modelo que o analista ainda não marcou (ver
    // app/api/urbi/dossie/route.ts) — não é marcação real, então fica fora de
    // total_marcado/outros para não mascarar status realmente inesperado.
    if (status === "em_branco") { resumo.em_branco += 1; continue; }
    resumo.total_marcado += 1;
    if (status === "conforme") resumo.conforme += 1;
    else if (status === "nao_conforme") resumo.nao_conforme += 1;
    else if (status === "nao_aplica") resumo.nao_aplica += 1;
    else resumo.outros += 1;
  }
  return resumo;
}

export function fatosDoLip(processo: {
  dados?: Record<string, unknown> | null;
  area_construida?: unknown;
  codigo: string;
  tipo_processo?: string | null;
  tags?: unknown;
}) {
  const resumo = resumirCampos(processo.dados as Record<string, any> | null | undefined);
  const incoerencias = acharIncoerencias(processo as any);
  return {
    campos_tecnicos: camposTecnicosDoLip(processo.dados),
    campos_vazios: resumo.vazios,
    campos_em_x: resumo.emX,
    campos_totais: resumo.totais,
    incoerencias,
  };
}

export function ordenarAnalises<T extends { numero_analise?: unknown }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => Number(a.numero_analise ?? 0) - Number(b.numero_analise ?? 0));
}
