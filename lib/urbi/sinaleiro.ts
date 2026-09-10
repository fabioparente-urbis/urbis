/**
 * lib/urbi/sinaleiro.ts — Sinaleiro do URBI (Fase 1, Plano Assessor Ativo, 07/09/2026).
 *
 * Função pura: recebe os avisos do Vigia (já buscados por /api/bdi/vigia) e as ações do Motor
 * de Produção (já calculadas por montarRelatorioMotor a partir do dossiê de /api/urbi/dossie) e
 * decide UMA cor — nunca acumula, nunca soma cores. Vermelho > amarelo > verde.
 *
 * Nenhuma consulta nova ao banco, nenhuma IA — é reclassificação do que os dois módulos já
 * calculam de graça. Ver docs/URBIS_PLANO_ASSESSOR_ATIVO.md §5, Fase 1.
 */
import type { Aviso } from "@/lib/bdi/vigia";
import type { AcaoPrioritaria } from "@/lib/urbi/motorProducao";

export type CorSinaleiro = "vermelho" | "amarelo" | "verde";

export type ItemSinaleiro = {
  titulo: string;
  detalhe: string;
  fonte: string;
  /** Condição que impede a análise (ver lib/bdi/vigia.ts, Aviso.bloqueante). */
  bloqueante?: boolean;
  /** Chave estável do aviso de origem (Aviso.id) — permite ao card grande oferecer um botão de
   * ação pra um aviso específico (hoje só "cond_imovel_duplicado"), em vez de só abrir o chat. */
  id?: string;
  /** Payload estruturado do aviso de origem (Aviso.dados), quando existir. */
  dados?: Record<string, any>;
};

export type EstadoSinaleiro = {
  cor: CorSinaleiro | null;
  itens: ItemSinaleiro[];
  /**
   * true quando algum item vermelho é bloqueante — dispara a intervenção grande do URBI
   * (aparece sozinho, no meio da tela), não só a cor do avatar. Pedido do Fábio, 08/09/2026.
   */
  bloqueante: boolean;
};

/**
 * Mapeamento das cores (decidido em conjunto com o Fábio, §3 do plano):
 * - Vermelho — fiscalizar/bloqueante: alerta real do Vigia (incoerência nos dados) e ação
 *   tier 1 do Motor (pendência não conforme do MAC).
 * - Amarelo — corrigir/revisar: atenção do Vigia (retrabalho alto, numeração no fim, muitos
 *   campos vazios) e divergência de cruzamento (tier 5 do Motor).
 * - Verde — sugerir: campo vazio que já tem documento correspondente no MHD, só falta vincular
 *   (tier 2 do Motor com esforço "rápido") — a única situação em que já existe valor pronto pra
 *   usar sem custo e sem exigir busca do analista.
 *
 * Avisos de severidade "info" do Vigia nunca entram aqui — são muitos e normais em qualquer
 * processo; contá-los no sinaleiro violaria o portão ("processo limpo fica sem cor").
 */
export function calcularSinaleiro(avisos: Aviso[], acoes: AcaoPrioritaria[]): EstadoSinaleiro {
  const vermelho: ItemSinaleiro[] = [];
  const amarelo: ItemSinaleiro[] = [];
  const verde: ItemSinaleiro[] = [];

  for (const a of avisos ?? []) {
    if (a.severidade === "alerta") {
      vermelho.push({ titulo: a.titulo, detalhe: a.detalhe, fonte: `Vigia — ${a.fonte}`, bloqueante: a.bloqueante === true, id: a.id, dados: a.dados });
    } else if (a.severidade === "atencao") {
      amarelo.push({ titulo: a.titulo, detalhe: a.detalhe, fonte: `Vigia — ${a.fonte}` });
    }
  }

  for (const acao of acoes ?? []) {
    if (acao.tier === 1) {
      vermelho.push({ titulo: acao.texto, detalhe: acao.motivo, fonte: "Motor de Produção — MAC" });
    } else if (acao.tier === 5) {
      amarelo.push({ titulo: acao.texto, detalhe: acao.motivo, fonte: "Motor de Produção — cruzamento" });
    } else if (acao.tier === 2 && acao.esforco === "rapido") {
      verde.push({ titulo: acao.texto, detalhe: acao.motivo, fonte: "Motor de Produção — MHD" });
    }
  }

  if (vermelho.length > 0) {
    return { cor: "vermelho", itens: vermelho, bloqueante: vermelho.some(i => i.bloqueante) };
  }
  if (amarelo.length > 0) return { cor: "amarelo", itens: amarelo, bloqueante: false };
  if (verde.length > 0) return { cor: "verde", itens: verde, bloqueante: false };
  return { cor: null, itens: [], bloqueante: false };
}

/**
 * Fase 3 do plano Assessor Ativo: a dica de histórico do Responsável Técnico (evento
 * "urbi:dica", disparado no onBlur do campo RT em ProcessoClient.tsx) também acende o sinal em
 * amarelo — nada é removido, só somado. Vermelho continua vencendo sobre a dica de RT (ela some
 * da tela desta rodada, mas o fato em si não é perdido — dica de RT não é persistida em lugar
 * nenhum, é sinal do instante em que o campo perdeu o foco).
 */
export function combinarComDicaRt(base: EstadoSinaleiro, dicaRt: string | null): EstadoSinaleiro {
  if (!dicaRt) return base;
  if (base.cor === "vermelho") return base;
  const itemRt: ItemSinaleiro = {
    titulo: "Histórico do Responsável Técnico",
    detalhe: dicaRt,
    fonte: "Módulo Profissionais — histórico do RT",
  };
  if (base.cor === "amarelo") return { cor: "amarelo", itens: [itemRt, ...base.itens], bloqueante: false };
  return { cor: "amarelo", itens: [itemRt], bloqueante: false };
}

export const CORES_SINALEIRO: Record<CorSinaleiro, { borda: string; forma: string; rotulo: string }> = {
  vermelho: { borda: "#dc2626", forma: "▲", rotulo: "Fiscalizar" },
  amarelo: { borda: "#d97706", forma: "◆", rotulo: "Corrigir/Revisar" },
  verde: { borda: "#16a34a", forma: "●", rotulo: "Sugerir" },
};
