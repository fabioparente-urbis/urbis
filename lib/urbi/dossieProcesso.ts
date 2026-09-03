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

// ---------------------------------------------------- grau de certeza (comum)

/**
 * Vocabulário formal de certeza pro Co-Analista — mesmo espírito de
 * `ClassificacaoComMotivo<T>` em lib/bdi/situacao.ts: toda comparação ou
 * inferência carrega isto, não só prosa solta no prompt. "confirmado" é
 * fato direto de uma fonte; "vale_conferir" é cruzamento/interpretação;
 * "base_insuficiente" é dado incompleto demais pra concluir.
 */
export type GrauDeCerteza =
  | "confirmado"
  | "vale_conferir"
  | "base_insuficiente"
  | "nao_aplicavel"
  | "aguarda_confirmacao_humana";

// ---------------------------------------------------- evolução do checklist

export type EventoMacHistorico = {
  analise_id: string;
  checklist_item_id: string;
  item_texto: string | null;
  status_novo: string;
  analista_nome: string | null;
  criado_em: string;
};

export type ItemEvolucao = {
  item_id: string;
  texto: string;
  de: string;
  para: string;
  quando: string;
  analista_nome: string | null;
};

export type EvolucaoChecklist = {
  itens_corrigidos: ItemEvolucao[];
  itens_voltaram_nao_conforme: ItemEvolucao[];
  itens_pendentes_mantidos: ItemEvolucao[];
};

/**
 * Compara o estado ATUAL de cada item (fonte real: o mapa vigente da última
 * análise, `statusAtualPorItem`) com o último valor que `mac_historico` já
 * conhecia dele ANTES desta passada começar. Não assume se uma análise nova
 * copia os itens da anterior ou nasce em branco — isso é decisão de tela,
 * varia por cliente/slot; aqui só compara fato contra fato.
 *
 * `mac_historico` é gravado tanto pelo Slot 5 quanto por Regularização/
 * Aceite SEI (`app/api/analise-regularizacao|analise-aceite-sei/route.ts`) —
 * transversal aos 3 slots por natureza, sem adapter nenhum.
 */
export function evolucaoChecklist(
  historico: EventoMacHistorico[],
  statusAtualPorItem: Map<string, string>,
  analiseAtualId: string | null,
): EvolucaoChecklist {
  const vazio: EvolucaoChecklist = { itens_corrigidos: [], itens_voltaram_nao_conforme: [], itens_pendentes_mantidos: [] };
  if (!analiseAtualId) return vazio;

  const porItem = new Map<string, EventoMacHistorico[]>();
  for (const ev of historico) {
    // Achado real (03/09/2026): mac_historico do Aceite SEI também registra
    // edição de nota livre (marco temporal/Google Earth) reaproveitando esta
    // mesma tabela — checklist_item_id nulo, status_anterior/status_novo com
    // parágrafo de texto em vez de status de checklist. Isso não é evolução
    // de item, então fica de fora por completo, não só sem match nos ifs.
    if (!ev.checklist_item_id) continue;
    const lista = porItem.get(ev.checklist_item_id) ?? [];
    lista.push(ev);
    porItem.set(ev.checklist_item_id, lista);
  }

  const corrigidos: ItemEvolucao[] = [];
  const voltaram: ItemEvolucao[] = [];
  const mantidos: ItemEvolucao[] = [];

  for (const [itemId, eventosItem] of porItem) {
    const ordenados = [...eventosItem].sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
    // "Antes desta passada" = último evento gravado numa análise diferente
    // da atual. Sem isso não existe "antes" real pra comparar — o item fica
    // de fora em vez de virar suposição.
    const anteriores = ordenados.filter((e) => e.analise_id !== analiseAtualId);
    if (anteriores.length === 0) continue;

    const estadoAtual = statusAtualPorItem.get(itemId);
    if (!estadoAtual) continue;

    const ultimoAnterior = anteriores[anteriores.length - 1];
    const estadoAnterior = ultimoAnterior.status_novo;
    const desta = ordenados.filter((e) => e.analise_id === analiseAtualId);
    const eventoReferencia = desta[desta.length - 1] ?? ultimoAnterior;
    const texto = eventoReferencia.item_texto ?? "Item sem cadastro localizado.";

    const base: ItemEvolucao = {
      item_id: itemId, texto, de: estadoAnterior, para: estadoAtual,
      quando: eventoReferencia.criado_em, analista_nome: eventoReferencia.analista_nome,
    };

    if (estadoAnterior === "nao_conforme" && estadoAtual !== "nao_conforme" && estadoAtual !== "em_branco") {
      corrigidos.push(base);
    } else if (estadoAtual === "nao_conforme" && estadoAnterior !== "nao_conforme") {
      // "Voltou" exige prova de que já foi não conforme ANTES do estado
      // imediatamente anterior — senão é a primeira vez que fica ruim, não
      // uma volta.
      const jaFoiNaoConformeAntes = anteriores.some((e) => e.status_novo === "nao_conforme");
      if (jaFoiNaoConformeAntes) voltaram.push(base);
    } else if (estadoAnterior === "nao_conforme" && estadoAtual === "nao_conforme") {
      mantidos.push({ ...base, quando: ultimoAnterior.criado_em, analista_nome: ultimoAnterior.analista_nome });
    }
  }

  return { itens_corrigidos: corrigidos, itens_voltaram_nao_conforme: voltaram, itens_pendentes_mantidos: mantidos };
}

