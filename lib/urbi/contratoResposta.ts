/**
 * lib/urbi/contratoResposta.ts — Fase AB da Inteligência URBIS (04/09/2026): contrato de
 * resposta do Co-Analista. Formaliza em texto o que toda resposta que usa o dossiê deve trazer,
 * pra o analista conseguir CONFERIR a resposta em vez de confiar cegamente nela — cabeçalho do
 * processo/slot, o que é fato do dossiê, o que é interpretação (vale conferir), o que faltou
 * (base insuficiente) e de onde veio cada coisa (fontes consultadas).
 *
 * Biblioteca pura (sem rede, sem banco) — só monta string pro system prompt
 * (app/api/urbi/chat/route.ts) e nome humano do slot pro manifesto
 * (lib/urbi/manifestoFontes.ts). Não decide nada, não valida a resposta do Gemini: é texto de
 * instrução, a verificação de verdade continua sendo humana (o manifesto backend, esse sim
 * verificável sem depender do texto do modelo, é responsabilidade de manifestoFontes.ts).
 */

/** Mesmo vocabulário de lib/urbi/adaptadores/*.ts (nome_slot) e lib/urbi/navegacao.ts (rotulo) —
 *  reproduzido aqui, não importado, porque isolamento de slot é regra (CLAUDE.md): este arquivo
 *  não deveria depender de um adaptador de slot específico só pra um rótulo de texto. Quando o
 *  dossiê já tem `tecnico.nome_slot` resolvido, prefira aquele (é a fonte de verdade); isto é só
 *  o retrovisor pra quando `tecnico` vier null (slot sem adaptador ainda). */
export function nomeHumanoDoSlot(tipoProcesso: string | null | undefined): string {
  switch (tipoProcesso) {
    case "regularizacao": return "Regularização SEI";
    case "aceite_sei": return "Aceite SEI";
    case "slot_05": return "Aprovação de Projeto";
    default: return "slot não identificado";
  }
}

/**
 * Bloco de instrução pro system prompt — formato humano obrigatório de resposta quando o
 * Co-Analista está ativo com dossiê carregado. Cada seção existe pra permitir que o analista
 * confira a resposta sem confiar cegamente no Gemini: sabe qual processo foi lido, o que é fato,
 * o que é leitura cruzada (nunca veredito), o que faltou, e de onde veio cada coisa.
 */
export function blocoContratoResposta(codigo: string, nomeSlot: string): string {
  return `CONTRATO DE RESPOSTA DO CO-ANALISTA — obrigatório em toda resposta que usar o dossiê deste
processo (não se aplica a papo geral, sem processo em contexto, nem ao modo BIP puro):
1. Abra sempre com a linha exata: "Processo analisado: ${codigo} — ${nomeSlot}".
2. Traga uma seção "Fatos do dossiê:" — bullets curtos, só o que tem grau_certeza "confirmado".
3. Se houver cruzamento ou interpretação sua (grau_certeza "vale_conferir" ou
   "aguarda_confirmacao_humana"), traga uma seção "Vale conferir:" citando sempre os dois lados
   que você comparou — nunca um veredito ("está errado"/"está certo").
4. Sempre que a leitura estiver parcial, um dado faltar, ou uma comparação não puder ser feita por
   falta de campo ou de prova, traga uma seção "Base insuficiente:" dizendo exatamente o que
   faltou — nunca omita esta seção quando isso acontecer, nunca disfarce ausência de dado como
   conclusão.
5. Feche sempre com uma seção "Fontes consultadas:" — de onde veio cada fato citado, em
   linguagem humana (rótulo do campo do LIP — o valor do campo "rotulo", NUNCA a chave do
   objeto JSON nem um caminho de propriedade como "lip.campos_tecnicos.algumaChave" —, aba/nome
   do item do MAC, tipo/número/passada do documento, referência do BIP) — NUNCA um
   identificador técnico, UUID, chave interna, caminho de propriedade ou nome de tabela. Quando
   o rótulo de um campo vier "Campo sem rótulo cadastrado", cite exatamente essa frase — nunca
   a chave técnica que ela substitui.
Omita só a seção que não tiver conteúdo nesta resposta (ex.: nada digno de "vale conferir" hoje)
— as demais seguem obrigatórias, mesmo numa resposta curta. O limite padrão de "3 parágrafos" do
seu estilo de resposta não vale para esta estrutura.`;
}
