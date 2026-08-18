/**
 * lib/lipAjuda.ts — texto de ajuda por campo do LIP, mostrado ao passar o mouse no rótulo.
 *
 * Não é um lookup no banco de propósito: são poucos campos, o texto é estático e editado por
 * quem mexe no código, não pelo analista. Se crescer muito ou precisar editar sem deploy, vira
 * coluna em `lip_campos` — por enquanto isso seria DDL sem necessidade.
 */
export const AJUDA_CAMPOS: Record<string, string> = {
  areaTotalPrivativa:
    "Área privativa (LC 364/2023, Art. 4º/Anexo I — Glossário): toda área da edificação "
    + "destinada ao uso específico e exclusivo do proprietário. Não é exclusiva de uso "
    + "habitacional — em comercial/serviço/institucional equivale à área ocupada pela "
    + "atividade (vendas, atendimento, administração, produção, depósito), EXCLUINDO as áreas "
    + "exigidas por lei para estacionamento e para carga e descarga. Não é o mesmo que "
    + "\"área total construída\" — a própria lei trata os dois como itens separados.",
};
