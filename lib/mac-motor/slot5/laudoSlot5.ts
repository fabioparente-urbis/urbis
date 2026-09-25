/**
 * lib/mac-motor/slot5/laudoSlot5.ts — dados do Laudo do Slot 5 (Aprovação de Projeto).
 *
 * Reproduz, em código, o que o Excel do Fábio faz hoje: a aba `Painel` (coluna F, linhas 2–121)
 * recebe os dados do processo e a aba `Laudo5` calcula tudo por fórmula. Aqui o LIP faz o papel
 * do Painel (os 120 campos do LIP do Slot 5 foram modelados sobre ele — `PAINEL_LIP` só liga a
 * linha à chave) e `calcularLaudo` reescreve as fórmulas do `Laudo5` uma a uma.
 *
 * Função pura, sem banco nem arquivo: quem lê o processo e quem escreve o Excel ficam de fora
 * (`lib/geradores/gerarLaudoSlot5.ts`). Isolado do Slot 1 — não importa gerarLaudo nem
 * compatibilidadeArea; o Laudo do Slot 1 é outro ato, de outro setor, e pode divergir.
 *
 * O que NÃO vem do LIP (por não existir campo) sai vazio e entra em `avisos`, nunca "0": em
 * Excel, referência a célula vazia vira 0 — e 0 num "A ÁREA CONFERE?" parece resposta.
 */

import { parseNumeroBR } from "./util";

/** Linha do Painel → chave do LIP. Conferido contra `lip_campos.label` em 24/09/2026. */
export const PAINEL_LIP: Record<number, string> = {
  2: "logradouro", 3: "via2", 4: "via3", 5: "via4", 6: "quantasFrentes", 7: "quadra", 8: "lote",
  9: "bairro", 10: "proprietario", 11: "processoFisico", 12: "processo", 13: "cheadvN",
  14: "iptu", 15: "dataPagtoTaxaInicial", 16: "tipoProcessoLip",
  33: "houveMudancaDeAnalista", 34: "areaTerreno", 35: "areaTotal", 36: "esquina",
  37: "numeroDeArtExecucao", 38: "numeroDeArtCaixa", 39: "numeroDeArtProjeto",
  40: "comercio", 41: "habitacional", 42: "misto", 43: "grandePorte", 44: "tipoUso", 45: "cnae",
  46: "dimensoesDoLoteConferemComA", 47: "dimensoesDoLoteConferemComRememb", 48: "usoDoSoloN",
  49: "oEnderecoEstaCorretoNoUso", 50: "unidadeTerritorialDoUsoDoSolo",
  51: "usoDoSoloEParaAprovacao", 52: "anexouCertidaoDeCorredorViario", 53: "atendeOPorteAdmitido",
  54: "tipoDeVia1", 55: "tipoDeVia2", 56: "tipoDeVia3", 57: "tipoDeVia4",
  58: "larguraDaVia1", 59: "larguraDaVia2", 60: "larguraDaVia3", 61: "larguraDaVia4",
  62: "larguraDoPasseio1", 63: "larguraDoPasseio2", 64: "larguraDoPasseio3", 65: "larguraDoPasseio4",
  66: "anexouArtRrtProjeto", 67: "aAreaNaArtDeProjeto", 68: "artDeProjetoAtendeAAcessibilidade",
  69: "anexouArtRrtExecucao", 70: "aAreaNaArtDeExecucao", 71: "aArtDeExecucaoAtendeA",
  72: "anexouArtRrtCaixa", 73: "volumeConfereComOProjeto",
  74: "trafegoElevadores", 75: "outorgaOnerosa", 76: "tDC", 77: "demolicao",
  78: "smmPCorredoresDoArtigo116", 79: "docEmitidoPeloComandoDaAeronautica",
  80: "certidaoDeAcessib", 81: "obsDocumentos",
  82: "habSeriada", 83: "habColetiva", 84: "quitinete", 85: "atividadeEconomica", 86: "institucional",
  87: "unidComerciais", 88: "unidHabitacionais", 89: "pav", 90: "areaTerreno", 91: "areaTotal",
  92: "areaTotalPrivativa", 93: "art163BaiaDeDesaceleracaoAa", 94: "aosEApaIntegranteDaArau",
  95: "aabEApac190", 96: "chacarasVerificarNomeDoBairroNa", 97: "chacarasVerificarNomeDoBairroNa2",
  98: "quitineteEmAab130", 99: "opcao1TotalExigidoAreaTerreno", 100: "areaPermeavelProjetada",
  101: "opcao2TotalExigidoAreaTerreno2", 102: "opcao3TotalExigidoAreaTerreno",
  103: "volumeDaCaixaDeRecarga", 104: "nDeCaixasDeCaptacao",
  105: "aproveitamentoExigidoAreaDeFruicao", 106: "areaAteXxPav",
  107: "indiceDeAproveitamentoDoProjetoAte", 108: "areaTotalMax75x",
  109: "indiceDeAproveitamentoDoProjetoTotal", 110: "totalASerDescontadoNoCalculo",
  111: "areaOcupadaPelaAtividade", 112: "vagasPcdExigido", 113: "vagasIdosoExigido",
  114: "vagaAmbulanciaPCnaeAtivEspec", 115: "totalDeVagasExigidasParaEssas",
  116: "totalDeVagasAtendidasParaAtividade", 117: "vagasPcdAtendidas", 118: "vagasIdosoAtendidas",
  119: "atendeAcessoCirculacaoVagasManobrasLc", 120: "atendeDecreto9451PUsoHab",
  121: "atendeAcessibilidade",
};

