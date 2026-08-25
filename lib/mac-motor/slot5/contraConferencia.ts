/**
 * lib/mac-motor/slot5/contraConferencia.ts — ciclo de contra-conferência do MAC, EXCLUSIVO do Slot 5.
 *
 * Duas metades do mesmo ciclo:
 *   1. `montarPrompt` — gera o texto que o analista cola numa IA de fora (Gemini, ChatGPT, o que for)
 *      junto com os PDFs da pasta. A IA audita a análise que já foi feita e devolve um relatório.
 *   2. `interpretarRelatorio` — lê esse relatório de volta e transforma em achados que a tela mostra
 *      um a um para o analista aceitar ou recusar.
 *
 * POR QUE UMA IA DE FORA: o motor do Slot 5 (LER PASTA / P3) e a contra-conferência erram junto se
 * forem o mesmo modelo com o mesmo prompt. O valor está em ser OUTRO olhar — outro modelo, outro
 * enquadramento (adversarial: o trabalho dela é achar erro, não confirmar).
 *
 * NADA É APLICADO SOZINHO. O relatório importado vira proposta; quem marca é o analista, item a
 * item — mesma regra dos filtros de aplicabilidade.
 *
 * Isolado do Slot 1: não importa nada de app/analise-regularizacao nem de lib/macFiltros.
 */

export type ItemChecklist = { id: string; grupo: string; ordem: number; texto: string };
export type StatusMac = "conforme" | "nao_conforme" | "nao_aplica";

/** Numeração "N.M" que o analista vê na tela: N = posição do grupo, M = posição dentro dele. */
export type ItemNumerado = ItemChecklist & { numero: string; itemN: number; subM: number };

const ROTULO_STATUS: Record<StatusMac, string> = {
  conforme: "CONFORME",
  nao_conforme: "NAO CONFORME",
  nao_aplica: "NAO SE APLICA",
};

const STATUS_VALIDOS = new Set<string>(["conforme", "nao_conforme", "nao_aplica"]);
const GRAVIDADES = new Set(["GRAVE", "MEDIO", "DUVIDA"]);

/** Reproduz EXATAMENTE a numeração da tela — export e import têm que concordar, senão o achado
 * "24.16" da IA cairia em outro item na hora de aplicar. */
export function numerarItens(itens: ItemChecklist[]): ItemNumerado[] {
  const menorOrdem = new Map<string, number>();
  for (const i of itens) {
    if (!menorOrdem.has(i.grupo) || i.ordem < menorOrdem.get(i.grupo)!) menorOrdem.set(i.grupo, i.ordem);
  }
  const grupos = [...menorOrdem.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g);
  const porGrupo = new Map<string, ItemChecklist[]>();
  for (const i of itens) {
    if (!porGrupo.has(i.grupo)) porGrupo.set(i.grupo, []);
    porGrupo.get(i.grupo)!.push(i);
  }
  for (const l of porGrupo.values()) l.sort((a, b) => a.ordem - b.ordem);

  const saida: ItemNumerado[] = [];
  grupos.forEach((g, iG) => {
    (porGrupo.get(g) ?? []).forEach((it, iS) => {
      saida.push({ ...it, numero: `${iG + 1}.${iS + 1}`, itemN: iG + 1, subM: iS + 1 });
    });
  });
  return saida;
}

const limpar = (s: unknown) =>
  String(s ?? "").replace(/ §R:.+$/, "").replace(/\s+/g, " ").trim();

const temValor = (v: any) =>
  v && typeof v === "object" && v.valor !== null && v.valor !== undefined && String(v.valor).trim() !== "";

const ausente = (v: any) => {
  if (!temValor(v)) return true;
  const t = String(v.valor).trim().toUpperCase();
  return t === "NP" || t === "N/P" || t === "NÃO" || t === "NAO";
};

/**
 * Documentos que a IA precisa ter em mãos. Os condicionais são decididos pela própria ficha do
 * processo — não adianta exigir COMAER de quem não está em zona aeroportuária, e é grave deixar
 * passar a certidão de corredor de quem está em corredor viário.
 */
