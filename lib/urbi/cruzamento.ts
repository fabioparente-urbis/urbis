import { numeroBR } from "@/lib/bdi/vigia";
import type { EvolucaoChecklist } from "./dossieProcesso";
import { dominioDoCampo, rotuloDoCampo, podeComparar, type Slot } from "./catalogoSemantico";

/**
 * Cruzamento determinístico LIP × MAC × BIP × documentos — Fase B do plano de Inteligência
 * URBIS. Biblioteca pura (sem rede, sem banco): recebe fato já lido por quem chama, devolve
 * classificação. Reutilizável pelos 3 slots hoje e por qualquer slot futuro, sem regra
 * específica de nenhum deles aqui dentro.
 *
 * Regras que valem pra todo o arquivo (pedido explícito do Fábio):
 * - normaliza número brasileiro antes de comparar (numeroBR, já usado em lib/bdi/vigia.ts —
 *   não reinventado aqui);
 * - nunca tolerância silenciosa: diferença real, por menor que seja, vira "possivel_divergencia",
 *   nunca "consistente";
 * - nunca aplica regra jurídica nova — só classifica presença/ausência de vínculo já existente;
 * - só compara par de campo/valor quando há correspondência real confirmada (mesma chave nos
 *   dois lados, ou vínculo já cadastrado) — nunca inventa qual campo "deveria" corresponder a qual.
 */

export type GrauCruzamento =
  | "consistente"
  | "possivel_divergencia"
  | "corrigido_entre_passadas"
  | "pendencia_mantida"
  | "dado_ausente"
  | "base_juridica_ausente"
  | "nao_aplicavel"
  | "aguarda_confirmacao_humana"
  // Fase AA (05/09/2026): campo sem domínio semântico catalogado (lib/urbi/catalogoSemantico.ts)
  // pra este slot — nunca vira comparação numérica adivinhada, sempre este estado explícito.
  | "base_insuficiente";

export type ResultadoCruzamento = {
  /** Categoria do cruzamento — usada pra escolher a função certa de leitura/registro. */
  tipo: "lip_x_documento" | "mac_item_x_bip" | "evolucao_checklist" | "semantica_lip";
  /** Chave ESTÁVEL de dedupe (item_id, chave de campo) — nunca exibida ao analista/modelo. */
  chave: string;
  /** Identificação HUMANA do que foi comparado — isto é o que aparece na tela/resposta, nunca a `chave`. */
  rotulo: string;
  resultado: GrauCruzamento;
  motivo: string;
  campos_comparados: string[];
  fontes: string[];
  regra: string;
};

// ---------------------------------------------------- comparador numérico puro

/**
 * Compara dois valores (número brasileiro ou texto) já normalizados. Nunca decide "está
 * errado" — só classifica igual/diferente/ausente. `regra` é sempre "comparação exata" — não
 * existe modo aproximado aqui, de propósito.
 */
export function compararValores(
  valorA: string | number | boolean | null | undefined,
  valorB: string | number | boolean | null | undefined,
): { resultado: GrauCruzamento; motivo: string; regra: string } {
  const presenteA = valorA !== null && valorA !== undefined && String(valorA).trim() !== "";
  const presenteB = valorB !== null && valorB !== undefined && String(valorB).trim() !== "";
  if (!presenteA || !presenteB) {
    return {
      resultado: "dado_ausente",
      motivo: !presenteA && !presenteB ? "Nenhum dos dois lados tem valor." : !presenteA ? "Falta valor do primeiro lado." : "Falta valor do segundo lado.",
      regra: "presença de valor",
    };
  }

  const numA = numeroBR(valorA);
  const numB = numeroBR(valorB);
  if (numA !== null && numB !== null) {
    if (numA === numB) {
      return { resultado: "consistente", motivo: `Mesmo valor numérico (${numA}) nos dois lados.`, regra: "comparação numérica exata, após normalizar formato BR" };
    }
    return { resultado: "possivel_divergencia", motivo: `Valores numéricos diferentes: ${numA} × ${numB}.`, regra: "comparação numérica exata, após normalizar formato BR" };
  }

  const textoA = String(valorA).trim().toLowerCase();
  const textoB = String(valorB).trim().toLowerCase();
  if (textoA === textoB) {
    return { resultado: "consistente", motivo: "Mesmo texto (após remover espaços extras e diferença de maiúscula/minúscula) nos dois lados.", regra: "comparação de texto exata, sem tolerância" };
  }
  return { resultado: "possivel_divergencia", motivo: `Textos diferentes: "${valorA}" × "${valorB}".`, regra: "comparação de texto exata, sem tolerância" };
}

// ---------------------------------------------------- LIP × documento (mhd_resultados_campo)

