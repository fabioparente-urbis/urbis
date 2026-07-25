// ============================================================
// Como cada assunto numera seus processos.
//
// A Regularização e o Aceite trabalham com número SEI (ou o processo
// físico antigo). A Aprovação de Projeto não tem SEI: ela tem o número
// do ALVARÁ — que o pessoal também chama de número do PROJETO, é o mesmo
// número — e, no lugar do processo físico, a ORDEM DE SERVIÇO.
//
// Isso estava hardcoded na Home com um slug `aprovacao_pp` que nem existe
// na tabela `assuntos`, e o resultado é que todo slot novo caía na regra
// do SEI. Agora quem manda é `assuntos.numeracao` — ver migration
// 2026_07_25_assuntos_numeracao.sql.
// ============================================================

export type Numeracao = "sei" | "alvara";

export type FormatoNumero = {
  /** Rótulo do formato, usado nas mensagens de erro. */
  nome: string;
  re: RegExp;
};

export type PerfilNumeracao = {
  /** Como a tela chama o número principal ("Processo: 25.5…"). */
  rotulo: string;
  /** Versão curta, para frases ("Ir para alvará:"). */
  rotuloCurto: string;
  /** Exemplo para placeholder. */
  exemplo: string;
  /** Linha de ajuda embaixo do campo de cadastro. */
  ajuda: string;
  formatos: FormatoNumero[];
};

export const PERFIS: Record<Numeracao, PerfilNumeracao> = {
  sei: {
    rotulo: "Processo",
    rotuloCurto: "processo",
    exemplo: "Ex.: 25.5.000082553-3 ou 91944504",
    ajuda: "Use número SEI ou processo físico.",
    formatos: [
      { nome: "SEI", re: /^\d{2}\.\d{1,2}\.\d{8,10}-\d$/ },
      { nome: "processo físico", re: /^\d{7,9}$/ },
    ],
  },
  alvara: {
    rotulo: "Nº do Alvará (Projeto)",
    rotuloCurto: "alvará",
    exemplo: "Ex.: 12345 ou 1234567",
    ajuda: "Só números: alvará/projeto tem 5 ou 6 dígitos; ordem de serviço, 7 ou 8.",
    formatos: [
      // Alvará e projeto são o mesmo número — 5 ou 6 dígitos.
      { nome: "alvará/projeto", re: /^\d{5,6}$/ },
      { nome: "ordem de serviço", re: /^\d{7,8}$/ },
    ],
  },
};

export function perfilDe(numeracao: string | null | undefined): PerfilNumeracao {
  return PERFIS[(numeracao as Numeracao) ?? "sei"] ?? PERFIS.sei;
}

/**
 * Só tira espaço das pontas. Alvará, projeto e ordem de serviço são
 * sequências de dígitos puras — sem prefixo "OS", sem ponto de milhar.
 * O SEI usa ponto de propósito e é validado pelo formato dele.
 */
export function normalizarNumero(valor: string): string {
  return valor.trim();
}

/** Valida o número contra os formatos do assunto. */
export function validarNumero(
  numeracao: string | null | undefined,
  valor: string,
): { ok: boolean; formato?: string; erro?: string } {
  const perfil = perfilDe(numeracao);
  const v = normalizarNumero(valor);
  if (!v) return { ok: false, erro: "Informe o número." };
  const achado = perfil.formatos.find((f) => f.re.test(v));
  if (achado) return { ok: true, formato: achado.nome };
  return {
    ok: false,
    erro: `Formato não reconhecido para este assunto. ${perfil.ajuda}`,
  };
}
