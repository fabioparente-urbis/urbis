// app/api/admin/bdi/leis/_referencias.ts
//
// Helper compartilhado: dada uma lei (registro de bdi_documentos_lei), busca
// itens de checklist em `mac_checklist_itens` cujo campo `ref` (texto livre,
// preenchido pelo autor do checklist) cite a lei. Como `ref` e texto livre,
// usamos heuristicas: numero/ano + palavras-chave do tipo. Tolerante a
// variacoes ortograficas comuns.
//
// Retorna [] quando nao ha referencias — o caller (DELETE) pode usar isso
// para autorizar a exclusao sem mais perguntas.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ReferenciaChecklist {
  id: string;
  modelo_id?: string | null;
  modelo_nome?: string | null;
  grupo?: string | null;
  texto?: string | null;
  ref?: string | null;
  ordem?: number | null;
}

type Lei = {
  id: string;
  titulo?: string | null;
  tipo?: string | null;
  numero?: string | null;
  ano?: string | number | null;
};

/**
 * Monta uma lista de patterns ILIKE razoaveis para detectar citacoes da lei
 * em texto livre. Ex.: numero "177" -> "%177%" (filtrando por tipo via
 * palavras-chave para reduzir falso positivo).
 */
function patternsParaLei(lei: Lei): string[] {
  const padroes = new Set<string>();
  const numero = lei.numero ? String(lei.numero).trim() : "";
  const ano = lei.ano != null ? String(lei.ano).trim() : "";
  const tipo = (lei.tipo ?? "").toLowerCase();

  // Para NBR e instrucao_aeronautica, o numero ja e bem distintivo
  if (tipo === "nbr" && numero) {
    padroes.add(`%NBR%${numero}%`);
    padroes.add(`%nbr%${numero}%`);
  }
  if (tipo === "instrucao_aeronautica" && numero) {
    padroes.add(`%${numero}%`);
  }

  // Lei complementar / ordinaria / decreto: combinar tipo + numero
  if (numero) {
    if (tipo === "lei_complementar") {
      padroes.add(`%LC%${numero}%`);
      padroes.add(`%Lei Complementar%${numero}%`);
      padroes.add(`%lei complementar%${numero}%`);
    } else if (tipo === "lei_ordinaria") {
      padroes.add(`%Lei%${numero}%`);
      padroes.add(`%lei%${numero}%`);
    } else if (tipo === "decreto") {
      padroes.add(`%Decreto%${numero}%`);
      padroes.add(`%decreto%${numero}%`);
    } else if (tipo === "instrucao_normativa") {
      padroes.add(`%IN%${numero}%`);
      padroes.add(`%Instrucao Normativa%${numero}%`);
      padroes.add(`%Instrução Normativa%${numero}%`);
    } else if (tipo === "plano_diretor") {
      padroes.add(`%Plano Diretor%`);
      padroes.add(`%plano diretor%`);
    }
  }

  // Tambem combinacao numero+ano e o titulo bruto como ultimo recurso
  if (numero && ano) {
    padroes.add(`%${numero}/${ano}%`);
    padroes.add(`%${numero}-${ano}%`);
  }
  if (lei.titulo) {
    // Usa as 4 primeiras palavras significativas do titulo (>3 chars) para
    // evitar match em "lei" / "de" / etc.
    const palavras = lei.titulo
      .split(/\s+/)
      .filter((p) => p.length > 3)
      .slice(0, 1);
    if (palavras.length > 0 && palavras[0].length > 5) {
      padroes.add(`%${palavras[0]}%`);
    }
  }

  return [...padroes];
}

/**
 * Busca referencias em `mac_checklist_itens.ref`. Como `ref` e texto livre,
 * o resultado pode ter falso positivos — o objetivo aqui e exibir tudo que
 * "potencialmente" cita a lei para o Administrador confirmar antes do delete.
 *
 * Faz uma busca por OR de patterns ILIKE. Limita a 200 linhas para nao
 * estourar a resposta.
 */
export async function buscarReferenciasChecklist(
  lei: Lei,
): Promise<ReferenciaChecklist[]> {
  const padroes = patternsParaLei(lei);
  if (padroes.length === 0) return [];

  // Monta a clausula OR do PostgREST: "ref.ilike.%X%,ref.ilike.%Y%"
  const orClause = padroes.map((p) => `ref.ilike.${p.replace(/,/g, "\\,")}`).join(",");

  const { data, error } = await supabaseAdmin
    .from("mac_checklist_itens")
    .select("id, modelo_id, grupo, texto, ref, ordem, ativo")
    .or(orClause)
    .eq("ativo", true)
    .limit(200);

  if (error) {
    console.warn("[bdi-leis referencias] supabase erro:", error.message);
    return [];
  }

  const itens = (data ?? []) as any[];
  if (itens.length === 0) return [];

  // Enriquecer com nome do modelo (se disponivel em mac_checklist_modelos)
  const modeloIds = Array.from(
    new Set(itens.map((i) => i.modelo_id).filter(Boolean)),
  );
  const nomesModelo = new Map<string, string>();
  if (modeloIds.length > 0) {
    const { data: modelos } = await supabaseAdmin
      .from("mac_checklist_modelos")
      .select("id, nome")
      .in("id", modeloIds);
    for (const m of modelos ?? []) {
      nomesModelo.set((m as any).id, (m as any).nome ?? null);
    }
  }

  return itens.map((i) => ({
    id: i.id,
    modelo_id: i.modelo_id ?? null,
    modelo_nome: nomesModelo.get(i.modelo_id) ?? null,
    grupo: i.grupo ?? null,
    texto: i.texto ?? null,
    ref: i.ref ?? null,
    ordem: i.ordem ?? null,
  }));
}
