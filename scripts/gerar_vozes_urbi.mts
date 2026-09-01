/**
 * Pré-grava as falas fixas do URBI em public/urbi/voz/.
 *
 *   npx tsx --env-file=.env.local scripts/gerar_vozes_urbi.mts
 *   npx tsx --env-file=.env.local scripts/gerar_vozes_urbi.mts --forcar
 *
 * Por que existe: o ElevenLabs cobra por caractere. Uma resposta padrão do URBI
 * ("Abrindo a pilha de processos.") é sempre a mesma — sintetizar de novo a cada
 * clique é pagar várias vezes pelo mesmo áudio. Aqui ela é gerada UMA vez, entra
 * no git e depois toca de graça, e ainda instantaneamente, sem ida à API.
 *
 * Idempotente por hash: só regrava a fala cujo texto, voz ou modelo mudou.
 * O manifesto guarda o hash, então rodar de novo sem mudar nada custa zero.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const DIR = "public/urbi/voz";
const MANIFESTO = `${DIR}/manifesto.json`;
const MODELO = "eleven_multilingual_v2";
const CARACTERES_POR_SEGUNDO = 14; // medido na voz em uso, com texto em português

const chave = process.env.ELEVENLABS_API_KEY;
const voz = process.env.ELEVENLABS_VOICE_ID;
if (!chave || !voz) {
  console.error("Faltam ELEVENLABS_API_KEY e/ou ELEVENLABS_VOICE_ID no .env.local.");
  process.exit(1);
}

const forcar = process.argv.includes("--forcar");

type Fala = { id: string; texto: string };
const intencoes = JSON.parse(readFileSync("components/urbi/urbi-intencoes.json", "utf8"));
const sistema = JSON.parse(readFileSync("components/urbi/urbi-frases-sistema.json", "utf8"));

const falas: Fala[] = [
  ...(intencoes.comandos ?? [])
    .filter((c: any) => typeof c.resposta === "string" && c.resposta.trim())
    .map((c: any) => ({ id: c.id, texto: c.resposta.trim() })),
  ...(sistema.frases ?? []).map((f: any) => ({ id: f.id, texto: f.texto.trim() })),
];

const idsRepetidos = falas.map((f) => f.id).filter((id, i, a) => a.indexOf(id) !== i);
if (idsRepetidos.length) {
  console.error("ids repetidos entre intenções e frases de sistema:", [...new Set(idsRepetidos)].join(", "));
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const manifestoAntigo: Record<string, any> = existsSync(MANIFESTO)
  ? JSON.parse(readFileSync(MANIFESTO, "utf8")).falas ?? {}
  : {};

const manifesto: Record<string, any> = {};
let gerados = 0, reaproveitados = 0, caracteres = 0;

for (const f of falas) {
  const hash = createHash("sha256").update(`${f.texto}|${voz}|${MODELO}`).digest("hex").slice(0, 16);
  const arquivo = `${f.id}.mp3`;
  const caminho = `${DIR}/${arquivo}`;
  const anterior = manifestoAntigo[f.id];

  if (!forcar && anterior?.hash === hash && existsSync(caminho)) {
    manifesto[f.id] = anterior;
    reaproveitados++;
    continue;
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": chave, "Content-Type": "application/json" },
      body: JSON.stringify({ text: f.texto, model_id: MODELO }),
    },
  );
  if (!res.ok) {
    console.error(`✗ ${f.id}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(caminho, buffer);
  gerados++;
  caracteres += f.texto.length;
  manifesto[f.id] = {
    texto: f.texto,
    arquivo,
    hash,
    caracteres: f.texto.length,
    bytes: buffer.byteLength,
    duracaoSeg: Number((f.texto.length / CARACTERES_POR_SEGUNDO).toFixed(1)),
  };
  console.log(`✓ ${f.id.padEnd(24)} ${String(f.texto.length).padStart(3)}c  ${buffer.byteLength} bytes`);
}

writeFileSync(
  MANIFESTO,
  JSON.stringify({ voz, modelo: MODELO, gerado_em: new Date().toISOString().slice(0, 10), falas: manifesto }, null, 2) + "\n",
);

console.log(`\n${gerados} gerada(s), ${reaproveitados} reaproveitada(s). Créditos consumidos agora: ${caracteres} caracteres.`);
