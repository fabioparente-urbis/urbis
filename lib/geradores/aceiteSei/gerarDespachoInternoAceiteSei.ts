// ============================================================
// lib/geradores/aceiteSei/gerarDespachoInternoAceiteSei.ts
// URBIS — DESPACHO INTERNO do ALVARÁ DE ACEITE (Slot 2).
//
// Despacho de tramitação entre setores (não vai ao interessado): o
// analista escolhe o destino e escreve o corpo.
//
// ISOLAMENTO DE SLOT (CLAUDE.md): reprodução POR LEITURA de
// `gerarDespachoInterno` de `lib/geradores.ts`. Nada importado de lá.
//
// CONTEÚDO IDÊNTICO AO SLOT 1, por determinação do Fábio em
// 17/09/2026 ("despacho interno tb"). Nenhuma correção de texto: o
// ganho é só o isolamento. O Slot 5 já tinha o seu próprio desde
// sempre (`app/api/mac/slot-05/despacho-interno`); o Slot 2 dividia a
// rota `app/api/despacho-interno` com o Slot 1 até hoje.
//
// Observação de fidelidade: o rodapé deste documento é "SEFIC / DIRAAP"
// (sem a gerência), diferente do indeferimento e do arquivamento, que
// levam "SEFIC / DIRAAP / GERAED". Reproduzido como está no original.
// ============================================================

import {
  Paragraph, Packer, AlignmentType,
  type Assinante,
  getLogoData, txt, p, vazio, blocoAssinaturaAnalista,
  rodapeDataSetor, montarDocumento,
} from "./docxBase";

export type DadosDespachoInternoAceite = {
  processo: string;
  interessado: string;
  numeroDespacho: string;
  /** Data já formatada pelo chamador (o original também recebe pronta). */
  data: string;
  /** Texto do assunto no cabeçalho — nome legível do slot. */
  tipoProcesso: string;
  destino: string;
  corpo: string;
  assinante?: Assinante;
};

export async function gerarDespachoInternoAceiteSei(dados: DadosDespachoInternoAceite): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || { nome: "Analista", cargo: "Analista de Obras e Urbanismo" };
  const ano = new Date().getFullYear().toString();
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt(dados.tipoProcesso, { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`DESPACHO Nº ${dados.numeroDespacho} / ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt(`À ${dados.destino}`)], { align: AlignmentType.LEFT, after: 160 }));
  dados.corpo.split("\n").forEach((linha: string) => {
    children.push(p([txt(linha || " ")], { after: 80 }));
  });
  children.push(vazio(200));
  blocoAssinaturaAnalista(assinante).forEach((par) => children.push(par));
  children.push(vazio(120));
  children.push(rodapeDataSetor(dados.data, "SEFIC / DIRAAP") as any);

  return await Packer.toBuffer(montarDocumento(children, "Despacho Interno", logoData)) as Buffer;
}
