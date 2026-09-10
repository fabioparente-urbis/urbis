/**
 * Vigia do processo e triagem por evidência.
 *
 * REGRA ABSOLUTA DESTE ARQUIVO: nenhuma IA, nenhum serviço pago, nenhuma
 * previsão. Só conta o que está gravado e diz de onde tirou.
 *
 * Nada aqui escreve: não altera processo, não grava observação, não muda
 * status. É leitura e classificação, mais nada.
 *
 * Por que os critérios ficam aqui e não espalhados na tela: para você poder
 * ler, discordar e mexer num lugar só. Cada regra tem peso e motivo escritos
 * logo abaixo, e mudar um número muda a triagem inteira.
 */
import { compararAreas } from "@/lib/compatibilidadeArea";
import { confrontarEndereco } from "@/lib/cadastroMapaFacil";

/** De onde saiu cada aviso. Aparece na tela junto do aviso. */
export type FonteAviso =
  | "campo do processo"
  | "histórico do MAC"
  | "checklist"
  | "BIP"
  | "view do BDI"
  | "auditoria";

export type Severidade = "info" | "atencao" | "alerta";

export type Aviso = {
  /** Chave estável, para teste e para ordenar. */
  id: string;
  titulo: string;
  detalhe: string;
  fonte: FonteAviso;
  severidade: Severidade;
  /**
   * true só nas condições que impedem a análise (pedido do Fábio, 08/09/2026 — ver
   * ~/.claude/plans/floating-humming-orbit.md). Aciona a intervenção grande do URBI, não só a
   * cor do avatar. Ausente/false em todo aviso normal — nem todo "alerta" é bloqueante.
   */
  bloqueante?: boolean;
  /**
   * Payload estruturado, só nos avisos que uma ação pode consumir direto (hoje só
   * `cond_imovel_duplicado`, ver `ImovelConflito`) — sem isso, quem mostra o aviso só tem texto
   * solto pra oferecer um botão de ação.
   */
  dados?: Record<string, any>;
};

export type ClasseTriagem = "mais simples para análise" | "exige atenção" | "maior risco de retrabalho";

export type Triagem = {
  classe: ClasseTriagem;
  /** Os fatos que levaram à classe. Sem isso a classe não vale nada. */
  motivos: string[];
};

// ---------------------------------------------------------------- entradas

/** Só o que o vigia precisa. Nomes iguais aos das colunas reais. */
export type DadosProcesso = {
  codigo: string;
  tipo_processo?: string | null;
  area_construida?: number | string | null;
  dados?: Record<string, any> | null;
  tags?: unknown;
};

export type LinhaRetrabalho = {
  virou_nao_conforme?: number | string | null;
  foi_resolvido?: number | string | null;
  trocas_totais?: number | string | null;
};

export type ExigenciaRecorrente = {
  exigencia: string;
  vezes: number | string;
  processos: number | string;
};

export type VinculoLegal = {
  referencia: string;
  confianca: string;
};

export type SaldoNumeracao = {
  tipo: string;
  restantes: number | string;
  situacao: string;
};

// ------------------------------------------------------------ utilitários

/**
 * Número que veio de campo de texto brasileiro. "375,00" é 375; "1.234,56" é
 * 1234.56. Devolve null quando não dá para interpretar — e quem chama TEM que
 * tratar esse null, porque "não deu para ler a área" é informação, não é zero.
 */
