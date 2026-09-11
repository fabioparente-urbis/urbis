/**
 * lib/documentosSei/parseDataDocumento.ts — Fase 11 do plano de leitura de PDF (§3.4, "sobre a
 * precisão da medição de tempo"): as datas em `fluxo_processo_eventos.data_documento` vêm em
 * texto livre, como o carimbo do SEI escreveu — "17/06/2024" e "4 de março de 2022" convivem no
 * mesmo processo (medido em 11/09/2026, 103 formatos distintos em 5 processos). Isto normaliza
 * pra Date, sem inventar precisão que a fonte não tem: falha vira `null`, nunca uma data chutada.
 *
 * Achado que também é RUÍDO conhecido, não corrigido aqui: datas de décadas atrás (RG, CPF,
 * nascimento) aparecem coladas em "data_documento" quando o carimbo do documento anexado é uma
 * cópia de identidade. Quem usa esta função pra medir duração precisa descartar outliers (ex:
 * mais de ~15 anos antes da data de hoje) — não é responsabilidade do parser decidir isso.
 */

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

export function parseDataDocumento(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const t = texto.trim().toLowerCase();

  const porBarra = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (porBarra) {
    const [, d, m, a] = porBarra;
    return dataValida(Number(a), Number(m) - 1, Number(d));
  }

  const porExtenso = t.match(/^(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})$/);
  if (porExtenso) {
    const [, d, mesNome, a] = porExtenso;
    const mes = MESES[mesNome];
    if (mes === undefined) return null;
    return dataValida(Number(a), mes, Number(d));
  }

  return null;
}

function dataValida(ano: number, mes: number, dia: number): Date | null {
  const d = new Date(Date.UTC(ano, mes, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes || d.getUTCDate() !== dia) return null;
  return d;
}
