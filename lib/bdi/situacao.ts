/**
 * Situação geral da Pilha de Processo — LIP, MAC e o resumo dos dois juntos.
 *
 * REGRA ABSOLUTA DESTE ARQUIVO, igual a lib/bdi/vigia.ts: nenhuma IA, nenhum
 * serviço pago, nenhuma previsão. Só classifica fato já gravado, e cada
 * classificação diz de que fato ela saiu — sem isso, o rótulo não vale nada.
 *
 * Nada aqui escreve: não altera processo, não grava status, não decide nada
 * pelo analista. É leitura e classificação, mais nada.
 *
 * POR QUE ISTO EXISTE — `processos.status` está morto: 80 de 80 processos
 * ativos têm 'CADASTRADO', sempre (auditoria de 02/09/2026). O filtro de
 * status que existia na tela da Pilha nunca separou nada — mentia. Este
 * arquivo é a substituição, calculada a partir de fato real: preenchimento
 * do LIP, presença/status de `analises_mac`, e as tags de despacho/
 * indeferimento/arquivamento/laudo do processo.
 *
 * Transversal aos 3 slots por construção — cada sinal usado aqui já é
 * gravado igual pelos 3 (mesma tabela `processos`, mesma `analises_mac`,
 * mesmo formato de tag). Nenhuma regra de análise de slot mora aqui.
 *
 * ESTADO "CONCLUÍDO" FICOU DE FORA DE PROPÓSITO (decisão do Fábio,
 * 02/09/2026): não existe, em nenhum slot, um fato que prove que um
 * processo terminou de vez — `laudo` é técnico, não administrativo, e nem
 * todo processo passa por laudo. Inventar isso seria tratar hipótese como
 * fato. Fica para quando houver um sinal real.
 */

/** As 5 situações possíveis — a ordem é a ordem de checagem (a de cima vence). */
export type SituacaoGeral =
  | "Arquivado/indeferido"
  | "Aguardando retorno do interessado"
  | "MAC em análise"
  | "LIP pendente"
  | "Em cadastro";

export type SituacaoLip = "Não iniciado" | "Incompleto" | "Completo";

export type SituacaoMac =
  | "Não iniciado"
  | "Em análise"
  | "Aguardando retorno do interessado"
  | "Arquivado/indeferido";

export type ClassificacaoComMotivo<T extends string> = {
  classe: T;
  motivo: string;
};

// ---------------------------------------------------------------- entradas

export type TagProcesso = {
  tipo: "despacho" | "despacho_interno" | "indeferimento" | "arquivamento" | "laudo";
  numero_analise?: number | null;
  criado_em?: string | null;
};

/** Só o resumo de campos que `vw_bdi_campos_criticos` já calcula — reaproveitado
 *  aqui em vez de recontar campo por campo, pra não divergir do BDI. */
export type ResumoCamposLip = {
  campos_vazios: number;
  campos_em_x: number;
  campos_totais: number;
};

/** A passada mais recente do processo em `analises_mac`, se existir. */
export type UltimaPassadaMac = {
  numero_analise: number;
  status: string;
  /** Despacho ao interessado já commitado nesta passada (numeração real). */
  numero_despacho?: string | null;
  /** Indeferimento/arquivamento já commitado nesta passada (série de parecer). */
  numero_parecer?: string | null;
} | null;

// ------------------------------------------------------------- utilitários

const TAGS_ARQUIVAMENTO = new Set(["indeferimento", "arquivamento"]);

/** A tag mais recente por `criado_em` (não pelo `data` de exibição, que mistura
 *  formato ISO e dd/mm/aaaa em tags antigas — só `criado_em` é confiável). */
function tagMaisRecente(tags: TagProcesso[]): TagProcesso | null {
  let mais: TagProcesso | null = null;
  let maisTempo = -Infinity;
  for (const t of tags) {
    const tempo = t.criado_em ? Date.parse(t.criado_em) : NaN;
    if (!Number.isFinite(tempo)) continue;
    if (tempo > maisTempo) { maisTempo = tempo; mais = t; }
  }
  return mais;
}

function temTagDeArquivamento(tags: TagProcesso[]): boolean {
  return tags.some((t) => TAGS_ARQUIVAMENTO.has(t.tipo));
}

// ------------------------------------------------------------- situação LIP

/**
 * "Completo"/"Incompleto" vem de `vw_bdi_campos_criticos` (mesma conta do
 * BDI — campo vazio é diferente de campo em X, e X não é erro). "Não
 * iniciado" é quando NADA foi preenchido ainda (nem X, nem vazio-com-fonte —
 * ou seja, `campos_totais` é 0, ou os poucos campos existentes não têm
 * nenhum valor real).
 */
export function situacaoLip(campos: ResumoCamposLip | null): ClassificacaoComMotivo<SituacaoLip> {
  if (!campos || campos.campos_totais === 0) {
    return { classe: "Não iniciado", motivo: "Nenhum campo do LIP tem dado gravado ainda." };
  }
  const preenchidos = campos.campos_totais - campos.campos_vazios - campos.campos_em_x;
  if (preenchidos <= 0) {
    return {
      classe: "Não iniciado",
      motivo: `${campos.campos_totais} campo(s) no LIP, nenhum com valor preenchido (vw_bdi_campos_criticos).`,
    };
  }
  if (campos.campos_vazios > 0) {
    return {
      classe: "Incompleto",
      motivo: `${campos.campos_vazios} de ${campos.campos_totais} campo(s) do LIP ainda vazio(s) (vw_bdi_campos_criticos).`,
    };
  }
  return {
    classe: "Completo",
    motivo: `${campos.campos_totais} campo(s) do LIP, nenhum vazio (vw_bdi_campos_criticos).`,
  };
}

