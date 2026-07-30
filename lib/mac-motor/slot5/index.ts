/**
 * lib/mac-motor/slot5/index.ts — orquestração do piloto do motor híbrido, Slot 5.
 *
 * Usa `lib/mac-execucao/*` só como CLIENTE (iniciarExecucao/registrarResultado/concluirExecucao,
 * versaoLip/versaoMac) — nenhuma função de lá é alterada. `versaoBip` é calculada aqui, a partir
 * dos vínculos REAIS dos 3 itens deste piloto (leitura, não escrita, de mac_bip_vinculos).
 *
 * NÃO integrado à tela ainda (por instrução do usuário) — só chamado por
 * app/api/mac/slot-05/executar-piloto/route.ts, que não é referenciado por nenhuma página.
 *
 * O comparador quadro×carimbo (arquétipo 3, experimental) NÃO é chamado aqui — não tem item MAC,
 * não faz parte da execução gravada. Ver comparadorQuadroCarimbo.ts.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  concluirExecucao, iniciarExecucao, marcarErro, registrarResultado,
  versaoLip as calcularVersaoLip, versaoMac as calcularVersaoMac, versaoBip as calcularVersaoBip,
  type ResultadoItem, type VinculoBipUsado,
} from "@/lib/mac-execucao";
import type { CampoLipCongelado, DocumentoEntrada, ResultadoExtracao } from "./tipos";
import { chamarGemini } from "./gemini";
import { PROMPT_CAIXA_RECARGA, PROMPT_DIMENSOES_TERRENO } from "./prompts";
import { fatoParaEvidencia, metadadosExtracaoParaEvidencia } from "./evidencias";
import {
  MAC_ITEM_DIMENSOES_TERRENO, decidirDimensoesTerreno,
} from "./regras/dimensoesTerreno";
import {
  MAC_ITEM_CAIXA_RECARGA_MEMORIAL, MAC_ITEM_CAIXA_RECARGA_VOLUME, decidirCaixaDeRecarga,
} from "./regras/caixaDeRecarga";

export const ITENS_MAC_DO_PILOTO_SLOT5 = [
  MAC_ITEM_DIMENSOES_TERRENO, MAC_ITEM_CAIXA_RECARGA_MEMORIAL, MAC_ITEM_CAIXA_RECARGA_VOLUME,
] as const;

export type EntradaPilotoSlot5 = {
  processoId: string;
  criadoPor?: string | null;
  apiKey: string;

  // fatos já extraídos pelo LIP (deterministicos, sem Gemini) — passo 1 do contrato pedido.
  // Congelados (valor bruto + normalizado + origem de processos.dados), não números soltos.
  areaTerreno: CampoLipCongelado;
  areaPermeavelProjetada: CampoLipCongelado;
  volumeDaCaixaDeRecarga: CampoLipCongelado;

  // documentos para o motor ler por conta própria — null = não disponível, motor trata como abstenção.
  // `documentoPrancha` é usado nas DUAS extrações (dimensões e caixa de recarga) — mesmo arquivo,
  // recortes de interesse diferentes por prompt.
  documentoCertidao: DocumentoEntrada | null;
  documentoPrancha: DocumentoEntrada | null;
};

export type SaidaPilotoSlot5 = {
  execucaoId: string;
  resultados: ResultadoItem[];
  extracoes: { dimensoesTerreno: ResultadoExtracao | null; caixaRecarga: ResultadoExtracao | null };
};

async function vinculosBipDoPiloto(): Promise<{ porItem: Map<string, VinculoBipUsado[]>; todos: { fragmentoId: string; confianca: string }[] }> {
  const { data, error } = await supabaseAdmin
    .from("mac_bip_vinculos")
    .select("mac_item_id, bip_fragmento_id, confianca")
    .in("mac_item_id", [...ITENS_MAC_DO_PILOTO_SLOT5]);
  if (error) throw new Error(`mac_bip_vinculos: ${error.message}`);

  const fragmentoIds = [...new Set((data ?? []).map((v) => v.bip_fragmento_id))];
  const { data: fragmentos } = fragmentoIds.length
    ? await supabaseAdmin.from("bdi_lei_fragmentos").select("id, referencia").in("id", fragmentoIds)
    : { data: [] as { id: string; referencia: string | null }[] };
  const referenciaPorId = new Map((fragmentos ?? []).map((f: any) => [f.id, f.referencia as string | null]));

  const porItem = new Map<string, VinculoBipUsado[]>();
  const todos: { fragmentoId: string; confianca: string }[] = [];
  for (const v of data ?? []) {
    const vinculo: VinculoBipUsado = {
      fragmentoId: v.bip_fragmento_id,
      referencia: referenciaPorId.get(v.bip_fragmento_id) ?? v.bip_fragmento_id,
      confianca: v.confianca,
    };
    todos.push({ fragmentoId: v.bip_fragmento_id, confianca: v.confianca });
    const lista = porItem.get(v.mac_item_id) ?? [];
    lista.push(vinculo);
    porItem.set(v.mac_item_id, lista);
  }
  return { porItem, todos };
}

export async function executarPilotoSlot5(entrada: EntradaPilotoSlot5): Promise<SaidaPilotoSlot5> {
  const vinculosBip = await vinculosBipDoPiloto();
  const [versaoLip, versaoMac, versaoBip] = await Promise.all([
    Promise.resolve(calcularVersaoLip()),
    Promise.resolve(calcularVersaoMac()),
    Promise.resolve(calcularVersaoBip(vinculosBip.todos)),
  ]);

  const execucao = await iniciarExecucao({
    processoId: entrada.processoId,
    versaoLip, versaoMac, versaoBip,
    criadoPor: entrada.criadoPor ?? null,
    metadata: {
      motor: "slot5-piloto-v3",
      arquetipos: ["dimensoesTerreno", "caixaDeRecarga"],
      itensMac: ITENS_MAC_DO_PILOTO_SLOT5,
    },
  });

  try {
    // dimensões lê planta + certidão juntas — o mesmo arquivo de planta usado na caixa de recarga
    const documentosDimensoes = [entrada.documentoPrancha, entrada.documentoCertidao].filter(
      (d): d is DocumentoEntrada => d !== null,
    );
    let extracaoDimensoes: ResultadoExtracao | null = null;
    if (documentosDimensoes.length > 0) {
      extracaoDimensoes = await chamarGemini(documentosDimensoes, PROMPT_DIMENSOES_TERRENO, entrada.apiKey);
    }
    const saidaDimensoes = decidirDimensoesTerreno({
      areaTerreno: entrada.areaTerreno,
      fatos: extracaoDimensoes?.fatos ?? [],
    });
    const evidenciasDimensoes = saidaDimensoes.fatosUsados.map(fatoParaEvidencia);
    if (extracaoDimensoes) evidenciasDimensoes.push(metadadosExtracaoParaEvidencia(extracaoDimensoes));

    const resultado1 = await registrarResultado(execucao.id, {
      macItemId: saidaDimensoes.macItemId,
      aplicabilidade: saidaDimensoes.aplicabilidade,
      resultado: saidaDimensoes.resultado,
      confianca: saidaDimensoes.confianca,
      justificativa: saidaDimensoes.justificativa,
      evidencias: evidenciasDimensoes,
      camposLip: saidaDimensoes.camposLip,
      vinculosBip: vinculosBip.porItem.get(saidaDimensoes.macItemId) ?? [],
      regraId: saidaDimensoes.regraId,
      regraVersao: saidaDimensoes.regraVersao,
      requerRevisao: saidaDimensoes.requerRevisao,
    });

    let extracaoCaixa: ResultadoExtracao | null = null;
    if (entrada.documentoPrancha) {
      extracaoCaixa = await chamarGemini([entrada.documentoPrancha], PROMPT_CAIXA_RECARGA, entrada.apiKey);
    }
    const { memorial, volume } = decidirCaixaDeRecarga({
      areaTerreno: entrada.areaTerreno,
      areaPermeavelProjetada: entrada.areaPermeavelProjetada,
      volumeDaCaixaDeRecarga: entrada.volumeDaCaixaDeRecarga,
      fatos: extracaoCaixa?.fatos ?? [],
    });

    const evidenciasMemorial = memorial.fatosUsados.map(fatoParaEvidencia);
    const evidenciasVolume = volume.fatosUsados.map(fatoParaEvidencia);
    if (extracaoCaixa) {
      evidenciasMemorial.push(metadadosExtracaoParaEvidencia(extracaoCaixa));
      evidenciasVolume.push(metadadosExtracaoParaEvidencia(extracaoCaixa));
    }

    const resultado2 = await registrarResultado(execucao.id, {
      macItemId: memorial.macItemId,
      aplicabilidade: memorial.aplicabilidade,
      resultado: memorial.resultado,
      confianca: memorial.confianca,
      justificativa: memorial.justificativa,
      evidencias: evidenciasMemorial,
      camposLip: memorial.camposLip,
      vinculosBip: vinculosBip.porItem.get(memorial.macItemId) ?? [],
      regraId: memorial.regraId,
      regraVersao: memorial.regraVersao,
      requerRevisao: memorial.requerRevisao,
    });

    const resultado3 = await registrarResultado(execucao.id, {
      macItemId: volume.macItemId,
      aplicabilidade: volume.aplicabilidade,
      resultado: volume.resultado,
      confianca: volume.confianca,
      justificativa: volume.justificativa,
      evidencias: evidenciasVolume,
      camposLip: volume.camposLip,
      vinculosBip: vinculosBip.porItem.get(volume.macItemId) ?? [],
      regraId: volume.regraId,
      regraVersao: volume.regraVersao,
      requerRevisao: volume.requerRevisao,
    });

    await concluirExecucao(execucao.id);

    return {
      execucaoId: execucao.id,
      resultados: [resultado1, resultado2, resultado3],
      extracoes: { dimensoesTerreno: extracaoDimensoes, caixaRecarga: extracaoCaixa },
    };
  } catch (e: any) {
    await marcarErro(execucao.id, e?.message ?? "erro desconhecido no piloto do Slot 5").catch(() => {});
    throw e;
  }
}

export { decidirDimensoesTerreno, MAC_ITEM_DIMENSOES_TERRENO } from "./regras/dimensoesTerreno";
export {
  decidirCaixaDeRecarga, MAC_ITEM_CAIXA_RECARGA_MEMORIAL, MAC_ITEM_CAIXA_RECARGA_VOLUME,
} from "./regras/caixaDeRecarga";
export { compararQuadroDeAreasComCarimbo } from "./comparadorQuadroCarimbo";
export { interpretarResposta, chamarGemini, RespostaGeminiInvalidaError } from "./gemini";
export * from "./tipos";
