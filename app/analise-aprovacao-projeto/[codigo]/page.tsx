"use client";

/**
 * Tela do MAC do Slot 5 — Aprovação de Projeto.
 *
 * Isolada do Slot 1: nenhum import de app/analise-regularizacao ou app/analise-aceite-sei; toda
 * a persistência passa por /api/mac/slot-05/analise, que só enxerga tipo_processo = slot_05.
 * A estrutura visual (cabeçalho, legenda, coluna de ações, índice, atalhos por grupo, aba OBS)
 * segue o padrão da tela do Slot 1 por decisão do usuário — replicada por leitura, nunca
 * importada, para que uma mudança aqui não possa atingir a Regularização/Aceite.
 *
 * O que ela faz de diferente: "PREENCHER DO LIP" lê o que a leitura da PASTA já congelou (campos
 * do LIP + texto dos PDFs guardado no MHD) e marca sozinho os grupos que não se aplicam.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  RelatorioImportado as RelatorioContraConferencia,
  AchadoImportado,
} from "@/lib/mac-motor/slot5/contraConferencia";
import {
  avaliarCargaDescarga, avaliarEstudos, comoNumero, fmt, vereditoDoEstudo,
  type DadosEstudos, type Veredito,
} from "@/lib/mac-motor/slot5/estudosExigencias";

type Status = "conforme" | "nao_conforme" | "nao_aplica";
type Item = { id: string; texto: string; grupo: string; ordem: number; ref?: string | null };
type Analise = {
  id: string; numero_analise: number; status: string;
  itens: Record<string, Status>; fontes: Record<string, string>; observacoes: string;
  observacoes_por_item?: Record<string, string>;
  // Números emitidos. Séries distintas: a mesma análise pode sair com despacho E parecer.
  // A fonte de numeração é a MESMA dos Slots 1 e 2 (/api/numeracao/proximo) — decisão do Fábio:
  // todos os slots consomem a mesma série, com as mesmas regras.
  numero_despacho?: string | null;
  numero_despacho_interno?: string | null;
  numero_parecer?: string | null;
  data_despacho?: string | null;
};
type FiltroProposto = {
  id: string; nome: string; recomendado: boolean; justificativa: string;
  statusAlvo: Status; qtd: number; itensIds: string[];
  grupos: { grupo: string; qtd: number }[];
};
type Proposta = {
  total: number; camposPreenchidos: number;
  filtros: FiltroProposto[];
  indecisas: { regraId: string; nome: string; camposFaltando: string[] }[];
};

const ABA_OBS = "__OBS__";

const ESTILO: Record<Status, { bg: string; borda: string; texto: string; icone: string; rotulo: string }> = {
  conforme: { bg: "#ECFDF5", borda: "#059669", texto: "#059669", icone: "✅", rotulo: "Conforme" },
  nao_conforme: { bg: "#FEF2F2", borda: "#DC2626", texto: "#DC2626", icone: "❌", rotulo: "Não Conforme" },
  nao_aplica: { bg: "#EFF6FF", borda: "#2563EB", texto: "#2563EB", icone: "⬜", rotulo: "Não se Aplica" },
};
const STATUS: Status[] = ["conforme", "nao_conforme", "nao_aplica"];

/** Cor do box de cada grupo no índice — resume, sem precisar abrir, o que está marcado lá dentro.
 * Vermelho ganha de todos (um item não conforme já reprova o grupo); azul só quando o grupo inteiro
 * é "não se aplica"; verde quando está todo respondido e sem erro; branco enquanto faltar resposta.
 * Tons claros, para o texto continuar legível por cima. */
const ESTADO_GRUPO: Record<EstadoGrupo, { bg: string; borda: string; rotulo: string }> = {
  vermelho: { bg: "#FEF2F2", borda: "#FCA5A5", rotulo: "tem item não conforme" },
  verde: { bg: "#ECFDF5", borda: "#6EE7B7", rotulo: "tudo conforme" },
  azul: { bg: "#EFF6FF", borda: "#93C5FD", rotulo: "não se aplica" },
  neutro: { bg: "var(--bg-card)", borda: "var(--border)", rotulo: "" },
};
type EstadoGrupo = "vermelho" | "verde" | "azul" | "neutro";


function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type ViaSalva = { nome_logradouro?: string | null; bairro?: string | null; largura_via?: number | string | null };

/* --- Largura de via → texto da observação -------------------------------------------------------
 * O item "Rever largura da rua na planta de situação, de acordo com consulta ao Cadastro de
 * Logradouros: ____m;" pede um VALOR digitado, não um status. Quem já consultou as vias em
 * "Via / Logradouros" não precisa redigitar: o texto se monta no padrão que o analista escrevia à
 * mão — "Para a Av Anapolis: 28,5m, para a R RSL3: 13m e para a R RSL12: 16m;". */
const VIA_MASCULINA = new Set([
  "ANEL", "BECO", "CAMINHO", "CONDOMINIO", "CONTORNO", "CORREDOR", "EIXO", "JARDIM", "LARGO",
  "PARQUE", "SETOR", "TERMINAL", "TRECHO", "VIADUTO", "VD",
]);
const VIA_MINUSCULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

/** "AV  ANAPOLIS" → "Av Anapolis". Token com número fica intacto ("R RSL13").
 * Acento não volta: o Cadastro de Logradouros guarda os nomes sem acento. */
function nomeDaVia(bruto: string) {
  return String(bruto ?? "").trim().split(/\s+/).filter(Boolean).map((t) => {
    if (/\d/.test(t)) return t;
    if (VIA_MINUSCULAS.has(t.toUpperCase())) return t.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }).join(" ");
}

/** Artigo do primeiro token — Rua/Avenida/Alameda são femininas (padrão), Anel/Viaduto masculinos. */
function artigoDaVia(nome: string) {
  const primeiro = semAcento(nome).trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  return VIA_MASCULINA.has(primeiro) ? "o" : "a";
}

/** 28.5 → "28,5m"; 13 → "13m". Zero ou vazio não vira medida. */
function medidaDaVia(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${String(n).replace(".", ",")}m`;
}

/** Monta o texto com as vias salvas, na ordem dos cards da tela de logradouros. */
function textoLarguraDeVias(vias: ViaSalva[]): string | null {
  const partes: string[] = [];
  for (const v of vias ?? []) {
    const nome = nomeDaVia(String(v?.nome_logradouro ?? ""));
    const larg = medidaDaVia(v?.largura_via);
    if (!nome || !larg) continue;
    const trecho = `${artigoDaVia(nome)} ${nome}: ${larg}`;
    if (!partes.includes(trecho)) partes.push(trecho);
  }
  if (!partes.length) return null;
  const cabeca = `Para ${partes[0]}`;
  if (partes.length === 1) return `${cabeca};`;
  const resto = partes.slice(1);
  const ultimo = resto.pop()!;
  return `${[cabeca, ...resto.map((t) => `para ${t}`)].join(", ")} e para ${ultimo};`;
}

/** O item do checklist que pede a largura conferida no Cadastro de Logradouros. */
function itemDeLarguraDeVia(texto: string) {
  const t = semAcento(texto);
  return t.includes("cadastro de logradouros") && t.includes("largura");
}

/** Reconhece um texto escrito por este mesmo gerador — só ele pode ser atualizado numa consulta
 * nova. Texto do analista nunca é sobrescrito (regra 6 do Slot 5). */
function textoDeViaGeradoAqui(texto: string) {
  return /^Para [ao] .+:\s*[\d.,]+m.*;$/.test(texto.trim());
}

/* --- Filtro de UNIDADE TERRITORIAL ---------------------------------------------------------------
 * Boa parte do checklist do Slot 5 fala de uma unidade territorial específica ("AA e ADD admite-se
 * ...", "AAB = 90,00 m² ..."). Sabendo em qual UT o terreno está, tudo que trata SÓ de outras UTs
 * sai da análise. As siglas abaixo foram levantadas item a item no modelo do Slot 5 (21/08/2026);
 * a que o analista digitar também conta, mesmo fora desta lista. */
const UNIDADES_TERRITORIAIS = ["AA", "AAB", "AAD", "ADD", "AOS", "ARAU", "APA", "APAC", "AEIS", "AEBT"];

/** Sigla isolada: "AAB" casa em "AAB e AOS", mas não dentro de "ACRÉSCIMO" nem de "APAC". */
function reUnidade(sigla: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${sigla}(?![\\p{L}\\p{N}])`, "u");
}

/** Extrai a sigla do que vier: "ÁREA DE ADENSAMENTO BÁSICO - AAB" → "AAB"; "aos" → "AOS". */
function siglaDaUnidade(bruto: string) {
  const limpo = semAcento(String(bruto ?? "")).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ");
  const tokens = limpo.split(/\s+/).filter((t) => /^[A-Z]{2,6}$/.test(t));
  const conhecida = tokens.find((t) => UNIDADES_TERRITORIAIS.includes(t));
  if (conhecida) return conhecida;
  // Sigla nova (o Fábio pode digitar outra): fica a última palavra curta, que é como o Uso do Solo
  // escreve ("... - XYZ").
  return tokens.length ? tokens[tokens.length - 1] : "";
}

/** Siglas de UT citadas por um item. */
function unidadesCitadas(texto: string, minha: string) {
  const lista = [...new Set([...UNIDADES_TERRITORIAIS, ...(minha ? [minha] : [])])];
  return lista.filter((sigla) => reUnidade(sigla).test(texto ?? ""));
}

/** "exceto AOS e ARAU" inverte a regra do item — aí o filtro não decide, é do analista.
 * "EXCETO SETOR SUL E JAÓ" não é exceção de UT e não bloqueia nada. */
function excecaoDeUnidade(texto: string, minha: string) {
  const t = semAcento(texto ?? "");
  const lista = [...new Set([...UNIDADES_TERRITORIAIS, ...(minha ? [minha] : [])])];
  for (const m of t.matchAll(/exceto|excecao|salvo/g)) {
    const janela = t.slice(m.index ?? 0, (m.index ?? 0) + 60);
    if (lista.some((sigla) => reUnidade(sigla.toLowerCase()).test(janela))) return true;
  }
  return false;
}

/** Veredito do item para a UT informada:
 * "outra" = fala só de outras UTs (sai da análise) · "minha" = cita a minha (fica) ·
 * "excecao" = regra invertida, fica para o analista · null = não fala de UT nenhuma. */
function vereditoDeUnidade(texto: string, minha: string): "outra" | "minha" | "excecao" | null {
  if (!minha) return null;
  const citadas = unidadesCitadas(texto, minha);
  if (!citadas.length) return null;
  if (excecaoDeUnidade(texto, minha)) return "excecao";
  return citadas.includes(minha) ? "minha" : "outra";
}

/* --- Filtros de tema (marcados pelo analista ou diagnosticados na leitura) ----------------------
 * Cada um responde a uma pergunta de sim/não sobre o processo. Marcado = o tema NÃO existe aqui,
 * então todo item do checklist que trata dele sai da análise (Não se Aplica, azul).
 * Os termos casam por palavra inteira e sem acento — "MILITAR" sozinho não entra na lista porque
 * casaria com "CORPO DE BOMBEIROS MILITAR", que é nota de carimbo de todo projeto. */
type FiltroTema = {
  id: string; rotulo: string; tema: string; termos: string[]; explica: string;
  /** Quando presente, ignora `termos` e usa exatamente estes ids — para os casos em que o texto
   * sozinho não separa um item do outro (ex.: os três itens de "Opção 1/2/3" do índice
   * paisagístico citam Art. 192 duas vezes; casar por palavra pegaria os dois). */
  idsExplicitos?: string[];
};

const FILTROS_TEMA: FiltroTema[] = [
  {
    id: "aeroportuaria",
    rotulo: "🛫 Sem zona aeroportuária",
    tema: "terreno em zona aeroportuária (exige De Acordo da COMAER / ICA / ANAC)",
    termos: ["COMAER", "AERONAUTICA", "AEROPORTUARIA", "AEROPORTUARIAS", "AEROPORTO", "ANAC", "AERODROMO", "ICA"],
    explica: "o terreno não está em zona aeroportuária — cai o que depende de COMAER/ICA/ANAC",
  },
  {
    id: "central",
    rotulo: "🏛️ Não é Setor Central",
    tema: "terreno no Setor Central",
    // "SETORES CENTRAL" cobre "Nos setores Central e Campinas"; "SETOR CENTRAL" cobre o singular.
    termos: ["SETOR CENTRAL", "SETORES CENTRAL"],
    explica: "o terreno não fica no Setor Central",
  },
  {
    id: "campinas",
    rotulo: "🏛️ Não é Setor Campinas",
    tema: "terreno no Setor Campinas",
    termos: ["CAMPINAS"],
    explica: "o terreno não fica no Setor Campinas",
  },
  {
    // "Setor Sul" no checklist aparece nos DOIS sentidos: ord=174 é a regra QUE VALE pra quem
    // está no Setor Sul; ord=119/120/186 são regras que valem pra quem NÃO ESTÁ ("EXCETO SETOR
    // SUL") — um filtro por palavra pegaria os quatro e inverteria o sentido dos três últimos.
    // Por isso só o item certo, por id.
    id: "sul",
    rotulo: "🏛️ Não é Setor Sul",
    tema: "terreno no Setor Sul",
    termos: [],
    idsExplicitos: ["ccdad59c-b515-4164-9ce9-c3f70e415630"],
    explica: "o terreno não fica no Setor Sul",
  },
  {
    id: "eit",
    rotulo: "🚦 Sem EIT",
    tema: "empreendimento sujeito a Estudo de Impacto de Trânsito (EIT/RIT)",
    termos: ["EIT", "RIT", "IMPACTO DE TRANSITO"],
    explica: "o empreendimento não é polo gerador de tráfego pelos limites da Lei 10.977/2023",
  },
  {
    id: "eiv",
    rotulo: "🏘️ Sem EIV",
    tema: "empreendimento sujeito a Estudo de Impacto de Vizinhança (EIV/RIV)",
    termos: ["EIV", "RIV", "IMPACTO DE VIZINHANCA"],
    explica: "o empreendimento não atinge os limites do art. 262 da LC 349/2022",
  },
  {
    id: "macroprojeto",
    rotulo: "🏗️ Não é macroprojeto",
    tema: "empreendimento classificado como macroprojeto",
    termos: ["MACROPROJETO", "MACROPROJETOS"],
    explica: "o empreendimento não é macroprojeto",
  },
  {
    // Os 3 itens de "Opção 1/2/3" do índice paisagístico (ÍTEM 19) — a lei dá três caminhos pra
    // atender o mesmo requisito, o projeto só precisa atender UM. Marcar a opção usada tira as
    // outras duas da análise. Por id, não por texto: os três citam Art. 192/85 em comum.
    id: "ip_opcao_1",
    rotulo: "🌿 IP Opção 1",
    tema: 'índice paisagístico atendido pela Opção 1 (Art. 192 LC 349/2022 — 15% permeável)',
    termos: [],
    idsExplicitos: ["32451fec-cde2-4a00-81e7-e41bebea0a42", "04085d11-3204-4795-93c5-0e64f0423ff9"],
    explica: "atendido pela Opção 1 — as opções 2 e 3 não se aplicam",
  },
  {
    id: "ip_opcao_2",
    rotulo: "🌿 IP Opção 2",
    tema: 'índice paisagístico atendido pela Opção 2 (Art. 192 LC 349/2022 — 15%/10%/não permeável)',
    termos: [],
    idsExplicitos: ["7f6ae634-2db2-4e10-9ad5-dd9fe70256c2", "04085d11-3204-4795-93c5-0e64f0423ff9"],
    explica: "atendido pela Opção 2 — as opções 1 e 3 não se aplicam",
  },
  {
    id: "ip_opcao_3",
    rotulo: "🌿 IP Opção 3",
    tema: 'índice paisagístico atendido pela Opção 3 (Art.85 LC 364/2023 — 25% não permeável)',
    termos: [],
    idsExplicitos: ["7f6ae634-2db2-4e10-9ad5-dd9fe70256c2", "32451fec-cde2-4a00-81e7-e41bebea0a42"],
    explica: "atendido pela Opção 3 — as opções 1 e 2 não se aplicam",
  },
  {
    id: "carga",
    rotulo: "🚚 Sem carga e descarga",
    tema: "pátio de carga e descarga exigido para o empreendimento",
    termos: ["CARGA E DESCARGA", "CARGA/DESCARGA", "DOCA", "DOCAS"],
    explica: "o empreendimento não é obrigado a ter pátio de carga e descarga",
  },
  {
    id: "gaveta",
    rotulo: "🅿️ Não tem vaga de gaveta",
    tema: "vaga de gaveta (vaga atrás de outra, dependente de manobra) no projeto",
    termos: ["GAVETA", "GAVETAS"],
    explica: "o projeto não tem vaga de gaveta",
  },
  {
    id: "manobrista",
    rotulo: "🧑‍✈️ Sem manobrista",
    tema: "manobrista no projeto",
    termos: ["MANOBRISTA", "MANOBRISTAS"],
    explica: "o projeto não tem manobrista",
  },
  {
    id: "planta_popular",
    rotulo: "🏠 Não é Planta Popular",
    tema: "projeto de Planta Popular",
    termos: ["PLANTA POPULAR"],
    explica: "o projeto não é de Planta Popular",
  },
  {
    id: "rampa",
    rotulo: "🪜 Sem rampa",
    // Um tema só, como o Fábio pediu: a resposta é "não" quando o projeto não tem rampa NENHUMA —
    // nem de veículos (garagem) nem de acessibilidade. Dos 15 itens alcançados, 6 são de
    // estacionamento e 6 da NBR 9050, então a distinção importa antes de marcar.
    tema: "rampa desenhada no projeto — de veículos (garagem) ou de acessibilidade",
    termos: ["RAMPA", "RAMPAS"],
    explica: "o projeto não tem rampa",
  },
  {
    id: "lazer",
    rotulo: "🏊 Sem área de lazer",
    tema: "área de lazer no projeto (piscina, playground, quadra, salão de festas)",
    termos: ["LAZER", "RECREACAO", "PLAYGROUND", "PISCINA", "PISCINAS", "DECKS", "DUCHAS",
             "QUADRA ESPORTIVA", "SALAO DE FESTAS", "ESPORTES"],
    explica: "o projeto não tem área de lazer",
  },
  {
    id: "baia_desaceleracao",
    rotulo: "🚗 Sem baia de desaceleração",
    tema: "baia de desaceleração de velocidade exigida no acesso ao terreno",
    termos: ["BAIA", "BAIAS"],
    explica: "o projeto não tem baia de desaceleração",
  },
  {
    id: "saliencia",
    rotulo: "🧱 Sem saliência",
    tema: "saliência acessória sobre o recuo (brise, floreira, balcão, beiral...)",
    termos: ["SALIENCIA", "SALIENCIAS"],
    explica: "o projeto não tem saliência sobre o recuo",
  },
];