// ------------------------------------------------------------- situação MAC

/**
 * "Não iniciado": nenhuma `analises_mac` ainda.
 *
 * "Aguardando retorno do interessado": a passada mais recente já tem
 * despacho ou parecer commitado (`analises_mac.numero_despacho`/
 * `numero_parecer`), ou tag de laudo correspondente — RESSALVA: isto não
 * prova que é o INTERESSADO que está com a bola, só que a passada atual
 * fechou e nenhuma nova foi aberta; pode ser o analista que ainda não abriu
 * a próxima. Checado ANTES do status de propósito — ver achado abaixo.
 *
 * "Em análise": só quando NÃO há despacho/parecer/laudo na passada mais
 * recente e o status dela é 'em_andamento'.
 *
 * "Arquivado/indeferido": tag de indeferimento ou arquivamento em qualquer
 * ponto do histórico — resultado definitivo, não se reabre.
 *
 * ACHADO REAL (02/09/2026, testado contra produção): `analises_mac.status`
 * NÃO É CONFIÁVEL para saber se uma passada já fechou — de 70 análises com
 * despacho já commitado, 65 (93%) continuam com status 'em_andamento'; só
 * indeferimento de fato muda o status. Por isso o número do documento
 * (`numero_despacho`/`numero_parecer`), não o status, decide "fechou ou
 * não" — o status só desempata quando não há documento nenhum ainda.
 */
export function situacaoMac(
  ultimaPassada: UltimaPassadaMac,
  tags: TagProcesso[],
): ClassificacaoComMotivo<SituacaoMac> {
  if (temTagDeArquivamento(tags)) {
    const tag = tags.find((t) => TAGS_ARQUIVAMENTO.has(t.tipo))!;
    return {
      classe: "Arquivado/indeferido",
      motivo: `Tag de ${tag.tipo} presente no processo — resultado definitivo (processos.tags).`,
    };
  }

  if (!ultimaPassada) {
    return { classe: "Não iniciado", motivo: "Nenhuma análise (analises_mac) registrada para este processo ainda." };
  }

  if (ultimaPassada.numero_despacho) {
    return {
      classe: "Aguardando retorno do interessado",
      motivo: `Análise nº ${ultimaPassada.numero_analise} já tem despacho nº ${ultimaPassada.numero_despacho} commitado (analises_mac.numero_despacho).`,
    };
  }
  if (ultimaPassada.numero_parecer) {
    return {
      classe: "Aguardando retorno do interessado",
      motivo: `Análise nº ${ultimaPassada.numero_analise} já tem parecer nº ${ultimaPassada.numero_parecer} commitado (analises_mac.numero_parecer).`,
    };
  }

  // Laudo não consome numeração própria (não tem coluna numero_* dedicada em
  // analises_mac) — só a tag do processo prova que ele saiu.
  const ultimaTagLaudo = tagMaisRecente(tags.filter((t) => t.tipo === "laudo"));
  if (ultimaTagLaudo) {
    const passadaDaTag = ultimaTagLaudo.numero_analise ?? 0;
    if (ultimaPassada.numero_analise <= passadaDaTag) {
      return {
        classe: "Aguardando retorno do interessado",
        motivo: `Laudo emitido para a análise nº ${passadaDaTag || "?"}, sem análise nova aberta depois (processos.tags).`,
      };
    }
  }

  if (ultimaPassada.status === "em_andamento") {
    return {
      classe: "Em análise",
      motivo: `Análise nº ${ultimaPassada.numero_analise} com status 'em_andamento', sem despacho/parecer/laudo ainda (analises_mac).`,
    };
  }

  // Caso raro: passada existe, sem despacho/parecer/laudo, e o status não é
  // 'em_andamento' (ex.: mudado manualmente sem gerar documento). Não
  // escondido — rotulado pelo que falta.
  return {
    classe: "Aguardando retorno do interessado",
    motivo: `Análise nº ${ultimaPassada.numero_analise} não está 'em_andamento' e não tem despacho/parecer/laudo registrado (analises_mac).`,
  };
}

// --------------------------------------------------------- situação geral

/**
 * Resume LIP + MAC num rótulo só, pra Pilha e pro filtro. Ordem de checagem
 * (a de cima vence): arquivado/indeferido > em análise > aguardando retorno
 * > LIP pendente > em cadastro. "MAC em análise" e "aguardando retorno" só
 * fazem sentido depois que a 1ª análise existe; antes disso, a situação
 * geral é sempre sobre o LIP.
 */
export function situacaoGeral(
  campos: ResumoCamposLip | null,
  ultimaPassada: UltimaPassadaMac,
  tags: TagProcesso[],
): ClassificacaoComMotivo<SituacaoGeral> {
  const mac = situacaoMac(ultimaPassada, tags);
  if (mac.classe === "Arquivado/indeferido") return { classe: "Arquivado/indeferido", motivo: mac.motivo };
  if (mac.classe === "Em análise") return { classe: "MAC em análise", motivo: mac.motivo };
  if (mac.classe === "Aguardando retorno do interessado") {
    return { classe: "Aguardando retorno do interessado", motivo: mac.motivo };
  }

  // MAC ainda não começou (classe "Não iniciado") — a situação geral é do LIP.
  const lip = situacaoLip(campos);
  if (lip.classe === "Não iniciado") return { classe: "Em cadastro", motivo: lip.motivo };
  return { classe: "LIP pendente", motivo: lip.motivo };
}
