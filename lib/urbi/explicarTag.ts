/**
 * O que o URBI fala quando o analista clica numa tag da Pilha.
 *
 * Pedido do Fábio em 08/09/2026: "analise todas as tags das pilhas, elas têm que ser
 * padronizadas, ao clicar nelas o URBI tem que explicar" e "coloca o URBI como quem explica tudo
 * ao analista". Antes disso, só a tag de esforço era clicável — as outras eram enfeite, e o
 * significado de cada uma vivia espalhado em `title=` que ninguém lê.
 *
 * REGRA DESTE ARQUIVO, igual a lib/bdi/vigia.ts e lib/bdi/situacao.ts: ZERO IA, ZERO SERVIÇO PAGO.
 * Texto determinístico montado sobre fato que já veio pronto da API. Clicar numa tag mil vezes
 * custa zero.
 *
 * TOM (pedido dele, mesma sessão): "mais claro, mais direto e informal, falar menos e dizer
 * mais". Cada explicação responde três coisas, nessa ordem, sem enrolação:
 *   1. o que essa tag quer dizer,
 *   2. de onde saiu esse fato (pra ele poder conferir e discordar),
 *   3. o que dá pra fazer agora.
 */

export type FamiliaTag = "documento" | "tipo" | "lip" | "mac" | "esforco";

export type TipoDocumentoTag =
  | "despacho" | "despacho_interno" | "indeferimento" | "arquivamento" | "laudo";

export type EntradaExplicacao =
  | {
      familia: "documento";
      tipo: TipoDocumentoTag;
      numero?: string | null;
      numeroAnalise?: number | null;
      data?: string | null;
      /** true quando o número existe em mdp_registros — muda o "o que fazer agora". */
      noMdp?: boolean;
    }
  | { familia: "tipo"; valor: string }
  | { familia: "lip"; valor: string; motivo?: string | null; marcadoManualmente?: boolean }
  | { familia: "mac"; valor: string; motivo?: string | null; diasAguardando?: number | null }
  | {
      familia: "esforco";
      valor: string;
      pendencias?: number | null;
      acaoBloqueante?: string | null;
      motivoBloqueante?: string | null;
    };

/** Junta as linhas descartando as vazias — evita parágrafo em branco no meio da fala. */
function montar(linhas: (string | null | undefined)[]): string {
  return linhas.filter((l) => l != null && l !== "").join("\n");
}

// ------------------------------------------------------------------ documento

const NOME_DOCUMENTO: Record<TipoDocumentoTag, string> = {
  despacho: "Despacho",
  despacho_interno: "Despacho Interno",
  indeferimento: "Indeferimento",
  arquivamento: "Arquivamento",
  laudo: "Laudo",
};

/**
 * O que cada documento significa PRA QUEM ESTÁ COM O PROCESSO agora — não a definição
 * administrativa formal, que o analista já sabe de cor.
 */
const SIGNIFICADO_DOCUMENTO: Record<TipoDocumentoTag, string> = {
  despacho: "Saiu exigência pro interessado. A bola está com ele, não com você.",
  despacho_interno: "Foi pedido interno — outro setor que tem que responder, não o interessado.",
  indeferimento: "O processo foi negado. Não tem análise nova a fazer aqui, salvo recurso.",
  arquivamento: "O processo foi arquivado. Encerrado, salvo se for reaberto.",
  laudo: "O laudo saiu — a análise que gerou ele está concluída.",
};

function explicarDocumento(e: Extract<EntradaExplicacao, { familia: "documento" }>): string {
  const nome = NOME_DOCUMENTO[e.tipo];
  const comNumero = e.numero ? `${nome} nº ${e.numero}` : nome;
  const daAnalise = e.numeroAnalise ? ` da análise ${e.numeroAnalise}` : "";
  const quando = e.data ? `, em ${e.data}` : "";

  return montar([
    `${comNumero}${daAnalise}${quando}.`,
    SIGNIFICADO_DOCUMENTO[e.tipo],
    "",
    e.numero && e.noMdp
      ? "Esse documento está no MDP — clique na tag de novo pra abrir ele lá."
      : e.numero
        ? `Esse número não está no MDP. Ou saiu antes do MDP existir, ou foi emitido fora do URBIS — o registro do processo (a tag) é a única prova dele aqui.`
        : "Essa marcação não tem número de documento junto, então não dá pra abrir no MDP.",
    "",
    "Fonte: a marcação gravada no próprio processo quando o documento foi emitido.",
  ]);
}

// ----------------------------------------------------------------------- tipo

const EXPLICACAO_TIPO: Record<string, string> = {
  regularizacao: montar([
    "Regularização SEI — obra já construída, pedindo pra ser regularizada.",
    "Aqui vale o marco temporal (LC 314/2018) e precisa do Uso do Solo.",
  ]),
  aceite_sei: montar([
    "Aceite SEI — obra que já tinha aprovação e está voltando pra ser aceita.",
    "Tem marco temporal próprio, e Uso do Solo não se aplica.",
  ]),
  aprovacao_pp: "Aprovação de Projeto de pequeno porte — projeto novo, ainda não construído.",
  aprovacao_mp: "Aprovação de Projeto de médio porte — projeto novo, ainda não construído.",
  slot_05: "Aprovação de Projeto — projeto novo, ainda não construído.",
};

function explicarTipo(valor: string): string {
  return montar([
    EXPLICACAO_TIPO[valor] ?? `Tipo de processo: ${valor}. Não tenho explicação cadastrada pra esse tipo ainda.`,
    "",
    "É o tipo que decide qual checklist e quais documentos o processo precisa.",
    "Fonte: o tipo escolhido quando o processo foi cadastrado.",
  ]);
}