export type CampoLipParaCruzar = { chave: string; valor: string | number | boolean; fonte: string | null };
export type ResultadoCampoDocumento = { chave: string; valor: string | null; fonte: string | null };

/**
 * Cruza campo técnico do LIP (`processos.dados`, já redigido — ver camposTecnicosDoLip) contra
 * o que a leitura de documento (`mhd_resultados_campo`, vigente) achou pra MESMA chave. Só
 * compara quando a chave aparece nos dois lados — é a "correspondência documental confirmada"
 * que o Fábio pediu, sem inventar qual campo bate com qual.
 *
 * Hoje só tem massa real pra isso no Slot 5 (mhd_resultados_campo não é alimentado pelos
 * outros slots) — mas a função não sabe nem verifica slot: se um dia Regularização/Aceite
 * passarem a gravar ali, funciona igual, sem mudar nada aqui.
 */
export function cruzarLipComDocumento(
  camposLip: Record<string, CampoLipParaCruzar>,
  resultadosDocumento: ResultadoCampoDocumento[],
): ResultadoCruzamento[] {
  const porChave = new Map(resultadosDocumento.map((r) => [r.chave, r]));
  const saida: ResultadoCruzamento[] = [];
  for (const [chave, campoLip] of Object.entries(camposLip)) {
    const doDocumento = porChave.get(chave);
    if (!doDocumento) continue; // sem correspondência confirmada — fica de fora, não é suposição
    const cmp = compararValores(campoLip.valor, doDocumento.valor);
    saida.push({
      tipo: "lip_x_documento",
      chave,
      rotulo: chave, // chave do LIP já é um identificador técnico legível (ex.: "areaTerreno"), não UUID — mantido como rótulo por falta de um "label" mais amigável disponível aqui
      resultado: cmp.resultado,
      motivo: cmp.motivo,
      campos_comparados: [chave],
      fontes: [campoLip.fonte ?? "processos.dados", doDocumento.fonte ?? "mhd_resultados_campo"],
      regra: cmp.regra,
    });
  }
  return saida;
}

// ---------------------------------------------------- item MAC × BIP (base jurídica)

export type VinculoBipDoItem = { referencia: string; confianca: string };

/**
 * Pra cada item NÃO CONFORME, classifica se ele tem base jurídica aprovada (mac_bip_vinculos —
 * nunca proposta pendente, essa nunca fundamenta nada) vinculada. Não decide se a exigência é
 * válida — só se ela tem fundamento legal citável hoje.
 */
export function cruzarItensMacComBip(
  itensNaoConformes: { item_id: string; texto: string }[],
  vinculosBipAprovadosPorItem: Map<string, VinculoBipDoItem[]>,
): ResultadoCruzamento[] {
  return itensNaoConformes.map((item) => {
    const vinculos = vinculosBipAprovadosPorItem.get(item.item_id) ?? [];
    if (vinculos.length === 0) {
      return {
        tipo: "mac_item_x_bip",
        chave: item.item_id, // estável, só pra dedupe interno (lib/urbi/sugestoes.ts) — nunca exibido
        rotulo: item.texto,
        resultado: "base_juridica_ausente",
        motivo: `O item "${item.texto}" está não conforme e não tem nenhum fragmento do BIP vinculado e aprovado.`,
        campos_comparados: [item.texto],
        fontes: ["mac_bip_vinculos"],
        regra: "presença de vínculo aprovado",
      };
    }
    return {
      tipo: "mac_item_x_bip",
      chave: item.item_id,
      rotulo: item.texto,
      resultado: "consistente",
      motivo: `O item "${item.texto}" tem ${vinculos.length} fragmento(s) do BIP vinculado(s) e aprovado(s): ${vinculos.map((v) => v.referencia).join(", ")}.`,
      campos_comparados: [item.texto],
      fontes: ["mac_bip_vinculos"],
      regra: "presença de vínculo aprovado",
    };
  });
}

// ---------------------------------------------------- evolução do checklist (reaproveitada)

/**
 * Não recalcula nada — só traduz o que evolucaoChecklist() (Frente 1, lib/urbi/dossieProcesso.ts)
 * já apurou pra dentro do vocabulário desta Fase B, pra dossiê/sugestões falarem uma língua só.
 * itens_voltaram_nao_conforme fica de fora de propósito: "voltou" não é nenhuma das 8 categorias
 * desta fase, continua só no bloco de evolução (já tem tratamento próprio e sugestão própria).
 */
