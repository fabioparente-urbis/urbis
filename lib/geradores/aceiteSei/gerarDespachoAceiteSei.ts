// ============================================================
// lib/geradores/aceiteSei/gerarDespachoAceiteSei.ts
// URBIS — Despacho do ALVARÁ DE ACEITE (Slot 2).
//
// ISOLAMENTO DE SLOT (CLAUDE.md): não importa NADA de `lib/geradores.ts`.
// Os helpers de docx (cabeçalho, rodapé, assinatura, itens agrupados)
// estão reproduzidos POR LEITURA, como manda a regra — "dois atos que
// hoje se parecem são de setores diferentes e podem divergir amanhã".
//
// ── POR QUE ESTE ARQUIVO EXISTE (achado de 17/09/2026) ──
//
// Até hoje `app/api/despacho-aceite-sei` chamava
// `gerarDespachoRegularizacao`, e o despacho do Aceite saía vestido de
// Regularização. O que ia no documento, para o interessado:
//
//   • "Assunto: ALVARÁ DE REGULARIZAÇÃO" — cravado na função, e a rota
//     nem passava o `assunto` que ela mesma já calculava.
//   • "…LEI COMPLEMENTAR Nº 314 … que institui o Alvará de
//     Regularização e INSTRUÇÃO NORMATIVA nº 04, de 16/05/2024…"
//   • "Texto da LC n°314/2018 alterado na LC n°368/2023;"
//   • o parágrafo do Decreto 2559/2018 em caixa alta;
//   • 'a – Art. 1º §1º LC n°314/2018: "Entende-se por edificações
//     estruturalmente definidas…"' — Art. 1º é do TÍTULO I
//     (Regularização); no Aceite vale o Art. 7º. Pior: esse parágrafo
//     era empurrado SEMPRE, enquanto o título "AVISOS:" era suprimido
//     para o Aceite — então a citação saía órfã, sem nem o rótulo.
//   • rodapé "Despacho Regularização".
//
// Existia um `gerarDespachoAceite` em `lib/geradores.ts`, com o assunto
// e a base legal certos, e NINGUÉM o chamava. Provável motivo: ele não
// suporta `corpoPersonalizado` (padrões de despacho), que a rota passou
// a precisar. Aqui os dois convivem.
//
// O texto da base legal abaixo é exatamente o que já estava naquele
// `gerarDespachoAceite` — não foi escrito por IA. Ele é genérico
// ("com base na legislação municipal vigente") e MERECE REVISÃO do
// Fábio: o Aceite tem base própria (LC nº 314/2018, TÍTULO II, Art. 7º,
// e IN nº 7, de 10/07/2024, Anexo I, item 9).
// ============================================================

import {
  Paragraph, Packer, AlignmentType, BorderStyle,
  type Assinante,
  getLogoData, txt, p, vazio, blocoAssinaturaAnalista, subtituloSecao,
  fmtDataLonga, montarDocumento,
} from "./docxBase";

export type { Assinante };

/**
 * Itens não conformes agrupados pelo `grupo` do checklist do Aceite.
 * Texto = exatamente `item.texto`, zero reescrita. Numeração contínua
 * entre grupos.
 *
 * Diferente do Slot 1, aqui NÃO existe a lista `TEXTOS_DESPACHO` com
 * textos por id (`d1`, `pr3`, `c7`…): aquele catálogo é da Regularização,
 * cita o Art. 2º § 4º e os 250 m² da caixa, e não tem o que fazer num
 * Aceite. O Aceite trabalha só com o texto que vem do próprio checklist.
 */
function gerarItensAgrupados(itens: { texto: string; grupo: string; ordem: number }[]) {
  const out: Paragraph[] = [];
  if (!itens?.length) return out;

  const ordemGrupos: string[] = [];
  const buckets: Record<string, { texto: string; ordem: number }[]> = {};
  itens.forEach((it) => {
    const g = (it.grupo || "OUTROS").toString();
    if (!buckets[g]) { buckets[g] = []; ordemGrupos.push(g); }
    buckets[g].push({ texto: it.texto, ordem: it.ordem });
  });

  let contador = 0;
  ordemGrupos.forEach((grupo) => {
    const lista = buckets[grupo].slice().sort((a, b) => a.ordem - b.ordem);
    if (!lista.length) return;
    out.push(subtituloSecao(grupo.toUpperCase()));
    lista.forEach((it) => {
      contador += 1;
      const texto = it.texto || "";
      if (!texto) return;
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        const isPrimeira = i === 0;
        out.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: isPrimeira ? 120 : 0, after: 80, line: 260 },
          indent: isPrimeira ? { left: 640, hanging: 640 } : { left: 640 },
          keepLines: true, keepNext: i < linhas.length - 1,
          children: [txt(isPrimeira ? `${contador}.   ${linha}` : `    ${linha}`, { size: 20 })],
        }));
      });
    });
  });
  return out;
}