/** Destaca no texto do item onde a busca bateu — compara sem acento/caixa (igual ao filtro dos
 * grupos), mas devolve o texto ORIGINAL com só o trecho achado em fundo amarelo. */
function destacarBusca(texto: string, queryBruta: string): ReactNode {
  const q = semAcento(queryBruta.trim());
  if (!q) return texto;
  const alvo = semAcento(texto);
  if (alvo.length !== texto.length) return texto; // normalização mudou o tamanho — não arrisca destacar errado
  const partes: ReactNode[] = [];
  let cursor = 0;
  let pos = alvo.indexOf(q, cursor);
  if (pos === -1) return texto;
  while (pos !== -1) {
    if (pos > cursor) partes.push(texto.slice(cursor, pos));
    partes.push(
      <mark key={pos} style={{ background: "#FDE047", color: "#1a1a1a" }}>{texto.slice(pos, pos + q.length)}</mark>
    );
    cursor = pos + q.length;
    pos = alvo.indexOf(q, cursor);
  }
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return partes;
}

/** Termo casado por palavra inteira, sem acento — aceita termo de mais de uma palavra. */
function itemCitaTermo(texto: string, termo: string) {
  const t = semAcento(texto ?? "");
  const alvo = semAcento(termo);
  return new RegExp(`(?<![\\p{L}\\p{N}])${alvo.replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "u").test(t);
}

/** Embute o que o item tinha ANTES de um filtro marcar por cima, pra "Desfazer" devolver
 * exatamente aquilo (inclusive uma marcação manual) em vez de só limpar. */
function embutirRestauracao(fonteNova: string, statusAnterior?: Status, fonteAnterior?: string) {
  if (!statusAnterior) return fonteNova;
  const payload = encodeURIComponent(JSON.stringify({ s: statusAnterior, f: fonteAnterior ?? "" }));
  return `${fonteNova} §R:${payload}`;
}
function extrairRestauracao(fonte: string | undefined): { status: Status; fonte: string } | null {
  const m = (fonte ?? "").match(/ §R:(.+)$/);
  if (!m) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(m[1]));
    return { status: obj.s as Status, fonte: String(obj.f ?? "") };
  } catch { return null; }
}

function itensDoTema(itens: Item[], f: FiltroTema) {
  if (f.idsExplicitos) {
    const alvo = new Set(f.idsExplicitos);
    return itens.filter((it) => alvo.has(it.id));
  }
  return itens.filter((it) => f.termos.some((termo) => itemCitaTermo(it.texto, termo)));
}

/** Ícone de origem da resposta — mesma ideia do 🤖/✏️ do MAC do Slot 1, com um a mais (🎛️ filtro). */
function origemDoItem(fonte: string | undefined): { icone: string; rotulo: string } | null {
  if (!fonte) return null;
  // "§R:..." é o que "Desfazer" precisa pra devolver a marcação de antes — nunca aparece pro
  // analista, só o texto legível na frente dele.
  const legivel = fonte.replace(/ §R:.+$/, "");
  if (legivel.startsWith("Filtro")) return { icone: "🎛️", rotulo: legivel };
  if (legivel.startsWith("IA")) return { icone: "🤖", rotulo: legivel };
  return { icone: "✍️", rotulo: legivel === "manual" ? "Marcado manualmente" : legivel };
}

export default function AnaliseAprovacaoProjeto() {
  const router = useRouter();
  const codigo = decodeURIComponent(String(useParams()?.codigo ?? ""));

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [processo, setProcesso] = useState<{
    proprietario: string | null; bairro: string | null; logradouro: string | null;
    areaTotal: string | null; numeroSei: string | null;
  } | null>(null);
  const [pendenciasLip, setPendenciasLip] = useState<string[]>([]);
  const [bannerAberto, setBannerAberto] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [itensChecklist, setItensChecklist] = useState<Item[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  // Número da análise iniciada mas ainda não gravada (a linha só nasce no primeiro salvamento).
  const [numeroAnaliseNova, setNumeroAnaliseNova] = useState(1);
  const [modalZerarAnalise, setModalZerarAnalise] = useState<number | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [marcas, setMarcas] = useState<Record<string, Status>>({});
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState("");
  const [observacoesPorItem, setObservacoesPorItem] = useState<Record<string, string>>({});
  /* Vínculo de cada subitem com lei/artigo do BIP — é do ITEM DO CHECKLIST (modelo), não do
   * processo: a lei que um item cita não muda de processo pra processo, então carrega uma vez só
   * e vale pra qualquer analista que abrir esse mesmo checklist. */
  const [vinculosBip, setVinculosBip] = useState<Record<string, { id: string; fragmentoId: string; referencia: string; lei: string }[]>>({});
  const [buscaBipAberta, setBuscaBipAberta] = useState<string | null>(null); // itemId com a busca aberta
  const [buscaBipQuery, setBuscaBipQuery] = useState("");
  const [buscaBipResultados, setBuscaBipResultados] = useState<{ id: string; referencia: string; lei: string; trecho: string }[]>([]);
  const [buscaBipCarregando, setBuscaBipCarregando] = useState(false);
  const [abaAtual, setAbaAtual] = useState<string | null>(null); // null = índice
  const [busca, setBusca] = useState("");
  const [ocultarResolvidos, setOcultarResolvidos] = useState(false);
  // Unidade territorial do terreno: sugestão vem do Uso do Solo (LIP) e o analista pode trocar.
  // Guardada por processo no próprio navegador — não existe coluna para ela e o valor do LIP
  // continua sendo a origem oficial.
  const [unidadeTerritorial, setUnidadeTerritorial] = useState("");
  const unidadeCarregada = useRef(false);
  /* EIT · EIV · carga e descarga: números do LIP + os que só o analista tem (depósito/produção,
   * pátio desenhado, capacidade de reunião, alunos por turno). Os manuais ficam por processo no
   * navegador, como a unidade territorial. */
  const [lipEstudos, setLipEstudos] = useState<DadosEstudos | null>(null);
  const [manuais, setManuais] = useState<{
    areaDepositoProducao: string; areaPatioProjetada: string; atividadeAnexoI: boolean;
    capacidadeReuniao: string; alunosPorTurno: string;
  }>({ areaDepositoProducao: "", areaPatioProjetada: "", atividadeAnexoI: false, capacidadeReuniao: "", alunosPorTurno: "" });
  // Lista aberta a partir de um número clicável do painel (ex.: "Pendentes"). Clicar num item
  // dela manda pro grupo dele e destaca — não é uma aba nova, some ao navegar pra outro lugar.
  const [listaFiltrada, setListaFiltrada] = useState<{ titulo: string; itens: Item[] } | null>(null);
  const [itemFoco, setItemFoco] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");
  /* Contra-conferência: o analista gera um prompt, leva numa IA de fora junto com os PDFs, e traz
   * o relatório de volta. O que volta é PROPOSTA — nenhum achado marca nada sozinho. */
  const [ccGerando, setCcGerando] = useState(false);
  const [ccPrompt, setCcPrompt] = useState<{ texto: string; caracteres: number; itens: number } | null>(null);
  const [ccInstrucoesAberto, setCcInstrucoesAberto] = useState(false);
  const [ccColarAberto, setCcColarAberto] = useState(false);
  const [ccTexto, setCcTexto] = useState("");
  const [ccImportando, setCcImportando] = useState(false);
  const [ccRelatorio, setCcRelatorio] = useState<RelatorioContraConferencia | null>(null);
  const [ccPainel, setCcPainel] = useState(false);
  const [ccDecisoes, setCcDecisoes] = useState<Record<string, "aceito" | "recusado">>({});

  const [proposta, setProposta] = useState<Proposta | null>(null);
  // "fechar" apenas ESCONDE o painel — a proposta continua em memória e volta pelo botão
  // "Ver filtros". Descartar de vez obrigaria a reavaliar tudo de novo.
  // Começa recolhido: abrir a tela não deve empurrar a lista de itens pra baixo.
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [decisoes, setDecisoes] = useState<Record<string, "aceito" | "recusado">>({});
  const [lendoLip, setLendoLip] = useState(false);
  const [importando, setImportando] = useState(false);
  const [macIncompleto, setMacIncompleto] = useState(false);
  const [salvandoIncompleto, setSalvandoIncompleto] = useState(false);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const inputImportRef = useRef<HTMLInputElement>(null);
  const inputPastaRef = useRef<HTMLInputElement>(null);
  const [lendoPasta, setLendoPasta] = useState(false);
  // Progresso do LER PASTA (IA) — mesmo padrão do LIP: % + tempo decorrido + o que está lendo agora.
  const [progressoPasta, setProgressoPasta] = useState(0);
  const [tempoPasta, setTempoPasta] = useState(0);
  const [docPasta, setDocPasta] = useState<string | null>(null);
  const tempoPastaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampaPastaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notificar = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  /**
   * Grava sem depender do state — usado na aplicação automática dos filtros, que roda dentro do
   * carregamento, quando `analise`/`marcas` ainda não subiram para o React.
   */
  const salvarDireto = useCallback(async (
    novasMarcas: Record<string, Status>, novasFontes: Record<string, string>,
    novasObs: string, analiseAtual: Analise | null,
  ) => {
    try {
      let alvo = analiseAtual;
      if (!alvo) {
        const r = await fetch("/api/mac/slot-05/analise", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.erro ?? "falha ao criar análise");
        setAnalise(d.analise);
        setAnalises((prev) => [d.analise, ...prev]);
        return;
      }
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alvo.id, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
    } catch (e: any) {
      notificar(`Erro ao gravar os filtros: ${e?.message ?? e}`);
    }
  }, [codigo, notificar]);

  useEffect(() => {
    if (!codigo) return;
    let cancelado = false;
    setCarregando(true);

    // Ordem pedida pelo usuário: ao ENTRAR, primeiro descobrir quais filtros ativar (o que o
    // processo não tem), só depois olhar o que o LIP consegue marcar. As duas coisas saem da
    // mesma chamada — ela não grava nada, só propõe.
    (async () => {
      try {
        const r = await fetch(`/api/mac/slot-05/analise?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" });
        const d = await r.json();
        if (cancelado) return;
        if (!d.ok) { setErro(d.erro); return; }

        setItensChecklist(d.itens ?? []);
        setProcesso(d.processo ?? null);
        setPendenciasLip(d.pendenciasLip ?? []);
        setMacIncompleto(d.macIncompleto === true);
        setAnalises(d.analises ?? []);
        const atual: Analise | undefined = (d.analises ?? [])[0];
        const marcasAtuais = atual?.itens ?? {};
        if (atual) {
          setAnalise(atual);
          setMarcas(marcasAtuais);
          setFontes(atual.fontes ?? {});
          setObservacoes(atual.observacoes ?? "");
          setObservacoesPorItem(atual.observacoes_por_item ?? {});
          fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${atual.id}`,
            { credentials: "include" })
            .then((r) => r.json())
            .then((h) => { if (!cancelado && h.ok) setHistorico(h.historico ?? []); })
            .catch(() => null);
        }
        setCarregando(false);

        // Roda os filtros e JÁ MARCA os recomendados como "Não se Aplica" nos itens deles.
        // O analista não precisa aceitar um a um: chega com o checklist enxuto e desfaz o que
        // discordar. Nunca sobrescreve item já respondido, e o que muda é gravado na hora.
        setLendoLip(true);
        const rp = await fetch("/api/mac/slot-05/preencher-automatico", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
        const dp = await rp.json();
        if (cancelado) return;
        if (dp.ok && dp.filtros?.length) {
          setProposta(dp);
          const recomendados = (dp.filtros as FiltroProposto[]).filter((f) => f.recomendado);

          const novasMarcas: Record<string, Status> = { ...marcasAtuais };
          const novasFontes: Record<string, string> = { ...(atual?.fontes ?? {}) };
          const aplicadosPorFiltro: Record<string, "aceito"> = {};
          let aplicados = 0;

          for (const f of recomendados) {
            let n = 0;
            for (const id of f.itensIds) {
              if (novasMarcas[id]) continue;
              novasMarcas[id] = f.statusAlvo;
              novasFontes[id] = `Filtro "${f.nome}" — ${f.justificativa}`;
              n++;
            }
            aplicadosPorFiltro[f.id] = "aceito";
            aplicados += n;
          }

          setDecisoes(aplicadosPorFiltro);

          if (aplicados > 0) {
            const bloco =
              `━━━ FILTROS APLICADOS AUTOMATICAMENTE ━━━\n` +
              `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → Não se Aplica\n` +
              recomendados.map((f) => `  • ${f.nome}: ${f.qtd} item(ns)\n    ↳ ${f.justificativa}`).join("\n");
            const novasObs = (atual?.observacoes ?? "") ? `${bloco}\n\n${atual!.observacoes}` : bloco;

            setMarcas(novasMarcas);
            setFontes(novasFontes);
            setObservacoes(novasObs);
            await salvarDireto(novasMarcas, novasFontes, novasObs, atual ?? null);
            // A gravação acabou de criar os registros da trilha — recarrega.
            if (atual) {
              fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${atual.id}`,
                { credentials: "include" })
                .then((rh) => rh.json())
                .then((h) => { if (!cancelado && h.ok) setHistorico(h.historico ?? []); })
                .catch(() => null);
            }
            notificar(`${aplicados} item(ns) já marcados como Não se Aplica por ${recomendados.length} filtro(s). Desfaça o que discordar.`);
          } else {
            notificar("Filtros avaliados — nada novo a retirar.");
          }
        }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      } finally {
        if (!cancelado) { setCarregando(false); setLendoLip(false); }
      }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const grupos = useMemo(() => {
    const ordem = new Map<string, number>();
    for (const i of itensChecklist) {
      if (!ordem.has(i.grupo) || i.ordem < ordem.get(i.grupo)!) ordem.set(i.grupo, i.ordem);
    }
    return [...ordem.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g);
  }, [itensChecklist]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itensChecklist) {
      if (!m.has(i.grupo)) m.set(i.grupo, []);
      m.get(i.grupo)!.push(i);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return m;
  }, [itensChecklist]);

  const stats = useMemo(() => {
    const m: Record<string, {
      total: number; respondidos: number; temErro: boolean; busca: string;
      conformes: number; naoAplicas: number; estado: EstadoGrupo;
    }> = {};
    for (const g of grupos) {
      const lista = porGrupo.get(g) ?? [];
      const total = lista.length;
      const respondidos = lista.filter((i) => marcas[i.id]).length;
      const temErro = lista.some((i) => marcas[i.id] === "nao_conforme");
      const conformes = lista.filter((i) => marcas[i.id] === "conforme").length;
      const naoAplicas = lista.filter((i) => marcas[i.id] === "nao_aplica").length;
      const completo = total > 0 && respondidos === total;
      const estado: EstadoGrupo =
        temErro ? "vermelho"
        : !completo ? "neutro"
        : naoAplicas === total ? "azul"
        : "verde";
      m[g] = {
        total, respondidos, temErro, conformes, naoAplicas, estado,
        busca: semAcento(g + " " + lista.map((i) => i.texto).join(" ")),
      };
    }
    return m;
  }, [grupos, porGrupo, marcas]);

  /** Numeração que o analista usa pra citar uma linha: ÍTEM = posição do grupo no índice,
   * O rótulo na tela é "N.M" (ex.: 19.5), igual à numeração do Excel do Fábio — sem a palavra
   * "SUB ITEM". */
  const numeroDoItem = useMemo(() => {
    const m = new Map<string, { item: number; sub: number }>();
    grupos.forEach((g, iG) => {
      (porGrupo.get(g) ?? []).forEach((it, iS) => m.set(it.id, { item: iG + 1, sub: iS + 1 }));
    });
    return m;
  }, [grupos, porGrupo]);

  const totais = useMemo(() => {
    const acc = { conforme: 0, nao_conforme: 0, nao_aplica: 0, pendente: 0 };
    for (const i of itensChecklist) {
      const s = marcas[i.id];
      if (s) acc[s]++; else acc.pendente++;
    }
    return acc;
  }, [itensChecklist, marcas]);

  /** Quanto do checklist saiu por filtro automático, quanto a IA (LER PASTA) sugeriu e quanto o
   * analista marcou à mão. */
  const origemDasRespostas = useMemo(() => {
    let porFiltro = 0, porIA = 0, porAnalista = 0;
    for (const i of itensChecklist) {
      if (!marcas[i.id]) continue;
      const f = fontes[i.id] ?? "";
      if (f.startsWith("Filtro")) porFiltro++;
      else if (f.startsWith("IA")) porIA++;
      else porAnalista++;
    }
    return { porFiltro, porIA, porAnalista };
  }, [itensChecklist, marcas, fontes]);

  /** Constrói a lista de itens por trás de um número clicável do painel. */
  function abrirLista(titulo: string, filtro: (i: Item) => boolean) {
    setListaFiltrada({ titulo, itens: itensChecklist.filter(filtro) });
  }

  function irParaItem(item: Item) {
    setListaFiltrada(null);
    setAbaAtual(item.grupo);
    setItemFoco(item.id);
  }

  // Rola até o item focado (aberto por um número clicável) e destaca por 2s.
  useEffect(() => {
    if (!itemFoco || abaAtual === null || abaAtual === ABA_OBS) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`item-${itemFoco}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-offset-1");
      (el.style as any).setProperty("--tw-ring-color", "var(--accent)");
      const limpa = setTimeout(() => { el.classList.remove("ring-2", "ring-offset-1"); setItemFoco(null); }, 2200);
      return () => clearTimeout(limpa);
    }, 50); // dá tempo do grupo renderizar antes de procurar o id
    return () => clearTimeout(t);
  }, [itemFoco, abaAtual]);

  async function garantirAnalise(itensIniciais?: Record<string, Status>, fontesIniciais?: Record<string, string>) {
    if (analise) return analise;
    const r = await fetch("/api/mac/slot-05/analise", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, itens: itensIniciais ?? {}, fontes: fontesIniciais ?? {} }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro ?? "falha ao criar análise");
    setAnalise(d.analise);
    setAnalises((prev) => [d.analise, ...prev]);
    return d.analise as Analise;
  }

  /* ── Gerenciamento das 5 análises — mesmas regras do Slot 1/2 ──────────────
   * Liberação sequencial (a análise N só abre depois que a N-1 existe), no máximo 5, e a nova
   * NASCE COPIANDO a anterior: reanálise é conferir o que o requerente corrigiu, não recomeçar
   * do zero. A criação no banco é preguiçosa (garantirAnalise no primeiro salvamento) — igual ao
   * resto da tela. */

  function selecionarAnalise(a: Analise) {
    setAnalise(a);
    setMarcas(a.itens ?? {});
    setFontes(a.fontes ?? {});
    setObservacoes(a.observacoes ?? "");
    setObservacoesPorItem(a.observacoes_por_item ?? {});
    setAbaAtual(null);
    setListaFiltrada(null);
  }

  function iniciarNovaAnalise(n: number) {
    if (analises.length >= 5) { notificar("Limite de 5 análises atingido."); return; }
    // `analises` chega ordenada por numero_analise DESC; pegar pelo maior número deixa a cópia
    // independente da ordenação da API.
    const ultima = [...analises].sort((a, b) => b.numero_analise - a.numero_analise)[0];
    setAnalise(null);
    setMarcas(ultima?.itens ?? {});
    setFontes(ultima?.fontes ?? {});
    setObservacoes(ultima?.observacoes ?? "");
    setObservacoesPorItem(ultima?.observacoes_por_item ?? {});
    setNumeroAnaliseNova(n);
    setAbaAtual(null);
    setListaFiltrada(null);
    notificar(`Análise ${n} iniciada — copiada da anterior. Salve para gravar.`);
  }

  function selecionarOuCriarAnalise(n: number) {
    const existente = analises.find((a) => a.numero_analise === n);
    if (existente) selecionarAnalise(existente);
    else iniciarNovaAnalise(n);
  }

  /** Zera a análise sem excluí-la: os itens voltam a pendente e o número da análise é preservado
   * (o histórico em `mac_historico` guarda o que existia). */
  async function zerarAnalise(n: number) {
    const alvo = analises.find((a) => a.numero_analise === n);
    if (!alvo) return;
    setModalZerarAnalise(null);
    try {
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: alvo.id, itens: {}, fontes: {}, observacoes: "", observacoes_por_item: {},
          status: "em_andamento",
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao zerar");

      const zerada: Analise = { ...alvo, itens: {}, fontes: {}, observacoes: "", observacoes_por_item: {}, status: "em_andamento" };
      setAnalises((prev) => prev.map((a) => (a.id === alvo.id ? zerada : a)));
      if (analise?.id === alvo.id) selecionarAnalise(zerada);
      notificar(`Análise ${n} zerada.`);
    } catch (e: any) {
      notificar(`Erro ao zerar: ${e?.message ?? e}`);
    }
  }

  /** Número mostrado no cabeçalho: a análise gravada ou a que acabou de ser iniciada. */
  const numeroAnaliseEmAndamento = analise?.numero_analise ?? numeroAnaliseNova;

  const salvar = useCallback(async (
    novasMarcas = marcas, novasFontes = fontes, novasObs = observacoes, silencioso = false,
    novasObsPorItem = observacoesPorItem,
  ) => {
    setSalvando(true);
    try {
      const a = await garantirAnalise(novasMarcas, novasFontes);
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: a.id, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs,
          observacoes_por_item: novasObsPorItem,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      // Recarrega a trilha: o PUT acabou de registrar as mudanças de status.
      fetch(`/api/mac/slot-05/historico?codigo=${encodeURIComponent(codigo)}&analiseId=${a.id}`,
        { credentials: "include" })
        .then((rh) => rh.json())
        .then((h) => { if (h.ok) setHistorico(h.historico ?? []); })
        .catch(() => null);
      if (!silencioso) notificar("✅ Salvo.");
    } catch (e: any) {
      notificar(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, fontes, observacoes, observacoesPorItem, analise, codigo, notificar]);

  /* Volta de "Via / Logradouros": as vias salvas viram a observação do item da largura de rua e o
   * MAC é gravado na hora — o analista não precisa nem digitar nem lembrar de salvar. Roda depois
   * do carregamento (senão salvaria por cima do que o carregamento ainda vai trazer) e uma única
   * vez por abertura da tela. */
  const viasAplicadas = useRef(false);
  useEffect(() => {
    if (carregando || viasAplicadas.current || itensChecklist.length === 0) return;
    viasAplicadas.current = true;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/processo/logradouro?codigo=${encodeURIComponent(codigo)}`,
          { credentials: "include" });
        const j = await r.json();
        if (cancelado || !j?.ok) return;
        const texto = textoLarguraDeVias(j.data ?? []);
        if (!texto) return;
        const alvos = itensChecklist.filter((i) => itemDeLarguraDeVia(i.texto));
        if (!alvos.length) return;
        const novas = { ...observacoesPorItem };
        let mudou = false;
        for (const it of alvos) {
          const atual = (novas[it.id] ?? "").trim();
          if (atual === texto) continue;
          if (atual && !textoDeViaGeradoAqui(atual)) continue; // texto do analista fica de pé
          novas[it.id] = texto;
          mudou = true;
        }
        if (!mudou || cancelado) return;
        setObservacoesPorItem(novas);
        await salvar(marcas, fontes, observacoes, true, novas);
        notificar("📏 Largura de via preenchida pela consulta ao Cadastro de Logradouros — MAC salvo.");
      } catch {
        /* conveniência: se a consulta falhar, o analista digita como sempre fez */
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, itensChecklist]);

  /** Clique direto num botão de status — sempre tag "manual", mesmo se estava marcado por filtro/IA
   * antes (o analista está assumindo a decisão daquele item agora).
   * GRAVA NA HORA (pedido do Fábio): qualquer marcação de item salva o MAC, para ninguém perder
   * trabalho por sair da tela sem clicar em Salvar. */
  function marcar(itemId: string, status: Status) {
    const desmarcando = marcas[itemId] === status;
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    if (desmarcando) { delete novasMarcas[itemId]; delete novasFontes[itemId]; }
    else { novasMarcas[itemId] = status; novasFontes[itemId] = "manual"; }
    setMarcas(novasMarcas);
    setFontes(novasFontes);
    void salvar(novasMarcas, novasFontes, observacoes, true);
  }

  /* MAC novo começa com a unidade territorial EM BRANCO (decisão do Fábio): o campo só se preenche
   * quando uma leitura de documento (pasta ou arquivo avulso) enxergar a sigla no Uso do Solo — o
   * valor do LIP não vale como preenchimento automático. O que já foi lido/digitado neste processo
   * volta do navegador; roda uma vez, para nunca apagar o que ele está digitando. */
  useEffect(() => {
    if (carregando || unidadeCarregada.current) return;
    unidadeCarregada.current = true;
    const guardada = typeof window !== "undefined"
      ? window.localStorage.getItem(`mac5-ut-${codigo}`) : null;
    const sigla = siglaDaUnidade(guardada || "");
    if (sigla) setUnidadeTerritorial(sigla);
  }, [carregando, codigo]);

  useEffect(() => {
    if (carregando) return;
    try {
      const bruto = window.localStorage.getItem(`mac5-estudos-${codigo}`);
      if (bruto) setManuais((p) => ({ ...p, ...JSON.parse(bruto) }));
    } catch { /* preferência local corrompida não pode derrubar a tela */ }
    fetch(`/api/mac/slot-05/estudos?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setLipEstudos(d.lip as DadosEstudos); })
      .catch(() => null);
  }, [carregando, codigo]);

  function trocarManual(patch: Partial<typeof manuais>) {
    setManuais((prev) => {
      const novo = { ...prev, ...patch };
      try { window.localStorage.setItem(`mac5-estudos-${codigo}`, JSON.stringify(novo)); } catch { /* ok */ }
      return novo;
    });
  }

  /* Vínculo com lei/artigo do BIP — carrega uma vez, quando o checklist termina de carregar. */
  useEffect(() => {
    if (carregando || itensChecklist.length === 0) return;
    fetch("/api/mac/slot-05/bip-vinculos", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        const porItem: typeof vinculosBip = {};
        for (const v of d.vinculos as { id: string; itemId: string; fragmentoId: string; referencia: string; lei: string }[]) {
          (porItem[v.itemId] ??= []).push({ id: v.id, fragmentoId: v.fragmentoId, referencia: v.referencia, lei: v.lei });
        }
        setVinculosBip(porItem);
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, itensChecklist.length]);

  function abrirBuscaBip(itemId: string) {
    setBuscaBipAberta((atual) => (atual === itemId ? null : itemId));
    setBuscaBipQuery("");
    setBuscaBipResultados([]);
  }

  useEffect(() => {
    if (!buscaBipAberta) return;
    const q = buscaBipQuery.trim();
    if (q.length < 2) { setBuscaBipResultados([]); return; }
    setBuscaBipCarregando(true);
    const t = setTimeout(() => {
      fetch(`/api/mac/slot-05/bip-busca?q=${encodeURIComponent(q)}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setBuscaBipResultados(d?.ok ? d.resultados : []))
        .catch(() => setBuscaBipResultados([]))
        .finally(() => setBuscaBipCarregando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [buscaBipQuery, buscaBipAberta]);

  async function vincularBip(itemId: string, fragmentoId: string, referencia: string, lei: string) {
    const r = await fetch("/api/mac/slot-05/bip-vinculos", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, fragmentoId }),
    });
    const d = await r.json();
    if (!d.ok) { notificar(`Erro ao vincular: ${d.erro ?? "falha"}`); return; }
    setVinculosBip((prev) => {
      const lista = prev[itemId] ?? [];
      if (lista.some((v) => v.fragmentoId === fragmentoId)) return prev;
      return { ...prev, [itemId]: [...lista, { id: d.id, fragmentoId, referencia, lei }] };
    });
    setBuscaBipAberta(null);
    notificar(`Vinculado: ${referencia}`);
  }

  async function desvincularBip(itemId: string, vinculoId: string) {
    const r = await fetch(`/api/mac/slot-05/bip-vinculos?id=${encodeURIComponent(vinculoId)}`, {
      method: "DELETE", credentials: "include",
    });
    const d = await r.json();
    if (!d.ok) { notificar(`Erro ao desvincular: ${d.erro ?? "falha"}`); return; }
    setVinculosBip((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? []).filter((v) => v.id !== vinculoId) }));
  }

  /* ── Contra-conferência ────────────────────────────────────────────────────
   * Gera o prompt, o analista leva numa IA de fora com os PDFs, e cola o relatório de volta. */

  /** Gera o prompt e abre o painel com as instruções — copiar e baixar ficam lá. */
  async function gerarContraConferencia() {
    setCcGerando(true);
    try {
      const r = await fetch(`/api/mac/slot-05/contra-conferencia?codigo=${encodeURIComponent(codigo)}`,
        { credentials: "include" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao gerar");
      setCcPrompt({ texto: d.prompt, caracteres: d.caracteres, itens: d.itens });
      setCcInstrucoesAberto(true);
    } catch (e: any) {
      notificar(`Erro ao gerar contra-conferência: ${e?.message ?? e}`);
    } finally {
      setCcGerando(false);
    }
  }

  async function copiarPrompt() {
    if (!ccPrompt) return;
    try {
      await navigator.clipboard.writeText(ccPrompt.texto);
      notificar("Prompt copiado — cole na IA junto com os documentos.");
    } catch {
      notificar("O navegador bloqueou a cópia. Use “Baixar .txt” e copie de lá.");
    }
  }

  function baixarPrompt() {
    if (!ccPrompt) return;
    const blob = new Blob([ccPrompt.texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contra-conferencia-${codigo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importarContraConferencia() {
    if (ccTexto.trim().length < 20) { notificar("Cole a resposta da IA."); return; }
    setCcImportando(true);
    try {
      const r = await fetch("/api/mac/slot-05/contra-conferencia", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, relatorio: ccTexto }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao importar");

      setCcRelatorio(d.relatorio);
      setCcDecisoes({});
      setCcColarAberto(false);
      setCcPainel(true);
      setAbaAtual(null);
      setCcTexto("");

      const n = d.relatorio.achados.length;
      const graves = d.relatorio.achados.filter((a: AchadoImportado) => a.gravidade === "GRAVE").length;
      notificar(
        n
          ? `${n} achado(s) importado(s) — ${graves} grave(s). Nada foi marcado ainda: decida um a um.`
          : "Relatório importado: a IA não contestou nenhum item.",
      );
    } catch (e: any) {
      notificar(`Erro ao importar: ${e?.message ?? e}`);
    } finally {
      setCcImportando(false);
    }
  }

  /** Aceitar = marcar o item com o que a IA propôs, guardando a evidência na fonte. */
  async function aceitarAchado(a: AchadoImportado) {
    if (!a.itemId || !a.aplicavel) return;
    const novasMarcas = { ...marcas, [a.itemId]: a.euDigo as Status };
    const novasFontes = {
      ...fontes,
      [a.itemId]: `Contra-conferência · ${ccRelatorio?.ia ?? "IA externa"} · ${a.evidencia}`.slice(0, 400),
    };
    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setCcDecisoes((p) => ({ ...p, [a.item]: "aceito" }));
    await salvar(novasMarcas, novasFontes, observacoes, true);
    notificar(`Item ${a.item} → ${ESTILO[a.euDigo as Status].rotulo}.`);
  }

  function recusarAchado(a: AchadoImportado) {
    setCcDecisoes((p) => ({ ...p, [a.item]: "recusado" }));
  }

  /** Tudo que os três motores precisam: o que o LIP trouxe + o que o analista digitou. */
  const dadosEstudos: DadosEstudos = useMemo(() => ({
    ...(lipEstudos ?? {}),
    areaDepositoProducao: comoNumero(manuais.areaDepositoProducao),
    areaPatioProjetada: comoNumero(manuais.areaPatioProjetada),
    atividadeAnexoI: manuais.atividadeAnexoI,
    capacidadeReuniao: comoNumero(manuais.capacidadeReuniao),
    alunosPorTurno: comoNumero(manuais.alunosPorTurno),
  }), [lipEstudos, manuais]);

  const gatilhos = useMemo(() => avaliarEstudos(dadosEstudos), [dadosEstudos]);
  const eit = useMemo(() => vereditoDoEstudo(gatilhos, "EIT"), [gatilhos]);
  const eiv = useMemo(() => vereditoDoEstudo(gatilhos, "EIV"), [gatilhos]);
  const carga = useMemo(() => avaliarCargaDescarga(dadosEstudos), [dadosEstudos]);

  /* EIT e EIV se resolvem sozinhos com o que o LIP já tem: atividade (CNAE), área ocupada pela
   * atividade e vagas. Dispensado pela conta → o filtro correspondente se aplica sozinho, com os
   * dois números na fonte. Exigido → nada é marcado; a conta vai para a observação de cada item e
   * a decisão continua sendo do analista (regra 7 do Slot 5).
   * O item que cita OS DOIS estudos ("apresentar EIV/RIV e EIT/RIT aprovados") só sai quando os
   * dois estiverem dispensados. */
  const estudosAplicados = useRef(false);
  useEffect(() => {
    if (carregando || !lipEstudos || estudosAplicados.current || itensChecklist.length === 0) return;
    estudosAplicados.current = true;
    (async () => {
      for (const [id, v] of [["eit", eit], ["eiv", eiv]] as const) {
        const f = FILTROS_TEMA.find((x) => x.id === id);
        if (!f) continue;
        const outro = id === "eit" ? FILTROS_TEMA.find((x) => x.id === "eiv") : FILTROS_TEMA.find((x) => x.id === "eit");
        const doOutro = new Set((outro ? itensDoTema(itensChecklist, outro) : []).map((i) => i.id));
        const vOutro = id === "eit" ? eiv : eit;
        const meus = itensDoTema(itensChecklist, f)
          .filter((it) => !doOutro.has(it.id) || vOutro.veredito === "dispensado");
        if (!meus.length) continue;

        if (v.veredito === "dispensado") {
          await aplicarFiltroTema(f, `LIP: ${v.porQue}`, meus);
        } else if (v.veredito === "exigido") {
          await escreverNosItens(`${f.rotulo.replace(/^\S+\s/, "")} EXIGIDO`, meus, v.porQue);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, lipEstudos, itensChecklist]);

  /** Escreve a conta na observação de cada item, sem marcar status nenhum. */
  async function escreverNosItens(titulo: string, itens: Item[], porQue: string) {
    const texto = `${titulo} — ${porQue}`;
    const novas = { ...observacoesPorItem };
    let n = 0;
    for (const it of itens) {
      const atual = (novas[it.id] ?? "").trim();
      if (atual.startsWith(titulo)) continue;         // já escrito numa rodada anterior
      novas[it.id] = atual ? `${texto}\n${atual}` : texto;
      n++;
    }
    if (!n) return;
    setObservacoesPorItem(novas);
    await salvar(marcas, fontes, observacoes, true, novas);
    notificar(`${titulo}: conta escrita em ${n} item(ns) — a decisão é sua.`);
  }

  function trocarUnidade(valor: string) {
    const sigla = valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setUnidadeTerritorial(sigla);
    if (typeof window !== "undefined") window.localStorage.setItem(`mac5-ut-${codigo}`, sigla);
  }

  /** O que o filtro de UT alcança com a sigla informada. */
  const alcanceUnidade = useMemo(() => {
    const minha = siglaDaUnidade(unidadeTerritorial);
    const outras: Item[] = [];
    let daMinha = 0, excecoes = 0;
    if (minha) {
      for (const it of itensChecklist) {
        const v = vereditoDeUnidade(it.texto, minha);
        if (v === "outra") outras.push(it);
        else if (v === "minha") daMinha++;
        else if (v === "excecao") excecoes++;
      }
    }
    const pendentes = outras.filter((it) => !marcas[it.id]).length;
    return { minha, outras, daMinha, excecoes, pendentes };
  }, [unidadeTerritorial, itensChecklist, marcas]);

  const ASSINATURA_UT = 'Filtro "UNIDADE TERRITORIAL"';

  /** Aplica o filtro: tudo que trata só de outras UTs vira Não se Aplica. Mesma regra dos demais
   * filtros — nunca por cima de item já respondido. */
  async function aplicarFiltroUnidade() {
    const { minha, outras, excecoes } = alcanceUnidade;
    if (!minha) { notificar("Digite a sigla da unidade territorial (ex.: AAB, AOS, AA, ADD)."); return; }
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let aplicados = 0;
    for (const it of outras) {
      if (novasMarcas[it.id]) continue;
      novasMarcas[it.id] = "nao_aplica";
      novasFontes[it.id] = `${ASSINATURA_UT} — o terreno é ${minha} e este item trata só de outra(s) unidade(s)`;
      aplicados++;
    }
    if (!aplicados) { notificar(`Unidade ${minha}: nada novo a retirar.`); return; }

    const porGrupoAlvo = new Map<string, number>();
    for (const it of outras) porGrupoAlvo.set(it.grupo, (porGrupoAlvo.get(it.grupo) ?? 0) + 1);
    const bloco =
      `━━━ FILTRO APLICADO: UNIDADE TERRITORIAL (${minha}) ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → Não se Aplica\n` +
      `↳ itens que tratam exclusivamente de unidades territoriais diferentes de ${minha}` +
      (excecoes ? `\n↳ ${excecoes} item(ns) com exceção de UT ("exceto ...") ficaram para conferência manual` : "") +
      "\n" + [...porGrupoAlvo.entries()].map(([g, q]) => `  • ${q}× ${g}`).join("\n");
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    await salvar(novasMarcas, novasFontes, novasObs);
    notificar(`Unidade ${minha}: ${aplicados} item(ns) saíram da análise.`);
  }

  /** Devolve só o que este filtro marcou (reconhecido pela fonte), como os outros filtros fazem. */
  async function desfazerFiltroUnidade() {
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let devolvidos = 0;
    for (const id of Object.keys(novasFontes)) {
      if (!(novasFontes[id] ?? "").startsWith(ASSINATURA_UT)) continue;
      delete novasMarcas[id];
      delete novasFontes[id];
      devolvidos++;
    }
    if (!devolvidos) { notificar("Filtro de unidade territorial: nada a desfazer."); return; }
    const bloco =
      `━━━ FILTRO DESFEITO: UNIDADE TERRITORIAL ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${devolvidos} item(ns) voltaram para a análise`;
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;
    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    await salvar(novasMarcas, novasFontes, novasObs, true);
    notificar(`Unidade territorial desfeita — ${devolvidos} item(ns) voltaram.`);
  }

  /** Itens que cada filtro de tema alcança, contados uma vez só. */
  const alcanceTemas = useMemo(() => {
    const m: Record<string, { itens: Item[]; pendentes: number; aplicado: boolean }> = {};
    for (const f of FILTROS_TEMA) {
      const itens = itensDoTema(itensChecklist, f);
      m[f.id] = {
        itens,
        pendentes: itens.filter((it) => !marcas[it.id]).length,
        aplicado: itens.some((it) => (fontes[it.id] ?? "").startsWith(`Filtro "${f.rotulo}"`)),
      };
    }
    return m;
  }, [itensChecklist, marcas, fontes]);

  /** Marca como Não se Aplica tudo que fala do tema. Mesma regra dos outros filtros: não passa por
   * cima de item já respondido e a fonte fica gravada para o "Desfazer" reconhecer. */
  async function aplicarFiltroTema(f: FiltroTema, motivo = "marcado por você", itensAlvo?: Item[]) {
    const alvos = itensAlvo ?? alcanceTemas[f.id]?.itens ?? [];
    if (!alvos.length) { notificar(`${f.rotulo}: o checklist não tem item sobre isso.`); return; }
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let aplicados = 0, substituidos = 0;
    for (const it of alvos) {
      const statusAnterior = novasMarcas[it.id];
      if (statusAnterior === "nao_aplica" && (novasFontes[it.id] ?? "").startsWith(`Filtro "${f.rotulo}"`)) continue; // já é deste filtro
      if (statusAnterior) substituidos++;
      novasMarcas[it.id] = "nao_aplica";
      novasFontes[it.id] = embutirRestauracao(`Filtro "${f.rotulo}" — ${f.explica} (${motivo})`, statusAnterior, novasFontes[it.id]);
      aplicados++;
    }
    if (!aplicados) { notificar(`${f.rotulo}: todos os itens já estavam marcados por este filtro.`); return; }
    const bloco =
      `━━━ FILTRO APLICADO: ${f.rotulo} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → Não se Aplica (${motivo})\n` +
      `↳ ${f.explica}`;
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;
    setMarcas(novasMarcas); setFontes(novasFontes); setObservacoes(novasObs);
    await salvar(novasMarcas, novasFontes, novasObs, true);
    notificar(`${f.rotulo}: ${aplicados} item(ns) marcados` + (substituidos ? ` (${substituidos} substituindo marcação anterior — "Desfazer" devolve).` : "."));
  }

  /** Desfaz um filtro: item que não tinha nada antes volta a ficar em branco; item que tinha uma
   * marcação (manual ou de outro filtro) recebe exatamente aquela marcação de volta. */
  async function desfazerFiltroTema(f: FiltroTema) {
    const assinatura = `Filtro "${f.rotulo}"`;
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let devolvidos = 0, restaurados = 0;
    for (const id of Object.keys(novasFontes)) {
      if (!(novasFontes[id] ?? "").startsWith(assinatura)) continue;
      const restauro = extrairRestauracao(novasFontes[id]);
      if (restauro) {
        novasMarcas[id] = restauro.status;
        novasFontes[id] = restauro.fonte;
        restaurados++;
      } else {
        delete novasMarcas[id];
        delete novasFontes[id];
      }
      devolvidos++;
    }
    if (!devolvidos) { notificar(`${f.rotulo}: nada a desfazer.`); return; }
    const bloco =
      `━━━ FILTRO DESFEITO: ${f.rotulo} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${devolvidos} item(ns) voltaram para a análise` +
      (restaurados ? ` (${restaurados} com a marcação de antes restaurada)` : "");
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;
    setMarcas(novasMarcas); setFontes(novasFontes); setObservacoes(novasObs);
    await salvar(novasMarcas, novasFontes, novasObs, true);
    notificar(`${f.rotulo} desfeito — ${devolvidos} item(ns) voltaram${restaurados ? `, ${restaurados} com a marcação de antes` : ""}.`);
  }

  /** Marca (ou limpa) o grupo inteiro de uma vez — grava sempre, como qualquer marcação de item. */
  function marcarGrupo(grupo: string, status: Status | null, salvarAgora = true) {
    const lista = porGrupo.get(grupo) ?? [];
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    for (const i of lista) {
      if (status) { novasMarcas[i.id] = status; novasFontes[i.id] = "manual"; }
      else { delete novasMarcas[i.id]; delete novasFontes[i.id]; }
    }
    setMarcas(novasMarcas);
    setFontes(novasFontes);
    notificar(status
      ? `${grupo}: ${lista.length} item(ns) → ${ESTILO[status].rotulo}.`
      : `${grupo}: ${lista.length} item(ns) limpos.`);
    if (salvarAgora) void salvar(novasMarcas, novasFontes, observacoes, true);
  }

  async function preencherDoLip() {
    setLendoLip(true);
    setProposta(null);
    try {
      const r = await fetch("/api/mac/slot-05/preencher-automatico", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao ler o LIP");
      setProposta(d);
      setPainelFiltros(true);
      setAbaAtual(null);
      if (d.total === 0) notificar("O LIP não permitiu decidir nenhum grupo sozinho.");
    } catch (e: any) {
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setLendoLip(false);
    }
  }

  /** Aplica UM filtro. Nunca sobrescreve item que o analista já respondeu. */
  async function aceitarFiltro(f: FiltroProposto) {
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let aplicados = 0;
    for (const id of f.itensIds) {
      if (novasMarcas[id]) continue;
      novasMarcas[id] = f.statusAlvo;
      novasFontes[id] = `Filtro "${f.nome}" — ${f.justificativa}`;
      aplicados++;
    }
    if (!aplicados) { notificar(`"${f.nome}": todos os itens já estavam respondidos.`); marcarDecidido(f, "aceito"); return; }

    const bloco =
      `━━━ FILTRO APLICADO: ${f.nome} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) → ${ESTILO[f.statusAlvo].rotulo}` +
      `${f.recomendado ? "" : " (aceito contra a recomendação do sistema)"}\n` +
      `↳ ${f.justificativa}\n` +
      f.grupos.map((g) => `  • ${g.qtd}× ${g.grupo}`).join("\n");
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    marcarDecidido(f, "aceito");
    await salvar(novasMarcas, novasFontes, novasObs);
    notificar(`"${f.nome}": ${aplicados} item(ns) saíram da análise.`);
  }

  function marcarDecidido(f: FiltroProposto, decisao: "aceito" | "recusado") {
    setDecisoes((prev) => ({ ...prev, [f.id]: decisao }));
  }

  /**
   * LER PASTA (IA): manda a pasta inteira; o servidor acha o último de cada documento e o Gemini
   * avalia os itens pendentes. Nada é gravado sem o analista aceitar — a resposta vira proposta.
   *
   * A rota responde NDJSON (mesmo formato do /api/lip/ler-pasta): uma linha "progresso" por
   * evento (catalogando → enviando cada PDF → analisando), última linha "resultado" ou "erro".
   * A fase "analisando" é a chamada única ao Gemini (1-3min) — sem progresso real possível ali,
   * então uma rampa por tempo (até 92%) preenche a espera, igual à barra do LIP.
   */
  async function lerPastaIA(arquivos: File[]) {
    setLendoPasta(true);
    setProgressoPasta(0);
    setTempoPasta(0);
    setDocPasta(null);
    if (tempoPastaRef.current) clearInterval(tempoPastaRef.current);
    tempoPastaRef.current = setInterval(() => setTempoPasta((t) => t + 1), 1000);

    const pararRampa = () => {
      if (rampaPastaRef.current) { clearInterval(rampaPastaRef.current); rampaPastaRef.current = null; }
    };

    try {
      const fd = new FormData();
      fd.append("codigo", codigo);
      // Pergunta ao Gemini, junto com o checklist, se cada tema existe neste processo — é assim que
      // zona aeroportuária / militar / área de lazer se resolvem sozinhas em outros processos.
      fd.append("temas", JSON.stringify(FILTROS_TEMA.map((f) => f.tema)));
      arquivos.forEach((f, i) => {
        fd.append(`arquivo_${i}`, f);
        fd.append(`caminho_${i}`, (f as any).webkitRelativePath || f.name);
      });
      const r = await fetch("/api/mac/slot-05/ler-pasta", { method: "POST", credentials: "include", body: fd });
      if (!r.body) throw new Error(`o servidor respondeu HTTP ${r.status} sem corpo`);

      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      let d: any = null;
      let erroFluxo: string | null = null;

      const processarLinha = (bruta: string) => {
        const l = bruta.trim();
        if (!l) return;
        let ev: any;
        try { ev = JSON.parse(l); } catch { return; }
        if (ev.tipo === "progresso") {
          if (ev.fase === "catalogando") {
            setProgressoPasta(3);
            setDocPasta(ev.documento ?? null);
          } else if (ev.fase === "enviando") {
            const frac = ev.total > 0 ? ev.atual / ev.total : 0;
            setProgressoPasta(Math.min(45, Math.round(5 + frac * 40)));
            setDocPasta(ev.documento ?? null);
          } else if (ev.fase === "analisando") {
            setDocPasta(ev.documento ?? "Gemini analisando...");
            pararRampa();
            let p = 45;
            rampaPastaRef.current = setInterval(() => {
              p += Math.random() * 2;
              if (p >= 92) { p = 92; pararRampa(); }
              setProgressoPasta(Math.round(p));
            }, 800);
          }
        } else if (ev.tipo === "erro") {
          erroFluxo = ev.erro || "Falha na leitura";
        } else if (ev.tipo === "resultado") {
          d = ev;
        }
      };

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linhaBruta of linhas) processarLinha(linhaBruta);
      }
      if (resto.trim()) processarLinha(resto);

      pararRampa();
      if (erroFluxo) throw new Error(erroFluxo);
      if (!d || !d.ok) throw new Error(d?.erro ?? "falha na leitura");
      setProgressoPasta(100);

      const novasMarcas = { ...marcas };
      const novasFontes = { ...fontes };
      let aplicados = 0;
      for (const [id, st] of Object.entries(d.itens ?? {})) {
        if (novasMarcas[id]) continue;           // nunca sobrescreve resposta existente
        novasMarcas[id] = st as Status;
        novasFontes[id] = d.fontes?.[id] ?? "IA";
        aplicados++;
      }
      const bloco =
        `━━━ LEITURA DA PASTA COM IA ━━━\n` +
        `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) sugeridos de ${d.avaliados} pendentes\n` +
        `Documentos lidos (últimos de cada): ${(d.documentosLidos ?? []).map((x: any) => `${x.papel} (${x.arquivo})`).join(" · ")}\n` +
        `Arquivos na pasta: ${d.arquivosNaPasta} · modelo ${d.modelo} · prompt v${d.versaoPrompt}` +
        ((d.incompatibilidades ?? []).length
          ? `\nIncompatibilidades apontadas:\n${d.incompatibilidades.map((s: string) => `  ⚠ ${s}`).join("\n")}` : "");
      const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;

      setMarcas(novasMarcas); setFontes(novasFontes); setObservacoes(novasObs);
      await salvar(novasMarcas, novasFontes, novasObs, true);

      /* Temas: "existe: nao" = o tema não está neste processo, então o que fala dele sai da análise.
       * "sim" mantém tudo, "incerto" não decide nada — o analista marca o botão se quiser. */
      for (const f of FILTROS_TEMA) {
        const resposta = (d.temas ?? {})[f.tema];
        if (!resposta || String(resposta.existe ?? "").toLowerCase() !== "nao") continue;
        if (!(alcanceTemas[f.id]?.itens ?? []).length) continue;
        await aplicarFiltroTema(f, `leitura da pasta: ${String(resposta.evidencia ?? "sem detalhe").slice(0, 120)}`);
      }

      // Unidade territorial lida no Uso DO SOLO desta pasta — é assim, e só assim, que o campo do
      // filtro se preenche sozinho.
      const utLida = siglaDaUnidade(String(d.unidadeTerritorial ?? ""));
      const notaNbr = d.nbrAcessibilidadeUsada ? " · ÍTEM 48 avaliado com o texto oficial da NBR 9050." : "";
      if (utLida) {
        trocarUnidade(utLida);
        notificar(`IA sugeriu ${aplicados} item(ns) · unidade territorial lida no Uso do Solo: ${utLida}.${notaNbr}`);
      } else {
        notificar(
          `IA sugeriu ${aplicados} item(ns) — confira: a fonte de cada um está no item.${notaNbr}` +
          (d.usoDoSoloLido === false ? " O Uso do Solo não estava na pasta: informe a unidade territorial à mão." : ""),
        );
      }
    } catch (e: any) {
      notificar(`Erro na leitura: ${e?.message ?? e}`);
    } finally {
      pararRampa();
      if (tempoPastaRef.current) { clearInterval(tempoPastaRef.current); tempoPastaRef.current = null; }
      setLendoPasta(false);
      setTimeout(() => { setProgressoPasta(0); setDocPasta(null); }, 1500);
    }
  }

  /** Restaura a análise a partir do Excel exportado desta tela. */
  async function importarExcel(arquivo: File) {
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append("codigo", codigo);
      fd.append("arquivo", arquivo);
      const r = await fetch("/api/mac/slot-05/importar", { method: "POST", credentials: "include", body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao importar");
      notificar(
        `${d.restaurados} item(ns) restaurados na análise ${d.analise}` +
        (d.foraDoModelo ? ` · ${d.foraDoModelo} ignorados (fora do checklist do Slot 5)` : ""),
      );
      window.location.reload();
    } catch (e: any) {
      notificar(`Erro ao importar: ${e?.message ?? e}`);
    } finally {
      setImportando(false);
    }
  }

  /** Zera as respostas da análise em aberto. O histórico guarda o que existia. */
  async function limparMac() {
    setConfirmarLimpar(false);
    try {
      const r = await fetch("/api/mac/slot-05/manutencao", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, acao: "limpar" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao limpar");
      setMarcas({});
      setFontes({});
      setDecisoes({});
      notificar(`MAC limpo — ${d.limpos} item(ns) voltaram para pendente.`);
    } catch (e: any) {
      notificar(`Erro ao limpar: ${e?.message ?? e}`);
    }
  }

  async function toggleMacIncompleto() {
    const novo = !macIncompleto;
    setMacIncompleto(novo); // otimista — a pilha de processos é quem mais se beneficia
    setSalvandoIncompleto(true);
    try {
      const r = await fetch("/api/mac/slot-05/manutencao", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, acao: "mac_incompleto", valor: novo }),
      });
      const d = await r.json();
      if (!d.ok) { setMacIncompleto(!novo); notificar(`Erro: ${d.erro}`); }
    } catch (e: any) {
      setMacIncompleto(!novo);
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvandoIncompleto(false);
    }
  }

  /**
   * Desfaz um filtro já aplicado: devolve à análise só os itens que VIERAM DELE — reconhecidos
   * pela fonte gravada. Item que o analista respondeu à mão nunca é limpo.
   */
  async function desfazerFiltro(f: FiltroProposto) {
    const assinatura = `Filtro "${f.nome}"`;
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let devolvidos = 0;
    for (const id of f.itensIds) {
      if (!(novasFontes[id] ?? "").startsWith(assinatura)) continue;
      delete novasMarcas[id];
      delete novasFontes[id];
      devolvidos++;
    }
    if (!devolvidos) { notificar(`"${f.nome}": nada a desfazer.`); marcarDecidido(f, "recusado"); return; }

    const bloco =
      `━━━ FILTRO DESFEITO: ${f.nome} ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${devolvidos} item(ns) voltaram para a análise\n` +
      `↳ ${f.justificativa}`;
    const novasObs = observacoes ? `${bloco}\n\n${observacoes}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    marcarDecidido(f, "recusado");
    await salvar(novasMarcas, novasFontes, novasObs, true);
    notificar(`"${f.nome}" desfeito — ${devolvidos} item(ns) voltaram para a análise.`);
  }

  const gruposFiltrados = useMemo(() => {
    const q = semAcento(busca.trim());
    let lista = q ? grupos.filter((g) => (stats[g]?.busca ?? "").includes(q)) : grupos;
    // "Resolvido" = grupo fechado e sem erro: tudo conforme (verde) ou tudo não se aplica (azul).
    // Some da lista pra sobrar na tela só o que ainda pede atenção.
    if (ocultarResolvidos) {
      lista = lista.filter((g) => {
        const e = stats[g]?.estado;
        return e !== "verde" && e !== "azul";
      });
    }
    return lista;
  }, [grupos, busca, stats, ocultarResolvidos]);

  /** Quantos grupos o botão "ocultar resolvidos" tira da tela. */
  const gruposResolvidos = useMemo(
    () => grupos.filter((g) => stats[g]?.estado === "verde" || stats[g]?.estado === "azul").length,
    [grupos, stats],
  );

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;
  if (erro) return (
    <div className="p-6">
      <p className="text-sm text-[var(--error)] mb-3">{erro}</p>
      <button onClick={() => router.push("/processos")} className="text-sm underline">← Processos</button>
    </div>
  );

  const itensDaAba = abaAtual && abaAtual !== ABA_OBS ? (porGrupo.get(abaAtual) ?? []) : [];

  const naoRespondidos = itensChecklist.filter((i) => !marcas[i.id]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ─── Barra de pendências LIP/MAC — mesmo padrão do Slot 1 ─────── */}
      {(pendenciasLip.length > 0 || naoRespondidos.length > 0) && (
        <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
          <div onClick={() => setBannerAberto((v) => !v)}
            style={{ cursor: "pointer", background: "var(--error)", color: "var(--accent-fg)",
              padding: "10px 16px", fontSize: 13, fontWeight: 600,
              borderBottom: "2px solid var(--border-strong)",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              {pendenciasLip.length > 0 && `⚠ LIP: ${pendenciasLip.join(", ")}. `}
              {naoRespondidos.length > 0 && `⬜ ${naoRespondidos.length} não verificado(s) no MAC. `}
            </span>
            <span style={{ marginLeft: 12, whiteSpace: "nowrap" }}>
              {bannerAberto ? "▲ Fechar" : "▼ Ver itens"}
            </span>
          </div>
          {bannerAberto && (
            <div style={{ background: "#7f1d1d", borderBottom: "2px solid var(--border-strong)",
              padding: "8px 16px 12px", maxHeight: "40vh", overflowY: "auto" }}>
              {pendenciasLip.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
                    Campos LIP em rascunho
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendenciasLip.map((p) => (
                      <a key={p} href={`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`}
                        style={{ fontSize: 12, color: "white", background: "rgba(255,255,255,0.2)",
                          borderRadius: 4, padding: "3px 10px", textDecoration: "none", fontWeight: 600 }}>
                        {p} →
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {naoRespondidos.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: "#fca5a5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>
                    Não verificados no MAC — {naoRespondidos.length}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {naoRespondidos.slice(0, 60).map((item) => (
                      <button key={item.id}
                        onClick={() => { setAbaAtual(item.grupo); setBannerAberto(false); }}
                        style={{ fontSize: 11, color: "white", textAlign: "left",
                          background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "4px 10px",
                          cursor: "pointer", border: "none", width: "100%" }}>
                        ❌ <strong>[{item.grupo}]</strong>{" "}
                        {item.texto.length > 100 ? item.texto.slice(0, 100) + "…" : item.texto}
                      </button>
                    ))}
                    {naoRespondidos.length > 60 && (
                      <p style={{ fontSize: 11, color: "#fca5a5" }}>
                        …e mais {naoRespondidos.length - 60} item(ns).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-4">
        {/* ─── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push("/"); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-red-800 hover:bg-red-700 text-red-200 px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🚪 Sair
            </button>
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← LIP
            </button>
            <button onClick={() => window.open(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`, "_blank")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
              🔍 Ver LIP ↗
            </button>
            <button onClick={() => router.push(`/admin/checklists?tipo=slot_05&voltar=${encodeURIComponent(`/analise-aprovacao-projeto/${codigo}`)}&rotulo=${encodeURIComponent("Voltar ao MAC")}`)}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              📋 Gerenciar MAC
            </button>
            <a href={`/api/mac/slot-05/exportar?codigo=${encodeURIComponent(codigo)}`} download
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors"
              title="Baixa todos os itens com status, filtro que marcou e observações — dá para restaurar tudo">
              📊 Exportar Excel
            </a>
            <button type="button" onClick={() => inputImportRef.current?.click()} disabled={importando}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded text-sm transition-colors"
              title="Restaura a análise a partir de um Excel exportado desta tela">
              {importando ? "⏳ Importando…" : "📥 Importar Excel"}
            </button>
            <input ref={inputImportRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarExcel(f); e.target.value = ""; }} />
          </div>

          <div>
            <h1 className="text-xl font-bold">🔍 MAC — Módulo de Análises e Conformidades</h1>
            <p className="text-xs text-[var(--text-muted)]">Aprovação de Projeto</p>
            {salvando
              ? <p className="text-xs text-[var(--warning)] animate-pulse">⏳ Salvando…</p>
              : <p className="text-xs text-[var(--success)]">✓ Salvo automaticamente</p>}
            <p className="text-sm">
              <span className="text-[var(--text-muted)]">Nº do Alvará (Projeto): </span>
              <span className="font-mono text-[var(--accent)]">{codigo}</span>
            </p>
            {processo?.proprietario && (
              <p className="text-xs text-[var(--text-muted)]">{processo.proprietario}</p>
            )}
            {(processo?.logradouro || processo?.bairro) && (
              <p className="text-xs text-[var(--text-muted)]">
                {[processo.logradouro, processo.bairro].filter(Boolean).join(" · ")}
              </p>
            )}
            {processo?.areaTotal && (
              <p className="text-xs text-[var(--text-muted)]">Área total: {processo.areaTotal} m²</p>
            )}
            {/* Uma análise pode ter emitido despacho E parecer — são séries distintas. */}
            {(() => {
              const emitidos = [
                analise?.numero_despacho ? `Despacho nº ${analise.numero_despacho}` : null,
                analise?.numero_despacho_interno ? `Despacho Interno nº ${analise.numero_despacho_interno}` : null,
                analise?.numero_parecer ? `Parecer nº ${analise.numero_parecer}` : null,
              ].filter(Boolean);
              return emitidos.length ? (
                <p className="text-[var(--success)] text-xs font-bold mt-0.5">
                  Análise {numeroAnaliseEmAndamento} concluída — {emitidos.join(" e ")}
                </p>
              ) : (
                <p className="text-[var(--accent)] text-xs font-bold mt-0.5">
                  Análise {numeroAnaliseEmAndamento} em andamento{analise ? "" : " (não salva)"}
                </p>
              );
            })()}
          </div>

          {/* Monitor de preenchimento do MAC — dentro do fluxo, nunca sobre o texto */}
          {(() => {
            const total = itensChecklist.length;
            const respondidos = total - totais.pendente;
            const pct = total ? Math.round((respondidos / total) * 100) : 0;
            const pctFiltro = total ? Math.round((origemDasRespostas.porFiltro / total) * 100) : 0;
            const cor = pct >= 100 ? "#059669" : pct >= 60 ? "#84cc16" : pct >= 30 ? "#eab308" : "#ef4444";
            const rExt = 34, rInt = 25;
            return (
              <div className="shrink-0 flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                <svg width="82" height="82" viewBox="0 0 82 82">
                  <circle cx="41" cy="41" r={rExt} fill="none" stroke="var(--border)" strokeWidth="7" />
                  <circle cx="41" cy="41" r={rExt} fill="none" stroke={cor} strokeWidth="7"
                    strokeDasharray={`${(pct / 100) * 2 * Math.PI * rExt} ${2 * Math.PI * rExt}`}
                    strokeLinecap="round" transform="rotate(-90 41 41)" />
                  <circle cx="41" cy="41" r={rInt} fill="none" stroke="#2563EB" strokeWidth="5" opacity="0.45"
                    strokeDasharray={`${(pctFiltro / 100) * 2 * Math.PI * rInt} ${2 * Math.PI * rInt}`}
                    strokeLinecap="round" transform="rotate(-90 41 41)" />
                  <text x="41" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill={cor}>{pct}%</text>
                </svg>
                <span className="text-[9px] font-bold uppercase tracking-tight text-[var(--text-muted)] text-center leading-tight w-[92px]">
                  Monitor de<br />preenchimento do MAC
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-semibold">
                  {respondidos}/{total}
                </span>
                <span className="text-[10px] text-[#2563EB]">🎛️ {pctFiltro}% por filtro</span>
              </div>
            );
          })()}
        </div>

        {/* ─── Painel de números: contagem por status e origem ──────────── */}
        <div className="mt-3 mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
            {STATUS.map((s) => (
              <button key={s} type="button"
                onClick={() => abrirLista(ESTILO[s].rotulo, (i) => marcas[i.id] === s)}
                className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--bg-card-hover)] transition-colors">
                <span className="w-7 h-7 rounded-lg border flex items-center justify-center text-sm shrink-0"
                  style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda }}>
                  {ESTILO[s].icone}
                </span>
                <div className="leading-tight text-left">
                  <p className="text-base font-bold" style={{ color: ESTILO[s].texto }}>{totais[s]}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{ESTILO[s].rotulo}</p>
                </div>
              </button>
            ))}

            <button type="button"
              onClick={() => abrirLista("Pendentes", (i) => !marcas[i.id])}
              className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--bg-card-hover)] transition-colors">
              <span className="w-7 h-7 rounded-lg border border-[#EA580C] bg-[#FFF7ED] flex items-center justify-center text-sm shrink-0">
                ⏳
              </span>
              <div className="leading-tight text-left">
                <p className="text-base font-bold text-[#EA580C]">{totais.pendente}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Pendentes</p>
              </div>
            </button>

            <div className="w-px self-stretch bg-[var(--border)]" />

            <button type="button"
              onClick={() => abrirLista("Retirados por filtro", (i) => !!marcas[i.id] && (fontes[i.id] ?? "").startsWith("Filtro"))}
              className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--bg-card-hover)] transition-colors">
              <span className="w-7 h-7 rounded-lg border border-[#2563EB] bg-[#EFF6FF] flex items-center justify-center text-sm shrink-0">
                🎛️
              </span>
              <div className="leading-tight text-left">
                <p className="text-base font-bold text-[#2563EB]">{origemDasRespostas.porFiltro}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Retirados por filtro</p>
              </div>
            </button>

            <button type="button"
              onClick={() => abrirLista("Sugeridos pela IA (LER PASTA)", (i) => !!marcas[i.id] && (fontes[i.id] ?? "").startsWith("IA"))}
              className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--bg-card-hover)] transition-colors">
              <span className="w-7 h-7 rounded-lg border border-[#059669] bg-[#ECFDF5] flex items-center justify-center text-sm shrink-0">
                🤖
              </span>
              <div className="leading-tight text-left">
                <p className="text-base font-bold text-[#059669]">{origemDasRespostas.porIA}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Sugerido por IA</p>
              </div>
            </button>

            <button type="button"
              onClick={() => abrirLista("Marcados por você", (i) => {
                const f = fontes[i.id] ?? "";
                return !!marcas[i.id] && !f.startsWith("Filtro") && !f.startsWith("IA");
              })}
              className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-[var(--bg-card-hover)] transition-colors">
              <span className="w-7 h-7 rounded-lg border border-[#7C3AED] bg-[#F5F3FF] flex items-center justify-center text-sm shrink-0">
                ✍️
              </span>
              <div className="leading-tight text-left">
                <p className="text-base font-bold text-[#7C3AED]">{origemDasRespostas.porAnalista}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Marcados por você</p>
              </div>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <div className="leading-tight text-right">
                <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                  {itensChecklist.length} itens · {grupos.length} grupos
                </p>
                <a href="https://www.ilovepdf.com/pt/comprimir_pdf" target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  🗜️ Comprimir PDF
                </a>
              </div>
            </div>
          </div>

          {/* barra de progresso: azul = filtro · verde = IA · roxo = você */}
          <div className="mt-3 h-2 w-full rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
            <div style={{ width: `${itensChecklist.length ? (origemDasRespostas.porFiltro / itensChecklist.length) * 100 : 0}%`, background: "#2563EB" }} />
            <div style={{ width: `${itensChecklist.length ? (origemDasRespostas.porIA / itensChecklist.length) * 100 : 0}%`, background: "#059669" }} />
            <div style={{ width: `${itensChecklist.length ? (origemDasRespostas.porAnalista / itensChecklist.length) * 100 : 0}%`, background: "#7C3AED" }} />
          </div>
        </div>

        {/* Progresso do LER PASTA (IA) — mesmo padrão do LIP: doc lido + tempo + % */}
        {progressoPasta > 0 && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 mb-2">
            <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span className="truncate pr-2">📁 {docPasta ?? "Lendo a pasta..."}</span>
              <span className="flex gap-2 shrink-0">
                <span className="text-[var(--text-muted)]">
                  {String(Math.floor(tempoPasta / 60)).padStart(2, "0")}:{String(tempoPasta % 60).padStart(2, "0")}
                </span>
                <span>{progressoPasta}%</span>
              </span>
            </div>
            <div className="w-full bg-[var(--bg-secondary)] rounded-full h-2">
              <div className="bg-[#2563EB] h-2 rounded-full transition-all duration-300" style={{ width: `${progressoPasta}%` }} />
            </div>
          </div>
        )}

        {toast && <p className="text-xs text-[var(--accent)] mb-2">{toast}</p>}
      </div>

      {/* ─── Corpo: conteúdo + coluna de ações ──────────────────────── */}
      <div className="flex gap-4 px-6 pb-8">
        <div className="flex-1 min-w-0">
          {/* Barra para reabrir o painel quando ele está escondido */}
          {proposta && !painelFiltros && (
            <button onClick={() => setPainelFiltros(true)}
              className="w-full mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#2563EB] bg-[#EFF6FF] px-4 py-2 text-left hover:bg-[#DBEAFE] transition-colors">
              <span className="text-sm font-bold text-[#2563EB]">
                🎛️ Filtros de aplicabilidade — {proposta.filtros.filter((f) => f.recomendado).length} aplicados ·{" "}
                {proposta.filtros.filter((f) => !f.recomendado).length} disponíveis
              </span>
              <span className="text-xs font-semibold text-[#2563EB]">▼ Ver filtros</span>
            </button>
          )}

          {/* Filtros — recomendados e não recomendados, decididos um a um */}
          {proposta && painelFiltros && (
            <div className="border border-[#2563EB] rounded-lg p-4 mb-4 bg-[var(--bg-card)]">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <p className="text-sm font-bold">🎛️ Filtros de aplicabilidade</p>
                <button onClick={() => setPainelFiltros(false)}
                  className="text-[11px] font-semibold text-[#2563EB] hover:underline">▲ esconder</button>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">
                Lido de {proposta.camposPreenchidos} campos do LIP e do texto dos documentos da pasta.
                Os <b>recomendados já marcaram Não se Aplica</b> nos itens deles — use
                <b> Desfazer</b> no que discordar. Item que você respondeu à mão nunca é tocado.
              </p>

              {(["recomendados", "naoRecomendados"] as const).map((faixa) => {
                const lista = proposta.filtros.filter((f) =>
                  faixa === "recomendados" ? f.recomendado : !f.recomendado);
                if (!lista.length) return null;
                const recomendado = faixa === "recomendados";
                return (
                  <div key={faixa} className="mb-4">
                    <p className="text-[10px] uppercase font-bold mb-1"
                      style={{ color: recomendado ? "#16A34A" : "#EA580C" }}>
                      {recomendado
                        ? `✔ Aplicados — o processo não tem estes temas (${lista.length})`
                        : `✖ Não recomendados — o tema aparece no processo (${lista.length}) · aplique se discordar`}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {lista.map((f) => {
                        const decisao = decisoes[f.id];
                        return (
                          <div key={f.id}
                            className="border rounded-lg px-3 py-2 flex items-start gap-3"
                            style={{
                              borderColor: decisao === "aceito" ? "#16A34A"
                                : decisao === "recusado" ? "#94A3B8" : "var(--border)",
                              opacity: decisao ? 0.65 : 1,
                            }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white"
                                  style={{ background: recomendado ? "var(--primary)" : "#94A3B8" }}>
                                  {f.nome}
                                </span>
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                  {f.qtd} item(ns) → {ESTILO[f.statusAlvo].rotulo}
                                </span>
                                {decisao === "aceito" && (
                                  <span className="text-[10px] font-bold" style={{ color: "#16A34A" }}>
                                    ✓ aplicado — itens marcados Não se Aplica
                                  </span>
                                )}
                                {decisao === "recusado" && (
                                  <span className="text-[10px] font-bold" style={{ color: "#64748B" }}>
                                    ✗ fora — itens seguem na análise
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">↳ {f.justificativa}</p>
                              {!!f.grupos.length && (
                                <p className="text-[10px] text-[var(--text-muted)]">
                                  {f.grupos.map((g) => `${g.qtd}× ${g.grupo}`).join(" · ")}
                                </p>
                              )}
                              {f.grupos.length > 1 && (
                                <p className="text-[10px] text-[var(--text-muted)] italic">
                                  alcança {f.grupos.length} grupo(s) — inclui itens achados pelo texto
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {decisao === "aceito" ? (
                                <button onClick={() => desfazerFiltro(f)}
                                  className="px-2 py-1 rounded text-[11px] font-bold border transition-colors"
                                  style={{ background: "#FEF2F2", borderColor: "#DC2626", color: "#DC2626" }}>
                                  ↩ Desfazer
                                </button>
                              ) : (
                                <button onClick={() => aceitarFiltro(f)} disabled={f.qtd === 0}
                                  className="px-2 py-1 rounded text-[11px] font-bold border transition-colors disabled:opacity-40"
                                  style={{ background: "#ECFDF5", borderColor: "#059669", color: "#059669" }}>
                                  ⬜ Aplicar N/A
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!!proposta.indecisas.length && (
                <div>
                  <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                    Sem dado para decidir ({proposta.indecisas.length})
                  </p>
                  {proposta.indecisas.map((i) => (
                    <p key={i.regraId} className="text-[10px] text-[var(--text-secondary)]">
                      • {i.nome} — {i.camposFaltando.join(", ") || "—"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contra-conferência recolhida */}
          {ccRelatorio && !ccPainel && (
            <button onClick={() => { setCcPainel(true); setAbaAtual(null); }}
              className="w-full mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#7C3AED] bg-[#F5F3FF] px-4 py-2 text-left hover:bg-[#EDE9FE] transition-colors">
              <span className="text-sm font-bold text-[#6D28D9]">
                🔍 Contra-conferência ({ccRelatorio.ia}) — {ccRelatorio.achados.length} achado(s) ·{" "}
                {ccRelatorio.achados.filter((a) => !ccDecisoes[a.item]).length} sem decisão
              </span>
              <span className="text-xs font-semibold text-[#6D28D9]">▼ Ver achados</span>
            </button>
          )}

          {/* Contra-conferência — achados de uma IA de fora, decididos um a um */}
          {ccRelatorio && ccPainel && (
            <div className="border border-[#7C3AED] rounded-lg p-4 mb-4 bg-[var(--bg-card)]">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <p className="text-sm font-bold">🔍 Contra-conferência — {ccRelatorio.ia}</p>
                <div className="flex gap-3">
                  <button onClick={() => { setCcRelatorio(null); setCcDecisoes({}); }}
                    className="text-[11px] font-semibold text-[var(--text-muted)] hover:underline">descartar</button>
                  <button onClick={() => setCcPainel(false)}
                    className="text-[11px] font-semibold text-[#6D28D9] hover:underline">▲ esconder</button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">
                Auditoria feita por uma IA <b>de fora</b>, com os documentos da pasta na mão.
                É opinião, não veredito — <b>nada foi marcado</b>. Aceite só o que a evidência convencer.
              </p>

              {!ccRelatorio.achados.length && (
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  A IA não contestou nenhum item do checklist.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                {ccRelatorio.achados.map((a) => {
                  const decisao = ccDecisoes[a.item];
                  const cor = a.gravidade === "GRAVE" ? "#DC2626"
                    : a.gravidade === "MEDIO" ? "#EA580C" : "#64748B";
                  return (
                    <div key={a.item}
                      className="border rounded-lg px-3 py-2"
                      style={{
                        borderColor: decisao === "aceito" ? "#16A34A"
                          : decisao === "recusado" ? "#94A3B8" : "var(--border)",
                        opacity: decisao ? 0.65 : 1,
                      }}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white"
                              style={{ background: cor }}>
                              {a.gravidade}
                            </span>
                            <span className="font-mono text-[11px] font-bold">{a.item}</span>
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              {ESTILO[a.statusAtual as Status]?.rotulo ?? "Em branco"}
                              {" → "}
                              {a.aplicavel ? ESTILO[a.euDigo as Status].rotulo : "não verificável"}
                            </span>
                            {decisao === "aceito" && (
                              <span className="text-[10px] font-bold" style={{ color: "#16A34A" }}>✓ aceito</span>
                            )}
                            {decisao === "recusado" && (
                              <span className="text-[10px] font-bold" style={{ color: "#64748B" }}>✗ recusado</span>
                            )}
                          </div>
                          <p className="text-[11px] mt-1">{a.textoItem}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">↳ {a.evidencia}</p>
                          {a.problema && (
                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: "#EA580C" }}>
                              ⚠ {a.problema}
                            </p>
                          )}
                        </div>
                        {!decisao && (
                          <div className="flex gap-1 shrink-0">
                            {a.aplicavel && !a.problema?.startsWith("a resposta proposta") && (
                              <button onClick={() => void aceitarAchado(a)}
                                className="px-2 py-1 rounded text-[10px] font-bold border"
                                style={{ borderColor: "#16A34A", color: "#16A34A" }}>
                                Aceitar
                              </button>
                            )}
                            <button onClick={() => recusarAchado(a)}
                              className="px-2 py-1 rounded text-[10px] font-bold border border-[var(--border)] text-[var(--text-muted)]">
                              {a.aplicavel ? "Recusar" : "Ciente"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!!ccRelatorio.errosFicha.length && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">
                    Erros apontados na ficha do LIP ({ccRelatorio.errosFicha.length}) — corrija no LIP, não aqui
                  </p>
                  {ccRelatorio.errosFicha.map((e, i) => (
                    <p key={i} className="text-[10px] text-[var(--text-secondary)]">
                      • <b>{e.campo}</b>: consta &quot;{e.sistemaAnotou}&quot; · correto seria &quot;{e.correto}&quot; — {e.evidencia}
                    </p>
                  ))}
                </div>
              )}

              {!!ccRelatorio.faltaNaPasta.length && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-1">
                    Falta na pasta ({ccRelatorio.faltaNaPasta.length})
                  </p>
                  {ccRelatorio.faltaNaPasta.map((f, i) => (
                    <p key={i} className="text-[10px] text-[var(--text-secondary)]">• {f}</p>
                  ))}
                </div>
              )}

              {!!ccRelatorio.descartados.length && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase font-bold mb-1" style={{ color: "#EA580C" }}>
                    Descartados na importação ({ccRelatorio.descartados.length})
                  </p>
                  {ccRelatorio.descartados.map((d, i) => (
                    <p key={i} className="text-[10px] text-[var(--text-secondary)]">• {d.item}: {d.motivo}</p>
                  ))}
                </div>
              )}

              {!!ccRelatorio.confianca && (
                <p className="text-[10px] text-[var(--text-muted)] italic mt-3">
                  Grau de confiança declarado pela IA: {ccRelatorio.confianca}
                </p>
              )}
            </div>
          )}

          {/* LISTA aberta por um número clicável do painel — some ao entrar num grupo ou fechar */}
          {abaAtual === null && listaFiltrada && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setListaFiltrada(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] shadow-sm transition-colors">
                  <span aria-hidden>←</span> Índice
                </button>
                <span className="font-bold">{listaFiltrada.titulo} — {listaFiltrada.itens.length} item(ns)</span>
              </div>
              {!listaFiltrada.itens.length ? (
                <p className="text-sm text-[var(--text-muted)]">Nenhum item aqui.</p>
              ) : (
                <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
                  {listaFiltrada.itens.map((it) => {
                    const origem = origemDoItem(fontes[it.id]);
                    return (
                      <button key={it.id} onClick={() => irParaItem(it)}
                        className="w-full text-left border-t border-[var(--border)] first:border-t-0 px-3 py-2 flex items-start gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wide">
                            <span className="font-mono">
                              {numeroDoItem.get(it.id)?.item ?? "?"}.{numeroDoItem.get(it.id)?.sub ?? "?"}
                            </span>
                            {" — "}{it.grupo}
                          </p>
                          <p className="text-xs whitespace-pre-wrap">{it.texto}</p>
                        </div>
                        {origem && (
                          <span title={origem.rotulo} className="text-sm shrink-0">{origem.icone}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ÍNDICE */}
          {abaAtual === null && !listaFiltrada && (
            <>
              {/* FILTRO DE UNIDADE TERRITORIAL — a sigla vai na frente do filtro */}
              <div className="mb-3 rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2"
                style={{ background: "#EFF6FF", borderColor: "#93C5FD" }}>
                <span className="text-xs font-bold uppercase tracking-wide">🗺️ Unidade territorial</span>
                <input value={unidadeTerritorial} onChange={(e) => trocarUnidade(e.target.value)}
                  placeholder="AAB, AOS, AA, ADD, APA..."
                  title="Sigla da unidade territorial do terreno — preenchida sozinha quando a leitura da pasta enxerga o Uso do Solo"
                  className="w-40 bg-white border border-[var(--border)] rounded-md px-2 py-1 text-sm font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <button onClick={() => void aplicarFiltroUnidade()}
                  disabled={!alcanceUnidade.minha || alcanceUnidade.pendentes === 0}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-colors disabled:opacity-40"
                  style={{ background: "#FFFFFF", borderColor: "#2563EB", color: "#2563EB" }}>
                  ⬜ Aplicar N/A ({alcanceUnidade.pendentes})
                </button>
                <button onClick={() => void desfazerFiltroUnidade()}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-colors"
                  style={{ background: "#FFFFFF", borderColor: "#DC2626", color: "#DC2626" }}>
                  ↩ Desfazer
                </button>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {alcanceUnidade.minha
                    ? `${alcanceUnidade.outras.length} item(ns) falam só de outra(s) unidade(s) · ` +
                      `${alcanceUnidade.daMinha} citam ${alcanceUnidade.minha} e ficam` +
                      (alcanceUnidade.excecoes
                        ? ` · ${alcanceUnidade.excecoes} com "exceto ..." ficam para você conferir`
                        : "")
                    : "vazio até a leitura da pasta ler o Uso do Solo — ou digite a sigla à mão"}
                </span>
              </div>
              {/* FILTROS DE TEMA — marcar = o tema não existe neste processo, e o que fala dele sai */}
              <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide">🚫 Não se aplica a este processo</span>
                {FILTROS_TEMA.map((f) => {
                  const a = alcanceTemas[f.id] ?? { itens: [], pendentes: 0, aplicado: false };
                  return (
                    <button key={f.id}
                      onClick={() => void (a.aplicado ? desfazerFiltroTema(f) : aplicarFiltroTema(f))}
                      disabled={!a.itens.length}
                      title={a.itens.length
                        ? `${f.explica} — ${a.itens.length} item(ns) do checklist`
                        : "o checklist não tem item sobre este tema"}
                      className="px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-colors disabled:opacity-40"
                      style={a.aplicado
                        ? { background: "#EFF6FF", borderColor: "#2563EB", color: "#2563EB" }
                        : { background: "#FFFFFF", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                      {a.aplicado ? "✓ " : "☐ "}{f.rotulo} ({a.itens.length})
                    </button>
                  );
                })}
                <span className="text-[11px] text-[var(--text-muted)]">
                  marcado = azul (Não se Aplica) · a leitura da pasta marca sozinha o que enxergar
                </span>
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar no checklist — ex.: recuo, acessibilidade, calçada"
                  className="flex-1 min-w-[260px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                {busca && (
                  <button onClick={() => setBusca("")}
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm">
                    Limpar
                  </button>
                )}
                <button onClick={() => setOcultarResolvidos((v) => !v)} disabled={!gruposResolvidos}
                  title="Some com os grupos fechados sem erro — tudo conforme ou tudo não se aplica"
                  className="px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
                  style={{
                    background: ocultarResolvidos ? "#16A34A" : "var(--bg-secondary)",
                    borderColor: ocultarResolvidos ? "#16A34A" : "var(--border)",
                    color: ocultarResolvidos ? "#fff" : "var(--text-secondary)",
                  }}>
                  {ocultarResolvidos ? `👁️ Mostrar todos (${gruposResolvidos} ocultos)` : `🙈 Ocultar resolvidos (${gruposResolvidos})`}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-1.5">
                Itens do checklist — {gruposFiltrados.length} de {grupos.length} grupos
                {" · "}{itensChecklist.length - totais.pendente} de {itensChecklist.length} subitens marcados
              </p>
              {/* Legenda das cores do box: o que está marcado dentro do grupo, sem precisar abrir. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] mb-3">
                {([
                  ["verde", "tudo conforme"],
                  ["vermelho", "algum item não conforme"],
                  ["azul", "tudo não se aplica"],
                  ["neutro", "falta responder"],
                ] as [EstadoGrupo, string][]).map(([e, txt]) => (
                  <span key={e} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm border inline-block"
                      style={{ background: ESTADO_GRUPO[e].bg, borderColor: ESTADO_GRUPO[e].borda }} />
                    {txt}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {gruposFiltrados.map((grupo) => {
                  const st = stats[grupo];
                  const estado: EstadoGrupo = st?.estado ?? "neutro";
                  const cor = ESTADO_GRUPO[estado];
                  const completo = !!st && st.total > 0 && st.respondidos === st.total;
                  return (
                    <div key={grupo}
                      title={cor.rotulo ? `${grupo} — ${cor.rotulo}` : grupo}
                      className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border transition-colors"
                      style={{ background: cor.bg, borderColor: cor.borda }}>
                      <button onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupo); }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left px-2 py-1 rounded-md hover:bg-black/5 transition-colors">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono w-[62px] shrink-0 uppercase tracking-wide">
                          ÍTEM {grupos.indexOf(grupo) + 1}
                        </span>
                        <span className="flex-1 text-sm font-medium truncate">{grupo}</span>
                      </button>
                      {/* Marcação do grupo inteiro sem abrir — os mesmos três status de dentro. */}
                      <div className="flex items-center gap-1 shrink-0">
                        {STATUS.map((sg) => {
                          const ativo =
                            (sg === "conforme" && estado === "verde") ||
                            (sg === "nao_conforme" && estado === "vermelho") ||
                            (sg === "nao_aplica" && estado === "azul");
                          return (
                            <button key={sg} onClick={() => marcarGrupo(grupo, sg, true)}
                              title={`${grupo}: todos ${ESTILO[sg].rotulo}`}
                              aria-label={`${grupo}: marcar todos como ${ESTILO[sg].rotulo}`}
                              className="w-7 h-7 rounded-md border text-xs flex items-center justify-center transition-colors hover:brightness-95"
                              style={{
                                background: ativo ? ESTILO[sg].bg : "#FFFFFF",
                                borderColor: ativo ? ESTILO[sg].texto : "var(--border)",
                                opacity: ativo ? 1 : 0.75,
                              }}>
                              {ESTILO[sg].icone}
                            </button>
                          );
                        })}
                        <button onClick={() => marcarGrupo(grupo, null, true)}
                          title={`${grupo}: limpar todas as marcações`}
                          aria-label={`${grupo}: limpar todas as marcações`}
                          className="w-7 h-7 rounded-md border border-[var(--border)] bg-white text-xs flex items-center justify-center opacity-75 transition-colors hover:brightness-95">
                          🧹
                        </button>
                      </div>
                      <span className={`text-xs shrink-0 w-12 text-right ${completo ? "text-[#059669]" : "text-[var(--text-muted)]"}`}>
                        {st?.respondidos ?? 0}/{st?.total ?? 0}
                      </span>
                    </div>
                  );
                })}
                <button onClick={() => setAbaAtual(ABA_OBS)}
                  className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                  <span className="text-[10px] text-[var(--text-muted)] font-mono w-[62px] shrink-0 uppercase tracking-wide">ÍTEM {grupos.length + 1}</span>
                  <span className="flex-1 text-sm font-medium">📝 OBS</span>
                </button>
              </div>
            </>
          )}

          {/* ABA OBS */}
          {abaAtual === ABA_OBS && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setAbaAtual(null)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] shadow-sm transition-colors">
                  <span aria-hidden>←</span> Índice
                </button>
                <span className="font-bold">📝 OBS</span>
              </div>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={22}
                placeholder="Observações do MAC — o pré-preenchimento pelo LIP registra aqui o que marcou e por quê."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-vertical" />
              <button onClick={() => salvar()}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded text-sm font-medium w-fit">
                💾 Salvar Observações
              </button>

              {/* Histórico completo da análise */}
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                  🕐 Histórico de alterações — {historico.length} registro(s)
                </p>
                {!historico.length ? (
                  <p className="text-xs text-[var(--text-muted)]">Nenhuma alteração registrada ainda.</p>
                ) : (
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
                    {historico.map((h: any, i: number) => (
                      <div key={h.id ?? i}
                        className="border-t border-[var(--border)] first:border-t-0 px-3 py-1.5 text-[11px] flex items-start gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-[110px]">
                          {h.criado_em ? new Date(h.criado_em).toLocaleString("pt-BR") : "—"}
                        </span>
                        <span className="shrink-0 w-[150px] truncate text-[var(--text-secondary)]" title={h.aba ?? ""}>
                          {h.aba ?? "—"}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]" title={h.item_texto ?? ""}>
                          {h.item_texto ?? "—"}
                        </span>
                        <span className="shrink-0 font-semibold"
                          style={{ color: ESTILO[h.status_novo as Status]?.texto ?? "var(--text-muted)" }}>
                          {h.status_anterior ? `${h.status_anterior} → ` : ""}
                          {ESTILO[h.status_novo as Status]?.rotulo ?? h.status_novo}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ITENS DE UM GRUPO */}
          {abaAtual !== null && abaAtual !== ABA_OBS && (
            <>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <button onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] shadow-sm transition-colors">
                  <span aria-hidden>←</span> Índice
                </button>
                <span className="font-bold truncate">
                  <span className="text-[var(--text-muted)] font-mono text-xs mr-2">
                    ÍTEM {grupos.indexOf(abaAtual) + 1}
                  </span>
                  {abaAtual}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pb-2">
                {STATUS.map((s) => (
                  <button key={s} onClick={() => marcarGrupo(abaAtual, s)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:text-white"
                    style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto }}>
                    {ESTILO[s].icone} Todos {ESTILO[s].rotulo}
                  </button>
                ))}
                <button onClick={() => marcarGrupo(abaAtual, null)}
                  className="flex items-center gap-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  🧹 Limpar Aba
                </button>
                <span className="text-xs text-[var(--text-muted)] self-center">
                  {stats[abaAtual]?.respondidos ?? 0}/{stats[abaAtual]?.total ?? 0} respondidos
                </span>
              </div>

              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
                {itensDaAba.map((it, iSub) => {
                  const origem = origemDoItem(fontes[it.id]);
                  return (
                  <div key={it.id} id={`item-${it.id}`}
                    className="border-t border-[var(--border)] first:border-t-0 px-3 py-2 flex flex-col gap-1.5 scroll-mt-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Numeração do sub item dentro do ÍTEM aberto — o analista cita o item pelo
                          * número na hora de conversar sobre o processo. */}
                        <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wide mb-0.5">
                          {grupos.indexOf(abaAtual) + 1}.{iSub + 1}
                        </p>
                        <p className="text-xs whitespace-pre-wrap">{destacarBusca(it.texto, busca)}</p>
                        {origem && (
                          <p title={origem.rotulo} className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            {origem.icone} {origem.rotulo}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {STATUS.map((s) => (
                          <button key={s} onClick={() => marcar(it.id, s)} title={ESTILO[s].rotulo}
                            className="w-8 h-8 rounded border text-sm font-bold transition-colors"
                            style={marcas[it.id] === s
                              ? { background: ESTILO[s].borda, borderColor: ESTILO[s].borda, color: "white" }
                              : { background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto, opacity: 0.45 }}>
                            {ESTILO[s].icone}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={observacoesPorItem[it.id] ?? ""}
                      onChange={(e) => setObservacoesPorItem((prev) => ({ ...prev, [it.id]: e.target.value }))}
                      placeholder="📝 Observação deste item — ex.: valores a informar, ressalvas..."
                      rows={1}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-y"
                    />

                    {/* Vínculo com lei/artigo do BIP — do item do checklist (modelo), vale pra
                      * qualquer processo que use este mesmo checklist. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(vinculosBip[it.id] ?? []).map((v) => (
                        <span key={v.id}
                          className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
                          style={{ background: "#EFF6FF", borderColor: "#93C5FD", color: "#1D4ED8" }}
                          title={v.lei || undefined}>
                          ⚖️ {v.referencia || "sem referência"}{v.lei ? ` — ${v.lei}` : ""}
                          <button onClick={() => desvincularBip(it.id, v.id)} title="Desvincular"
                            className="text-[#1D4ED8] hover:text-red-600 font-bold leading-none">×</button>
                        </span>
                      ))}
                      <button onClick={() => abrirBuscaBip(it.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                        + vincular lei/artigo
                      </button>
                    </div>

                    {buscaBipAberta === it.id && (
                      <div className="border border-[var(--border)] rounded-md bg-[var(--bg-card)] p-2 flex flex-col gap-1.5">
                        <input autoFocus value={buscaBipQuery} onChange={(e) => setBuscaBipQuery(e.target.value)}
                          placeholder="Buscar por número de artigo, lei ou palavra (ex.: Art. 90, NBR 9050)..."
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                        {buscaBipCarregando && <p className="text-[10px] text-[var(--text-muted)]">Buscando…</p>}
                        {!buscaBipCarregando && buscaBipQuery.trim().length >= 2 && buscaBipResultados.length === 0 && (
                          <p className="text-[10px] text-[var(--text-muted)]">Nada encontrado no BIP.</p>
                        )}
                        {buscaBipResultados.map((r) => (
                          <button key={r.id} onClick={() => vincularBip(it.id, r.id, r.referencia, r.lei)}
                            className="text-left px-2 py-1 rounded hover:bg-[var(--bg-card-hover)] border border-transparent hover:border-[var(--border)]">
                            <p className="text-[10px] font-mono font-semibold text-[#1D4ED8]">{r.referencia}</p>
                            {r.lei && <p className="text-[10px] text-[var(--text-muted)]">{r.lei}</p>}
                            <p className="text-[10px] text-[var(--text-secondary)]">{r.trecho}</p>
                          </button>
                        ))}
                        <button onClick={() => setBuscaBipAberta(null)}
                          className="self-start text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          Fechar
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              {/* Navegação entre grupos */}
              <div className="flex justify-between mt-3">
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i > 0) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i - 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === 0}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  ← Anterior
                </button>
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i < grupos.length - 1) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i + 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === grupos.length - 1}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  Próximo →
                </button>
              </div>

              {/* Histórico de alterações — mesma tabela mac_historico do Slot 1 */}
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
                  🕐 Histórico de alterações
                </p>
                {(() => {
                  const idsDaAba = new Set(itensDaAba.map((i) => i.id));
                  const doGrupo = historico.filter((h: any) => idsDaAba.has(h.checklist_item_id));
                  if (!doGrupo.length) {
                    return <p className="text-xs text-[var(--text-muted)]">Nenhuma alteração registrada ainda.</p>;
                  }
                  return (
                    <div className="flex flex-col gap-1">
                      {doGrupo.slice(0, 40).map((h: any, i: number) => (
                        <div key={h.id ?? i} className="text-[11px] text-[var(--text-secondary)] border-l-2 border-[var(--border)] pl-2">
                          <span className="text-[var(--text-muted)]">
                            {h.criado_em ? new Date(h.criado_em).toLocaleString("pt-BR") : ""}
                          </span>{" "}
                          {h.analista_nome && <span className="font-semibold">{h.analista_nome}</span>}{" "}
                          <span>{h.status_anterior ?? "sem resposta"} → <b>{h.status_novo}</b></span>
                          {h.item_texto && (
                            <p className="text-[10px] text-[var(--text-muted)] truncate">{h.item_texto}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* ─── Coluna de AÇÕES ─────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col gap-2">
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Ações</p>

          {/* Análises 1-5 — mesma regra do Slot 1/2: a N só libera quando a N-1 existe. */}
          {[1, 2, 3, 4, 5].map((n) => {
            const existente = analises.find((a) => a.numero_analise === n);
            const jaEmitida = !!(existente?.numero_despacho || existente?.numero_parecer);
            const liberada = n === 1 || analises.some((a) => a.numero_analise === n - 1);
            const ativa = numeroAnaliseEmAndamento === n;
            return (
              <div key={n} className="flex gap-1 items-stretch">
                <button
                  disabled={!liberada && !existente}
                  onClick={() => selecionarOuCriarAnalise(n)}
                  title={existente ? `Abrir Análise ${n}` : liberada ? `Iniciar Análise ${n} (copia a anterior)` : `Conclua a Análise ${n - 1} primeiro`}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    ativa ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                      : jaEmitida ? "bg-[var(--success-bg)] text-[var(--text-primary)] border-[var(--border-strong)]"
                        : existente || liberada ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)] border-dashed border-[var(--border)] cursor-not-allowed opacity-50"}`}>
                  {jaEmitida ? "✅" : "📋"} Análise {n}
                </button>
                {existente && (
                  <button onClick={() => setModalZerarAnalise(n)} title={`Zerar Análise ${n}`}
                    className="px-2 rounded-lg text-xs border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white transition-colors">
                    🗑️
                  </button>
                )}
              </div>
            );
          })}

          <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/logradouro/${encodeURIComponent(codigo)}?voltar=${encodeURIComponent(`/analise-aprovacao-projeto/${codigo}`)}&rotulo=${encodeURIComponent("Voltar ao MAC")}`); }}
            className="w-full py-2 rounded-lg text-sm font-bold border bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] mt-1">
            🗺️ Via / Logradouro
          </button>
          <button onClick={() => router.push("/admin/filtros-slot5")}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors"
            title="Criar e editar os filtros que tiram itens da análise">
            🎛️ Gerenciar Filtros
          </button>

          <button
            onClick={() => {
              if (proposta) { setPainelFiltros(true); setAbaAtual(null); notificar("Filtros abertos."); }
              else void preencherDoLip();
            }}
            disabled={lendoLip}
            className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Mostra os filtros de aplicabilidade lidos do LIP e dos documentos da pasta">
            {lendoLip ? "⏳ Lendo…" : proposta ? "🎛️ Ver filtros" : "📁 PREENCHER DO LIP"}
          </button>
          {proposta && (
            <button onClick={preencherDoLip} disabled={lendoLip}
              className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] py-1.5 rounded-lg text-xs transition-colors"
              title="Reavalia as condições contra o LIP e os documentos">
              🔄 Reavaliar filtros
            </button>
          )}

          <button type="button" onClick={() => inputPastaRef.current?.click()} disabled={lendoPasta}
            className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Lê a pasta inteira, acha o último projeto/ART/uso/certidão e manda pro Gemini avaliar os itens pendentes">
            {lendoPasta ? "⏳ Lendo pasta…" : "📁 LER PASTA (IA)"}
          </button>
          <input ref={inputPastaRef} type="file" multiple className="hidden"
            /* @ts-expect-error atributos de seleção de pasta não estão no tipo do React */
            webkitdirectory="" directory=""
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void lerPastaIA(fs); e.target.value = ""; }} />

          {/* Contra-conferência: sai daqui pra uma IA de fora e volta pelo botão de importar. */}
          <button onClick={() => { if (ccPrompt) setCcInstrucoesAberto(true); else void gerarContraConferencia(); }}
            disabled={ccGerando}
            className="w-full bg-[#F5F3FF] hover:bg-[#7C3AED] hover:text-white disabled:opacity-50 border border-[#7C3AED] text-[#6D28D9] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Gera o prompt de auditoria para colar no Gemini/ChatGPT junto com os PDFs da pasta">
            {ccGerando ? "⏳ Gerando…" : ccPrompt ? "🔍 Ver contra-conferência" : "🔍 Gerar contra-conferência"}
          </button>
          {ccPrompt && (
            <button onClick={gerarContraConferencia} disabled={ccGerando}
              className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] py-1.5 rounded-lg text-xs transition-colors"
              title="Regera o prompt com as marcações mais recentes">
              🔄 Regerar com o estado atual
            </button>
          )}
          <button onClick={() => setCcColarAberto(true)}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] py-1.5 rounded-lg text-xs transition-colors"
            title="Cole aqui a resposta da IA para virar proposta de correção">
            📥 Importar relatório da IA
          </button>

          <button onClick={() => salvar()} disabled={salvando}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando…" : "💾 Salvar"}
          </button>

          <button
            onClick={async () => {
              const novas = { ...marcas };
              const novasFontes = { ...fontes };
              for (const i of itensChecklist) if (!novas[i.id]) { novas[i.id] = "conforme"; novasFontes[i.id] = "manual"; }
              setMarcas(novas);
              setFontes(novasFontes);
              await salvar(novas, novasFontes, observacoes);
              notificar("Itens pendentes marcados como Conforme.");
            }}
            className="w-full bg-[#ECFDF5] hover:bg-[#059669] hover:text-white border border-[#059669] text-[#059669] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Marca como Conforme todo item ainda sem resposta">
            ✅ Concluir pendentes
          </button>

          {/* ── Documentos do Slot 5 ────────────────────────────────────
              Os botões existem no lugar certo, mas a GERAÇÃO ainda não foi
              construída. Cada slot é independente: quando forem feitos, serão
              rotas próprias do Slot 5 — nunca reuso das do Slot 1. */}
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mt-3">
            Documentos
          </p>

          {[
            { rotulo: "📨 Despacho Interno", cor: "#2563EB" },
            { rotulo: "📄 Despacho", cor: "#2563EB" },
            { rotulo: "📑 Laudo", cor: "#059669" },
            { rotulo: "⛔ Indeferimento", cor: "#DC2626" },
          ].map((b) => (
            <button key={b.rotulo}
              onClick={() => notificar(`"${b.rotulo.replace(/^\S+\s/, "")}" do Slot 5 ainda não foi construído.`)}
              title="Ainda não construído para o Slot 5 — será rota própria, independente do Slot 1"
              className="w-full font-bold py-2.5 rounded-lg text-sm border border-dashed hover:bg-[var(--bg-card-hover)] transition-colors"
              style={{ borderColor: b.cor, color: b.cor }}>
              {b.rotulo}
            </button>
          ))}

          <p className="text-[10px] text-[var(--text-muted)] leading-snug mt-1">
            Tracejado = ainda não gera documento. Cada um será rota própria do Slot 5,
            independente do Slot 1.
          </p>

          {/* ── Manutenção ─────────────────────────────────────────────
              Exportar/Importar Excel e Gerenciar MAC subiram pro topo,
              junto com Home/Sair/LIP — mesmo padrão do Slot 1. */}
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mt-3">
            Manutenção
          </p>
          <button type="button" onClick={() => setConfirmarLimpar(true)}
            className="w-full bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            🗑️ Limpar MAC
          </button>
          <button type="button" onClick={toggleMacIncompleto} disabled={salvandoIncompleto}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              macIncompleto
                ? "bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]"
                : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
            {macIncompleto ? "🔴 MAC não concluído" : "⚪ Marcar MAC não concluído"}
          </button>
        </aside>
      </div>

      {confirmarLimpar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--error)] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-[var(--error)] font-bold text-lg mb-3">🗑️ Limpar o MAC?</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Apaga as <b>{itensChecklist.length - totais.pendente} resposta(s)</b> desta análise —
              inclusive o que os filtros marcaram. Os itens voltam todos para pendente.
            </p>
            <p className="text-[var(--text-muted)] text-xs mb-5">
              A análise não é excluída e o histórico guarda o que existia. Exporte o Excel antes se
              quiser poder restaurar exatamente como está.
            </p>
            <div className="flex gap-3">
              <button onClick={limparMac}
                className="flex-1 bg-[var(--error)] hover:opacity-90 text-white font-bold py-2 rounded-lg text-sm">
                Limpar mesmo assim
              </button>
              <button onClick={() => setConfirmarLimpar(false)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalZerarAnalise !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--error)] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-[var(--error)] font-bold text-lg mb-3">⚠️ Zerar Análise {modalZerarAnalise}?</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Apaga os itens, fontes e observações da <b>Análise {modalZerarAnalise}</b> — inclusive
              o que os filtros marcaram. Os itens voltam todos para pendente.
            </p>
            <p className="text-[var(--text-muted)] text-xs mb-5">
              A análise não é excluída e continua sendo a nº {modalZerarAnalise}; o histórico guarda
              o que existia. Exporte o Excel antes se quiser poder restaurar.
            </p>
            <div className="flex gap-3">
              <button onClick={() => void zerarAnalise(modalZerarAnalise)}
                className="flex-1 bg-[var(--error)] hover:opacity-90 text-white font-bold py-2 rounded-lg text-sm">
                Zerar Análise {modalZerarAnalise}
              </button>
              <button onClick={() => setModalZerarAnalise(null)}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {ccInstrucoesAberto && ccPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[#7C3AED] rounded-xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-[#6D28D9] font-bold text-lg mb-1">🔍 Contra-conferência pronta</h2>
            <p className="text-[var(--text-muted)] text-xs mb-4">
              {Math.round(ccPrompt.caracteres / 1000)} mil caracteres · {ccPrompt.itens} itens do checklist ·
              cabe no Gemini e no ChatGPT.
            </p>

            <div className="flex gap-2 mb-4">
              <button onClick={copiarPrompt}
                className="flex-1 bg-[#7C3AED] hover:opacity-90 text-white font-bold py-2 rounded-lg text-sm">
                📋 Copiar prompt
              </button>
              <button onClick={baixarPrompt}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                ⬇️ Baixar .txt
              </button>
            </div>

            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Como usar
            </p>
            <ol className="text-xs text-[var(--text-secondary)] flex flex-col gap-2 mb-4 list-decimal pl-4">
              <li>
                Abra uma <b>conversa nova</b> no Gemini ou no ChatGPT. Conversa nova importa: o
                histórico de outro processo contamina a análise.
              </li>
              <li>
                <b>Anexe os documentos</b> da pasta na mesma mensagem: prancha do projeto,
                <b> print da tela do ATENDIMENTO</b>, Uso do Solo, Certidão de Matrícula, ARTs,
                certidão de corredor viário, despachos, declarações e o que mais existir.
                Arquivos <code>.rar</code> não são lidos — extraia antes.
              </li>
              <li><b>Cole o prompt</b> junto com os anexos e envie.</li>
              <li>
                A IA responde com um <b>inventário</b> do que recebeu e <b>pede o que faltar</b>.
                Anexe o que ela pedir, ou diga que não existe — aí ela segue e marca aqueles itens
                como não verificáveis.
              </li>
              <li>
                Ela trabalha em <b>lotes de 40 itens</b>. A cada lote, responda apenas
                <b> CONTINUA</b>. São 15 rodadas.
              </li>
              <li>Ao terminar o último lote, digite <b>RELATÓRIO FINAL</b>.</li>
              <li>
                <b>Copie a resposta inteira</b> (incluindo o bloco <code>json</code> do final) e volte
                aqui em <b>“Importar relatório da IA”</b>.
              </li>
            </ol>

            <p className="text-[11px] text-[var(--text-muted)] mb-4">
              O Gemini enxerga o desenho da prancha (cota, corte). O ChatGPT às vezes só lê o texto de
              PDF pesado de CAD — se ele nunca citar uma cota, é isso. Vale rodar nos dois: onde os
              dois apontarem a mesma coisa, é forte indício de erro real.
            </p>

            <button onClick={() => setCcInstrucoesAberto(false)}
              className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
              Fechar
            </button>
          </div>
        </div>
      )}

      {ccColarAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[#7C3AED] rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <h2 className="text-[#6D28D9] font-bold text-lg mb-2">📥 Importar contra-conferência</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-1">
              Cole a resposta <b>inteira</b> da IA, incluindo o bloco <code>json</code> do final —
              é dele que saem os achados.
            </p>
            <p className="text-[var(--text-muted)] text-xs mb-3">
              Nada é marcado na importação: cada achado vira uma proposta que você aceita ou recusa.
            </p>
            <textarea value={ccTexto} onChange={(e) => setCcTexto(e.target.value)} autoFocus rows={12}
              placeholder="Cole aqui o RELATÓRIO FINAL que a IA devolveu…"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#7C3AED] mb-4" />
            <div className="flex gap-3">
              <button onClick={importarContraConferencia} disabled={ccImportando || ccTexto.trim().length < 20}
                className="flex-1 bg-[#7C3AED] hover:opacity-90 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-sm">
                {ccImportando ? "Lendo…" : "Importar achados"}
              </button>
              <button onClick={() => { setCcColarAberto(false); setCcTexto(""); }}
                className="flex-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