export type CelulaLaudo = string | number;
export type DadosLipLaudo = Record<string, { valor?: unknown } | undefined> | null | undefined;

export type ResultadoLaudoSlot5 = {
  /** coordenada A1 da aba `Laudo5` → valor a gravar. Só as células que dependem do processo. */
  celulas: Record<string, CelulaLaudo>;
  /** o que o analista precisa completar/conferir na planilha — nunca some em silêncio. */
  avisos: string[];
};

/** Referência direta `=Painel!F<linha>` do Laudo5 (68 células) + as 3 vindas da aba Vagas. */
const DIRETAS: Record<string, number> = {
  D4: 11, G4: 12, K4: 13, N4: 15, D5: 10, G8: 46, N8: 47, D10: 48, K10: 51, D11: 49, K11: 52,
  D12: 50, K12: 53, D13: 54, J13: 58, N13: 62, D14: 55, J14: 60, N14: 65, E16: 66, I16: 69,
  N16: 72, E17: 67, I17: 70, N17: 73, E18: 68, I18: 71, D20: 74, H20: 75, J20: 76, L20: 77,
  D21: 78, H21: 79, J21: 80, L21: 81, G23: 82, J23: 87, N23: 89, G24: 83, G25: 84, G26: 85,
  J26: 88, G27: 86, D28: 90, J28: 91, J29: 92, N31: 93, J35: 94, J36: 95, J37: 96, J38: 97,
  J39: 98, J91: 99, J92: 100, M92: 101, M93: 102, L96: 103, L97: 103, L98: 104, F103: 105,
  K103: 106, M103: 107, K104: 108, M104: 109, M132: 114, L137: 119, L139: 120, L140: 121,
  L134: 116, M135: 117, M136: 118,
};

/** Campos que podem ficar vazios sem virar aviso (texto livre / não se aplica a todo processo). */
const OPCIONAIS = new Set([81, 87, 88]);

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const ehNP = (v: unknown) => String(v ?? "").trim().toUpperCase() === "NP";

/** Número BR ("3.572,10", "5071,49") ou número já numérico; null se não for número. */
function n(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  return parseNumeroBR(v);
}

/**
 * "ÁREA DE ADENSAMENTO BÁSICO - AAB" → "AAB". O Painel guarda só a sigla; o LIP guarda a
 * frase do Uso do Solo.
 */
export function siglaUnidadeTerritorial(v: string): string {
  const m = v.match(/-\s*([A-Za-zÇÃ]{2,6})\s*$/);
  return m ? m[1].toUpperCase() : v.trim();
}

/** O que o Painel guardaria na linha `linha`, lido do LIP. `undefined` = sem dado. */
export function valorPainel(dados: DadosLipLaudo, linha: number): string | undefined {
  const chave = PAINEL_LIP[linha];
  if (!chave) return undefined;
  const bruto = dados?.[chave]?.valor;
  if (vazio(bruto)) return undefined;
  const s = String(bruto).trim();
  if (linha === 50) return siglaUnidadeTerritorial(s);
  if (linha === 13) return s.replace(/\s*\/\s*/g, "/");   // " 1.577 / 2026" → "1.577/2026"
  if (linha === 89) {
    const p = n(s);
    return p !== null ? String(p) : s;
  }
  return s;
}

