/**
 * lib/mhdDependencias.ts — matriz DOCUMENTO → CAMPOS → ANÁLISES do MHD.
 *
 * Responde a pergunta que faz a leitura incremental valer a pena:
 * *chegou uma ART nova — o que exatamente muda por causa disso?*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA CORREÇÃO IMPORTANTE DE DESENHO
 *
 * O desenho original dizia "refazer apenas análises dependentes" para economizar.
 * Aqui a matriz existe, mas NÃO serve para pular cálculo — serve para EXPLICAR.
 *
 * Motivo: as conferências são aritmética local, custo zero e milissegundos. O que
 * custa dinheiro é mandar página para a IA, e isso a memória por hash já resolve.
 * Pular conferência para economizar o que já é gratuito só cria uma classe de bug
 * caríssima: a inconsistência que não foi recalculada porque alguém errou uma
 * linha da matriz. Então:
 *
 *   · EXTRAÇÃO  → incremental de verdade. Documento com hash conhecido não é
 *                 relido, e nunca volta para a IA.
 *   · CONFERÊNCIA → roda SEMPRE inteira, sobre o conhecimento guardado.
 *   · A MATRIZ  → diz ao analista o que mudou por causa de quê, e destaca na
 *                 tela as análises afetadas pela correção que acabou de chegar.
 *
 * O relatório continua mostrando "reanálises executadas / dispensadas" — só que
 * "dispensada" passa a significar "não foi afetada por esta correção", que é uma
 * informação honesta, em vez de "não calculei e torço para estar certo".
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Campos do LIP que cada papel de documento alimenta. */
export const CAMPOS_POR_PAPEL: Record<string, string[]> = {
  projeto: [
    "areaTerreno", "areaTotal", "pav", "nome_responsavel_arq", "cau",
    "nome_responsavel_eng", "crea", "nDeCaixasDeCaptacao", "volumeDaCaixaDeRecarga",
    "areaPermeavelProjetada", "areaImpermeabilizada", "volumeExigidoDaCaixa",
    "opcao1TotalExigidoAreaTerreno", "opcao2TotalExigidoAreaTerreno",
    "opcao2TotalExigidoAreaTerreno2", "opcao3TotalExigidoAreaTerreno",
    "alturaDaEdificacao", "acessoVertical", "dimensoesDoLoteConferemComA",
  ],
  uso_solo: [
    "logradouro", "quadra", "lote", "bairro", "iptu", "usoDoSoloN",
    "unidadeTerritorialDoUsoDoSolo", "usoDoSoloEParaAprovacao", "tipoDeVia1",
    "anexouCertidaoDeCorredorViario", "atendeOPorteAdmitido", "cnae",
    "quantasFrentes", "esquina", "aabEApac190", "atividadeEconomica",
    "alertasDoUsoDoSolo",
  ],
  art_projeto: ["numeroDeArtProjeto", "anexouArtRrtProjeto", "artDeProjetoAtendeAAcessibilidade", "areaNaArtDeProjeto"],
  art_execucao: ["numeroDeArtExecucao", "anexouArtRrtExecucao", "aArtDeExecucaoAtendeA", "areaNaArtDeExecucao"],
  art_caixa: ["numeroDeArtCaixa", "anexouArtRrtCaixa", "volumeNaArtDeCaixa"],
  certidao_matricula: ["certidao", "dimensoesDoLoteConferemComA"],
  requerimento: ["proprietario", "comercio"],
  declaracao: [],
  documentos_pessoais: [],
  projeto_cad: [],
};

/**
 * De quais papéis cada conferência depende. A chave é um trecho do nome da
 * conferência, para não amarrar em string exata (o texto muda; o vínculo não).
 */
export const PAPEIS_POR_CONFERENCIA: { casa: RegExp; papeis: string[] }[] = [
  { casa: /cobertura vegetal fecha/i,            papeis: ["projeto"] },
  { casa: /ART de projeto confere/i,             papeis: ["art_projeto", "projeto"] },
  { casa: /ART de execução confere/i,            papeis: ["art_execucao", "projeto"] },
  { casa: /ART de caixa confere/i,               papeis: ["art_caixa", "projeto"] },
  { casa: /requerimento confere/i,               papeis: ["requerimento", "projeto"] },
  { casa: /IPTU é o mesmo/i,                     papeis: ["uso_solo", "projeto", "requerimento"] },
  { casa: /cita o Uso do Solo correto/i,         papeis: ["projeto", "uso_solo"] },
  { casa: /carimbo segue o modelo/i,             papeis: ["projeto"] },
  { casa: /caixa de recarga confere/i,           papeis: ["projeto", "uso_solo"] },
  { casa: /paisagístico atende/i,                papeis: ["projeto", "uso_solo"] },
  { casa: /aproveitamento dentro do máximo/i,    papeis: ["projeto", "uso_solo"] },
  { casa: /Vagas de estacionamento/i,            papeis: ["projeto", "uso_solo"] },
  { casa: /datas dos documentos são coerentes/i, papeis: ["projeto", "art_projeto"] },
  { casa: /Validade do Uso do Solo/i,            papeis: ["uso_solo"] },
];

/** Rótulo humano de cada papel — usado na tela do MHD e no resumo da leitura. */
export const ROTULO_PAPEL: Record<string, string> = {
  projeto: "Projeto Arquitetônico",
  projeto_cad: "Projeto em DWG/DXF",
  uso_solo: "Uso do Solo",
  art_projeto: "ART de Projeto",
  art_execucao: "ART de Execução",
  art_caixa: "ART de Caixa de Recarga",
  art_indefinida: "ART (atividade ilegível)",
  certidao_matricula: "Certidão de Matrícula",
  requerimento: "Requerimento",
  declaracao: "Declaração de Responsabilidade",
  documentos_pessoais: "Documentos da Pessoa Física/Jurídica",
  corredor_viario: "Certidão de Corredor Viário",
  outorga_onerosa: "Outorga Onerosa",
  decea_comaer: "Manifestação DECEA/COMAER",
  tdc: "Transferência do Direito de Construir",
  smm: "Documento de Mobilidade / Tráfego",
  demolicao: "Documento de Demolição",
  memorial: "Memorial",
  comprovante_taxa: "Comprovante de Taxa",
  despacho_urbis: "Despacho do URBIS",
  outros: "Não identificado",
};

export const rotuloDe = (papel: string) => ROTULO_PAPEL[papel] ?? papel;

/** Conferências afetadas por um conjunto de papéis que mudaram nesta rodada. */
export function conferenciasAfetadas(papeisAlterados: string[]): (nome: string) => boolean {
  const set = new Set(papeisAlterados);
  return (nome: string) => {
    const regra = PAPEIS_POR_CONFERENCIA.find((r) => r.casa.test(nome));
    if (!regra) return true; // sem regra declarada, trata como afetada — nunca esconder
    return regra.papeis.some((p) => set.has(p));
  };
}

/** Campos do LIP que podem ter mudado, dados os papéis alterados. */
export function camposAfetados(papeisAlterados: string[]): Set<string> {
  const out = new Set<string>();
  for (const p of papeisAlterados) for (const c of CAMPOS_POR_PAPEL[p] ?? []) out.add(c);
  return out;
}
