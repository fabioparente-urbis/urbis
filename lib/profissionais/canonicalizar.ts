/**
 * lib/profissionais/canonicalizar.ts — Fase 9 do mandato de 12 fases (05/09/2026).
 *
 * ACHADO DA AUDITORIA: CAU/CREA na base real (`profissionais.cau`/`profissionais.crea`,
 * 25 registros vindos do backfill único de 17/07/2026) não têm máscara fixa — mesma
 * pessoa poderia, em tese, ter sido digitada de formas diferentes em processos diferentes:
 * "3186/D-GO", "1019837780D-GO", "CREA-1020076283DGO", "1018567658-D/GO" são todos formatos
 * reais observados. O dedup hoje é comparação exata de string pós-uppercase — isso PERDE
 * duplicatas que só divergem em separador/prefixo.
 *
 * Este módulo só DETECTA candidatos (comparação determinística, sem IA, sem heurística de
 * nome) para revisão humana — nunca funde nada sozinho. Mesmo padrão de proposta→aprovação já
 * usado em `lib/mac/vinculosFila.ts` (BIP): candidato aqui não é fato, é sugestão de revisão.
 */

/** Remove prefixo do próprio rótulo do conselho e tudo que não for alfanumérico, maiúsculo. */
export function canonicalizarRegistro(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const semPrefixo = valor.toUpperCase().replace(/^\s*(CAU|CREA)[\s-]*/, "");
  const soAlfanumerico = semPrefixo.replace(/[^A-Z0-9]/g, "");
  return soAlfanumerico.length > 0 ? soAlfanumerico : null;
}

export type ProfissionalParaComparacao = {
  id: string;
  nome_original: string;
  cau?: string | null;
  crea?: string | null;
};

export type CandidatoDuplicado = {
  profissional_a: { id: string; nome: string };
  profissional_b: { id: string; nome: string };
  campo: "cau" | "crea";
  valor_canonico: string;
};

/**
 * Compara CAU-com-CAU e CREA-com-CREA (nunca cruza os dois campos — são conselhos
 * diferentes). Só emite pares; nunca escreve `merged_into_id` sozinho — a decisão de
 * unificar é sempre humana, pela mesma tela que já resolve a cadeia de soft-merge.
 */
export function detectarCandidatosDuplicados(
  profissionais: ProfissionalParaComparacao[],
): CandidatoDuplicado[] {
  const candidatos: CandidatoDuplicado[] = [];
  for (const campo of ["cau", "crea"] as const) {
    const porValorCanonico = new Map<string, ProfissionalParaComparacao[]>();
    for (const p of profissionais) {
      const canonico = canonicalizarRegistro(p[campo]);
      if (!canonico) continue;
      if (!porValorCanonico.has(canonico)) porValorCanonico.set(canonico, []);
      porValorCanonico.get(canonico)!.push(p);
    }
    for (const [valorCanonico, grupo] of porValorCanonico) {
      if (grupo.length < 2) continue;
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          candidatos.push({
            profissional_a: { id: grupo[i].id, nome: grupo[i].nome_original },
            profissional_b: { id: grupo[j].id, nome: grupo[j].nome_original },
            campo,
            valor_canonico: valorCanonico,
          });
        }
      }
    }
  }
  return candidatos;
}
