// ============================================================
// Dispensas documentais — Aceite SEI (Slot 2).
//
// Lei Complementar nº 314/2018, TÍTULO II (Do Alvará de Aceite) e
// Instrução Normativa nº 7, de 10/07/2024, Anexo I, item 9.
//
// O Aceite NÃO é uma Regularização mais velha: é outro título, com
// outra lista de documentos. Três diferenças viram regra de sistema:
//
//   1. USO DO SOLO — NÃO é exigível. O Art. 7º, § 2º manda apresentar
//      os documentos do Art. 2º "EXCETUANDO O INCISO I", e o inciso I
//      do Art. 2º é justamente "Uso do Solo Aprovação de Projeto".
//      O interessado PODE juntar; o sistema nunca cobra.
//
//   2. CAIXA DE RECARGA / POÇO DE INFILTRAÇÃO — NÃO é exigível. A
//      obrigação nasce no Art. 2º, § 4º, que é do TÍTULO I
//      (Regularização). O Título II não a repete. O interessado PODE
//      apresentar; o sistema nunca cobra.
//
//   3. ART/RRT — NÃO é exigível no Aceite, nem a do levantamento nem a
//      da caixa. Decisão do Fábio, 17/09/2026: "não é obrigado a ter ART
//      mas pode ter... se tiver anotamos... tanto pra levantamento
//      quanto pra caixa". O sistema nunca cobra; quando vem, registra.
//
//      A IN nº 7/2024 (Anexo I, item 9, letras "E", "F" e "G") põe o
//      corte em 200,00 m² de área construída, e esse corte continua
//      sendo CALCULADO — mas como informação para o analista e para o
//      laudo, nunca como exigência automática. Ver o comentário dentro
//      de `chavesDispensadasAceiteSei`.
//
//      ATENÇÃO ao que NÃO é dispensado: o DESENHO continua completo.
//      Regra confirmada pelo Fábio em 17/09/2026 — "o croqui deve ser
//      IDÊNTICO ao projeto, só seria dispensada a ART com menos de
//      200m²". O que cai é a ART, não o conteúdo (planta de situação,
//      planta baixa e de locação, cobertura, fachadas, quadro de
//      áreas e no mínimo dois cortes). "Croqui cotado" é rótulo
//      administrativo, não permissão para entregar menos desenho.
//
// ISOLAMENTO DE SLOT (CLAUDE.md): este arquivo é do Slot 2 e não
// importa NADA de `lib/caixaRecargaSlot1.ts` nem de
// `lib/mac-motor/slot5/`, mesmo onde o código se parece. Os 200 m²
// daqui não têm relação nenhuma com os 250 m² da caixa do Slot 1 nem
// com os 200 m² da caixa do Slot 5: são três cortes de três leis
// diferentes que por acaso usam números parecidos. Um mexer no outro
// é exatamente o acidente que o isolamento existe para impedir.
//
// Tudo aqui é COMPARAÇÃO NUMÉRICA sobre campo que o LIP já tem —
// decisão determinística do sistema, nunca da IA.
// ============================================================

/** Corte da IN nº 7/2024, Anexo I, item 9 — em m² de área construída. */
export const LIMITE_AREA_ART_M2 = 200;

/** Campo do LIP como ele vive em `processos.dados`. */
export type CampoLip = { valor?: string | null; origem?: string | null; fonte?: string | null } | null | undefined;

/**
 * Chaves do LIP ligadas ao Uso do Solo. Nenhuma é exigível no Aceite.
 *
 * CONFERIDAS contra `lip_campos.chave` do assunto Aceite SEI
 * (cb574aa0-5040-4fd0-aa60-14b64d9a047a) em 17/09/2026 — os 79 campos
 * reais das 9 abas. NÃO copiar nomes de campo do Slot 1: o Aceite usa
 * chaves próprias (`areaAceite`, não `areaTotal`; `numeroUso`, não
 * `usoSolo`), e confiar em nome achado no código foi exatamente o que
 * causou o bug de 15/09/2026 (29 de 95 campos gravados em campo
 * inexistente).
 *
 * `corredor` e `faixa` entram porque são LIDOS do documento de Uso do
 * Solo: sem o documento — que aqui não é exigível — não há de onde
 * tirá-los. `despacho` e `seiCheadv` moram na mesma aba "3. Uso do
 * Solo" mas são do CHEADV, não do Uso do Solo, e por isso NÃO entram.
 *
 * `vistoriaUnidadeTerritorial` ficou DE FORA de propósito: o prefixo diz
 * vistoria e a origem real (Uso do Solo ou laudo fiscal) não está clara.
 * Na dúvida, não dispensar — deixar de fora só mantém uma pré-marcação
 * visível, enquanto dispensar demais apaga em silêncio a cobrança de um
 * documento que talvez seja exigível.
 */