function documentosEssenciais(dados: Record<string, any>, indicePorGrupo: Map<RegExp, number>) {
  const acheItem = (re: RegExp) => {
    for (const [padrao, n] of indicePorGrupo) if (padrao.source === re.source) return n;
    return null;
  };
  const lista: { nome: string; porque: string }[] = [
    {
      nome: "Prancha do projeto arquitetônico (PDF)",
      porque: "sem o desenho quase nada do checklist pode ser verificado",
    },
    {
      nome: "Print da tela do ATENDIMENTO / Alvará Mais Fácil",
      porque:
        `é a ÚNICA fonte para o ÍTEM ${acheItem(/ALVAR/) ?? 1} inteiro (área do terreno, área construída, ` +
        `pavimentos, tipo de uso, nº das ARTs, vagas, responsável técnico). Voce NAO tem acesso ao ` +
        `sistema da Prefeitura — sem esse print esses itens são impossíveis de conferir`,
    },
    { nome: "Uso do Solo", porque: "unidade territorial, atividade, alertas e corredor viário" },
    { nome: "Certidão de Matrícula", porque: "dimensões e confrontações do lote, proprietário" },
    { nome: "ARTs/RRTs (projeto, execução e caixa de recarga)", porque: "números e áreas que o checklist compara com a prancha" },
  ];

  const corredor =
    /CORREDOR/i.test(String(dados?.alertasDoUsoDoSolo?.valor ?? "")) ||
    String(dados?.anexouCertidaoDeCorredorViario?.valor ?? "").trim().toUpperCase() === "SIM";
  if (corredor) {
    lista.push({
      nome: "Certidão de Corredor Viário",
      porque: `a ficha diz que este processo ESTÁ em corredor viário — o ÍTEM ${acheItem(/CORREDOR/) ?? "de corredor viário"} se aplica`,
    });
  }
  if (!ausente(dados?.docEmitidoPeloComandoDaAeronautica)) {
    lista.push({ nome: "Documento do COMAER / Aeronáutica", porque: "a ficha indica exigência de zona aeroportuária" });
  }
  if (temValor(dados?.cheadvN)) {
    lista.push({
      nome: `Documentos da CHEADV (nº ${String(dados.cheadvN.valor).trim()})`,
      porque: "a ficha registra CHEADV neste processo",
    });
  }
  return lista;
}