// ------------------------------------------------------------------------ LIP

function explicarLip(e: Extract<EntradaExplicacao, { familia: "lip" }>): string {
  const cabeca =
    e.valor === "Completo"
      ? "LIP completo — todo campo da ficha tem valor."
      : e.valor === "Incompleto"
        ? "LIP incompleto — ainda falta campo pra preencher."
        : e.valor === "Não iniciado"
          ? "LIP não iniciado — nenhum campo da ficha foi preenchido ainda."
          : `LIP: ${e.valor}.`;

  const oQueFazer =
    e.valor === "Completo"
      ? "Dá pra começar o MAC."
      : e.valor === "Incompleto"
        ? "Abra o LIP e veja os campos em laranja — enquanto faltar campo, o MAC vai trabalhar com base furada."
        : e.valor === "Não iniciado"
          ? "O primeiro passo é subir o PDF do SEI no LIP pra ele preencher a ficha."
          : "";

  return montar([
    cabeca,
    e.marcadoManualmente
      ? "Você marcou esse LIP como \"não concluído\" na mão — por isso ele conta como incompleto mesmo com os campos cheios."
      : null,
    oQueFazer ? "" : null,
    oQueFazer,
    "",
    e.motivo ? `Fonte: ${e.motivo}` : "Fonte: contagem de campos preenchidos da ficha do LIP.",
  ]);
}

// ------------------------------------------------------------------------ MAC

function explicarMac(e: Extract<EntradaExplicacao, { familia: "mac" }>): string {
  const dias = typeof e.diasAguardando === "number" ? Math.floor(e.diasAguardando) : null;

  if (e.valor === "Aguardando retorno do interessado") {
    return montar([
      dias != null
        ? `Aguardando retorno há ${dias} dia${dias === 1 ? "" : "s"}.`
        : "Aguardando retorno do interessado.",
      "A última análise fechou com documento emitido e nenhuma nova foi aberta — a bola está com o interessado.",
      dias != null && dias >= 180
        ? "\n⛔ Passou de 180 dias. Nesse ponto não dá pra emitir documento novo — confira as datas exatas no SEI antes de qualquer coisa."
        : dias != null && dias >= 175
          ? "\n⚠ Está chegando nos 180 dias. Vale conferir as datas exatas no SEI, porque URBIS e SEI podem ter uma diferença de dias."
          : null,
      "",
      e.motivo ? `Fonte: ${e.motivo}` : "Fonte: a última análise registrada no MAC e os documentos emitidos.",
    ]);
  }

  const cabeca =
    e.valor === "Em análise"
      ? "MAC em análise — tem uma análise aberta que ainda não gerou documento."
      : e.valor === "Não iniciado"
        ? "MAC não iniciado — nenhuma análise foi aberta pra esse processo ainda."
        : e.valor === "Arquivado/indeferido"
          ? "Processo indeferido ou arquivado — resultado definitivo, não se reabre sozinho."
          : `MAC: ${e.valor}.`;

  const oQueFazer =
    e.valor === "Em análise"
      ? "É esse que está na sua mão agora."
      : e.valor === "Não iniciado"
        ? "Se o LIP já estiver preenchido, dá pra abrir a primeira análise."
        : e.valor === "Arquivado/indeferido"
          ? "Não tem análise nova a fazer aqui."
          : "";

  return montar([
    cabeca,
    oQueFazer,
    "",
    e.motivo ? `Fonte: ${e.motivo}` : "Fonte: as análises registradas no MAC e as marcações do processo.",
  ]);
}

// -------------------------------------------------------------------- esforço

function explicarEsforco(e: Extract<EntradaExplicacao, { familia: "esforco" }>): string {
  const cabeca =
    e.valor === "rapido"
      ? "Rápido — pelo último retrato, esse aqui não tem pendência travando."
      : e.valor === "exige_atencao"
        ? "Exige atenção — tem coisa no último retrato que não fecha sozinha."
        : e.valor === "depende_documento"
          ? "Depende de documento que ainda não chegou."
          : e.valor === "base_insuficiente"
            ? "Base insuficiente — não tenho dado suficiente pra dizer se é rápido ou não. Não é problema no processo, é falta de leitura minha."
            : `Esforço: ${e.valor}.`;

  return montar([
    cabeca,
    typeof e.pendencias === "number" && e.pendencias > 0
      ? `São ${e.pendencias} pendência${e.pendencias === 1 ? "" : "s"} na última análise do MAC.`
      : null,
    e.acaoBloqueante ? `\n⛔ O que impede seguir: ${e.acaoBloqueante}` : null,
    e.motivoBloqueante ? `Motivo: ${e.motivoBloqueante}` : null,
    "",
    "Isso é um palpite meu sobre esforço, não sobre o mérito — quem decide o processo é você.",
    "Fonte: Motor de Produção, sobre o retrato mais recente do Radar.",
  ]);
}

// ------------------------------------------------------------------- fachada

/** Uma porta só — a tela não precisa saber de qual família é a tag pra pedir a explicação. */
export function explicarTag(e: EntradaExplicacao): string {
  switch (e.familia) {
    case "documento": return explicarDocumento(e);
    case "tipo": return explicarTipo(e.valor);
    case "lip": return explicarLip(e);
    case "mac": return explicarMac(e);
    case "esforco": return explicarEsforco(e);
  }
}
