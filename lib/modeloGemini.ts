import { GEMINI_MODEL, type GeminiModel } from "@/lib/constants";

/**
 * Escolha do modelo de IA por tamanho de arquivo — Fase 2 de
 * `docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md` ("o modelo deixa de ser fixo").
 *
 * ## Por que existe
 *
 * O teto de 50MB por PDF é do MODELO `gemini-2.5-flash`, não da plataforma — MEDIDO em
 * 10/09/2026 com o mesmo `fileUri` do processo 25.5.000012012-9 (52MB):
 *
 * | modelo | resultado |
 * |---|---|
 * | `gemini-2.5-flash` | 400 INVALID_ARGUMENT |
 * | `gemini-3.6-flash` | leu: 229 páginas em 9,6s |
 *
 * Antes desta Fase, esse PDF era recusado pelo próprio URBIS antes de chegar ao Gemini.
 *
 * ## Por que NÃO trocar o padrão
 *
 * O sucessor gasta 2,06x mais tokens por página (532 contra 258 — ele trata a página como
 * IMAGEM, o 2.5 tratava como DOCUMENTO) e custa mais caro por token: **5,2x por página hoje,
 * 10,3x a partir de 01/01/2027**, quando acaba o preço promocional. Trocar o padrão
 * multiplicaria por 5 a conta de TODA leitura, inclusive as que o 2.5 lê bem.
 *
 * Some-se a isso que os prompts do LIP foram afinados durante meses em cima do 2.5, e ninguém
 * mediu ainda se o 3.6 extrai com a mesma qualidade (Fase 3 do plano). Até lá, o 3.6 só entra
 * onde a alternativa é não ler nada.
 *
 * ## A regra
 *
 * Abaixo do teto do 2.5, nada muda — mesmo modelo, mesmo custo, mesmo comportamento. Acima
 * dele, entra sozinho o modelo que suporta o arquivo, sem pedir nada ao analista (§3.6 do
 * plano: "O PDF é grande demais para o modelo → escolhe automaticamente um modelo que suporte.
 * O que o operador faz: Nada").
 *
 * Módulo de infraestrutura: não conhece slot e não decide regra de negócio — mesmo precedente
 * já escrito em `lib/documentosSei/fatiar.ts`, a regra de isolamento entre slots não se aplica.
 */

/** Sucessor verificado na API em 10/09/2026 (`models.list` devolve `gemini-3.6-flash`). */
export const GEMINI_MODEL_ARQUIVO_GRANDE: GeminiModel = "gemini-3.6-flash";

/** Teto do `gemini-2.5-flash` para leitura de PDF. Acima disto ele responde 400. */
export const LIMITE_BYTES_MODELO_PADRAO = 50 * 1024 * 1024;

/**
 * Teto do que o servidor aceita receber — limite de PLATAFORMA, não de modelo. É o mesmo número
 * já praticado nas rotas de documentos SEI (`.../documentos-sei/route.ts`), para não haver dois
 * tetos diferentes no mesmo sistema. Arquivo maior que isso não é caso de trocar de modelo: é
 * caso de fatiar o PDF antes (Organizador de PDF SEI / leitura de arquivos individuais).
 */
export const LIMITE_BYTES_PLATAFORMA = 350 * 1024 * 1024;

/**
 * O modelo que dá conta deste arquivo. Sem tamanho informado devolve o padrão — é o
 * comportamento de hoje, e nenhum caminho de leitura piora por não saber o tamanho.
 */
export function escolherModeloPorTamanho(tamanhoBytes?: number | null): GeminiModel {
  if (typeof tamanhoBytes !== "number" || !Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0)
    return GEMINI_MODEL;
  return tamanhoBytes > LIMITE_BYTES_MODELO_PADRAO ? GEMINI_MODEL_ARQUIVO_GRANDE : GEMINI_MODEL;
}

/** `true` quando a leitura saiu do modelo padrão por causa do tamanho. */
export function ehModeloDeArquivoGrande(modelo: string | null | undefined): boolean {
  return modelo === GEMINI_MODEL_ARQUIVO_GRANDE;
}

/**
 * Frase para a tela quando o arquivo obriga o modelo caro. `null` quando nada mudou — assim
 * quem chama não precisa repetir a regra de tamanho, e o analista só é avisado no caso em que
 * há de fato algo diferente acontecendo. Ele não precisa decidir nada; só não fica no escuro,
 * que é a regra "nada some em silêncio" do §3.6 do plano.
 */
export function avisoModeloArquivoGrande(tamanhoBytes?: number | null): string | null {
  if (escolherModeloPorTamanho(tamanhoBytes) !== GEMINI_MODEL_ARQUIVO_GRANDE) return null;
  const mb = ((tamanhoBytes ?? 0) / 1024 / 1024).toFixed(0);
  return `Arquivo de ${mb}MB: acima de ${LIMITE_BYTES_MODELO_PADRAO / 1024 / 1024}MB o modelo padrão não lê. Usando ${GEMINI_MODEL_ARQUIVO_GRANDE}, que suporta — a leitura é mais cara.`;
}
