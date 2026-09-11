/**
 * lib/documentosSei/normalizarSetor.ts — o campo `setor` de `fluxo_processo_eventos` vem do
 * cabeçalho do PDF, como o OCR leu. Medido em 11/09/2026 sobre as 2441 linhas do acervo: 54 das 89
 * linhas do ranking "tempo típico por setor" vinham de UM ÚNICO processo, e entre as primeiras
 * posições apareciam um endereço ("Companhia, situada na Rua 44, n° 399..."), uma área colada no
 * nome ("DIRETORIA DE ANÁLISE E APROVAÇÃO DE PROJETO 300,00 m²"), quebra de ligadura do OCR
 * ("Secretaria Municipal de E fi ciência") e órgãos alheios ao fluxo.
 *
 * Duas coisas acontecem aqui, e só estas duas — o vocabulário oficial dos setores é conhecimento do
 * analista (§7.2 do plano), não se inventa aqui:
 *
 *   1. AGRUPAR o que é o mesmo setor escrito diferente. A chave descarta acento, caixa, pontuação,
 *      sigla repetida no fim e TODOS OS ESPAÇOS — é o que junta "E fi ciência" com "Eficiência",
 *      porque a quebra de ligadura do OCR só insere espaço.
 *   2. DESCARTAR o que comprovadamente não é nome de setor (dígitos, lixo de OCR, texto corrido).
 *      Descarte é contado e devolvido a quem chama: nada some em silêncio (§3.6 do plano).
 */

export type SetorNormalizado = { chave: string; exibicao: string };

/** Nome longo demais para ser cabeçalho de setor — a partir daqui é parágrafo capturado por engano. */
const LIMITE_CARACTERES = 70;

/** Caracteres que um cabeçalho de setor pode ter. Qualquer outro denuncia lixo de OCR. */
const SO_TEXTO_DE_CABECALHO = /^[A-Za-zÀ-ÿ\s.,'’\-–/&]+$/;

/** Duas posições seguidas de dígito: área, CEP, número de documento, nº de processo. Nunca é setor. */
const TEM_NUMERO = /\d{2,}/;

/** Palavras que denunciam endereço ou texto corrido em vez de cabeçalho. */
const TEXTO_CORRIDO = /\b(cep|rua|avenida|situad[ao]|n[º°]|quadra|lote)\b/i;

/**
 * Sigla repetida no fim do próprio nome ("... de Projetos - DIRAAP"). Não distingue setor.
 * O TRAÇO é obrigatório: sem ele, um nome todo em maiúsculas perderia a última palavra
 * ("SECRETARIA MUNICIPAL DE FINANÇAS" viraria "SECRETARIA MUNICIPAL DE") e setores diferentes
 * colidiriam numa chave só.
 */
const SIGLA_NO_FIM = /\s*[-–]\s*[A-ZÀ-Ÿ]{3,8}\.?\s*$/;

/**
 * O cabeçalho às vezes vem com o mesmo nome duas vezes seguidas ("DIRETORIA DE FISCALIZACAO URBANA
 * DIRETORIA DE FISCALIZACAO URBANA") — o OCR lê a linha do timbre e a do rodapé. Colapsa para uma.
 */
function colapsarRepeticao(texto: string): string {
  const metade = Math.floor(texto.length / 2);
  const a = texto.slice(0, metade).trim();
  const b = texto.slice(metade).trim();
  return a.length > 3 && a.toLowerCase() === b.toLowerCase() ? a : texto;
}

export function normalizarSetor(bruto: string | null | undefined): SetorNormalizado | null {
  if (!bruto) return null;

  const limpo = colapsarRepeticao(bruto.replace(/\s+/g, " ").trim()).replace(/[\s\-–,.]+$/, "");
  if (limpo.length < 4 || limpo.length > LIMITE_CARACTERES) return null;
  if (TEM_NUMERO.test(limpo)) return null;
  if (TEXTO_CORRIDO.test(limpo)) return null;
  if (!SO_TEXTO_DE_CABECALHO.test(limpo)) return null;

  const chave = limpo
    .replace(SIGLA_NO_FIM, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (chave.length < 4) return null;
  return { chave, exibicao: limpo };
}

/**
 * Escolhe como um grupo de grafias vai aparecer na tela: a forma mais repetida, e entre empates a
 * mais curta — a longa costuma ser a que trouxe sujeira colada.
 */
export function exibicaoPreferida(ocorrencias: string[]): string {
  const contagem = new Map<string, number>();
  for (const o of ocorrencias) contagem.set(o, (contagem.get(o) ?? 0) + 1);
  return [...contagem.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length,
  )[0][0];
}
