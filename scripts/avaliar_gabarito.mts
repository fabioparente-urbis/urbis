/**
 * scripts/avaliar_gabarito.mts — MEDE ACURÁCIA, não coerência.
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/avaliar_gabarito.mts
 *   ... 44556            (só um processo)
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────────
 * `testar_rastreabilidade.mts` prova que o sistema é COERENTE: que a declaração bate com o
 * comportamento e que nenhum campo desaparece. Nunca prova que o VALOR está certo.
 *
 * Enquanto tudo era regex sobre camada de texto, dava para viver com isso: extrator determinístico
 * erra por omissão, quase nunca por invenção. Visão erra por invenção — devolve número plausível
 * onde não conseguiu ler. Sem medir contra o que o documento REALMENTE diz, "a visão está
 * funcionando" vira opinião, e regressão por troca de modelo passa despercebida.
 *
 * O gabarito é conferido por humano e vive em `gabarito/<processo>.json`. Campo com
 * `conferido: false` NÃO é medido — é lacuna do gabarito, não erro do leitor, e some da conta.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lerPastaSlot5, type ArquivoEntrada } from "../lib/lerPastaSlot5";
import { matriz } from "../lib/rastreabilidade";
import { fecharResultados } from "../lib/rastreabilidade/fechar";

type ItemGabarito = { esperado: string | null; conferido: boolean; nota?: string };
type Gabarito = {
  processo: string; pasta: string; conferidoEm: string; conferidoPor: string;
  campos: Record<string, ItemGabarito>;
};

/**
 * Compara valores tolerando FORMATAÇÃO, nunca conteúdo.
 *
 * A primeira versão caía numa armadilha que só apareceu quando o gabarito rodou: comparava os
 * dígitos de qualquer coisa. Com isso "RUA 2" × "R 2" passava, e "AVENIDA 2" também passaria.
 * Instrumento de medição leniente é pior que não medir, porque produz confiança falsa.
 *
 * Agora a comparação numérica só vale quando os DOIS lados são essencialmente números — o resto
 * compara texto normalizado.
 */
function equivalente(esperado: string, obtido: string): boolean {
  const norm = (s: string) =>
    s.trim().toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[ÁÀÂÃ]/g, "A").replace(/[ÉÊ]/g, "E").replace(/[ÍÏ]/g, "I")
      .replace(/[ÓÔÕ]/g, "O").replace(/[ÚÜ]/g, "U").replace(/Ç/g, "C")
      .replace(/\s*(M²|M³|M2|M3)\s*$/i, "");
  const a = norm(esperado), b = norm(obtido);
  if (a === b) return true;

  // só é comparação numérica quando não sobra letra dos dois lados
  const ehNumerico = (s: string) => /^[\d.,\s-]+$/.test(s) && /\d/.test(s);
  if (ehNumerico(a) && ehNumerico(b)) {
    const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
    const na = numero(a), nb = numero(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return Math.abs(na - nb) < 0.005;
  }
  return false;
}

const alvo = process.argv[2];
const dirGabarito = path.join(process.cwd(), "gabarito");
if (!fs.existsSync(dirGabarito)) {
  console.log("nenhum gabarito em ./gabarito — nada a medir");
  process.exit(0);
}
const arquivos = fs.readdirSync(dirGabarito)
  .filter((n) => n.endsWith(".json") && (!alvo || n === `${alvo}.json`));

const campos = matriz("LIP", "slot_05")!.campos!;
let totalAcerto = 0, totalErro = 0, totalOmissao = 0, totalNaoMedido = 0;

for (const arq of arquivos) {
  const g: Gabarito = JSON.parse(fs.readFileSync(path.join(dirGabarito, arq), "utf8"));
  const pasta = g.pasta.replace(/^~/, process.env.HOME!);

  console.log(`\n══ ${g.processo} — gabarito de ${g.conferidoEm} (${g.conferidoPor})`);
  if (!fs.existsSync(pasta)) { console.log(`  (pulado — pasta não encontrada: ${pasta})`); continue; }

  const entradas: ArquivoEntrada[] = fs.readdirSync(pasta)
    .filter((n) => !n.startsWith(".") && /\.pdf$/i.test(n))
    .map((nome) => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(pasta, nome)));
      return { nome, rodada: 1, hash: crypto.createHash("sha256").update(buffer).digest("hex"), buffer };
    });

  const leitura = await lerPastaSlot5(entradas);
  const obtidos = fecharResultados(campos, leitura.campos);

  const linhas: string[] = [];
  let acerto = 0, erro = 0, omissao = 0, naoMedido = 0;

  for (const [chave, item] of Object.entries(g.campos)) {
    const r: any = obtidos[chave];
    const valorObtido = r?.valor ?? null;
    const resultado = r?.resultado ?? "(ausente)";

    if (!item.conferido) { naoMedido++; continue; }

    // gabarito diz que o dado NÃO está no documento: acerto é não inventar
    if (item.esperado === null) {
      const absteve = valorObtido == null;
      if (absteve) { acerto++; linhas.push(`  ok       ${chave.padEnd(34)} absteve corretamente (${resultado})`); }
      else { erro++; linhas.push(`  INVENTOU ${chave.padEnd(34)} devolveu "${valorObtido}" e o documento não traz o dado`); }
      continue;
    }

    if (valorObtido == null) {
      omissao++;
      linhas.push(`  omitiu   ${chave.padEnd(34)} esperado "${item.esperado}" · resultado ${resultado}`);
      continue;
    }
    if (equivalente(item.esperado, String(valorObtido))) {
      acerto++;
      linhas.push(`  ok       ${chave.padEnd(34)} "${valorObtido}"`);
    } else {
      erro++;
      linhas.push(`  ERRO     ${chave.padEnd(34)} esperado "${item.esperado}" · obtido "${valorObtido}"`);
    }
  }

  // erros e omissões primeiro: é o que se conserta
  linhas.sort((a, b) => (a.includes("  ok  ") ? 1 : 0) - (b.includes("  ok  ") ? 1 : 0));
  console.log(linhas.join("\n"));

  const medidos = acerto + erro + omissao;
  const pct = medidos ? ((acerto / medidos) * 100).toFixed(1) : "—";
  console.log(
    `\n  medidos ${medidos} · acerto ${acerto} · erro ${erro} · omissão ${omissao} · ` +
    `acurácia ${pct}%   (não medidos: ${naoMedido} campos sem gabarito conferido)`,
  );

  totalAcerto += acerto; totalErro += erro; totalOmissao += omissao; totalNaoMedido += naoMedido;
}

const medidosTotal = totalAcerto + totalErro + totalOmissao;
console.log(
  `\n══ TOTAL — ${arquivos.length} processo(s) · medidos ${medidosTotal} · ` +
  `acerto ${totalAcerto} · erro ${totalErro} · omissão ${totalOmissao} · ` +
  `acurácia ${medidosTotal ? ((totalAcerto / medidosTotal) * 100).toFixed(1) : "—"}%`,
);
console.log(`   ${totalNaoMedido} campo(s) aguardando conferência humana no gabarito.`);

/* ERRO e OMISSÃO não são a mesma falha, e a diferença é a mesma que separa NAO_ENCONTRADO de
 * FONTE_ILEGIVEL na matriz: omitir é o leitor não achar (conserta-se o extrator); errar é devolver
 * valor diferente do que o documento diz (é o caso grave, e o único que visão pode produzir em
 * silêncio). Um leitor que omite muito é imaturo; um que erra é perigoso. */
