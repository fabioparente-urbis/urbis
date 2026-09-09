/**
 * lib/urbi/motorProducao.ts — Motor de Produção do Co-Analista (04/09/2026).
 *
 * Dicas curtas e acionáveis pro analista, calculadas 100% em CÓDIGO a partir do dossiê que
 * `montarDossieFactual` já monta (lib/urbi/montarDossie.ts) — SEM Gemini, sem custo, sem
 * depender de prompt. Reaproveita o que já existe (catálogo semântico, situação, BDI, MDP, BIP)
 * em vez de recalcular nada.
 *
 * Prioriza até 3 ações, na ordem fixa pedida (mais bloqueante primeiro):
 *   1. impede emissão/continuidade — item NÃO CONFORME na análise ativa (MAC);
 *   2. documento ausente — campo do LIP que referencia um documento e está vazio;
 *   3. campo crítico — outro campo do LIP vazio (fonte canônica: vw_bdi_campos_criticos);
 *   4. item reincidente/retorno — voltou a não conforme, mantido pendente, retrabalho (BDI),
 *      interessado ainda não retornou, ou item cujo texto mudou desde a última marcação;
 *   5. divergência determinística — `cruzamentos` (nunca uma comparação inventada);
 *   6. observação pendente — item com observação registrada que o URBI não pode ler.
 *
 * SÓ SUGERE — nunca decide, altera, emite ou pontua. "Esforço provável" nunca é prazo: é uma
 * das 4 classificações fixas, sempre com fonte objetiva.
 *
 * Fase 6 do plano Documentos Vivos (§21, 06/09/2026): tier 2 ("documento ausente") passa a
 * diferenciar campo vazio porque NINGUÉM TROUXE o documento (esforço "depende_documento", cobrar
 * de fora) de campo vazio cujo documento JÁ ESTÁ no MHD (Organizador de PDF SEI, Slots 1/2) mas
 * não foi vinculado ao LIP ainda — esforço "rapido" (é só aceitar a sugestão de
 * `lib/documentosSei/compararLip.ts`, já pronta na tela). `d.mhd` já vem no dossiê
 * (`montarDossieFactual`), reaproveitado — nenhuma consulta nova aqui.
 */
import { CAMPO_POR_PAPEL_PECA, ROTULO_CAMPO_LIP } from "@/lib/documentosSei/compararLip";

export type EsforcoProvavel = "rapido" | "exige_atencao" | "depende_documento" | "base_insuficiente";

export type AcaoPrioritaria = {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  texto: string;
  motivo: string;
  esforco: EsforcoProvavel;
  /**
   * Grupo do item no checklist ("Calçada", "Documentação"...), quando a ação vem de pendência do
   * MAC. Guardado à parte, e não só embutido no `texto`, pra `formatarRelatorioMotor` poder
   * agrupar e dizer "Calçada: X; Y" em vez de repetir "(Calçada)" em cada linha — 08/09/2026,
   * pedido do Fábio: "falar menos e dizer mais".
   */
  grupo?: string | null;
  /**
   * `item_id` do item do checklist, quando a ação vem de pendência do MAC — é o que permite o
   * URBI levar o analista ATÉ o item e deixá-lo destacado na tela, em vez de largar ele na
   * tela do MAC pra procurar (08/09/2026, Fábio: "pelo menos ele poderia me levar até o lugar
   * pra proceder a correção e deixar o local selecionado chamando atenção").
   */
  itemId?: string | null;
};

export type RelatorioMotor = {
  situacao: string;
  acoes: AcaoPrioritaria[];
  esforco: EsforcoProvavel;
  motivo: string;
};

// ─────────────────────────────────────────────────────────────── util

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Colapsa espaço/quebra de linha — texto de item de checklist às vezes vem com \n\n embutido
 *  (achado real: Slot 5, item de "CARIMBO" com lista de notas em várias linhas). */
function limparEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function truncar(texto: string, limite: number): string {
  const t = limparEspacos(texto);
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

/** Teto duro pra QUALQUER ação, depois de composta — "curto" é requisito do produto. Corta
 *  o CORPO (o trecho citado), nunca o prefixo/sufixo fixo — assim "(grupo)." sempre sobrevive
 *  inteiro em vez de virar um "(" pendurado sem fechar. */
const LIMITE_ACAO = 130;

function compor(prefixo: string, corpo: string, sufixo: string): string {
  const disponivel = Math.max(20, LIMITE_ACAO - prefixo.length - sufixo.length);
  return prefixo + truncar(corpo, disponivel) + sufixo;
}

/** Rede de segurança final pra qualquer ação que não passou por `compor` (ex.: rótulo de
 *  cruzamento já formatado) — se o corte cair no meio de um parêntese aberto, fecha ou recua
 *  pra antes dele, nunca deixa "(" pendurado. */
function truncarAcaoFinal(texto: string): string {
  if (texto.length <= LIMITE_ACAO) return texto;
  let cortado = texto.slice(0, LIMITE_ACAO - 1);
  const abertos = (cortado.match(/\(/g) ?? []).length;
  const fechados = (cortado.match(/\)/g) ?? []).length;
  if (abertos > fechados) {
    const ultimaAbertura = cortado.lastIndexOf("(");
    cortado = cortado.slice(0, ultimaAbertura).trimEnd();
  }
  return `${cortado}…`;
}

function fraseSituacaoLip(classe: string | undefined): string {
  switch (classe) {
    case "Não iniciado": return "LIP não iniciado";
    case "Incompleto": return "LIP incompleto";
    case "Completo": return "LIP completo";
    default: return classe ? `LIP ${classe.toLowerCase()}` : "LIP sem situação";
  }
}

function fraseSituacaoMac(classe: string | undefined): string {
  switch (classe) {
    case "Não iniciado": return "MAC não iniciado";
    case "Em análise": return "MAC em análise";
    case "Arquivado/indeferido": return "MAC arquivado/indeferido";
    case "Aguardando retorno do interessado": return "MAC aguardando retorno";
    default: return classe ? `MAC ${classe.toLowerCase()}` : "MAC sem situação";
  }
}

// ─────────────────────────────────────────────────────────────── tier 1 — pendências (MAC)

const PADRAO_PEDE_DOCUMENTO = /\b(apresentar|anexar|juntar|comprovar|encaminhar|entregar)\b/;

function candidatosPendencias(mac: any): AcaoPrioritaria[] {
  const pendencias: any[] = Array.isArray(mac?.pendencias_ultima_analise) ? mac.pendencias_ultima_analise : [];
  return pendencias.map((item): AcaoPrioritaria => {
    const textoItem = String(item?.texto ?? "Item sem cadastro localizado.");
    const grupo = item?.grupo ? String(item.grupo) : null;
    const vinculos: any[] = Array.isArray(item?.vinculos_bip) ? item.vinculos_bip : [];
    const pedeDocumento = PADRAO_PEDE_DOCUMENTO.test(normalizar(textoItem));
    return {
      tier: 1,
      texto: compor(`Corrigir/confirmar "`, textoItem, `"${grupo ? ` (${grupo})` : ""}.`),
      grupo,
      itemId: item?.item_id ? String(item.item_id) : null,
      // BIP só entra quando há vínculo REAL e aprovado (mac_bip_vinculos) — nunca por inferência.
      motivo: vinculos.length > 0
        ? `MAC: não conforme, com vínculo BIP aprovado (${vinculos[0].referencia}).`
        : "MAC: não conforme, sem vínculo BIP aprovado.",
      esforco: pedeDocumento ? "depende_documento" : "exige_atencao",
    };
  });
}

// ─────────────────────────────────────────────────────────────── tiers 2/3 — campos vazios (LIP)

const PREFIXO_DOCUMENTO = "DOC SEI —";

function normalizarRotulo(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Rótulos de campo LIP (ex.: "Certidão", "ART de Levantamento") que já têm documento no MHD. */
function rotulosLipJaNoMhd(mhd: any[]): Set<string> {
  const out = new Set<string>();
  for (const doc of mhd ?? []) {
    const campo = CAMPO_POR_PAPEL_PECA[doc?.papel];
    const rotulo = campo ? ROTULO_CAMPO_LIP[campo] : undefined;
    if (rotulo) out.add(normalizarRotulo(rotulo));
  }
  return out;
}

function candidatosCamposVazios(lip: any, mhd: any[]): { documento: AcaoPrioritaria[]; critico: AcaoPrioritaria[] } {
  const rotulos: string[] = Array.isArray(lip?.campos_vazios_rotulos) ? lip.campos_vazios_rotulos : [];
  const jaNoMhd = rotulosLipJaNoMhd(mhd);
  const documento: AcaoPrioritaria[] = [];
  const critico: AcaoPrioritaria[] = [];
  for (const rotulo of rotulos) {
    if (rotulo.startsWith(PREFIXO_DOCUMENTO)) {
      const nomeCampo = rotulo.slice(PREFIXO_DOCUMENTO.length).trim();
      const existeNoMhd = jaNoMhd.has(normalizarRotulo(nomeCampo));
      documento.push({
        tier: 2,
        texto: existeNoMhd
          ? `Aceitar "${nomeCampo}" — já está no Organizador de PDF SEI, só falta vincular ao LIP.`
          : `Conferir/anexar "${nomeCampo}".`,
        motivo: existeNoMhd
          ? "MHD: documento já organizado (Organizador de PDF SEI), ainda não vinculado ao LIP."
          : "LIP: campo de referência de documento vazio.",
        esforco: existeNoMhd ? "rapido" : "depende_documento",
      });
    } else {
      critico.push({
        tier: 3,
        texto: `Preencher/confirmar campo "${rotulo}".`,
        motivo: "LIP: campo crítico vazio (fonte: vw_bdi_campos_criticos).",
        esforco: "rapido",
      });
    }
  }
  return { documento, critico };
}

// ─────────────────────────────────────────────────────────────── tier 4 — reincidência/retorno/BDI

function candidatosReincidenciaERetorno(mac: any, fluxo: any, tecnico: any): AcaoPrioritaria[] {
  const saida: AcaoPrioritaria[] = [];

  const voltaram: any[] = Array.isArray(mac?.evolucao?.itens_voltaram_nao_conforme) ? mac.evolucao.itens_voltaram_nao_conforme : [];
  for (const item of voltaram) {
    saida.push({
      tier: 4,
      texto: `Reconferir "${truncar(String(item.texto ?? ""), 90)}" — voltou a não conforme.`,
      motivo: `MAC: reincidência confirmada (histórico), em ${String(item.quando ?? "").slice(0, 10)}.`,
      esforco: "exige_atencao",
    });
  }

  const mantidos: any[] = Array.isArray(mac?.evolucao?.itens_pendentes_mantidos) ? mac.evolucao.itens_pendentes_mantidos : [];
  for (const item of mantidos) {
    saida.push({
      tier: 4,
      texto: `Resolver "${truncar(String(item.texto ?? ""), 90)}" — segue pendente desde passada anterior.`,
      motivo: `MAC: pendência mantida entre passadas, desde ${String(item.quando ?? "").slice(0, 10)}.`,
      esforco: "exige_atencao",
    });
  }

  const retrabalho: any[] = Array.isArray(fluxo?.retrabalho_entre_passadas) ? fluxo.retrabalho_entre_passadas : [];
  for (const item of retrabalho) {
    saida.push({
      tier: 4,
      texto: `Reconferir "${truncar(String(item.exigencia ?? ""), 90)}" — retrabalho entre passadas.`,
      motivo: `BDI: retrabalho registrado (vw_bdi_retrabalho_por_passada), voltou em ${String(item.voltou_em ?? "").slice(0, 10)}.`,
      esforco: "exige_atencao",
    });
  }

  const aguardando: any[] = Array.isArray(fluxo?.aguardando_retorno) ? fluxo.aguardando_retorno : [];
  for (const item of aguardando) {
    if (item?.situacao !== "ainda aguardando") continue; // só fato real de espera — nunca "base insuficiente" tratado como fato
    saida.push({
      tier: 4,
      texto: `Cobrar/registrar retorno do interessado — análise nº ${item.analise ?? "?"}.`,
      motivo: `BDI: aguardando retorno há ${item.dias ?? "?"} dia(s) desde o despacho.`,
      esforco: "depende_documento",
    });
  }

  const mudancas: any[] = Array.isArray(tecnico?.mudancas_estruturais) ? tecnico.mudancas_estruturais : [];
  for (const item of mudancas) {
    const textoAtual = item?.texto_atual as string | null | undefined;
    saida.push({
      tier: 4,
      texto: textoAtual
        ? `Reconferir "${truncar(textoAtual, 90)}" — texto do item mudou desde a última marcação.`
        : `Reconferir item removido/substituído do catálogo desde a última marcação.`,
      motivo: "BDI: mudança de catálogo detectada (base histórica insuficiente pra comparar sozinho).",
      esforco: "exige_atencao",
    });
  }

  return saida;
}

// ─────────────────────────────────────────────────────────────── tier 5 — cruzamentos (divergência)

function candidatosCruzamentos(cruzamentos: any[] | undefined): AcaoPrioritaria[] {
  const lista = Array.isArray(cruzamentos) ? cruzamentos : [];
  return lista
    .filter((c) => c?.resultado === "possivel_divergencia" || c?.resultado === "base_juridica_ausente")
    .map((c): AcaoPrioritaria => ({
      tier: 5,
      texto: `Conferir "${truncar(String(c.rotulo ?? c.chave ?? ""), 90)}" — ${
        c.resultado === "possivel_divergencia" ? "divergência entre fontes" : "sem base jurídica vinculada"
      }.`,
      motivo: `Cruzamento determinístico: ${truncar(String(c.motivo ?? ""), 100)}`,
      esforco: "exige_atencao",
    }));
}

// ─────────────────────────────────────────────────────────────── tier 6 — observação pendente

function candidatosObservacoes(mac: any): AcaoPrioritaria[] {
  const marcacoes: any[] = Array.isArray(mac?.marcacoes_ultima_analise) ? mac.marcacoes_ultima_analise : [];
  return marcacoes
    .filter((m) => typeof m?.observacao === "string" && m.observacao.trim().length > 0)
    .map((m): AcaoPrioritaria => ({
      tier: 6,
      texto: `Reler observação registrada em "${truncar(String(m.texto ?? ""), 90)}".`,
      motivo: "MAC: observação existe na tela (texto não acessível ao URBI, por privacidade).",
      esforco: "exige_atencao",
    }));
}

// ─────────────────────────────────────────────────────────────── montagem final

/**
 * `d` é o `data` devolvido por `montarDossieFactual` (lib/urbi/montarDossie.ts) — mesma fonte
 * usada pelo chat, nunca uma consulta própria nova. Funciona igual nos 3 slots porque só lê
 * campos que o dossiê já normaliza da mesma forma pra todos.
 */
export function montarRelatorioMotor(d: Record<string, any>): RelatorioMotor {
  const lip = d.lip ?? {};
  const mac = d.mac ?? {};
  const fluxo = d.fluxo ?? {};
  const tecnico = d.tecnico ?? {};
  const situacoes = d.situacoes ?? {};

  const { documento: acoesDocumento, critico: acoesCritico } = candidatosCamposVazios(lip, d.mhd);
  /**
   * Pendência de checklist ("não conforme") só é AÇÃO BLOQUEANTE de verdade quando a análise que
   * a gerou ainda está aberta — achado ao vivo em 08/09/2026 (Fábio): "quero resolver esses 42
   * processos com ação bloqueante... isso tá errado". Um item "não conforme" que já resultou em
   * despacho, laudo ou indeferimento não é mais "coisa pra resolver hoje": ou o interessado já
   * foi cobrado por ele (despacho), ou o processo já fechou (laudo/indeferido/encerrado) — nesses
   * casos o item conta pra história, não pro Briefing do dia.
   */
  const macAindaAberto = situacoes.mac?.classe === "Em análise";
  const todasAsAcoes: AcaoPrioritaria[] = [
    ...(macAindaAberto ? candidatosPendencias(mac) : []),
    ...acoesDocumento,
    ...acoesCritico,
    ...candidatosReincidenciaERetorno(mac, fluxo, tecnico),
    ...candidatosCruzamentos(d.cruzamentos),
    ...candidatosObservacoes(mac),
  ].map((a) => ({ ...a, texto: truncarAcaoFinal(a.texto) }));

  const acoes = todasAsAcoes.slice(0, 3);
  const numRetornos = (Array.isArray(fluxo.aguardando_retorno) ? fluxo.aguardando_retorno : [])
    .filter((r: any) => r?.situacao === "ainda aguardando").length;

  const situacao = [
    fraseSituacaoLip(situacoes.lip?.classe),
    fraseSituacaoMac(situacoes.mac?.classe),
    numRetornos > 0 ? `${numRetornos} retorno${numRetornos > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" | ");

  if (acoes.length === 0) {
    const coberturaCompleta = d.cobertura?.completo !== false;
    return {
      situacao,
      acoes: [],
      esforco: coberturaCompleta ? "rapido" : "base_insuficiente",
      motivo: coberturaCompleta
        ? "Nenhuma pendência determinística encontrada — processo em dia (LIP/MAC/BDI/cruzamentos sem sinal)."
        : `Leitura incompleta do dossiê (${(d.cobertura?.fontes_indisponiveis ?? []).length} fonte(s) indisponível(is)) — sem dado suficiente pra priorizar com segurança.`,
    };
  }

  // Esforço/motivo do topo refletem a ação #1 (a mais prioritária) — é o que decide o ritmo real.
  return { situacao, acoes, esforco: acoes[0].esforco, motivo: acoes[0].motivo };
}

const ROTULO_ESFORCO: Record<EsforcoProvavel, string> = {
  rapido: "Rápido",
  exige_atencao: "Exige atenção",
  depende_documento: "Depende de documento",
  base_insuficiente: "Base insuficiente",
};

/** Formata no template exato pedido — nunca prosa livre, nunca prazo/data inventados. */
/**
 * Corta no fim de uma frase/oração, não no meio da palavra — o corte duro em 90 caracteres
 * produzia coisas como `ART/RRT de levantamento da …`, que não diz nada. Prefere o primeiro
 * ponto/ponto-e-vírgula; se não houver, corta no último espaço antes do limite.
 */
function primeiraOracao(texto: string, limite: number): string {
  const t = limparEspacos(texto).replace(/^["“]|["”]$/g, "");
  const corteFrase = t.search(/[;.]\s/);
  const base = corteFrase > 20 && corteFrase < limite ? t.slice(0, corteFrase) : t;
  if (base.length <= limite) return base;
  const cortado = base.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return `${(ultimoEspaco > 20 ? cortado.slice(0, ultimoEspaco) : cortado).trim()}…`;
}

/** Tira o embrulho burocrático que `candidatosPendencias` monta, pra sobrar só o que interessa. */
function semEmbrulho(texto: string): string {
  return texto
    .replace(/^(Corrigir\/confirmar|Preencher\/confirmar campo|Reconferir|Resolver|Conferir)\s+/i, "")
    .replace(/\s*\([^)]*\)\.?$/, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/^[•\-–]\s*/, "")
    .trim();
}

/**
 * Itens do mesmo grupo do checklist costumam começar igual ("Em Calçadas atender e informar: •"),
 * e repetir isso em cada item é justamente o "falar muito e dizer pouco". Tira o começo comum
 * quando ele é longo o bastante pra ser mesmo um cabeçalho repetido, e não coincidência.
 */
function tirarPrefixoComum(itens: string[]): string[] {
  if (itens.length < 2) return itens;
  let tamanho = 0;
  const primeiro = itens[0];
  while (tamanho < primeiro.length && itens.every((i) => i[tamanho] === primeiro[tamanho])) tamanho++;
  if (tamanho < 15) return itens; // curto demais pra ser cabeçalho — provavelmente coincidência
  const corte = primeiro.slice(0, tamanho).lastIndexOf(" ") + 1;
  if (corte < 15) return itens;
  return itens.map((i) => i.slice(corte).replace(/^[•\-–:]\s*/, "").trim()).filter(Boolean);
}

/**
 * Reescrito em 08/09/2026 — "o URBI tem que ser mais claro, mais direto e informal, falar menos
 * e dizer mais" (Fábio), olhando uma resposta que repetia "Corrigir/confirmar ... (Calçada)" em
 * três linhas e terminava frases no meio ("de levantamento da …").
 *
 * O que mudou é só COMO se fala — os fatos (`r.acoes`, `r.situacao`, `r.motivo`) continuam vindo
 * inteiros do mesmo cálculo determinístico. Agrupa por grupo do checklist em vez de repetir o
 * parêntese em cada linha, corta no fim da oração em vez de no meio da palavra, e junta
 * situação/esforço numa linha só em vez de três seções com rótulo.
 */
export function formatarRelatorioMotor(r: RelatorioMotor): string {
  const cabecalho = [
    (r.situacao || "sem situação disponível").replace(/\s*\|\s*/g, ", "),
    ROTULO_ESFORCO[r.esforco].toLowerCase(),
  ].filter(Boolean).join(" · ");

  if (r.acoes.length === 0) {
    return `${cabecalho}\n\nNão achei nada travando aqui. ${r.motivo}`;
  }

  // Agrupa pelo grupo do checklist: "Calçada: largura...; superfície..." em vez de três linhas
  // repetindo "(Calçada)".
  const porGrupo = new Map<string, string[]>();
  for (const a of r.acoes) {
    const chave = a.grupo?.trim() || "";
    const lista = porGrupo.get(chave) ?? [];
    lista.push(primeiraOracao(semEmbrulho(a.texto), 90));
    porGrupo.set(chave, lista);
  }
  const linhas = [...porGrupo.entries()].map(([grupo, itens]) => {
    const limpos = tirarPrefixoComum(itens);
    return grupo ? `• ${grupo}: ${limpos.join("; ")}` : `• ${limpos.join("; ")}`;
  });

  const quantas = r.acoes.length;
  return `${cabecalho}

${quantas === 1 ? "Falta isto" : `Faltam estas ${quantas}`} pra destravar:
${linhas.join("\n")}

${r.motivo}`;
}
