/**
 * lib/mac-motor/slot5/estudosExigencias.ts — EIT, EIV e carga e descarga do Slot 5.
 *
 * Funções PURAS, sem Supabase e sem `next/*`: a tela do MAC importa direto e recalcula a cada
 * tecla, e a rota usa as mesmas funções sobre `processos.dados`. Nada aqui grava nada.
 *
 * Por que existe: os três temas são decididos por CONTA, não por desenho — área da atividade,
 * área de depósito/produção, número de vagas. O LIP já traz esses números; o que faltava era a
 * tabela da lei com o OPERADOR certo de cada uma.
 *
 * A distinção que motivou o arquivo (ditada pelo Fábio em 24/08/2026, com a letra da lei):
 *   • EIT — Lei 10.977/2023, art. 5º, IV: "área ocupada IGUAL OU SUPERIOR a 2.000 m²"  → >=
 *   • EIV — LC 349/2022, art. 262, III e Lei 11.127/2024, art. 5º, III: "SUPERIOR a 2.000 m²" → >
 * Com 2.000,00 m² cravados o EIT é exigido e o EIV não. Por isso os dois vereditos são separados,
 * nunca um só "EIT/EIV".
 */

export type Veredito = "exigido" | "dispensado" | "sem_dado";

export type DadosEstudos = {
  /** `cnae` do Uso do Solo — só os dígitos importam. */
  cnae?: string | null;
  /** `areaOcupadaPelaAtividade` (m²) — o termo que as duas leis usam. */
  areaAtividade?: number | null;
  /** Vagas de estacionamento do empreendimento. */
  vagas?: number | null;
  /** Uso habitacional (qualquer tipologia). */
  habitacional?: boolean | null;
  /** Somatória das áreas de produção e/ou depósito (m²) — IN 008/2023. */
  areaDepositoProducao?: number | null;
  /** Pátio de carga e descarga desenhado no projeto (m²). */
  areaPatioProjetada?: number | null;
  /** Atividade listada no Anexo I da IN 008/2023 (exige pátio independente de depósito). */
  atividadeAnexoI?: boolean | null;
  /** Capacidade de reunião simultânea (pessoas) — o LIP não tem, entra à mão. */
  capacidadeReuniao?: number | null;
  /** Alunos por turno — o LIP não tem, entra à mão. */
  alunosPorTurno?: number | null;
};

export type Gatilho = {
  id: string;
  estudo: "EIT" | "EIV";
  descricao: string;
  lei: string;
  veredito: Veredito;
  /** A conta feita, com os dois números — vira a fonte gravada no item. */
  conta: string;
};

/* ── Atividades por CNAE ────────────────────────────────────────────────────────────────────
 * Prefixos de CNAE (só dígitos) que caracterizam cada gatilho. Lista curta e explícita: prefixo
 * errado marcaria item por engano, e a regra do Slot 5 é não chutar. */
const CNAE_ABASTECIMENTO = ["4711", "4712", "4721", "4630", "4631", "4632", "4633", "4634", "4635", "4636", "4637", "4639"];
const CNAE_ENSINO = ["851", "852", "853", "854", "855"];
const CNAE_TERMINAL = ["4924", "4930", "5091", "5099", "5211", "5222", "5223", "5229", "4911", "4912"];
const CNAE_AERODROMO = ["5111", "5112", "5120", "5240"];

function soDigitos(v?: string | null) {
  return String(v ?? "").replace(/\D/g, "");
}

/* O Uso do Solo nem sempre traz um CNAE de verdade. Quando a atividade ainda não foi definida
 * ele imprime um código de preenchimento — "000000008 · Comércio sem uso definido" é o que veio
 * nos processos 48533 e 48535 (26/08/2026). Esse código não é uma atividade: tratá-lo como CNAE
 * real fazia todo gatilho de EIT/EIV responder "dispensado" (não é abastecimento, não é ensino,
 * não é terminal...), transformando FALTA DE DADO em dispensa automática — exatamente o que a
 * regra do Slot 5 proíbe. Placeholder agora vale o mesmo que CNAE ausente: "sem dado". */