/**
 * Itens não conformes que chegam só como id, sem texto. No Slot 1 os ids
 * viram texto pelo catálogo `TEXTOS_DESPACHO`; aqui não há catálogo, então
 * o id vai COMO VEIO e o fato é reportado ao chamador em
 * `idsSemTexto` — item não pode sumir nem virar sigla muda no documento
 * do interessado (CLAUDE.md).
 */
function gerarItensPorId(ids: string[]): { paragrafos: Paragraph[]; idsSemTexto: string[] } {
  const paragrafos: Paragraph[] = [];
  if (!ids?.length) return { paragrafos, idsSemTexto: [] };
  let contador = 0;
  ids.forEach((id) => {
    contador += 1;
    paragrafos.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 120, after: 80, line: 260 },
      indent: { left: 640, hanging: 640 },
      keepLines: true,
      children: [txt(`${contador}.   ${id}`, { size: 20 })],
    }));
  });
  return { paragrafos, idsSemTexto: [...ids] };
}

export type DadosDespachoAceite = {
  processo: string;
  interessado: string;
  numeroProcessoFisico?: string;
  numeroDespacho: string;
  /** Assunto do cabeçalho — vem de `assuntos.nome_documento` ("ALVARÁ DE ACEITE"). */
  assunto: string;
  /** Nº SEI do documento do CHEADV (`seiCheadv` do LIP), citado na base legal. */
  seiCheadv?: string;
  naoConformes: string[];
  naoConformesAgrupados?: { texto: string; grupo: string; ordem: number }[];
  observacoes?: string;
  observacoesPorAba?: Record<string, string>;
  analises: { numero: number; data: string; ultima?: boolean }[];
  assinante?: Assinante;
  analista?: string;
  crea?: string;
  setor?: string;
  data?: string;
  /** Padrão de despacho escolhido: substitui a montagem pelo checklist. */
  corpoPersonalizado?: string;
};

export type ResultadoDespachoAceite = {
  buffer: Buffer;
  /** Ids que entraram no documento sem texto legível — nunca em silêncio. */
  idsSemTexto: string[];
};

