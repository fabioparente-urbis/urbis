/**
 * scripts/conferir_escolha_modelo.mts — confere a Fase 2 do plano de leitura de PDF
 * (`docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md`): o modelo deixou de ser fixo e passa a ser
 * escolhido pelo TAMANHO do arquivo.
 *
 * Responde duas perguntas, e só isso:
 *   1. a régua de decisão está certa nas bordas? (49MB, 50MB exatos, 50MB+1 byte, 52MB, 351MB)
 *   2. os dois modelos que o código nomeia EXISTEM e aceitam generateContent na chave em uso?
 *
 * A segunda pergunta é consulta de metadados (`models.get`) — não gera nada, não gasta token.
 * Nenhuma leitura de PDF é feita aqui: gastar IA de verdade é ato do analista pela tela.
 *
 *   npx tsx --env-file=.env.local scripts/conferir_escolha_modelo.mts
 */
import { GEMINI_MODEL } from "../lib/constants";
import {
  escolherModeloPorTamanho, ehModeloDeArquivoGrande, avisoModeloArquivoGrande,
  GEMINI_MODEL_ARQUIVO_GRANDE, LIMITE_BYTES_MODELO_PADRAO, LIMITE_BYTES_PLATAFORMA,
} from "../lib/modeloGemini";

const MB = 1024 * 1024;
let falhas = 0;

function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "✅" : "❌"} ${rotulo}: ${String(obtido)}${ok ? "" : ` (esperado: ${String(esperado)})`}`);
}

console.log("── régua de decisão ──");
conferir("sem tamanho informado (comportamento antigo)", escolherModeloPorTamanho(null), GEMINI_MODEL);
conferir("tamanho zero ou inválido", escolherModeloPorTamanho(0), GEMINI_MODEL);
conferir("1MB", escolherModeloPorTamanho(1 * MB), GEMINI_MODEL);
conferir("49MB", escolherModeloPorTamanho(49 * MB), GEMINI_MODEL);
conferir("50MB exatos (ainda cabe no padrão)", escolherModeloPorTamanho(LIMITE_BYTES_MODELO_PADRAO), GEMINI_MODEL);
conferir("50MB + 1 byte", escolherModeloPorTamanho(LIMITE_BYTES_MODELO_PADRAO + 1), GEMINI_MODEL_ARQUIVO_GRANDE);
conferir("52MB (o PDF do processo 25.5.000012012-9)", escolherModeloPorTamanho(52 * MB), GEMINI_MODEL_ARQUIVO_GRANDE);
conferir("349MB (abaixo do teto do servidor)", escolherModeloPorTamanho(349 * MB), GEMINI_MODEL_ARQUIVO_GRANDE);
conferir("teto de plataforma é maior que o teto do modelo", LIMITE_BYTES_PLATAFORMA > LIMITE_BYTES_MODELO_PADRAO, true);

console.log("\n── aviso mostrado ao analista ──");
conferir("arquivo pequeno não avisa nada", avisoModeloArquivoGrande(10 * MB), null);
const aviso = avisoModeloArquivoGrande(52 * MB);
conferir("arquivo grande avisa", typeof aviso === "string" && aviso.includes("52MB"), true);
conferir("reconhece o modelo escalado", ehModeloDeArquivoGrande(GEMINI_MODEL_ARQUIVO_GRANDE), true);
conferir("não confunde o padrão com o escalado", ehModeloDeArquivoGrande(GEMINI_MODEL), false);

console.log("\n── os dois modelos existem na chave em uso (metadados, sem gastar token) ──");
const chave = process.env.GEMINI_API_KEY;
if (!chave) {
  console.log("⚠️  GEMINI_API_KEY ausente — rode com `--env-file=.env.local`. Régua conferida mesmo assim.");
} else {
  for (const modelo of [GEMINI_MODEL, GEMINI_MODEL_ARQUIVO_GRANDE]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}?key=${chave}`);
    if (!r.ok) {
      falhas++;
      console.log(`❌ ${modelo}: a API não reconhece (${r.status})`);
      continue;
    }
    const d = await r.json() as { supportedGenerationMethods?: string[] };
    const aceita = (d.supportedGenerationMethods ?? []).includes("generateContent");
    if (!aceita) falhas++;
    console.log(`${aceita ? "✅" : "❌"} ${modelo}: ${aceita ? "aceita generateContent" : "NÃO aceita generateContent"}`);
  }
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} conferência(s) falharam`}`);
process.exit(falhas === 0 ? 0 : 1);