export function montarPrompt(args: {
  codigo: string;
  numeroAnalise: number | string;
  dados: Record<string, any>;
  itens: ItemChecklist[];
  marcas: Record<string, string>;
  fontes: Record<string, string>;
  observacoesPorItem: Record<string, string>;
  tamanhoLote?: number;
}): string {
  const { codigo, numeroAnalise, dados, itens, marcas, fontes, observacoesPorItem } = args;
  const tamLote = args.tamanhoLote ?? 40;

  const numerados = numerarItens(itens);
  const totalGrupos = new Set(numerados.map((i) => i.itemN)).size;

  // Índice do grupo por assunto, para o prompt citar o número certo do ÍTEM.
  const indicePorGrupo = new Map<RegExp, number>();
  for (const re of [/ALVAR/, /CORREDOR/, /ACESSIBILIDADE/]) {
    const achado = numerados.find((i) => re.test(i.grupo));
    if (achado) indicePorGrupo.set(re, achado.itemN);
  }

  const cont: Record<string, number> = {};
  for (const i of numerados) {
    const s = marcas[i.id] ?? "em_branco";
    cont[s] = (cont[s] ?? 0) + 1;
  }
  const nPendentes = cont.em_branco ?? 0;

  const lipLinhas = Object.entries(dados)
    .filter(([, v]) => temValor(v))
    .map(([k, v]) => `${k}: ${limpar(v.valor)}`);

  const essenciais = documentosEssenciais(dados, indicePorGrupo);

  const lotes: ItemNumerado[][] = [];
  for (let i = 0; i < numerados.length; i += tamLote) lotes.push(numerados.slice(i, i + tamLote));

  let macTexto = "";
  lotes.forEach((lote, iL) => {
    macTexto +=
      `\n\n========== LOTE ${iL + 1} de ${lotes.length} — itens ${lote[0].numero} a ` +
      `${lote[lote.length - 1].numero} (${lote.length} subitens) ==========\n`;
    let grupoAtual: string | null = null;
    for (const it of lote) {
      if (it.grupo !== grupoAtual) {
        grupoAtual = it.grupo;
        macTexto += `\n--- ÍTEM ${it.itemN} · grupo: ${grupoAtual} ---\n`;
      }
      const st = marcas[it.id] as StatusMac | undefined;
      const rot = st ? ROTULO_STATUS[st] : "EM BRANCO (o sistema nao decidiu)";
      const fonte = limpar(fontes[it.id]).slice(0, 180);
      const obs = limpar(observacoesPorItem[it.id]).slice(0, 200);
      macTexto += `${it.numero} [${rot}] ${limpar(it.texto)}\n`;
      if (fonte) macTexto += `     (motivo do sistema: ${fonte})\n`;
      if (obs) macTexto += `     (observacao do analista: ${obs})\n`;
    }
  });

  return `Voce vai fazer a CONTRA-CONFERENCIA (auditoria independente) de uma analise de aprovacao de projeto arquitetonico ja feita pela Prefeitura de Goiania. Anexei os documentos do processo. Leia-os de verdade antes de comecar.

# SEU PAPEL

Voce e um analista SENIOR de aprovacao de projetos, cetico, contratado justamente para ACHAR OS ERROS da analise que ja foi feita. Concordar com tudo e considerado FALHA no seu trabalho. Seu valor esta em encontrar o que passou batido.

# REGRA DE OURO (inegociavel)

So afirme o que voce CONSEGUE VER nos documentos anexados. Se a cota, a medida, o texto ou o desenho nao estiverem visiveis, a resposta e "NAO VERIFICAVEL" — nunca chute a partir do que voce lembra da norma ou do que parece razoavel. Uma afirmacao sua sem evidencia visivel no documento e pior do que nao responder.

Sempre que apontar algo, diga ONDE viu: prancha, corte, planta, quadro, numero da folha, aba da planilha, secao do documento.

# OS ERROS, POR GRAVIDADE

- **GRAVE — "nao se aplica" indevido**: o item foi tirado da analise mas SE APLICA a este projeto. Uma exigencia legal desaparece e ninguem percebe. Boa parte dos "nao se aplica" foi marcada por filtro automatico (ex.: "o projeto nao tem rampa"); confira se a premissa do filtro bate com o desenho.
- **GRAVE — "conforme" indevido**: o item foi aprovado mas o desenho nao atende. Gera obra irregular.
- **MEDIO — "nao conforme" indevido**: exige correcao de algo que ja esta atendido. Atrasa o processo sem motivo.
- **DUVIDA — nao verificavel**: voce nao consegue confirmar nem negar com o que foi anexado.

# ===== PASSO 1: INVENTARIO E CHECAGEM DE SUFICIENCIA =====

Sua PRIMEIRA resposta e so isto — nao comece a analise ainda.

**(a) Inventario.** Para cada arquivo que voce recebeu, uma linha:
\`nome do arquivo — que documento e — o que consigo ler nele (texto? desenho com cotas legiveis? planilha? imagem sem cota legivel?)\`

Seja franco sobre o que voce NAO consegue ler. Se a prancha chegou como texto sem o desenho, ou as cotas estao ilegiveis, diga AGORA — muda tudo o que voce pode afirmar depois.

**(b) Checagem de suficiencia.** Estes documentos sao necessarios para esta analise:

${essenciais.map((d, i) => `${i + 1}. **${d.nome}** — ${d.porque}.`).join("\n")}

Confira quais chegaram. **Se faltar algum, PECA explicitamente**, assim:
\`FALTANDO: <documento> — sem ele nao consigo verificar <o que exatamente>. Pode anexar?\`

Nao comece a analise com documento essencial faltando. Espere eu anexar ou responder.

Se eu disser que o documento **nao existe** ou que **nao posso anexar**, siga em frente — mas trate todo item que dependia dele como \`nao_verificavel\`, com a evidencia dizendo "sem <documento>", e liste isso na secao FALTA NA PASTA do relatorio final. Nunca preencha no lugar do documento ausente.

Termine com: \`PASSO 1 CONCLUIDO — aguardando "CONTINUA"\`.

# ===== PASSO 2: PROTOCOLO DE LOTES =====

O checklist tem ${numerados.length} subitens. Analisar tudo de uma vez faz voce passar os olhos em vez de conferir. Por isso o trabalho e FATIADO:

1. **Um lote por resposta.** Depois do inventario vem o LOTE 0 (a ficha do processo), depois LOTE 1 a LOTE ${lotes.length}. Ao terminar um, PARE.
2. Termine cada um com: \`LOTE N CONCLUIDO — aguardando "CONTINUA"\`.
3. Eu respondo apenas **CONTINUA** e voce faz o proximo.
4. **Confira item por item dentro do lote.** Cada linha merece uma olhada no documento. Esse e o unico motivo de existir o fatiamento — se voce correr, ele perdeu a razao de ser.
5. Quando eu digitar **RELATORIO FINAL**, voce junta TUDO num relatorio unico. Releia suas proprias respostas anteriores antes de escrever: nao deixe achado ficar pelo caminho.

## Formato de cada lote

Nao repita os itens corretos. So o que voce contesta ou nao consegue verificar:

\`\`\`
[GRAVIDADE] item N.M — o sistema disse: X | eu digo: Y
   Evidencia: o que voce viu e ONDE
\`\`\`

Lote inteiro certo? Escreva so: \`LOTE N: nada a apontar.\`

Feche com um contador de uma linha:
\`Lote N: X itens conferidos · Y graves · Z medios · W duvidas\`

# ===== PASSO 3: RELATORIO FINAL =====

Quando eu pedir, produza DUAS partes.

## PARTE A — relatorio para leitura humana

### 1. RESUMO
Total conferido, achados por gravidade, e uma frase honesta: o projeto esta em condicao de ser aprovado ou nao?

### 2. ACHADOS GRAVES
Cada "nao se aplica" indevido e "conforme" indevido: item, o que muda, evidencia.

### 3. ACHADOS MEDIOS
Os "nao conforme" indevidos.

### 4. ITENS EM BRANCO QUE VOCE DECIDIU
O sistema deixou ${nPendentes} itens sem resposta. Liste os que voce decidiu COM EVIDENCIA.

### 5. ERROS NA FICHA (LIP)
O que voce achou no LOTE 0.

### 6. FALTA NA PASTA
Documento, prancha ou detalhamento necessario que nao foi anexado — compare com seu inventario do PASSO 1.

### 7. GRAU DE CONFIANCA
Quanto voce conseguiu efetivamente verificar e quanto ficou no escuro. Seja honesto: se metade nao deu para conferir, diga.

## PARTE B — bloco JSON (obrigatorio, para reimportar no sistema)

Ao final, DEPOIS do texto, um unico bloco \`\`\`json com exatamente esta estrutura:

\`\`\`json
{
  "contraConferencia": {
    "ia": "nome e versao do modelo que voce e",
    "processo": "${codigo}",
    "achados": [
      {
        "item": "24.16",
        "gravidade": "GRAVE",
        "sistemaDisse": "nao_aplica",
        "euDigo": "conforme",
        "evidencia": "o que voce viu e onde, em uma frase"
      }
    ],
    "errosFicha": [
      { "campo": "areaTotal", "sistemaAnotou": "3572,10", "correto": "3.572,10", "evidencia": "onde viu" }
    ],
    "faltaNaPasta": ["documento que faltou e para que serviria"],
    "confianca": "uma frase sobre quanto foi possivel verificar"
  }
}
\`\`\`

Regras do JSON, sem excecao:
- \`item\`: exatamente o numero N.M como aparece nos lotes. Nunca invente um numero que nao existe.
- \`sistemaDisse\` e \`euDigo\`: apenas \`conforme\`, \`nao_conforme\`, \`nao_aplica\` — ou, so em \`euDigo\`, \`nao_verificavel\` quando voce nao conseguiu concluir. Use \`em_branco\` em \`sistemaDisse\` para item que estava sem resposta.
- \`gravidade\`: \`GRAVE\`, \`MEDIO\` ou \`DUVIDA\`.
- **So entre no JSON o que voce realmente contesta ou nao conseguiu verificar.** Item que voce conferiu e concorda NAO entra — o sistema ja tem essa resposta.
- \`evidencia\` e obrigatoria e precisa dizer ONDE voce viu. Achado sem evidencia sera descartado na importacao.
- O JSON precisa ser valido e completo. Se for muito longo, corte o texto da PARTE A, nunca o JSON.

# O QUE VOCE RECEBE

- **Documentos anexados**: os arquivos da pasta do processo — prancha, print do ATENDIMENTO, Uso do Solo, matricula, ARTs, certidoes, despachos, declaracoes, planilhas exportadas do LIP/MAC e o que mais existir. NAO assuma o que foi anexado: veja o que chegou.
- Se vier uma **planilha exportada do LIP ou do MAC**, ela e a mesma analise em outro formato. Use para conferencia cruzada. Se a planilha divergir dos blocos de texto abaixo, isso e um achado — reporte.
- **LOTE 0** — ficha do processo (LIP). Numero errado aqui contamina toda a analise.
- **LOTE 1 a ${lotes.length}** — os ${numerados.length} subitens do checklist (MAC) com a marcacao do sistema e o motivo.

Situacao atual: ${cont.conforme ?? 0} conforme · ${cont.nao_conforme ?? 0} nao conforme · ${cont.nao_aplica ?? 0} nao se aplica · ${nPendentes} em branco.

---

========== LOTE 0 — FICHA DO PROCESSO (LIP) ==========

Processo ${codigo} · analise ${numeroAnalise} · ${lipLinhas.length} campos preenchidos · ${totalGrupos} grupos no checklist.
Confira cada campo contra os documentos. Reporte so os errados:
\`[GRAVIDADE] campo: sistema anotou "X" | correto e "Y" — visto em <onde>\`

${lipLinhas.join("\n")}
${macTexto}

---

FIM DOS DADOS.

Agora faca **somente o PASSO 1** (inventario + checagem de suficiencia). Nao comece o LOTE 0 ainda.
`;
}