export async function gerarDespachoAceiteSei(dados: DadosDespachoAceite): Promise<ResultadoDespachoAceite> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: dados.setor || "SEFIC / DIRAAP / GERAED",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataAssinatura = fmtDataLonga(dados.data, true);
  const ano = new Date().getFullYear().toString();
  const children: Paragraph[] = [];
  let idsSemTexto: string[] = [];

  children.push(vazio(160));
  children.push(p([txt("SEI:  "), txt(dados.processo, { bold: true }), txt("    |    Processo Físico:  "), txt(dados.numeroProcessoFisico || "—", { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  /* Assunto vem por PARÂMETRO, de `assuntos.nome_documento`. Cravar o texto
   * aqui foi exatamente o defeito que este arquivo corrige. */
  children.push(p([txt("Assunto:  "), txt((dados.assunto || "ALVARÁ DE ACEITE").toUpperCase(), { bold: true })], { align: AlignmentType.LEFT, after: 180 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`DESPACHO Nº   ${dados.numeroDespacho || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(new Paragraph({ spacing: { before: 0, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }, children: [txt("AO INTERESSADO/AUTOR", { bold: true })] }));
  children.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [txt("OBSERVAÇÕES:", { bold: true })] }));

  /* Base legal do ACEITE. Texto herdado do `gerarDespachoAceite` que já
   * existia em `lib/geradores.ts` e nunca era chamado — não inventado aqui.
   * PENDENTE DE REVISÃO DO FÁBIO: é genérico demais para um ato oficial. O
   * Aceite tem base própria: LC nº 314/2018, TÍTULO II, Art. 7º, e IN nº 7,
   * de 10/07/2024, Anexo I, item 9. Não saem daqui, de propósito, o Art. 1º
   * § 1º nem a nota da LC nº 368/2023: são do Título I (Regularização). */
  /* DECRETO ATUALIZADO — 17/09/2026.
   * Estava "Decreto Nº 2559, DE 13 DE DEZEMBRO DE 2018" e a "SECRETARIA
   * MUNICIPAL DE PLANEJAMENTO URBANO E HABITAÇÃO". O modelo de despacho da
   * chefia ("checkist slot2 claud.xlsm", linhas 25-26) já cita o
   * DECRETO 2531/2024 e a SEPLANH — o nosso citava decreto revogado. Fábio,
   * ao ser avisado: "cita o mais novo né".
   *
   * Texto reproduzido LITERAL do modelo, inclusive maiúsculas. O nº SEI do
   * CHEADV entra quando existe: no modelo ele é anexado por fórmula
   * (`=CONCATENATE(...,", conforme SEI",...)`). Não uso a chave `despacho`
   * para isso porque ela guarda o CORPO do despacho em prosa, não o número. */
  /* Base legal ATUALIZADA — 17/09/2026, Fábio confirmou "SIM" ao usar o texto
   * literal do modelo de despacho da chefia ("checkist slot2 claud.xlsm",
   * linhas 10-12 e 25-26), substituindo a frase genérica anterior
   * ("com base na legislação municipal vigente..."), herdada do
   * `gerarDespachoAceite` abandonado.
   *
   * "...institui o Alvará de Regularização..." não é erro de slot: é a
   * EMENTA OFICIAL da LC nº 314/2018 (ela se chama assim mesmo cobrindo os
   * dois títulos — Regularização e Aceite), e está assim no despacho de
   * Aceite da própria chefia. */
  const trechoSei = dados.seiCheadv ? `, CONFORME SEI ${dados.seiCheadv}` : "";
  [
    "Análise de acordo com a LEI COMPLEMENTAR Nº 314, de 05/11/2018 que institui o Alvará de Regularização e INSTRUÇÃO NORMATIVA nº 04, de 16/05/2024 que regulamenta a LC nº 314;",
    "Texto da LC n°314/2018 alterado na LC n°368/2023;",
    `DE ACORDO COM O DECRETO 2531/2024, A ANÁLISE DOCUMENTAL FOI REALIZADA PELA CHEADV – CHEFIA DA ADVOCACIA SETORIAL DA SEFIC${trechoSei};`,
  ].forEach((b) => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(b)] }));
  });

  dados.analises.forEach((a, idx) => {
    const label = a.ultima
      ? `${a.numero}ª ANÁLISE (ÚLTIMA*) :       ${a.data}   – LIBERAÇÃO DE TAXA OU INDEFERIMENTO;`
      : `${a.numero}ª ANÁLISE:       ${a.data}`;
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 40, after: 40 }, indent: { left: 900 }, keepLines: true, keepNext: idx < dados.analises.length - 1, children: [txt(label, { bold: a.ultima })] }));
  });
  if (dados.analises.some((a) => a.ultima)) {
    children.push(new Paragraph({ spacing: { before: 80, after: 160 }, indent: { left: 440 }, children: [txt("Observação: *Caso nesta etapa não seja liberada a taxa, o processo/projeto será indeferido.", { size: 18, italics: true })] }));
  }
  children.push(vazio(120));

  const temItensChecklist =
    (dados.naoConformesAgrupados && dados.naoConformesAgrupados.length > 0) ||
    (dados.naoConformes && dados.naoConformes.length > 0);

  if (dados.corpoPersonalizado) {
    // Padrão de despacho: substitui inteiramente a montagem pelo checklist.
    children.push(p([txt("PENDÊNCIAS:", { bold: true, underline: true })], { after: 80 }));
    dados.corpoPersonalizado.split("\n").filter((l) => l.trim()).forEach((linha) => {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 80, line: 260 }, children: [txt(linha)] }));
    });
  } else {
    if (temItensChecklist) {
      children.push(p([txt("PENDÊNCIAS:", { bold: true, underline: true })], { after: 80 }));
    }
    if (dados.naoConformesAgrupados && dados.naoConformesAgrupados.length > 0) {
      gerarItensAgrupados(dados.naoConformesAgrupados).forEach((item) => children.push(item));
    } else if (dados.naoConformes?.length) {
      const r = gerarItensPorId(dados.naoConformes);
      r.paragrafos.forEach((item) => children.push(item));
      idsSemTexto = r.idsSemTexto;
    }
  }

  if (dados.observacoesPorAba && Object.keys(dados.observacoesPorAba).length > 0) {
    children.push(vazio(100));
    children.push(p([txt("Observações por seção:", { bold: true, underline: {} })]));
    Object.entries(dados.observacoesPorAba).forEach(([aba, obs]) => {
      if (obs && obs.trim()) children.push(p([txt(`${aba}: `, { bold: true }), txt(obs)]));
    });
  }

  children.push(vazio(160));
  children.push(new Paragraph({ spacing: { before: 200, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, children: [txt("CONSIDERAÇÕES FINAIS", { bold: true, underline: true })] }));
  [
    "AS CÓPIAS DE ARQUIVO NÃO PODEM SER RETIRADAS DO PROCESSO;",
    "É FACULTADO AO ANALISTA/REVISOR O DIREITO DE SOLICITAR DOCUMENTAÇÃO, CORREÇÕES E ADEQUAÇÕES SEMPRE QUE NECESSÁRIO, ANTES DO DEFERIMENTO DO PROCESSO, CONFORME LEGISLAÇÃO MUNICIPAL VIGENTE.",
  ].forEach((item) => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(item)] }));
  });
  children.push(vazio(300));
  blocoAssinaturaAnalista(assinante).forEach((par) => children.push(par));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 0 }, children: [txt(dataAssinatura)] }));

  const doc = montarDocumento(children, "Despacho Aceite", logoData);
  return { buffer: await Packer.toBuffer(doc) as Buffer, idsSemTexto };
}
