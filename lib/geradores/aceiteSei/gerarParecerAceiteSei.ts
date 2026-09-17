// ============================================================
// lib/geradores/aceiteSei/gerarParecerAceiteSei.ts
// URBIS — INDEFERIMENTO e ARQUIVAMENTO do ALVARÁ DE ACEITE (Slot 2).
//
// Os dois saem da série de PARECER (não da de despacho) e por isso
// moram no mesmo arquivo.
//
// ISOLAMENTO DE SLOT (CLAUDE.md): reprodução POR LEITURA de
// `gerarIndeferimento` e `gerarArquivamento` de `lib/geradores.ts`.
// Nada é importado de lá.
//
// ── CONTEÚDO IDÊNTICO AO SLOT 1, POR DETERMINAÇÃO ──
//
// Fábio, 17/09/2026: "indeferimento e arquivamento é igual ao slot 1".
// Então aqui NÃO há correção de texto nenhuma: é a mesma redação, palavra
// por palavra. O ganho é só o isolamento — se um dia o Aceite divergir,
// diverge sem tocar na Regularização.
//
// Diferente do despacho, estes dois já recebiam `assunto` por parâmetro
// (de `assuntos.nome_documento`), então nunca carregaram o nome do ato
// errado no cabeçalho como o despacho carregava.
//
// ⚠ UMA OBSERVAÇÃO PARA O FÁBIO, reproduzida de propósito sem mexer:
// no corpo do indeferimento a expressão "APROVAÇÃO DE PROJETO" está
// CRAVADA — "Versam os autos sobre a solicitação de APROVAÇÃO DE
// PROJETO" — enquanto só a linha "Assunto:" usa o parâmetro. Num Aceite
// o corpo diz, portanto, que se trata de aprovação de projeto. Pode ser
// a moldura genérica do Decreto nº 2.559/2018 (que fala de "análise e
// aprovação de projetos arquitetônicos") e estar correto; pode ser
// engano herdado. Não alterei: redação de ato oficial não se muda por
// conta própria — mesma lição das células M46/M47 do laudo.
// ============================================================

import {
  Paragraph, Packer, AlignmentType, ImageRun,
  type Assinante,
  getLogoData, txt, p, vazio, blocoAssinaturaAnalista, blocoLinhaEmBranco,
  rodapeDataSetor, fmtDataLonga, dimensoesImagem, montarDocumento,
} from "./docxBase";

export type { Assinante };

const SETOR_RODAPE = "SEFIC / DIRAAP / GERAED";

/** Assinante padrão quando o processo não tem analista cadastrado. */
function assinantePadrao(dados: { assinante?: Assinante; analista?: string; crea?: string }): Assinante {
  return dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: "Análise e Licenciamento de Edificações",
    registro: dados.crea || "CREA 11716/D-GO",
  };
}

/** Assinatura do analista + gerente + diretor (linha em branco quando não cadastrados). */
function blocoAssinaturas(
  assinante: Assinante,
  gerente?: Assinante,
  diretora?: Assinante,
): Paragraph[] {
  const out: Paragraph[] = [];
  blocoAssinaturaAnalista(assinante).forEach((par) => out.push(par));
  (gerente ? blocoAssinaturaAnalista(gerente) : blocoLinhaEmBranco("Gerente")).forEach((par) => out.push(par));
  (diretora ? blocoAssinaturaAnalista(diretora) : blocoLinhaEmBranco("Diretor")).forEach((par) => out.push(par));
  return out;
}

export type DadosIndeferimentoAceite = {
  processo: string;
  interessado: string;
  analises: { numero: number; data: string; despacho?: string }[];
  naoConformes?: string[];
  observacoes?: string;
  endereco?: string;
  analista?: string;
  crea?: string;
  setor?: string;
  assinante?: Assinante;
  gerente?: Assinante;
  diretora?: Assinante;
  numeroParecer?: string;
  /** Vem de `assuntos.nome_documento` — "Alvará de Aceite". */
  assunto?: string;
  data?: string;
  fotos?: { base64: string; tipo: "png" | "jpg"; legenda: string }[];
};