export function cruzarEvolucaoChecklist(evolucao: EvolucaoChecklist): ResultadoCruzamento[] {
  const saida: ResultadoCruzamento[] = [];
  for (const item of evolucao.itens_corrigidos) {
    saida.push({
      tipo: "evolucao_checklist", chave: item.item_id, rotulo: item.texto, resultado: "corrigido_entre_passadas",
      motivo: `Item "${item.texto}" estava ${item.de}, passou a ${item.para} em ${item.quando}.`,
      campos_comparados: [item.texto], fontes: ["mac_historico"], regra: "comparação de status entre passadas",
    });
  }
  for (const item of evolucao.itens_pendentes_mantidos) {
    saida.push({
      tipo: "evolucao_checklist", chave: item.item_id, rotulo: item.texto, resultado: "pendencia_mantida",
      motivo: `Item "${item.texto}" segue ${item.para} desde ${item.quando}, sem mudança.`,
      campos_comparados: [item.texto], fontes: ["mac_historico"], regra: "comparação de status entre passadas",
    });
  }
  return saida;
}

// ---------------------------------------------------- comparação por semântica (Fase AA)

export type CampoParaComparar = { slot: Slot; chave: string; valor: string | number | boolean | null | undefined; fonte: string };

/**
 * Compara dois campos do LIP DENTRO do mesmo processo usando o catálogo semântico
 * (lib/urbi/catalogoSemantico.ts) — nunca compara direto sem consultar o domínio de cada lado.
 * Substitui qualquer comparação ad hoc entre campos diferentes (ex.: a incoerência inválida
 * "área construída total × área do terreno", removida de lib/bdi/vigia.ts em 05/09/2026— aqui
 * ela ficaria "base_insuficiente" pra sempre, porque não existe regra ativa nem campo de área
 * ocupada em nenhum slot, então nem precisaria ter sido escrita à mão pra ser barrada).
 *
 * Três desfechos possíveis, nunca um quarto:
 *   1. Domínio não catalogado pra algum dos dois lados → "base_insuficiente" (semântica não
 *      comprovada — pode ser campo real mas ainda não mapeado, nunca uma suposição).
 *   2. Domínios catalogados mas SEM regra de comparação ativa entre eles → "nao_aplicavel"
 *      (ex.: área construída × área do terreno — domínios diferentes, sem regra).
 *   3. Mesmo domínio (única regra ativa hoje) → comparação numérica de verdade via
 *      compararValores, resultado "consistente"/"possivel_divergencia"/"dado_ausente" normal.
 */
export function compararPorSemantica(campoA: CampoParaComparar, campoB: CampoParaComparar): ResultadoCruzamento {
  const rotuloA = rotuloDoCampo(campoA.slot, campoA.chave) ?? campoA.chave;
  const rotuloB = rotuloDoCampo(campoB.slot, campoB.chave) ?? campoB.chave;
  const chaveDedupe = `${campoA.slot}:${campoA.chave}__${campoB.slot}:${campoB.chave}`;
  const domA = dominioDoCampo(campoA.slot, campoA.chave);
  const domB = dominioDoCampo(campoB.slot, campoB.chave);

  if (!domA || !domB) {
    const semDominio = !domA ? rotuloA : rotuloB;
    return {
      tipo: "semantica_lip", chave: chaveDedupe, rotulo: `${rotuloA} × ${rotuloB}`,
      resultado: "base_insuficiente",
      motivo: `"${semDominio}" não tem domínio semântico catalogado neste slot — comparação não realizada (evita adivinhar significado).`,
      campos_comparados: [rotuloA, rotuloB], fontes: [campoA.fonte, campoB.fonte],
      regra: "campo sem entrada em lib/urbi/catalogoSemantico.ts",
    };
  }

  const regra = podeComparar(domA, domB);
  if (!regra) {
    return {
      tipo: "semantica_lip", chave: chaveDedupe, rotulo: `${rotuloA} × ${rotuloB}`,
      resultado: "nao_aplicavel",
      motivo: `"${rotuloA}" (domínio ${domA}) e "${rotuloB}" (domínio ${domB}) têm semânticas diferentes e sem regra de comparação ativa — nunca comparados diretamente.`,
      campos_comparados: [rotuloA, rotuloB], fontes: [campoA.fonte, campoB.fonte],
      regra: "domínios semânticos incompatíveis, sem regra de comparação cadastrada",
    };
  }

  const cmp = compararValores(campoA.valor, campoB.valor);
  return {
    tipo: "semantica_lip", chave: chaveDedupe, rotulo: `${rotuloA} × ${rotuloB}`,
    resultado: cmp.resultado,
    motivo: `${rotuloA} (${campoA.valor ?? "—"}) × ${rotuloB} (${campoB.valor ?? "—"}): ${cmp.motivo}`,
    campos_comparados: [rotuloA, rotuloB], fontes: [campoA.fonte, campoB.fonte],
    regra: regra.descricao,
  };
}
