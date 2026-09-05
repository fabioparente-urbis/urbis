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
 */

export type EsforcoProvavel = "rapido" | "exige_atencao" | "depende_documento" | "base_insuficiente";

export type AcaoPrioritaria = {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  texto: string;
  motivo: string;
  esforco: EsforcoProvavel;
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

function candidatosCamposVazios(lip: any): { documento: AcaoPrioritaria[]; critico: AcaoPrioritaria[] } {
  const rotulos: string[] = Array.isArray(lip?.campos_vazios_rotulos) ? lip.campos_vazios_rotulos : [];
  const documento: AcaoPrioritaria[] = [];
  const critico: AcaoPrioritaria[] = [];
  for (const rotulo of rotulos) {
    if (rotulo.startsWith(PREFIXO_DOCUMENTO)) {
      documento.push({
        tier: 2,
        texto: `Conferir/anexar "${rotulo.slice(PREFIXO_DOCUMENTO.length).trim()}".`,
        motivo: "LIP: campo de referência de documento vazio.",
        esforco: "depende_documento",
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

  const { documento: acoesDocumento, critico: acoesCritico } = candidatosCamposVazios(lip);
  const todasAsAcoes: AcaoPrioritaria[] = [
    ...candidatosPendencias(mac),
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
export function formatarRelatorioMotor(r: RelatorioMotor): string {
  const linhasAcoes = r.acoes.length > 0
    ? r.acoes.map((a, i) => `${i + 1}. ${a.texto}`).join("\n")
    : "1. Nenhuma ação prioritária identificada agora.";
  return `Situação: ${r.situacao || "sem situação disponível"}

Agora:
${linhasAcoes}

Esforço provável:
• ${ROTULO_ESFORCO[r.esforco]}

Motivo:
• ${r.motivo}`;
}