export function numeroBR(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  if (!limpo) return null;
  // Tira separador de milhar e troca a vírgula decimal por ponto.
  const normalizado = limpo.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Valor de um campo do LIP, que é sempre { valor, fonte, origem }. */
function valorCampo(dados: Record<string, any> | null | undefined, chave: string): string {
  const v = dados?.[chave];
  if (!v || typeof v !== "object") return "";
  return typeof v.valor === "string" ? v.valor.trim() : "";
}

/** Mesmo campo, mas devolvendo { valor, fonte } — formato que compararAreas espera. */
function parseObjCampo(dados: Record<string, any> | null | undefined, chave: string): { valor: string | null; fonte: string | null } {
  const v = dados?.[chave];
  if (!v || typeof v !== "object") return { valor: null, fonte: null };
  return {
    valor: typeof v.valor === "string" ? v.valor.trim() : null,
    fonte: typeof v.fonte === "string" ? v.fonte : null,
  };
}

/** Quantas análises o processo já teve, pelo maior numero_analise das tags. */
export function contarAnalises(tags: unknown): number {
  if (!Array.isArray(tags)) return 0;
  let maior = 0;
  for (const t of tags) {
    if (!t || typeof t !== "object") continue; // há tags gravadas como texto solto
    const n = Number((t as any).numero_analise);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior;
}

/** O processo tem tag de indeferimento? */
export function temIndeferimento(tags: unknown): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t: any) => t && typeof t === "object" && t.tipo === "indeferimento");
}

// ------------------------------------------------------ contagem de campos

export type ResumoCampos = {
  vazios: string[];
  emX: string[];
  totais: number;
};

/**
 * Separa vazio de "X" — são coisas diferentes e a tela não pode misturar.
 * "X" afirma que o documento não traz aquilo; é informação de ausência, não
 * erro. Vazio é o que merece olhar, porque pode ser falha de leitura.
 */
export function resumirCampos(dados: Record<string, any> | null | undefined): ResumoCampos {
  const vazios: string[] = [];
  const emX: string[] = [];
  let totais = 0;
  if (!dados) return { vazios, emX, totais };

  for (const [chave, v] of Object.entries(dados)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    if (!("valor" in v)) continue;
    totais++;
    const valor = typeof v.valor === "string" ? v.valor.trim() : "";
    if (valor === "") vazios.push(chave);
    else if (valor.toUpperCase() === "X") emX.push(chave);
  }
  return { vazios, emX, totais };
}

// --------------------------------------------------------- incoerências

export type Incoerencia = { campo: string; explicacao: string };

/**
 * Só incoerência que dá para afirmar com o dado em mãos. Quando um número não
 * pode ser interpretado, isso VIRA UM AVISO em vez de sumir — esconder erro de
 * dado é pior que mostrar.
 */
export function acharIncoerencias(p: DadosProcesso): Incoerencia[] {
  const achados: Incoerencia[] = [];

  const areaConstruida = numeroBR(p.area_construida ?? null);
  const textoTerreno = valorCampo(p.dados, "areaTerreno");
  const areaTerreno = numeroBR(textoTerreno);

  if (textoTerreno && areaTerreno === null) {
    achados.push({
      campo: "areaTerreno",
      explicacao: `A área do terreno está gravada como "${textoTerreno}" e não dá para ler como número.`,
    });
  }
  if (p.area_construida != null && String(p.area_construida).trim() !== "" && areaConstruida === null) {
    achados.push({
      campo: "area_construida",
      explicacao: `A área construída está gravada como "${p.area_construida}" e não dá para ler como número.`,
    });
  }
  // REMOVIDO em 05/09/2026 (piloto humano controlado, achado real): "área construída > área do
  // terreno" NÃO é incoerência por si só — `area_construida` é o TOTAL construído somando todos
  // os pavimentos, e `areaTerreno` é só a área do lote; uma edificação de vários pavimentos tem,
  // legitimamente, área construída total maior que a do terreno. Os dois campos não têm a mesma
  // semântica (um é soma de pavimentos, o outro é área de lote) e não podem ser comparados
  // diretamente. Uma regra válida exigiria área OCUPADA (projeção no térreo) × área do terreno,
  // ou taxa de ocupação × limite legal — nenhum desses dados está disponível aqui hoje; inventar
  // essa regra sem base determinística explícita seria o mesmo erro, só disfarçado. Removida sem
  // substituto até existir dado real pra sustentar uma regra nova.
  return achados;
}

// ------------------------------------------------ imóvel duplicado (cond. 8)

/** Status que fazem um processo anterior NÃO contar como conflito — ver acharImovelConflitante. */
const STATUS_NAO_CONFLITA = new Set(["INDEFERIDO", "ARQUIVADO", "ARQUIVADO_DUPLICADO"]);