export const CHAVES_LIP_USO_SOLO = [
  "numeroUso", "cnae1", "cnae2", "corredor", "faixa",
] as const;

/** Chaves do LIP ligadas à caixa de recarga. Nenhuma é exigível no Aceite. */
export const CHAVES_LIP_CAIXA = [
  "caixa", "volMin", "volAt", "caixas", "areaImpermeavel", "areaPermeavel",
  "artCx", "nroArtCx",
] as const;

/**
 * Chaves do LIP da ART/RRT do levantamento — dispensadas só até 200 m².
 *
 * `levantamento` (o DESENHO) NÃO está aqui e nunca deve estar: ele
 * continua exigível em qualquer área. Só a responsabilidade técnica
 * formal cai. Ver o cabeçalho deste arquivo.
 */
export const CHAVES_LIP_ART_LEVANTAMENTO = ["artLev", "nroArtLev"] as const;

export type SituacaoArtLevantamento =
  /** Área construída ≤ 200 m² — a IN não exige ART/RRT. Decisão fechada. */
  | "DISPENSADA"
  /** Área construída > 200 m² — ART/RRT exigível. */
  | "EXIGIVEL"
  /** Área construída não informada — sem ela não há como aplicar o corte. */
  | "INDETERMINADA";

export type VeredictoArtLevantamento = {
  situacao: SituacaoArtLevantamento;
  /** true = dispensada pela área; false = exigível; null = falta a área para decidir. */
  dispensadaPorArea: boolean | null;
  /** Área construída considerada na comparação, em m² (0 quando desconhecida). */
  areaConsiderada: number;
  /** Texto pronto para a tela do LIP, para o VCP e para o registro em Observações. */
  mensagem: string;
};

/** Aceita as grafias históricas de `processos.tipo_processo` para o Slot 2. */
export function ehAceiteSei(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim().startsWith("aceite");
}

/**
 * Mesmo parser de área do resto do sistema: aceita "1.234,56",
 * "1234,56" e "1234.56", com ou sem "m²". "NP", vazio e lixo viram
 * null — nunca 0, que seria "área zero" e dispensaria por engano.
 */
function parseArea(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/m²|m2/gi, "").trim();
  if (!s || s.toUpperCase() === "NP") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Aplica o corte dos 200 m² sobre o que o LIP já tem.
 *
 * A área considerada soma a área a aceitar (`areaTotal`) com a área já
 * aprovada anteriormente (`areaAprovada`), quando houver — leitura
 * CONSERVADORA: somar só pode ADIAR uma dispensa, nunca dispensar um
 * caso que a norma exigiria.
 */
export function avaliarArtLevantamento(leitura: {
  /** `areaAceite` — "Á. do Aceite (TOTAL)", aba 2 do LIP do Aceite. */
  areaAceite?: CampoLip;
  /** `areaExistente` — "Área Existente Aprovada (m²)", aba 2. */
  areaExistente?: CampoLip;
}): VeredictoArtLevantamento {
  const areaAceite = parseArea(leitura.areaAceite?.valor) ?? 0;
  const areaExistente = parseArea(leitura.areaExistente?.valor) ?? 0;
  const areaConsiderada = areaAceite + areaExistente;

  const detalheParcelas =
    areaExistente > 0
      ? ` (${fmt(areaAceite)} m² a aceitar + ${fmt(areaExistente)} m² já aprovados)`
      : "";

  if (areaConsiderada <= 0) {
    return {
      situacao: "INDETERMINADA",
      dispensadaPorArea: null,
      areaConsiderada: 0,
      mensagem:
        `Área construída não informada no LIP — sem ela o sistema não aplica o corte de ` +
        `${LIMITE_AREA_ART_M2} m² da IN nº 7/2024 (Anexo I, item 9). Preencha ` +
        `"Á. do Aceite (TOTAL)" para saber se a ART/RRT do levantamento é exigível.`,
    };
  }

  if (areaConsiderada <= LIMITE_AREA_ART_M2) {
    return {
      situacao: "DISPENSADA",
      dispensadaPorArea: true,
      areaConsiderada,
      mensagem:
        `Área construída de ${fmt(areaConsiderada)} m²${detalheParcelas} — não passa de ` +
        `${LIMITE_AREA_ART_M2} m². ART/RRT do levantamento DISPENSADA pela IN nº 7/2024 ` +
        `(Anexo I, item 9). O LEVANTAMENTO EM SI CONTINUA EXIGÍVEL e com o mesmo conteúdo ` +
        `de um projeto completo — o que cai é só a responsabilidade técnica formal.`,
    };
  }

  return {
    situacao: "EXIGIVEL",
    dispensadaPorArea: false,
    areaConsiderada,
    mensagem:
      `Área construída de ${fmt(areaConsiderada)} m²${detalheParcelas} — acima de ` +
      `${LIMITE_AREA_ART_M2} m². ART/RRT do levantamento EXIGÍVEL pela IN nº 7/2024 ` +
      `(Anexo I, item 9, letra "G").`,
  };
}

