/**
 * lib/visao/localizar.ts — acha EM QUE PÁGINA e ONDE está o quadro procurado.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────────
 * A primeira versão da receita fixava `pagina: 0` e uma fração da página. Isso descrevia a pasta
 * de amostra, não a regra: um processo pode ter 1, 2, 5 ou 10 pranchas, e cada projetista diagrama
 * onde quer. É o mesmo sobreajuste que já foi corrigido em `via2` e em `unidComerciais`.
 *
 * ── POR QUE EM DUAS ETAPAS ──────────────────────────────────────────────────────
 * Não há âncora de texto para usar: o alvo é exatamente o conteúdo que NÃO está na camada de
 * texto. E a prancha é A0 (3370x2384pt) — renderizar a página inteira numa resolução em que texto
 * de 8pt seja legível daria ~35 megapixels, que o modelo reduz de volta antes de olhar.
 *
 *   VARREDURA  página inteira em baixa resolução. O quadro não é legível, mas é VISÍVEL como
 *              bloco — o suficiente para dizer em que página está e em que retângulo.
 *   RECORTE    só aquele retângulo, em alta resolução, onde o texto é legível.
 *
 * Varrer custa uma chamada barata por página; ler custa uma. Sem isso, ou se lê a prancha errada,
 * ou não se lê nada quando o projetista muda a diagramação.
 */

import { recortar } from "./rasterizar";
import type { Receita, RegiaoAbsoluta } from "./tipos";

/** Gemini devolve caixa como [ymin, xmin, ymax, xmax] normalizado em 0..1000. */
function caixaDoModelo(texto: string): { y0: number; x0: number; y1: number; x1: number } | null {
  let json: any;
  try { json = JSON.parse(texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); }
  catch { return null; }
  if (json?.encontrado !== true) return null;
  const c = json?.box_2d ?? json?.caixa;
  if (!Array.isArray(c) || c.length !== 4 || !c.every((n: any) => Number.isFinite(Number(n)))) return null;
  const [ymin, xmin, ymax, xmax] = c.map(Number);
  if (ymax <= ymin || xmax <= xmin) return null;
  return { y0: ymin / 1000, x0: xmin / 1000, y1: ymax / 1000, x1: xmax / 1000 };
}

const promptDeVarredura = (alvo: string) => [
  "Esta é uma PRANCHA de projeto arquitetônico, vista inteira e em baixa resolução.",
  "Você NÃO precisa ler o conteúdo — só dizer se um quadro específico está nesta página e onde.",
  "",
  `PROCURE POR: ${alvo}`,
  "",
  "Se estiver nesta página, devolva a caixa delimitadora do quadro como box_2d no formato",
  "[ymin, xmin, ymax, xmax], normalizado de 0 a 1000, cobrindo o quadro INTEIRO com folga.",
  "Se não estiver nesta página, diga que não encontrou. Não invente localização.",
  "",
  "Responda SOMENTE JSON:",
  '{"encontrado": true, "box_2d": [470, 720, 620, 860]}',
  "ou",
  '{"encontrado": false}',
].join("\n");

/**
 * Varre as páginas do documento e devolve onde o alvo está, em fração da página.
 *
 * `chamar` é injetado para que este módulo não conheça provedor, cota nem retentativa — quem sabe
 * disso é o orquestrador.
 */
export async function localizar(
  pdf: Uint8Array,
  paginas: number,
  receita: Receita,
  chamar: (png: Uint8Array, prompt: string) => Promise<{ texto: string; custo: number; ms: number }>,
): Promise<{ regiao: RegiaoAbsoluta; custo: number; chamadas: number } | null> {
  let custo = 0;
  let chamadas = 0;

  for (let pagina = 0; pagina < paginas; pagina++) {
    const varredura = await recortar(pdf, {
      pagina, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: receita.localizacao.varreduraPx,
    });
    const r = await chamar(varredura.png, promptDeVarredura(receita.localizacao.alvo));
    custo += r.custo;
    chamadas++;

    const caixa = caixaDoModelo(r.texto);
    if (!caixa) continue;

    /* Margem generosa: o modelo acerta a região aproximada e erra a borda com facilidade, e cortar
     * meia linha da tabela é pior do que trazer um pedaço do desenho vizinho junto. */
    const m = receita.localizacao.margem;
    const limita = (n: number) => Math.min(1, Math.max(0, n));
    return {
      regiao: {
        pagina,
        x0: limita(caixa.x0 - m), y0: limita(caixa.y0 - m),
        x1: limita(caixa.x1 + m), y1: limita(caixa.y1 + m),
        alvoPx: receita.localizacao.alvoPx,
      },
      custo, chamadas,
    };
  }
  return null;
}