// ------------------------------------------------------- observações do MAC

/**
 * Observações do MAC vivem em coluna diferente por slot, DE PROPÓSITO (ver
 * supabase/migrations/2026_08_18_analises_mac_observacoes_por_item.sql):
 * Slot 5 grava por item (`observacoes_por_item`), Regularização/Aceite SEI
 * grava por aba/grupo (`observacoes_por_aba`). O isolamento é do dado, não
 * da leitura — aqui só decide qual coluna consultar, sem tocar em nenhuma
 * das duas.
 */
export function anexarObservacoes(
  marcacoes: { item_id: string; grupo: string | null }[],
  tipoProcesso: string | null | undefined,
  observacoesPorItem: Record<string, unknown> | null | undefined,
  observacoesPorAba: Record<string, unknown> | null | undefined,
): Map<string, string> {
  const fontePorItem = tipoProcesso === "slot_05";
  const fonte = fontePorItem ? observacoesPorItem : observacoesPorAba;
  const saida = new Map<string, string>();
  for (const m of marcacoes) {
    const chave = fontePorItem ? m.item_id : m.grupo;
    if (!chave) continue;
    const valor = (fonte as Record<string, unknown> | null | undefined)?.[chave];
    if (typeof valor !== "string") continue;
    const limpo = valor.trim();
    if (limpo) saida.set(m.item_id, limpo.slice(0, 400));
  }
  return saida;
}

// --------------------------------------------------- histórico do LIP (raso)

export type AlteracaoLip = { quando: string; campos_alterados: string[] };

// Mesmo espírito de CHAVE_PESSOAL (topo do arquivo), mas contra o RÓTULO do
// campo como o analista vê na tela ("Proprietário", "Logradouro"...), não a
// chave técnica — é isso que processo_historico.detalhe guarda.
const ROTULO_PESSOAL = /(propriet|interessad|autor|respons[áa]vel|cpf|cnpj|e-?mail|telefone|celular|contato|matr[íi]cula|endere[cç]o|logradouro)/i;

/**
 * `processo_historico.detalhe.campos` guarda `{ campo, de, para }` por chave
 * alterada — achado real (03/09/2026): isso INCLUI o valor anterior/novo de
 * verdade (ex.: campo "Proprietário" com nome real), não só o nome da
 * chave como a leitura original do código sugeria. Por isso esta função
 * NUNCA expõe `de`/`para` — só o rótulo do campo, e mesmo assim filtrado
 * pelo mesmo tipo de regra usada pro LIP técnico (nunca expor rótulo que
 * cheire a dado pessoal). Aceita também o formato legado (`campos` como
 * lista de strings), sem inventar valor pra ele.
 */
export function historicoAlteracoesLip(
  eventos: { criado_em: string; detalhe: unknown }[],
): AlteracaoLip[] {
  return eventos
    .map((e) => {
      const detalhe = e.detalhe as { campos?: unknown } | null;
      const brutos = Array.isArray(detalhe?.campos) ? detalhe!.campos : [];
      const rotulos = brutos
        .map((c: unknown) => (typeof c === "string" ? c : (c as { campo?: unknown })?.campo))
        .filter((r: unknown): r is string => typeof r === "string" && r.trim().length > 0)
        .filter((r) => !ROTULO_PESSOAL.test(r));
      return { quando: e.criado_em, campos_alterados: [...new Set(rotulos)] };
    })
    .filter((e) => e.campos_alterados.length > 0);
}