/** Só dígitos — "12.345-6" e "123456" são o mesmo IPTU. */
function apenasDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** O mínimo de outro processo que a comparação de imóvel precisa enxergar. */
export type CandidatoImovel = {
  codigo: string;
  tipo_processo?: string | null;
  status?: string | null;
  dados?: Record<string, any> | null;
};

export type ImovelConflito = {
  codigo: string;
  tipoProcesso: string;
  status: string;
  /** Como a igualdade foi decidida — aparece no aviso, pra dar pro analista o que conferir. */
  criterio: "iptu" | "endereco";
};

/**
 * Acha, entre os candidatos, outro processo (Regularização ou Aceite SEI) do MESMO imóvel que
 * ainda conta (pedido do Fábio, 10/09/2026 — ver migration 2026_09_10_urbi_cond_imovel_duplicado):
 * indeferido/arquivado não conta, mas um alvará já aprovado ou concluído conta pra sempre, mesmo
 * anos depois.
 *
 * Critério 1, IPTU: só dígitos, os dois lados não-vazios, iguais. É o identificador mais
 * confiável quando existe.
 *
 * Critério 2, endereço (só quando não há IPTU num dos lados): reaproveita `confrontarEndereco`
 * (mesma lógica que já confronta LIP × Mapa Fácil) exigindo logradouro, quadra E lote batendo —
 * bairro fica de fora do critério porque costuma ser redundante com a quadra e divergir por
 * causa só de nomenclatura de setor. "sem_dado" em qualquer um dos três não conta como bate: é
 * bloqueio automático, e dado faltando não pode virar acusação de duplicidade.
 *
 * Puro — sem I/O, quem chama já buscou os candidatos no banco.
 */
export function acharImovelConflitante(
  dadosAtual: Record<string, any> | null | undefined,
  candidatos: CandidatoImovel[],
): ImovelConflito | null {
  const iptuAtual = apenasDigitos(valorCampo(dadosAtual, "iptu"));

  const enderecoAtual = {
    logradouro: valorCampo(dadosAtual, "logradouro"),
    quadra: valorCampo(dadosAtual, "quadra"),
    lote: valorCampo(dadosAtual, "lote"),
    bairro: valorCampo(dadosAtual, "bairro"),
  };
  const temEnderecoAtual = !!(enderecoAtual.logradouro && enderecoAtual.quadra && enderecoAtual.lote);

  for (const c of candidatos) {
    const status = String(c.status ?? "").toUpperCase();
    if (STATUS_NAO_CONFLITA.has(status)) continue;

    const iptuCand = apenasDigitos(valorCampo(c.dados, "iptu"));
    if (iptuAtual.length >= 3 && iptuCand.length >= 3 && iptuAtual === iptuCand) {
      return { codigo: c.codigo, tipoProcesso: String(c.tipo_processo ?? ""), status, criterio: "iptu" };
    }
  }

  if (!temEnderecoAtual) return null;

  for (const c of candidatos) {
    const status = String(c.status ?? "").toUpperCase();
    if (STATUS_NAO_CONFLITA.has(status)) continue;

    const confronto = confrontarEndereco(enderecoAtual, {
      logradouro: valorCampo(c.dados, "logradouro"),
      quadra: valorCampo(c.dados, "quadra"),
      lote: valorCampo(c.dados, "lote"),
      bairro: valorCampo(c.dados, "bairro"),
    });
    const porCampo = new Map(confronto.map((it) => [it.campo, it.situacao]));
    const bate = porCampo.get("logradouro") === "bate" && porCampo.get("quadra") === "bate" && porCampo.get("lote") === "bate";
    if (bate) {
      return { codigo: c.codigo, tipoProcesso: String(c.tipo_processo ?? ""), status, criterio: "endereco" };
    }
  }

  return null;
}

// ------------------------------------------------------------- os avisos

export type ChaveRegraBloqueio =
  | "COND_180_DIAS" | "COND_FISCAL_DIVERGE" | "COND_MARCO_TEMPORAL"
  | "COND_USO_SOLO" | "COND_BUSCA_ENDERECO" | "COND_ASSUNTO_ERRADO" | "COND_CHEADV_APTO"
  | "COND_IMOVEL_DUPLICADO";