export async function gerarIndeferimentoAceiteSei(dados: DadosIndeferimentoAceite): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante = assinantePadrao(dados);
  const dataGoiania = fmtDataLonga(dados.data);
  const ano = new Date().getFullYear().toString();
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt(dados.assunto || "APROVAÇÃO DE PROJETO", { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`PARECER Nº   ${dados.numeroParecer || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt("AO INTERESSADO/AUTOR")], { align: AlignmentType.LEFT, after: 120 }));
  // "APROVAÇÃO DE PROJETO" cravado — ver o ⚠ no cabeçalho deste arquivo.
  children.push(p([txt("Versam os autos sobre a solicitação de "), txt("APROVAÇÃO DE PROJETO", { bold: true }), txt(`, para o imóvel situado à `), txt(dados.endereco || dados.processo, { bold: true }), txt(". O processo obteve as seguintes análises:")], { after: 100 }));

  dados.analises.filter((a) => a.data && a.data !== "NP").forEach((a, i, arr) => {
    const ordinal = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"][a.numero - 1] || `${a.numero}ª`;
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT, spacing: { before: 0, after: 50, line: 240 },
      indent: { left: 440, hanging: 280 }, keepLines: true, keepNext: i < arr.length - 1,
      children: [txt("• ", { bold: true }), txt(`${ordinal} análise: `, { bold: true }), txt(`realizada em ${a.data}`), txt(a.despacho ? `, por meio do Despacho nº ${a.despacho}.` : ".")],
    }));
  });
  children.push(vazio(140));
  children.push(p([txt("O Decreto n° 2.559, de 13 de dezembro de 2018, que revogou o Decreto nº 546, de 27 de fevereiro de 2015, define procedimentos administrativos para análise e aprovação de projetos arquitetônicos e licença no âmbito municipal. Por não cumprimento ao exigido nos despachos anteriormente listados, essa Diretoria de Análise e Aprovação de Projetos "), txt("INDEFERE", { bold: true }), txt(" o prosseguimento dos autos, nos termos do Artigo 8º, §4º, Inciso II do Decreto nº. 2.559/2018.")], { after: 120 }));

  if (dados.naoConformes?.length) {
    children.push(vazio(80));
    children.push(p([txt("Motivos do indeferimento:", { bold: true })], { after: 60 }));
    dados.naoConformes.forEach((motivo, idx) => {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 60, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt(`${idx + 1}.  ${motivo}`, { size: 20 })] }));
    });
    children.push(vazio(80));
  }
  if (dados.observacoes) {
    children.push(p([txt("Observações: ", { bold: true }), txt(dados.observacoes)], { after: 100 }));
  }
  if (dados.fotos?.length) {
    children.push(vazio(80));
    children.push(p([txt("Documentação fotográfica anexa:", { bold: true })], { after: 100 }));
    for (const foto of dados.fotos) {
      const buffer = Buffer.from(foto.base64, "base64");
      const { width, height } = dimensoesImagem(buffer, foto.tipo);
      const larguraMax = 420;
      const escala = width > larguraMax ? larguraMax / width : 1;
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 40 },
        children: [new ImageRun({ data: buffer, transformation: { width: Math.round(width * escala), height: Math.round(height * escala) }, type: foto.tipo })],
      }));
      if (foto.legenda) {
        children.push(p([txt(foto.legenda, { italics: true, size: 18 })], { align: AlignmentType.CENTER, after: 160 }));
      }
    }
  }
  children.push(p([txt("Informamos que o interessado/autor poderá apresentar recurso ou justificativa em até "), txt("15 (quinze) dias", { bold: true }), txt(", contados a partir da publicação deste parecer, conforme previsto no Artigo 9º do Decreto nº. 2.559/2018. Em caso de recurso julgado improcedente, deverá ser solicitada a abertura de novo processo.")], { after: 160 }));
  children.push(p([txt("Sem nada mais no momento.")], { align: AlignmentType.LEFT, after: 60 }));
  children.push(vazio(200));
  blocoAssinaturas(assinante, dados.gerente, dados.diretora).forEach((par) => children.push(par));
  children.push(vazio(120));
  children.push(rodapeDataSetor(dataGoiania, SETOR_RODAPE) as any);

  return await Packer.toBuffer(montarDocumento(children, "Indeferimento", logoData)) as Buffer;
}

export type DadosArquivamentoAceite = {
  processo: string;
  interessado: string;
  analista?: string;
  crea?: string;
  assinante?: Assinante;
  gerente?: Assinante;
  diretora?: Assinante;
  numeroParecer?: string;
  assunto?: string;
  data?: string;
};

export async function gerarArquivamentoAceiteSei(dados: DadosArquivamentoAceite): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante = assinantePadrao(dados);
  const dataGoiania = fmtDataLonga(dados.data);
  const ano = new Date().getFullYear().toString();
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt(dados.assunto || "APROVAÇÃO DE PROJETO", { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`PARECER Nº   ${dados.numeroParecer || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt("AO ARQUIVO")], { align: AlignmentType.LEFT, after: 160 }));
  children.push(p([txt("Conforme o Decreto n° 2.559, de 13 de dezembro de 2018, que revogou o Decreto nº. 546, de 27 de fevereiro de 2015, definem procedimentos administrativos para análise e aprovação de projetos arquitetônicos e licença no âmbito municipal, e por não cumprimento ao exigido nos despachos anteriormente listados, esta Diretoria comunica o "), txt("ARQUIVAMENTO DO PROCESSO", { bold: true }), txt(", nos termos do Art. 4, Inciso 4.5 e seguintes do Decreto citado, tendo sido o pedido de reconsideração "), txt("INDEFERIDO", { bold: true }), txt(" pela instância competente e exigirá para expectativa de futura aprovação a abertura de "), txt("NOVO PROCESSO", { bold: true }), txt(", mediante o pagamento das respectivas taxas.")], { after: 240 }));
  children.push(p([txt("Sem nada mais no momento.")], { align: AlignmentType.LEFT, after: 60 }));
  children.push(vazio(200));
  blocoAssinaturas(assinante, dados.gerente, dados.diretora).forEach((par) => children.push(par));
  children.push(vazio(120));
  children.push(rodapeDataSetor(dataGoiania, SETOR_RODAPE) as any);

  return await Packer.toBuffer(montarDocumento(children, "Arquivamento", logoData)) as Buffer;
}
