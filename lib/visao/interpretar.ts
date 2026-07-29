/**
 * lib/visao/interpretar.ts — resposta do modelo → leitura por campo.
 *
 * Módulo PURO, sem banco e sem rede, de propósito: é a parte que mais precisa de teste
 * determinístico e barato, e enquanto morava junto da orquestração arrastava o cliente do Supabase
 * para dentro da suíte de governança — que passava a exigir env só para conferir um parser.
 *
 * A abstenção é POR CAMPO: uma linha ilegível não invalida as outras do mesmo quadro. A exceção é
 * a incoerência entre campos — aí o recorte inteiro cai, porque não há como saber qual dos valores
 * está errado, e escolher um seria chutar.
 */

import type { LeituraCampo, Receita } from "./tipos";

export function interpretarResposta(texto: string, r: Receita): Record<string, LeituraCampo> {
  const todosFalham = (motivo: string): Record<string, LeituraCampo> =>
    Object.fromEntries(r.chaves.map((c) => [c, { ok: false as const, motivo }]));

  let json: any;
  try {
    json = JSON.parse(texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  } catch {
    return todosFalham("resposta não é JSON utilizável");
  }
  // abstenção global continua aceita: o modelo pode dizer que a tabela não está no recorte
  if (json?.abstencao === true) return todosFalham(String(json.motivo ?? "o modelo se absteve"));

  const bruto = json?.campos ?? json;
  const porCampo: Record<string, LeituraCampo> = {};
  const lidos: Record<string, string> = {};

  for (const chave of r.chaves) {
    const c = bruto?.[chave];
    if (c == null) { porCampo[chave] = { ok: false, motivo: "campo ausente na resposta" }; continue; }
    if (c?.abstencao === true) {
      porCampo[chave] = { ok: false, motivo: String(c.motivo ?? "o modelo se absteve neste campo") };
      continue;
    }
    // aceita tanto {"valor": "1"} quanto "1" — o modelo às vezes achata o objeto
    const valor = String(typeof c === "object" ? (c.valor ?? "") : c).trim();
    const v = r.validadores[chave]?.(valor) ?? { ok: true };
    if (!v.ok) { porCampo[chave] = { ok: false, motivo: `resposta inválida: ${v.motivo}` }; continue; }

    const conf = Number(typeof c === "object" ? c.confianca : NaN);
    porCampo[chave] = { ok: true, valor, confianca: Number.isFinite(conf) ? conf : null };
    lidos[chave] = valor;
  }

  // coerência cruzada: leitura internamente inconsistente derruba o recorte inteiro
  const coer = r.coerencia?.(lidos);
  if (coer && !coer.ok) return todosFalham(coer.motivo ?? "leitura incoerente entre os campos do recorte");

  return porCampo;
}