export type RegraBloqueio = { ativo: boolean; parametros: Record<string, any> };

export type EntradaVigia = {
  processo: DadosProcesso;
  retrabalho?: LinhaRetrabalho | null;
  exigenciasRecorrentes?: ExigenciaRecorrente[];
  vinculosLegais?: VinculoLegal[];
  numeracao?: SaldoNumeracao[];
  /**
   * Condições que impedem a análise (Fase A, 08/09/2026) — cada uma só entra se a chave
   * correspondente estiver `ativo` em `regras` (lib/urbi/regrasBloqueio.ts). O que dá para
   * derivar do próprio `processo.dados` (vistoriaLevante, áreas, uso do solo, busca de
   * endereço) é lido aqui dentro; o que precisa de outra tabela vem pronto do chamador:
   */
  regras?: Partial<Record<ChaveRegraBloqueio, RegraBloqueio>>;
  /** true quando existe evento LIP_MARCO_TEMPORAL_REPROVADO para este processo (auditoria_eventos). */
  marcoTemporalReprovado?: boolean;
  /**
   * A prova por trás de `marcoTemporalReprovado` — o `detalhe` já gravado no evento de auditoria
   * (`marco`/`leitura`, ver `avaliarMarcoTemporal` em lib/marcoTemporal.ts), com o TRECHO exato do
   * laudo que embasa o veredito. Pedido do Fábio, 08/09/2026: "e quando eu clico ele deve provar
   * isso" — sem isso, a intervenção era uma frase pronta repetida, sem o fato por trás dela.
   * Undefined em eventos antigos gravados antes deste campo existir (evento existe, prova não).
   */
  marcoTemporalEvidencia?: {
    marco?: string | null;
    parecerFiscal?: string | null;
    estruturaConcluidaAntesDoMarco?: string | null;
    dataConclusaoObra?: string | null;
    trecho?: string | null;
    fonte?: string | null;
  } | null;
  /** Dias corridos desde a última emissão em mdp_registros. null = nunca emitiu nada ainda. */
  diasSemUltimaEmissao?: number | null;
  /**
   * Outro processo (Regularização/Aceite SEI) do MESMO imóvel que ainda conta como conflito —
   * condição 8, pedido do Fábio em 10/09/2026. Já vem pronto de `acharImovelConflitante`; quem
   * chama busca os candidatos no banco (`processos` do mesmo imóvel) e aplica a função pura.
   * null = não achou nenhum.
   */
  imovelConflito?: ImovelConflito | null;
};

/**
 * Monta a lista de avisos. Cada um diz de onde veio — sem isso o analista não
 * tem como conferir, e aviso que não dá para conferir não serve.
 */
