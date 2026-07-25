// ============================================================
// Filtros rápidos do MAC.
//
// Cada filtro é um atalho do analista: "não é posto de combustível",
// "não tem marquise". Clicou, os grupos daquele filtro viram
// "não se aplica" de uma vez.
//
// Só faz sentido em assunto com muitos grupos — a Aprovação de Projeto
// tem 48, e a maioria não se aplica a um projeto qualquer. Por isso o
// mapa é por slug de assunto: quem não estiver aqui não mostra filtro.
//
// Os nomes dos grupos são EXATOS, como estão em `mac_checklist_itens.grupo`.
// Se um grupo for renomeado no admin, o filtro simplesmente deixa de
// encontrá-lo — não quebra nada, mas para de agir. A tela mostra quantos
// itens serão marcados antes de confirmar, então um mapa errado aparece
// para o analista antes de acontecer.
// ============================================================

export type FiltroMac = {
  /** Texto do botão. */
  nome: string;
  /** Grupos que viram "não se aplica" quando o filtro é acionado. */
  grupos: string[];
};

export const FILTROS_POR_ASSUNTO: Record<string, FiltroMac[]> = {
  slot_05: [
    {
      // É aprovação nova — não é modificação de projeto já aprovado.
      nome: "APRO DE PROJ",
      grupos: [
        "PROCESSOS MODIFICAÇÃO SEM ACRÉSCIMO",
        "PROCESSOS MODIFICAÇÃO COM ACRÉSCIMO",
      ],
    },
    {
      // Pendente: o usuário vai definir os grupos com a planilha aberta.
      nome: "MEDIO PORTE",
      grupos: [],
    },
    {
      // Uso comercial: cai tudo que é exclusivo de uso habitacional.
      nome: "COMERCIAL",
      grupos: [
        "VAGAS PARA USO HABITACIONAL",
        "HABITAÇÃO SERIADA",
        "HABITAÇÃO SERIADA E COLETIVA NÃO INTEGRANTES DE LOTEAMENTO",
        "QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018",
        "47.QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018 - APRESENTAR NO PROJETO",
      ],
    },
    {
      nome: "S/ ONEROSA",
      grupos: [
        "COEFICIENTE DE APROVEITAMENTO BÁSICO NÃO ONEROSO E ONEROSO Art. 242 LC N°349 /2022) E TDC",
      ],
    },
    {
      nome: "NÃO É POSTO",
      grupos: [
        "POSTO DE COMBUSTIVEL – LC nº364/2023 – Art. 120",
        "Rebaixo para atividade: Posto de COMERCIO E COMBUSTÍVEL E SERVIÇOS AUTOMOTIVOS: §10º",
      ],
    },
    {
      nome: "NÃO É PENSÃO",
      grupos: ["PENSAO, PENSIONATO E CASA DE ESTUDANTES – LC nº364/2023 – Art. 121"],
    },
    { nome: "S/ CORREDOR", grupos: ["CORREDOR VIÁRIO"] },
    {
      nome: "S/ CARGA E DES",
      grupos: [
        "EXIGENCIA DE CARGA E DESCARGA – LEI DE ATIVI N°10.8450 DE 04/11/22 e INSTRUÇÃO NORMATIVA Nº8 01/10/2023",
        "SOLUÇÃO ALTERNATIVA PARA CARGA E DESCARGA EM EDIFICAÇÃO REGULAR EXISTENTE – Art. 17 LC n°10.845/2022)",
      ],
    },
    { nome: "S/ SUBSOLO", grupos: ["SUBSOLO AFLORADO (RECUO E ALTURA)"] },
    { nome: "S/ EIT E EIV", grupos: ["EIT / EIV"] },
    { nome: "S/ EMB E DESE", grupos: ["EMBARQUE E DESEMBARQUE"] },
    { nome: "S/ BAIA DE DES", grupos: ["BAIA DE DESACELERAÇÃO DE VELOCIDADE"] },
    { nome: "S/ MARQUISE", grupos: ["MARQUISES E COBERTURAS"] },
  ],
};

export function filtrosDoAssunto(slug: string | null | undefined): FiltroMac[] {
  return FILTROS_POR_ASSUNTO[slug ?? ""] ?? [];
}