// ── Importação ───────────────────────────────────────────────────────────────

export type AchadoImportado = {
  item: string;
  itemId: string | null;
  gravidade: "GRAVE" | "MEDIO" | "DUVIDA";
  sistemaDisse: string;
  euDigo: string;
  evidencia: string;
  /** O que a análise realmente tem hoje. Diverge de `sistemaDisse` quando o relatório envelheceu. */
  statusAtual: string;
  /** Motivo de o achado não poder ser aplicado direto (item inexistente, sem evidência, etc.). */
  problema: string | null;
  /** `false` para DUVIDA/nao_verificavel: é aviso, não vira marcação. */
  aplicavel: boolean;
  textoItem: string;
  grupo: string;
};

export type RelatorioImportado = {
  ia: string;
  achados: AchadoImportado[];
  errosFicha: { campo: string; sistemaAnotou: string; correto: string; evidencia: string }[];
  faltaNaPasta: string[];
  confianca: string;
  descartados: { item: string; motivo: string }[];
};

/** Acha o bloco JSON no meio do relatório — a IA quase sempre embrulha em ```json, mas nem sempre. */
function extrairJson(texto: string): any | null {
  const cercados = [...texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  // De trás para frente: o bloco final é o relatório; blocos anteriores podem ser exemplos do prompt.
  for (const bruto of cercados.reverse()) {
    try {
      const j = JSON.parse(bruto);
      if (j?.contraConferencia) return j;
    } catch { /* tenta o próximo */ }
  }
  const i = texto.indexOf('"contraConferencia"');
  if (i === -1) return null;
  const inicio = texto.lastIndexOf("{", i);
  for (let fim = texto.length; fim > inicio; fim--) {
    const corte = texto.lastIndexOf("}", fim);
    if (corte <= inicio) break;
    try {
      const j = JSON.parse(texto.slice(inicio, corte + 1));
      if (j?.contraConferencia) return j;
    } catch { /* encolhe e tenta de novo */ }
  }
  return null;
}

export function interpretarRelatorio(
  texto: string,
  itens: ItemChecklist[],
  marcas: Record<string, string>,
): { ok: true; relatorio: RelatorioImportado } | { ok: false; erro: string } {
  const json = extrairJson(texto);
  if (!json) {
    return {
      ok: false,
      erro: "não achei o bloco JSON no relatório. Cole a resposta INTEIRA da IA, incluindo o bloco ```json do final.",
    };
  }

  const cc = json.contraConferencia ?? {};
  const numerados = numerarItens(itens);
  const porNumero = new Map(numerados.map((i) => [i.numero, i]));

  const achados: AchadoImportado[] = [];
  const descartados: { item: string; motivo: string }[] = [];

  for (const bruto of Array.isArray(cc.achados) ? cc.achados : []) {
    const numero = String(bruto?.item ?? "").trim();
    const evidencia = limpar(bruto?.evidencia);
    const euDigo = String(bruto?.euDigo ?? "").trim().toLowerCase();
    const sistemaDisse = String(bruto?.sistemaDisse ?? "").trim().toLowerCase();
    const gravidadeBruta = String(bruto?.gravidade ?? "").trim().toUpperCase();
    const gravidade = (GRAVIDADES.has(gravidadeBruta) ? gravidadeBruta : "DUVIDA") as AchadoImportado["gravidade"];

    const alvo = porNumero.get(numero);
    if (!alvo) {
      descartados.push({ item: numero || "(sem número)", motivo: "item não existe neste checklist" });
      continue;
    }
    if (!evidencia) {
      descartados.push({ item: numero, motivo: "achado sem evidência" });
      continue;
    }
    if (euDigo !== "nao_verificavel" && !STATUS_VALIDOS.has(euDigo)) {
      descartados.push({ item: numero, motivo: `resposta "${bruto?.euDigo}" não é um status válido` });
      continue;
    }

    const statusAtual = marcas[alvo.id] ?? "em_branco";
    const aplicavel = STATUS_VALIDOS.has(euDigo);

    // Relatório envelhecido: a análise mudou desde a exportação. Não bloqueia, mas o analista precisa ver.
    let problema: string | null = null;
    if (sistemaDisse && sistemaDisse !== statusAtual) {
      problema =
        `o relatório partiu de "${sistemaDisse}", mas o item hoje está "${statusAtual}" — ` +
        `a análise mudou depois que a contra-conferência foi gerada`;
    } else if (aplicavel && euDigo === statusAtual) {
      problema = "a resposta proposta é igual à atual — nada a mudar";
    }

    achados.push({
      item: numero,
      itemId: alvo.id,
      gravidade,
      sistemaDisse: sistemaDisse || "(não informado)",
      euDigo,
      evidencia,
      statusAtual,
      problema,
      aplicavel,
      textoItem: alvo.texto,
      grupo: alvo.grupo,
    });
  }

  const ordemGravidade = { GRAVE: 0, MEDIO: 1, DUVIDA: 2 };
  achados.sort((a, b) => ordemGravidade[a.gravidade] - ordemGravidade[b.gravidade]);

  return {
    ok: true,
    relatorio: {
      ia: limpar(cc.ia) || "IA não identificada",
      achados,
      errosFicha: (Array.isArray(cc.errosFicha) ? cc.errosFicha : []).map((e: any) => ({
        campo: limpar(e?.campo),
        sistemaAnotou: limpar(e?.sistemaAnotou),
        correto: limpar(e?.correto),
        evidencia: limpar(e?.evidencia),
      })).filter((e: any) => e.campo),
      faltaNaPasta: (Array.isArray(cc.faltaNaPasta) ? cc.faltaNaPasta : []).map(limpar).filter(Boolean),
      confianca: limpar(cc.confianca),
      descartados,
    },
  };
}
