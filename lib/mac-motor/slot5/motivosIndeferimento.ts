/**
 * lib/mac-motor/slot5/motivosIndeferimento.ts — motivos que o analista pode marcar no indeferimento do Slot 5.
 *
 * RASCUNHO para o Fábio revisar (02/10/2026): o Slot 1 tem uma lista própria de Regularização
 * (uso do solo, >7 pavimentos, obra após 04/03/2022…) que NÃO se aplica a Aprovação de Projeto, e o
 * checklist do Slot 5 não tem item "gera indeferimento". Os dois motivos abaixo vêm do texto que o próprio
 * parecer já carrega (Decreto nº 2.531/2024, art. 8º, § 7º) e do motivo genérico do Slot 1. Acrescentar,
 * trocar ou remover é só editar esta lista — a tela e o documento leem daqui.
 */
export const MOTIVOS_INDEFERIMENTO_SLOT5: string[] = [
  "Exigências dos despachos anteriores não atendidas no prazo — art. 8º, § 7º do Decreto nº 2.531/2024",
  "Processo sem documentação mínima para análise",
];