export function montarAvisos(e: EntradaVigia): Aviso[] {
  const avisos: Aviso[] = [];
  const campos = resumirCampos(e.processo.dados);

  if (campos.vazios.length > 0) {
    avisos.push({
      id: "campos_vazios",
      titulo: `${campos.vazios.length} campo(s) vazio(s)`,
      detalhe: campos.vazios.slice(0, 12).join(", ") + (campos.vazios.length > 12 ? "…" : ""),
      fonte: "campo do processo",
      severidade: campos.vazios.length >= 10 ? "atencao" : "info",
    });
  }

  if (campos.emX.length > 0) {
    avisos.push({
      id: "campos_em_x",
      titulo: `${campos.emX.length} campo(s) marcado(s) com X`,
      // Deixa explícito na tela que X não é defeito.
      detalhe: `X afirma que o documento não traz a informação — não é erro. Campos: ${campos.emX.slice(0, 12).join(", ")}`,
      fonte: "campo do processo",
      severidade: "info",
    });
  }

  for (const inc of acharIncoerencias(e.processo)) {
    avisos.push({
      id: `incoerencia_${inc.campo}`,
      titulo: "Incoerência nos dados",
      detalhe: inc.explicacao,
      fonte: "campo do processo",
      severidade: "alerta",
    });
  }

  const analises = contarAnalises(e.processo.tags);
  if (analises > 0) {
    avisos.push({
      id: "numero_analises",
      titulo: `${analises}ª análise`,
      detalhe: analises >= 3
        ? "Processo já passou por várias análises."
        : "Contado pelas tags de despacho do processo.",
      fonte: "campo do processo",
      severidade: "info",
    });
  }

  const r = e.retrabalho;
  if (r) {
    const trocas = Number(r.trocas_totais ?? 0);
    const voltou = Number(r.virou_nao_conforme ?? 0);
    if (trocas > 0) {
      avisos.push({
        id: "retrabalho",
        titulo: `${trocas} troca(s) de status no checklist`,
        detalhe: `${voltou} item(ns) que estavam conformes voltaram a não conforme; ${Number(r.foi_resolvido ?? 0)} foram resolvidos.`,
        fonte: "histórico do MAC",
        severidade: trocas >= 100 ? "atencao" : "info",
      });
    }
  }

  const recorrentes = e.exigenciasRecorrentes ?? [];
  if (recorrentes.length > 0) {
    avisos.push({
      id: "exigencias_recorrentes",
      titulo: "Exigências que costumam aparecer em processos como este",
      detalhe: recorrentes.slice(0, 5)
        .map(x => `${String(x.exigencia).slice(0, 70)} (${x.processos} processos)`)
        .join(" · "),
      fonte: "view do BDI",
      severidade: "info",
    });
  }

  // Lei só entra quando existe vínculo real no BIP. Sem vínculo, nada é dito —
  // inventar artigo é pior que ficar calado.
  const vinculos = e.vinculosLegais ?? [];
  if (vinculos.length > 0) {
    avisos.push({
      id: "referencia_legal",
      titulo: "Referência legal vinculada no BIP",
      detalhe: vinculos.slice(0, 5).map(v => `${v.referencia} (confiança ${v.confianca})`).join(" · "),
      fonte: "BIP",
      severidade: "info",
    });
  }

  // Numeração é agregada POR TIPO, não por faixa. O analista tem várias faixas
  // do mesmo tipo, e faixa antiga esgotada é normal — o que importa é se ainda
  // sobra número para emitir aquele documento. Listar faixa por faixa repetia
  // "faixa de parecer esgotada" três vezes e escondia o que interessa.
  const porTipo = new Map<string, number>();
  for (const n of e.numeracao ?? []) {
    const restantes = Number(n.restantes ?? 0);
    porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + (Number.isFinite(restantes) ? restantes : 0));
  }
  for (const [tipo, restantes] of porTipo) {
    if (restantes > 20) continue; // folga suficiente, não vira aviso
    avisos.push({
      id: `numeracao_${tipo}`,
      titulo: restantes === 0
        ? `Sem número de ${tipo} disponível`
        : `Numeração de ${tipo} perto do fim`,
      detalhe: restantes === 0
        ? "Todas as faixas deste tipo estão esgotadas — não há como emitir sem abrir faixa nova."
        : `${restantes} número(s) restante(s) somando as faixas em aberto.`,
      fonte: "view do BDI",
      severidade: restantes === 0 ? "alerta" : "atencao",
    });
  }

  // ── Condições que impedem a análise (Fase A, 08/09/2026) ────────────────
  // Cada bloco só roda se a regra estiver ligada — fail-safe desligado, ver
  // lib/urbi/regrasBloqueio.ts. "bloqueante: true" é o que dispara a intervenção grande do
  // URBI, além de colorir o avatar de vermelho (lib/urbi/sinaleiro.ts).
  const regra = (chave: ChaveRegraBloqueio): RegraBloqueio =>
    e.regras?.[chave] ?? { ativo: false, parametros: {} };
  const tipo = String(e.processo.tipo_processo ?? "").toLowerCase().trim();
  const ehRegularizacao = tipo.startsWith("regularizacao");
  /**
   * As 8 condições bloqueantes só valem para Regularização/Aceite SEI — Slot 1/2 hoje,
   * Slot 3/4 (PED, futuro) amanhã, sempre pelo mesmo prefixo do tipo. Slot 5 (Aprovação de
   * Projeto) atende outra legislação e NUNCA entra aqui — pedido explícito do Fábio, 10/09/2026.
   */
  const aplicaCondicoesBloqueio = ehRegularizacao || tipo.startsWith("aceite");

  if (regra("COND_FISCAL_DIVERGE").ativo && aplicaCondicoesBloqueio) {
    const vistoriaLevante = valorCampo(e.processo.dados, "vistoriaLevante");
    if (vistoriaLevante.toLowerCase() === "não" || vistoriaLevante.toLowerCase() === "nao") {
      avisos.push({
        id: "cond_fiscal_diverge",
        titulo: "Fiscal: projeto não confere com a obra",
        detalhe: "O laudo de vistoria registra que o levantamento não confere integralmente com a obra construída. Conferir antes de prosseguir com a análise.",
        fonte: "campo do processo",
        severidade: "alerta",
        bloqueante: true,
      });
    }
    if (ehRegularizacao) {
      const veredicto = compararAreas({
        projeto: parseObjCampo(e.processo.dados, "areaTotal"),
        laudo: parseObjCampo(e.processo.dados, "areaLaudo"),
        art: parseObjCampo(e.processo.dados, "areaArt"),
        vistoria: parseObjCampo(e.processo.dados, "areaVistoria"),
      });
      if (veredicto.criticoFiscalizacao) {
        avisos.push({
          id: "cond_area_fiscalizacao",
          titulo: "Área divergente da fiscalização",
          detalhe: veredicto.mensagem,
          fonte: "campo do processo",
          severidade: "alerta",
          bloqueante: true,
        });
      }
    }
  }

  if (regra("COND_MARCO_TEMPORAL").ativo && aplicaCondicoesBloqueio && e.marcoTemporalReprovado) {
    const ev = e.marcoTemporalEvidencia;
    const trecho = ev?.trecho?.trim();
    const detalhe = trecho
      ? `Segundo a vistoria fiscal, a estrutura não estava concluída antes de ${ev?.marco ?? "marco temporal"} ` +
        `(Lei Complementar nº 314/2018). Trecho do laudo${ev?.fonte ? ` (${ev.fonte})` : ""}: "${trecho}". ` +
        `Este processo deve ser indeferido por isso — não há por que seguir analisando o restante.`
      : "Segundo a vistoria fiscal, a estrutura não estava concluída antes do marco temporal da Lei Complementar nº 314/2018. Este processo deve ser indeferido por isso — não há por que seguir analisando o restante. (Evento antigo, sem o trecho do laudo salvo junto — abra o LIP para conferir o laudo original.)";
    avisos.push({
      id: "cond_marco_temporal",
      titulo: "Marco temporal não atendido",
      detalhe,
      fonte: "auditoria",
      severidade: "alerta",
      bloqueante: true,
    });
  }

  if (regra("COND_USO_SOLO").ativo && ehRegularizacao) {
    const usoSolo = valorCampo(e.processo.dados, "usoSolo");
    const usoDefinido = valorCampo(e.processo.dados, "usoDefinido");
    if (!usoSolo && !usoDefinido) {
      avisos.push({
        id: "cond_uso_solo",
        titulo: "Sem documento de Uso do Solo",
        detalhe: "O processo não tem o documento de Uso do Solo vinculado — sem ele a análise pode ter que ser refeita depois.",
        fonte: "campo do processo",
        severidade: "alerta",
        bloqueante: true,
      });
    }
  }

  // Regularização SEI e Aceite SEI apenas — pedido original do Fábio era "Regularização SEI...
  // e Aceite SEI" (ver plano floating-humming-orbit.md). Achado em 08/09/2026: faltava esse
  // filtro, e a condição disparava também na Aprovação de Projeto (Slot 5), que nunca teve busca
  // de endereço no fluxo. "Slot 5 não tem busca... não deve haver esse pedido" — Fábio.
  if (regra("COND_BUSCA_ENDERECO").ativo && aplicaCondicoesBloqueio) {
    const outro = valorCampo(e.processo.dados, "outro");
    if (!outro) {
      avisos.push({
        id: "cond_busca_endereco",
        titulo: "Sem busca de outros processos no mesmo endereço",
        detalhe: "Não há registro de que a busca de processos arquivados para este endereço foi feita. Solicitar a busca antes de seguir analisando.",
        fonte: "campo do processo",
        severidade: "alerta",
        bloqueante: true,
      });
    }
  }

  if (regra("COND_ASSUNTO_ERRADO").ativo && aplicaCondicoesBloqueio) {
    const carimbo = valorCampo(e.processo.dados, "carimboTipoProjeto");
    const carimboNorm = carimbo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (carimboNorm) {
      const esperado = ehRegularizacao ? "regulariza" : tipo.startsWith("aceite") ? "aceite" : null;
      if (esperado && !carimboNorm.includes(esperado)) {
        avisos.push({
          id: "cond_assunto_errado",
          titulo: "Carimbo do projeto não confere com o assunto cadastrado",
          detalhe: `O processo está cadastrado como "${e.processo.tipo_processo}", mas o carimbo do projeto diz "${carimbo}" — conferir se o assunto está certo antes de seguir analisando.`,
          fonte: "campo do processo",
          severidade: "alerta",
          bloqueante: true,
        });
      }
    }
  }

  if (regra("COND_CHEADV_APTO").ativo && aplicaCondicoesBloqueio) {
    const cheadvAprovado = valorCampo(e.processo.dados, "cheadvAprovado");
    if (cheadvAprovado.toLowerCase() === "não" || cheadvAprovado.toLowerCase() === "nao") {
      avisos.push({
        id: "cond_cheadv_apto",
        titulo: "CHEADV não aprovou a documentação",
        detalhe: "O despacho CHEADV existe no processo, mas a conclusão dele não aprova a documentação apresentada. Conferir antes de prosseguir com a análise.",
        fonte: "campo do processo",
        severidade: "alerta",
        bloqueante: true,
      });
    }
  }

  if (regra("COND_IMOVEL_DUPLICADO").ativo && aplicaCondicoesBloqueio && e.imovelConflito) {
    const conf = e.imovelConflito;
    const outroTipo = conf.tipoProcesso.toLowerCase().startsWith("regularizacao") ? "Regularização SEI" : "Aceite SEI";
    const porQue = conf.criterio === "iptu" ? "mesmo IPTU" : "mesmo logradouro, quadra e lote";
    avisos.push({
      id: "cond_imovel_duplicado",
      titulo: "Já existe outro processo para este imóvel",
      detalhe: `O processo ${conf.codigo} (${outroTipo}, status ${conf.status}) é do mesmo imóvel (${porQue}). Só é permitida uma Regularização ou um Aceite SEI por imóvel — indeferido/arquivado não conta, mas um alvará já aprovado ou concluído conta mesmo anos depois. Conferir antes de seguir analisando.`,
      fonte: "campo do processo",
      severidade: "alerta",
      bloqueante: true,
      dados: { codigo: conf.codigo, tipoProcesso: conf.tipoProcesso, status: conf.status },
    });
  }

  const regra180 = regra("COND_180_DIAS");
  if (regra180.ativo && aplicaCondicoesBloqueio && e.diasSemUltimaEmissao != null) {
    const diasBloqueio = Number(regra180.parametros?.diasBloqueio ?? 180);
    const diasAviso = Number(regra180.parametros?.diasAviso ?? 170);
    if (e.diasSemUltimaEmissao >= diasBloqueio) {
      avisos.push({
        id: "cond_180_dias",
        titulo: `${e.diasSemUltimaEmissao} dias sem retorno`,
        detalhe: `Já se passaram ${e.diasSemUltimaEmissao} dias corridos desde a última emissão neste processo — nenhum documento novo pode ser emitido até isso ser resolvido.`,
        fonte: "campo do processo",
        severidade: "alerta",
        bloqueante: true,
      });
    } else if (e.diasSemUltimaEmissao >= diasAviso) {
      avisos.push({
        id: "cond_180_dias_proximo",
        titulo: `${e.diasSemUltimaEmissao} dias sem retorno — perto do limite`,
        detalhe: `${e.diasSemUltimaEmissao} dias corridos desde a última emissão. Perto de ${diasBloqueio} dias — conferir manualmente as datas exatas no SEI, pode haver lapso temporal entre URBIS e SEI.`,
        fonte: "campo do processo",
        severidade: "atencao",
      });
    }
  }

  return avisos;
}