export function cnaeEhPlaceholder(cnae: string | null | undefined) {
  const d = soDigitos(cnae);
  if (!d) return false;
  // Só zeros, ou zeros seguidos de um único dígito (000000008, 00000000, 0...) — nenhum CNAE real
  // começa com zero: a seção A da CNAE começa em 01.
  return /^0+\d?$/.test(d);
}

function ehAtividade(cnae: string | null | undefined, prefixos: string[]) {
  const d = soDigitos(cnae);
  if (!d) return null;                       // sem CNAE não dá para afirmar nem negar
  if (cnaeEhPlaceholder(cnae)) return null;  // código de preenchimento também não afirma nem nega
  return prefixos.some((p) => d.startsWith(p));
}

function numero(v?: number | null) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Converte "2.265,41" (e variações) em 2265.41. Devolve null para vazio ou lixo. */
export function comoNumero(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  const s = String(bruto ?? "").trim();
  if (!s) return null;
  const limpo = s.replace(/\s|m²|m2/gi, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Um gatilho de área: precisa saber se a ATIVIDADE se enquadra e comparar a ÁREA com o limite.
 * Três saídas, nunca chute: sem CNAE ou sem área → "sem_dado".
 */
function gatilhoDeArea(
  base: Omit<Gatilho, "veredito" | "conta">,
  ehDaAtividade: boolean | null,
  area: number | null,
  operador: ">=" | ">",
  limite: number,
): Gatilho {
  if (ehDaAtividade === false) {
    return { ...base, veredito: "dispensado", conta: "a atividade do Uso do Solo não é dessa lista" };
  }
  if (ehDaAtividade === null) {
    return { ...base, veredito: "sem_dado", conta: "falta o CNAE no Uso do Solo" };
  }
  if (area === null) {
    return { ...base, veredito: "sem_dado", conta: "falta a área ocupada pela atividade" };
  }
  const bate = operador === ">=" ? area >= limite : area > limite;
  const sinal = operador === ">=" ? (bate ? "≥" : "<") : bate ? ">" : "≤";
  return {
    ...base,
    veredito: bate ? "exigido" : "dispensado",
    conta: `${fmt(area)} m² ${sinal} ${fmt(limite)} m²`,
  };
}

function gatilhoDeContagem(
  base: Omit<Gatilho, "veredito" | "conta">,
  aplicavel: boolean | null,
  valor: number | null,
  limite: number,
  unidade: string,
): Gatilho {
  if (aplicavel === false) return { ...base, veredito: "dispensado", conta: `o projeto não tem ${unidade === "vagas" ? "uso habitacional" : unidade}` };
  if (valor === null) return { ...base, veredito: "sem_dado", conta: `falta ${unidade}` };
  const bate = valor > limite;
  return { ...base, veredito: bate ? "exigido" : "dispensado", conta: `${fmt(valor)} ${unidade} ${bate ? ">" : "≤"} ${fmt(limite)}` };
}

export function fmt(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Todos os gatilhos do EIT e do EIV, avaliados sobre os dados disponíveis. */
export function avaliarEstudos(d: DadosEstudos): Gatilho[] {
  const area = numero(d.areaAtividade);
  const abastecimento = ehAtividade(d.cnae, CNAE_ABASTECIMENTO);
  const ensino = ehAtividade(d.cnae, CNAE_ENSINO);
  const terminal = ehAtividade(d.cnae, CNAE_TERMINAL);
  const aerodromo = ehAtividade(d.cnae, CNAE_AERODROMO);
  const hab = d.habitacional === null || d.habitacional === undefined ? null : d.habitacional;

  const g: Gatilho[] = [];

  // ── EIT — Lei 10.977/2023, art. 5º ────────────────────────────────────────────────────────
  g.push(gatilhoDeArea(
    { id: "EIT_ABASTECIMENTO", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, IV",
      descricao: "centro de abastecimento, mercado, supermercado ou hipermercado" },
    abastecimento, area, ">=", 2000));

  g.push(gatilhoDeArea(
    { id: "EIT_ENSINO", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, V",
      descricao: "ensino e educação" },
    ensino, area, ">=", 2000));

  g.push(gatilhoDeContagem(
    { id: "EIT_VAGAS", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, II, VIII, X e XI",
      descricao: "uso habitacional, seriada, coletiva, conjunto residencial ou PDU" },
    hab, numero(d.vagas), 500, "vagas"));

  g.push(gatilhoDeContagem(
    { id: "EIT_REUNIAO", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, II",
      descricao: "atividade com reunião simultânea de pessoas" },
    null, numero(d.capacidadeReuniao), 600, "pessoas"));

  g.push({
    id: "EIT_TERMINAL", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, VI e VII",
    descricao: "terminal de cargas ou passageiros, estação férrea ou metrô",
    veredito: terminal === null ? "sem_dado" : terminal ? "exigido" : "dispensado",
    conta: terminal === null
      ? (cnaeEhPlaceholder(d.cnae)
        ? `o Uso do Solo não define a atividade (código ${soDigitos(d.cnae)} — "sem uso definido")`
        : "falta o CNAE no Uso do Solo")
      : `CNAE ${soDigitos(d.cnae) || "—"}`,
  });

  g.push({
    id: "EIT_AERODROMO", estudo: "EIT", lei: "Lei 10.977/2023, art. 5º, VII",
    descricao: "aeródromo, heliporto ou heliponto",
    veredito: aerodromo === null ? "sem_dado" : aerodromo ? "exigido" : "dispensado",
    conta: aerodromo === null
      ? (cnaeEhPlaceholder(d.cnae)
        ? `o Uso do Solo não define a atividade (código ${soDigitos(d.cnae)} — "sem uso definido")`
        : "falta o CNAE no Uso do Solo")
      : `CNAE ${soDigitos(d.cnae) || "—"}`,
  });

  // ── EIV — LC 349/2022, art. 262 e Lei 11.127/2024, art. 5º ────────────────────────────────
  g.push(gatilhoDeArea(
    { id: "EIV_ABASTECIMENTO", estudo: "EIV", lei: "LC 349/2022, art. 262, III · Lei 11.127/2024, art. 5º, III",
      descricao: "centro de abastecimento, mercado, supermercado ou hipermercado" },
    abastecimento, area, ">", 2000));

  g.push(gatilhoDeArea(
    { id: "EIV_ENSINO_AREA", estudo: "EIV", lei: "LC 349/2022, art. 262, IV",
      descricao: "ensino" },
    ensino, area, ">", 360));

  g.push(gatilhoDeContagem(
    { id: "EIV_ENSINO_ALUNOS", estudo: "EIV", lei: "LC 349/2022, art. 262, IV",
      descricao: "ensino, por alunos em um turno" },
    ensino, numero(d.alunosPorTurno), 100, "alunos por turno"));

  return g;
}

/** Resumo por estudo: exigido se QUALQUER gatilho dispara; dispensado só quando nenhum dispara e
 * nenhum ficou sem dado — pendência não vira dispensa. */
export function vereditoDoEstudo(gatilhos: Gatilho[], estudo: "EIT" | "EIV"): {
  veredito: Veredito; porQue: string; gatilhos: Gatilho[];
} {
  const meus = gatilhos.filter((g) => g.estudo === estudo);
  const exigem = meus.filter((g) => g.veredito === "exigido");
  const semDado = meus.filter((g) => g.veredito === "sem_dado");
  if (exigem.length) {
    return {
      veredito: "exigido",
      porQue: exigem.map((g) => `${g.descricao}: ${g.conta} (${g.lei})`).join(" · "),
      gatilhos: meus,
    };
  }
  if (semDado.length) {
    return {
      veredito: "sem_dado",
      porQue: `falta dado em ${semDado.length} gatilho(s): ${semDado.map((g) => g.conta).join(" · ")}`,
      gatilhos: meus,
    };
  }
  return { veredito: "dispensado", porQue: meus.map((g) => g.conta).join(" · "), gatilhos: meus };
}

/* ── Carga e descarga — IN 008/2023 ────────────────────────────────────────────────────────── */

/** Anexo V: faixa da área de depósito/produção → pátio mínimo. A faixa de cima é aberta e cai em
 * estudo específico, com piso de 50 m². */
export const FAIXAS_PATIO: { ate: number; minimo: number; rotulo: string }[] = [
  { ate: 360, minimo: 25, rotulo: "180,00 a 360,00 m²" },
  { ate: 540, minimo: 50, rotulo: "360,01 a 540,00 m²" },
  { ate: 1500, minimo: 100, rotulo: "540,01 a 1.500,00 m²" },
  { ate: 3000, minimo: 200, rotulo: "1.500,01 a 3.000,00 m²" },
  { ate: 5000, minimo: 400, rotulo: "3.000,01 a 5.000,00 m²" },
];

export type ExigenciaCarga = {
  veredito: Veredito;
  /** Área mínima do pátio, quando obrigatório. */
  minimo: number | null;
  /** Se o pátio desenhado atende — null quando não há área projetada informada. */
  atende: boolean | null;
  porQue: string;
  /** Acima de 5.000 m² o dimensionamento sai de estudo específico, não da tabela. */
  estudoEspecifico: boolean;
};

export function avaliarCargaDescarga(d: DadosEstudos): ExigenciaCarga {
  const dep = numero(d.areaDepositoProducao);
  const patio = numero(d.areaPatioProjetada);
  const anexoI = d.atividadeAnexoI === true;

  if (dep === null && !anexoI) {
    return {
      veredito: "sem_dado", minimo: null, atende: null, estudoEspecifico: false,
      porQue: "falta a somatória das áreas de produção e/ou depósito (IN 008/2023) — ou marque a atividade como Anexo I",
    };
  }

  // Anexo I obriga o pátio mesmo sem depósito; aí o mínimo é 25 m² quando o depósito não chega a 180.
  if (anexoI && (dep === null || dep < 180)) {
    return {
      veredito: "exigido", minimo: 25, estudoEspecifico: false,
      atende: patio === null ? null : patio >= 25,
      porQue: `atividade do Anexo I da IN 008/2023${dep === null ? "" : ` com depósito/produção de ${fmt(dep)} m² (< 180 m²)`} — pátio mínimo de 25,00 m²`,
    };
  }

  if (dep !== null && dep < 180) {
    return {
      veredito: "dispensado", minimo: null, atende: null, estudoEspecifico: false,
      porQue: `depósito/produção de ${fmt(dep)} m² < 180,00 m² e a atividade não é do Anexo I`,
    };
  }

  const area = dep as number;
  if (area > 5000) {
    return {
      veredito: "exigido", minimo: 50, estudoEspecifico: true,
      atende: patio === null ? null : patio >= 50,
      porQue: `depósito/produção de ${fmt(area)} m² acima de 5.000,00 m² — dimensionamento por estudo específico, respeitado o mínimo de 50,00 m²`,
    };
  }

  const faixa = FAIXAS_PATIO.find((f) => area <= f.ate)!;
  return {
    veredito: "exigido", minimo: faixa.minimo, estudoEspecifico: false,
    atende: patio === null ? null : patio >= faixa.minimo,
    porQue: `depósito/produção de ${fmt(area)} m² (faixa ${faixa.rotulo}) — pátio mínimo de ${fmt(faixa.minimo)},00 m² (Anexo V da IN 008/2023)`,
  };
}

/** Lê do `processos.dados` do LIP o que os três motores precisam. */
export function dadosDoLip(dados: Record<string, any> | null | undefined): DadosEstudos {
  const valor = (chave: string) => dados?.[chave]?.valor ?? null;
  const simNao = (chave: string) => {
    const v = String(valor(chave) ?? "").trim().toUpperCase();
    if (!v || v === "NP") return null;
    return v === "SIM";
  };
  return {
    cnae: valor("cnae"),
    areaAtividade: comoNumero(valor("areaOcupadaPelaAtividade")),
    vagas: comoNumero(valor("totalDeVagasAtendidasParaAtividade")) ?? comoNumero(valor("totalDeVagasExigidasParaEssas")),
    habitacional: simNao("habitacional"),
  };
}