export function calcularLaudo(
  dados: DadosLipLaudo,
  opts: { dataEmissao: Date },
): ResultadoLaudoSlot5 {
  const P: Record<number, string | undefined> = {};
  for (let l = 2; l <= 121; l++) P[l] = valorPainel(dados, l);

  const c: Record<string, CelulaLaudo> = {};
  const avisos: string[] = [];

  // ── Referências diretas ──────────────────────────────────────────────────────────────
  for (const [coord, linha] of Object.entries(DIRETAS)) {
    let v = P[linha];
    // Linha 101 do Painel é a ÁREA (m²) não permeável projetada; o LIP guarda o percentual
    // ("3,84%") nesse campo. Percentual não é área — não vai para a célula de m².
    if (linha === 101 && v !== undefined && v.includes("%")) {
      avisos.push(`${coord}: o LIP só tem o percentual (${v}) da área não permeável projetada — falta a área em m²`);
      v = undefined;
    }
    if (v === undefined) {
      c[coord] = "";
      if (!OPCIONAIS.has(linha) && linha !== 101) avisos.push(`${coord}: sem dado no LIP (${PAINEL_LIP[linha]})`);
    } else if (coord === "J29" || coord === "L134" || coord === "M135" || coord === "M136") {
      c[coord] = n(v) ?? v;   // o Excel guarda área privativa e vagas como número
    } else if (coord === "J13" || coord === "J14" || coord === "N13" || coord === "N14") {
      c[coord] = n(v) ?? v;   // larguras de via/passeio
    } else {
      c[coord] = v;
    }
  }
  c.D6 = `${P[2] ?? ""} , Q.${P[7] ?? ""} , L.${P[8] ?? ""} ; `;

  const A = n(P[90]);            // D28 — área do lote
  const J26 = P[88];             // unidades habitacionais
  const J29 = n(P[92]);          // área total privativa

  const sobre = (base: number | null, f: (a: number) => number): CelulaLaudo =>
    base === null ? "" : f(base);
  if (A === null) avisos.push("D28: área do lote ausente/ilegível no LIP — todo o cálculo de índices fica em branco");

  // ── Fração ideal ─────────────────────────────────────────────────────────────────────
  c.H35 = sobre(A, (a) => a / 180);
  c.H36 = sobre(A, (a) => a / 90);
  c.H38 = sobre(A, (a) => a / 180);
  c.H39 = sobre(A, (a) => a / 30);
  c.K35 = ehNP(J26) || J26 === undefined ? "NP" : sobre(A && n(J26) ? A : null, (a) => a / (n(J26) as number));

  // ── Índice de ocupação e coeficientes (percentuais do lote) ──────────────────────────
  const fator: Record<string, number> = {
    E64: 0.9, E65: 0.9, E66: 1, E69: 0.5, E76: 0.9, E77: 1, E78: 1, E79: 1, E80: 1,
    E82: 0.4, E83: 0.4, E84: 0.4, E85: 0.4, E86: 0.4,
  };
  for (const [coord, f] of Object.entries(fator)) c[coord] = sobre(A, (a) => a * f);
  // A planilha calcula E70 sobre D29 (célula vazia) — resulta sempre 0. Reproduzido como está.
  c.E70 = 0;
  // Os L__ dividem o que o analista digita em I__ (não vem do LIP; o modelo traz 0) pela área.
  // Como I__ fica em 0, L__ = 0 — mantido pelo próprio modelo, nada a gravar.

  // ── Permeabilidade / paisagismo ─────────────────────────────────────────────────────
  c.E91 = sobre(A, (a) => a * 0.15);
  c.E92 = sobre(A, (a) => a * 0.10);
  c.G92 = sobre(A, (a) => a * 0.05);
  c.G93 = sobre(A, (a) => a * 0.25);
  const j91 = P[99], j92 = P[100], m92 = P[101], m93 = P[102];
  c.I91 = j91 === undefined || ehNP(j91) ? "NP" : sobre(n(j91) !== null ? A : null, (a) => (n(j91) as number) / a);
  c.I92 = j92 === undefined || ehNP(j92) ? "NP" : sobre(n(j92) !== null ? A : null, (a) => (n(j92) as number) / a);
  c.L92 = m92 === undefined || ehNP(m92) ? "NP" : sobre(n(m92) !== null ? A : null, (a) => (n(m92) as number) / a);
  c.L93 = m93 === undefined || ehNP(m93) ? "NP" : sobre(n(m93) !== null ? A : null, (a) => (n(m93) as number) / a);

  // ── Captação de água pluvial ────────────────────────────────────────────────────────
  c.J96 = j91 === undefined || ehNP(j91) ? "NP" : sobre(n(j91) !== null ? A : null, (a) => a - (n(j91) as number));
  c.E96 = c.J96 === "NP" || c.J96 === "" ? "NP" : (c.J96 as number) / 200;
  c.J97 = j92 === undefined || ehNP(j92) ? "NP" : sobre(n(j92) !== null ? A : null, (a) => a - (n(j92) as number));
  c.E97 = c.J97 === "NP" || c.J97 === "" ? "NP" : (c.J97 as number) / 200;

  // Conferência que o Excel não faz: caixa de captação menor que o exigido.
  const exigido = typeof c.E97 === "number" ? c.E97 : null;
  const utilizado = n(c.L97);
  if (exigido !== null && utilizado !== null && utilizado < exigido) {
    avisos.push(`L97: volume da caixa de recarga no LIP (${utilizado}) é menor que o exigido (${exigido.toFixed(2)} m³) — conferir se é digitação`);
  }

  // ── Aproveitamento ──────────────────────────────────────────────────────────────────
  c.F102 = sobre(A, (a) => a * 6);
  c.F105 = sobre(A, (a) => a * 7.5);
  const f103 = P[105];
  c.F104 = f103 === undefined || ehNP(f103) ? "NP" : sobre(n(f103) !== null ? A : null, (a) => a * 6 + (n(f103) as number));

  // ── Vagas ───────────────────────────────────────────────────────────────────────────
  c.M108 = P[92] === undefined || ehNP(P[92]) ? "NP" : sobre(J29, (a) => a / 100);
  c.M109 = J26 === undefined ? "" : J26;
  c.M110 = J26 === undefined || ehNP(J26) ? "NP" : sobre(n(J26), (a) => a * 0.02);

  // ── Atividade econômica ─────────────────────────────────────────────────────────────
  const l125 = n(P[91]);
  const l126 = n(P[110]);
  c.L125 = P[91] ?? "";
  c.L126 = l126 ?? "";
  if (l126 === null) avisos.push("L126: total a descontar da área ocupada ausente no LIP (totalASerDescontadoNoCalculo)");
  const l127 = l125 !== null && l126 !== null ? l125 - l126 : null;
  c.L127 = l127 ?? "";
  c.K128 = l127 === null ? "" : l127 / 45;
  c.G128 = P[45] === undefined ? "" : ehNP(P[45]) ? "NÃO" : "SIM";
  c.M130 = n(P[112]) ?? "";
  c.M131 = n(P[113]) ?? "";

  // ── Rodapé / resumo ────────────────────────────────────────────────────────────────
  c.J142 = J29 ?? "";
  c.D147 = J29 ?? "";
  c.D148 = J29 ?? 0;     // SUM(D145:D147): existente 0 + redução 0 + a construir
  c.D149 = J29 ?? "";
  c.D151 = c.K128;
  c.F151 = c.M130;
  c.H151 = c.M131;
  c.D152 = c.L134;
  c.F152 = c.M135;
  c.H152 = c.M136;

  c.M144 = opts.dataEmissao.toISOString().slice(0, 10);   // o gerador converte para data

  // Faixa "PENDENCIA" do modelo: só quando falta dado que o LIP deveria ter dado.
  c.B1 = avisos.length > 0 ? "PENDENCIA: VER PREENCHIMENTO DO LAUDO" : "";

  // ── O que o LIP não tem: fica pro analista ──────────────────────────────────────────
  avisos.push("Recuos utilizados em projeto (I58:L61) e alturas acumuladas (H58:H61) não vêm do LIP — preencher na planilha");
  avisos.push("Ocupação por pavimento (I64:I86) e vagas de uso habitacional (C118:L122) não vêm do LIP — conferir na planilha");

  return { celulas: c, avisos };
}