// ---------------------------------------------------------- a triagem

/**
 * CRITÉRIOS DA TRIAGEM — mexa aqui, é o lugar.
 *
 * Não é probabilidade nem previsão de prazo: é contagem de fatos que já
 * aconteceram. Cada fato que pesa aparece na lista de motivos, então a
 * classificação sempre pode ser conferida e contestada.
 */
export const CRITERIOS = {
  /** Acima disto, o histórico de idas e vindas já é grande. */
  trocasParaRisco: 80,
  /** Item que voltou a não conforme: sinal forte de retrabalho. */
  reversoesParaRisco: 5,
  /** Quantidade de campos vazios que deixa de ser detalhe. */
  vaziosParaAtencao: 10,
  /** Da 3ª análise em diante, o processo já foi bastante depurado. */
  analisesParaSimples: 3,
  /** Área construída acima disto costuma trazer mais exigência. */
  areaGrandeM2: 1000,
};

export function triar(e: EntradaVigia): Triagem {
  const motivos: string[] = [];
  const campos = resumirCampos(e.processo.dados);
  const analises = contarAnalises(e.processo.tags);
  const incoerencias = acharIncoerencias(e.processo);
  const trocas = Number(e.retrabalho?.trocas_totais ?? 0);
  const reversoes = Number(e.retrabalho?.virou_nao_conforme ?? 0);
  const area = numeroBR(e.processo.area_construida ?? null);

  // --- sinais de risco de retrabalho
  let risco = 0;
  if (trocas >= CRITERIOS.trocasParaRisco) {
    risco++;
    motivos.push(`${trocas} trocas de status no checklist (histórico do MAC).`);
  }
  if (reversoes >= CRITERIOS.reversoesParaRisco) {
    risco++;
    motivos.push(`${reversoes} itens voltaram de conforme para não conforme (histórico do MAC).`);
  }
  if (temIndeferimento(e.processo.tags)) {
    risco++;
    motivos.push("Processo já teve indeferimento (tag do processo).");
  }

  // --- sinais de atenção
  let atencao = 0;
  if (incoerencias.length > 0) {
    atencao++;
    motivos.push(`${incoerencias.length} incoerência(s) nos dados: ${incoerencias[0].explicacao}`);
  }
  if (campos.vazios.length >= CRITERIOS.vaziosParaAtencao) {
    atencao++;
    motivos.push(`${campos.vazios.length} campos vazios no LIP (campo do processo).`);
  }
  if (area !== null && area >= CRITERIOS.areaGrandeM2) {
    atencao++;
    motivos.push(`Área construída de ${area} m², acima de ${CRITERIOS.areaGrandeM2} m² (campo do processo).`);
  }
  if (area === null && e.processo.area_construida != null && String(e.processo.area_construida).trim() !== "") {
    atencao++;
    motivos.push("A área construída não pôde ser interpretada como número (campo do processo).");
  }

  // --- sinais de que está mais simples
  const simples: string[] = [];
  if (analises >= CRITERIOS.analisesParaSimples) {
    simples.push(`Já está na ${analises}ª análise — as exigências anteriores já foram trabalhadas.`);
  }
  if (campos.vazios.length === 0) {
    simples.push("Nenhum campo vazio no LIP.");
  }
  if (trocas === 0) {
    simples.push("Sem trocas de status no checklist.");
  }

  if (risco > 0) {
    return { classe: "maior risco de retrabalho", motivos };
  }
  if (atencao > 0) {
    return { classe: "exige atenção", motivos };
  }
  return {
    classe: "mais simples para análise",
    motivos: simples.length > 0 ? simples : ["Nenhum sinal de retrabalho ou inconsistência encontrado."],
  };
}
