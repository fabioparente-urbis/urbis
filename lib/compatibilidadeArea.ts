// ============================================================
// Compatibilidade de área — Regularização SEI (Slot 1).
//
// A área a regularizar pode aparecer em até 4 fontes do processo:
// o Quadro de Áreas do Projeto/Levantamento (areaTotal), o Laudo
// Técnico (areaLaudo), a ART de Levantamento (areaArt) e o Termo
// de Vistoria Fiscal (areaVistoria). As quatro devem ser
// compatíveis entre si. Quando não são, a área que PREVALECE é a
// da fiscalização — é o fiscal que vistoriou o imóvel in loco.
//
// Autorização: usuário pediu explicitamente em 2026-08-04,
// nomeando "Slot 1 — Regularização SEI" e definindo a alteração
// (comparar áreas, avisar o analista com destaque se não bater,
// principalmente contra a área da fiscalização).
// ============================================================

export type FonteArea = { valor?: string | null; fonte?: string | null } | null | undefined;

export type LeituraAreas = {
  /** areaTotal — Quadro de Áreas do Projeto/Levantamento. */
  projeto?: FonteArea;
  /** areaLaudo — Laudo Técnico. */
  laudo?: FonteArea;
  /** areaArt — ART/RRT de Levantamento. */
  art?: FonteArea;
  /** areaVistoria — Termo de Vistoria Fiscal (fiscalização). Prevalece em divergência. */
  vistoria?: FonteArea;
};

type ChaveArea = keyof LeituraAreas;

export type DivergenciaArea = {
  a: ChaveArea;
  b: ChaveArea;
  valorA: number;
  valorB: number;
  diferenca: number;
};

export type VeredictoCompatibilidadeArea = {
  compativel: boolean;
  /** true quando alguma divergência envolve a área apontada pela fiscalização. */
  criticoFiscalizacao: boolean;
  divergencias: DivergenciaArea[];
  mensagem: string;
};

export const ROTULOS_AREA: Record<ChaveArea, string> = {
  projeto: "Projeto/Levantamento",
  laudo: "Laudo Técnico",
  art: "ART de Levantamento",
  vistoria: "Fiscalização (Termo de Vistoria)",
};

const TOLERANCIA_M2 = 0.5;

/** Mesmo parser de área usado no VCP (lib/mrp.ts / s4): aceita "1.234,56", "1234,56" e "1234.56". */
function parseArea(v: string | null | undefined): number | null {
  if (!v) return null;
  let s = String(v).replace(/m²|m2/gi, "").trim();
  if (!s || s.toUpperCase() === "NP") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Compara as áreas presentes (ignora as ausentes). Sempre seguro chamar — vira no-op se faltar dado. */
export function compararAreas(leitura: LeituraAreas): VeredictoCompatibilidadeArea {
  const fontes: { chave: ChaveArea; n: number }[] = [];
  (Object.keys(ROTULOS_AREA) as ChaveArea[]).forEach((chave) => {
    const n = parseArea(leitura[chave]?.valor);
    if (n !== null) fontes.push({ chave, n });
  });

  if (fontes.length < 2) {
    return { compativel: true, criticoFiscalizacao: false, divergencias: [], mensagem: "" };
  }

  const divergencias: DivergenciaArea[] = [];
  for (let i = 0; i < fontes.length; i++) {
    for (let j = i + 1; j < fontes.length; j++) {
      const diferenca = Math.abs(fontes[i].n - fontes[j].n);
      if (diferenca > TOLERANCIA_M2) {
        divergencias.push({ a: fontes[i].chave, b: fontes[j].chave, valorA: fontes[i].n, valorB: fontes[j].n, diferenca });
      }
    }
  }

  if (divergencias.length === 0) {
    return {
      compativel: true,
      criticoFiscalizacao: false,
      divergencias: [],
      mensagem: "Áreas compatíveis entre projeto, laudo, ART e fiscalização.",
    };
  }

  const criticoFiscalizacao = divergencias.some((d) => d.a === "vistoria" || d.b === "vistoria");
  const linhas = divergencias.map(
    (d) =>
      `${ROTULOS_AREA[d.a]} (${d.valorA.toFixed(2)}m²) ≠ ${ROTULOS_AREA[d.b]} (${d.valorB.toFixed(2)}m²) — diferença de ${d.diferenca.toFixed(2)}m²`
  );

  const mensagem = criticoFiscalizacao
    ? `Área divergente da FISCALIZAÇÃO: ${linhas.join("; ")}. A área apontada pela fiscalização (Termo de Vistoria) deve PREVALECER — confira antes de prosseguir.`
    : `Áreas divergentes entre documentos: ${linhas.join("; ")}.`;

  return { compativel: false, criticoFiscalizacao, divergencias, mensagem };
}

/** Slot 1 (Regularização SEI) — aceita a grafia legada e "regularizacao_sei". */
export function ehRegularizacaoSei(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim().startsWith("regularizacao");
}

/**
 * Bloco anexado ao prompt do S3, igual à técnica do marco temporal
 * (lib/marcoTemporal.ts): vai DEPOIS do prompt do slot, então não
 * altera o que o P2_EXTRACAO já extrai — só acrescenta 3 chaves
 * novas dentro do "campos" já existente, só quando o documento
 * realmente mencionar área nessas fontes.
 */
export function blocoPromptCompatibilidadeArea(tipoProcesso: string | null | undefined): string {
  if (!ehRegularizacaoSei(tipoProcesso)) return "";

  return `

---
VERIFICAÇÃO ADICIONAL — COMPATIBILIDADE DE ÁREA (Regularização SEI)

Além de "areaTotal" (Quadro de Áreas do Projeto/Levantamento, já instruído acima),
procure a ÁREA A REGULARIZAR também nestes outros documentos, SE ela estiver
explicitamente mencionada neles. Não calcule, não deduza, não copie o valor de
outro documento — cada campo só é preenchido se o PRÓPRIO documento citar um
valor de área:

- "areaLaudo": área citada no LAUDO TÉCNICO, se houver.
- "areaArt": área citada na ART/RRT DE LEVANTAMENTO (campo "Dados da Obra/Serviço"
  ou equivalente), se houver.
- "areaVistoria": área verificada/confirmada PELO FISCAL no TERMO DE VISTORIA
  FISCAL mais recente, se houver — é a mais importante das quatro, pois é a
  medição feita in loco pela fiscalização, e prevalece em caso de divergência.

Use vírgula decimal, mesmo formato de "areaTotal" (ex.: "369,24"). Se o
documento não mencionar área nenhuma, retorne null — NUNCA invente, NUNCA
copie de outro documento só para preencher.

Acrescente essas 3 chaves DENTRO do objeto "campos" já existente (mesmo nível
de "areaTotal"), sem remover nem alterar nenhum campo já definido:

"areaLaudo": { "valor": "..." ou null, "fonte": "Laudo Técnico, SEI ..." },
"areaArt": { "valor": "..." ou null, "fonte": "ART de Levantamento, SEI ..." },
"areaVistoria": { "valor": "..." ou null, "fonte": "Termo de Vistoria Fiscal, SEI ..." }
---`;
}