/** Atalho para quem tem `processos.dados` na mão (tela do LIP, rotas, VCP). */
export function avaliarArtLevantamentoDosDados(
  dados: Record<string, CampoLip> | null | undefined,
): VeredictoArtLevantamento {
  const d = dados ?? {};
  return avaliarArtLevantamento({ areaAceite: d["areaAceite"], areaExistente: d["areaExistente"] });
}

export type DispensasAceiteSei = {
  /** Chaves do LIP que NÃO podem virar exigência automática neste processo. */
  chaves: string[];
  /** Veredito da ART — null quando o processo não é Aceite SEI. */
  veredictoArt: VeredictoArtLevantamento | null;
  /** Um motivo por grupo dispensado, para log e para a resposta da rota. */
  motivos: string[];
};

/**
 * Chaves do LIP que, no Aceite SEI, nunca podem virar "não conforme"
 * automático no MAC por estarem vazias.
 *
 * NÃO desativa, não esconde e não responde item nenhum do checklist: os
 * itens continuam lá, visíveis e marcáveis pelo analista. O que deixa de
 * acontecer é só a PRÉ-MARCAÇÃO automática — mesma semântica da dispensa
 * da caixa no Slot 1. Por isso devolve `motivos`: quem chama registra o
 * que deixou de marcar, porque item não pode sumir em silêncio
 * (CLAUDE.md).
 *
 * Uso do Solo, caixa e ART/RRT (de levantamento E de caixa) saem SEMPRE:
 * nenhum é exigível no Aceite, e todos podem ser apresentados. A área não
 * entra nessa conta — ver o comentário sobre os 200 m² no corpo da função.
 */
export function chavesDispensadasAceiteSei(
  tipoProcesso: string | null | undefined,
  dados: Record<string, CampoLip> | null | undefined,
): DispensasAceiteSei {
  if (!ehAceiteSei(tipoProcesso)) return { chaves: [], veredictoArt: null, motivos: [] };

  const chaves: string[] = [
    ...CHAVES_LIP_USO_SOLO,
    ...CHAVES_LIP_CAIXA,
    ...CHAVES_LIP_ART_LEVANTAMENTO,
  ];
  const motivos: string[] = [
    `Uso do Solo não é exigível no Aceite (LC nº 314/2018, Art. 7º, § 2º, que excetua o ` +
      `inciso I do Art. 2º) — pode ser apresentado, nunca cobrado.`,
    `Caixa de recarga/poço de infiltração não é exigível no Aceite (a obrigação do Art. 2º, ` +
      `§ 4º é do Título I, Regularização) — pode ser apresentada, nunca cobrada.`,
    `ART/RRT não é exigível no Aceite, nem a de levantamento nem a de caixa — se vier, é ` +
      `fato a registrar; se não vier, não é exigência.`,
  ];

  /* O corte dos 200 m² acompanha a resposta como INFORMAÇÃO, não como portão.
   * Decisão do Fábio, 17/09/2026: "não é obrigado a ter ART mas pode ter... se
   * tiver anotamos... tanto pra levantamento quanto pra caixa". Ou seja, a
   * ausência de ART nunca vira exigência automática em NENHUMA área — e é por
   * isso que CHAVES_LIP_ART_LEVANTAMENTO entra na lista acima sem condição.
   *
   * O veredito continua sendo calculado porque ainda serve para duas coisas
   * legítimas: dizer ao analista o que a IN nº 7/2024 esperaria naquela área, e
   * alimentar a nota do laudo. Informar não é cobrar. */
  const veredictoArt = avaliarArtLevantamentoDosDados(dados);

  return { chaves, veredictoArt, motivos };
}
