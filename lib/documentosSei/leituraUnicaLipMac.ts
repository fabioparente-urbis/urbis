/**
 * lib/documentosSei/leituraUnicaLipMac.ts — Fase 9 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("uma leitura, dois destinos").
 *
 * Base isolada desta fase: interruptor (fail-safe DESLIGADO, mesmo padrão de
 * lib/documentosSei/config.ts) e o prompt combinado que junta a extração de campos do LIP com o
 * julgamento do checklist do MAC numa resposta só.
 *
 * NADA aqui é chamado ainda por ProcessoClient.tsx nem por app/api/mac/p3/route.ts — ligar isso
 * nos dois pipelines de leitura de produção do Slot 1/2 fica para a próxima sessão, com o Fábio
 * presente (ver urbis_fatiador_pdf_modulo.md).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function leituraUnicaLipMacAtiva(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("urbis_config")
    .select("leitura_unica_lip_mac_ativo")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return false;
  return (data as any).leitura_unica_lip_mac_ativo === true;
}

type ChecklistItemIn = { id: string; texto: string; grupo: string };

/**
 * Junta o prompt de leitura do LIP (o que hoje monta S2/S3) com o prompt P3_MAC (o que hoje monta
 * app/api/mac/p3/route.ts) num único texto, pedindo uma resposta JSON com dois blocos —
 * `{ lip: {...}, mac: {...} }` — em vez de duas chamadas separadas ao Gemini.
 *
 * O bloco `mac` usa o MESMO formato de saída que app/api/mac/p3/route.ts já espera (itens,
 * documentos, incompatibilidades), pra poder reaproveitar o parsing existente sem reescrevê-lo.
 * O bloco `lip` reproduz o prompt do LIP como está salvo hoje, sem reescrever — só delimitado.
 */
export function montarPromptCombinadoLipMac(
  promptLip: string,
  promptMac: string,
  checklistItens: ChecklistItemIn[]
): string {
  const checklistEnxuto = checklistItens.map((i) => ({ id: i.id, texto: i.texto, grupo: i.grupo }));
  return `Você vai analisar o PDF de um processo administrativo e produzir DUAS saídas independentes
a partir da MESMA leitura — não repita a leitura, use o que você já viu no documento para as duas.

===== SAÍDA 1 — FICHA DO PROCESSO (LIP) =====
${promptLip}

===== SAÍDA 2 — CHECKLIST DE CONFORMIDADE (MAC) =====
${promptMac}

CHECKLIST MAC (analisar cada item contra o PDF e classificar):
${JSON.stringify(checklistEnxuto, null, 2)}

===== FORMATO FINAL — OBRIGATÓRIO =====
Responda com um único JSON no formato:
{
  "lip": { ...exatamente o que a SAÍDA 1 pede... },
  "mac": {
    "itens": { "<id do item>": "conforme" | "nao_conforme" | "nao_aplica" | null, ... },
    "documentos": [ ... ],
    "incompatibilidades": [ "..." ]
  }
}
Nenhum campo de "lip" pode aparecer dentro de "mac" nem vice-versa. Se um dos dois blocos não
tiver nada a preencher, devolva o objeto vazio ({}) — nunca omita a chave.`;
}

/** Formato esperado da resposta combinada, depois do parse do JSON do Gemini. */
export type RespostaLeituraUnica = {
  lip: Record<string, any>;
  mac: {
    itens?: Record<string, any>;
    documentos?: any[];
    incompatibilidades?: string[];
  };
};
