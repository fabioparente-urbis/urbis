/**
 * lib/urbi/catalogoSemantico.ts — Fase AA da Inteligência URBIS (05/09/2026): mapa semântico
 * dos campos de área/dimensão do LIP, pros 3 slots reais (Regularização SEI, Aceite SEI,
 * Aprovação de Projeto).
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────────
 * Achado real desta rodada (piloto humano controlado): o Co-Analista comparou "área construída
 * total" com "área do terreno" e concluiu uma "incoerência" que não existe — um prédio de vários
 * pavimentos tem, LEGITIMAMENTE, área construída total maior que a do terreno. Os dois campos não
 * têm a mesma semântica (um é soma de pavimentos, o outro é área de lote) e nunca deveriam ter
 * sido comparados diretamente (correção anterior: lib/bdi/vigia.ts, achou-se-e-removeu). Este
 * catálogo existe pra que NENHUMA comparação futura repita esse erro — nunca por decisão viva do
 * URBI, sempre por consulta a esta tabela, auditável e versionada em código.
 *
 * ── ACHADO DA AUDITORIA DE CAMPOS REAIS (05/09/2026) ─────────────────────────────
 * Os 3 slots NÃO usam a mesma chave pro mesmo domínio — às vezes usam a MESMA chave pra
 * domínios DIFERENTES. Confirmado contra `lip_campos` real:
 *   - "areaTotal" existe em Regularização (= "Área a ser Regularizada TOTAL", domínio
 *     área_a_regularizar) E em Slot 5 (= "Área total de construção", domínio
 *     área_construída_total) — MESMA CHAVE, DOMÍNIO DIFERENTE. Nunca comparar area_total de
 *     um slot com area_total de outro assumindo que é o mesmo dado.
 *   - "área do terreno" é a chave "areaTerreno" nos 3 slots — essa, sim, é estável.
 *   - "área impermeável" muda de chave entre slots: "areaImpermeavel" (Regularização/Aceite)
 *     vs "areaImpermeabilizada" (Slot 5) — mesmo domínio, chave diferente.
 *   - "área ocupada" (projeção da edificação no térreo, o dado que realmente poderia ser
 *     comparado contra área do terreno) NÃO EXISTE em nenhum dos 3 slots hoje — só existem
 *     sub-conceitos mais estreitos ("área ocupada pela atividade comercial"). Por isso nenhuma
 *     regra de "ocupação do lote" pode ser ativa: falta o campo essencial em TODOS os slots.
 *   - "altura" é representada como BOOLEANO em Regularização/Aceite ("mais de 12m de altura?")
 *     e como NÚMERO em Slot 5 ("altura da edificação, em metros") — mesmo domínio amplo, tipos
 *     de dado incompatíveis; comparação direta nunca é válida entre os dois formatos.
 *   - "caixa de recarga" tem 3 sub-domínios REALMENTE diferentes, não um só: volume MÍNIMO
 *     exigido (regra legal), volume ATENDIDO (o que foi construído), volume DECLARADO NA ART
 *     (o que o profissional assinou) — comparar dois desses É válido (ex.: atendido ≥ mínimo
 *     exigido), mas exige saber qual é qual, nunca tratar os três como a mesma coisa.
 *
 * ── COMO USAR ─────────────────────────────────────────────────────────────────────
 * `dominioDoCampo(slot, chave)` resolve o domínio semântico de um campo real. `podeComparar(domA,
 * domB)` diz se dois domínios são comparáveis e, se forem, a regra determinística exata. Campo
 * sem entrada aqui (chave não catalogada) SEMPRE vira "base insuficiente" em quem consome isto —
 * nunca uma suposição. Ver lib/urbi/cruzamento.ts (compararPorSemantica) e lib/bdi/vigia.ts
 * (acharIncoerencias) pros consumidores reais.
 */

export type Slot = "regularizacao" | "aceite_sei" | "slot_05";

export type DominioSemantico =
  | "area_terreno"
  | "area_construida_total"
  | "area_ocupada"
  | "area_impermeavel"
  | "area_permeavel"
  | "area_aprovada_existente"
  | "area_a_regularizar"
  | "area_recuo"
  | "altura_edificacao_metros"
  | "altura_edificacao_booleano"
  | "volume_minimo_exigido_caixa"
  | "volume_atendido_caixa"
  | "volume_declarado_art_caixa";

export type Unidade = "m2" | "m3" | "metros" | "booleano";

export type CampoSemantico = {
  slot: Slot;
  chave: string;
  rotuloHumano: string;
  dominio: DominioSemantico;
  unidade: Unidade;
};

/**
 * Núcleo de maior impacto (pedido explícito) — só os campos que EXISTEM de verdade em
 * `lip_campos` (auditado em 05/09/2026, sem invenção de correspondência pra slot que não tem o
 * campo). Ausência de um slot num domínio é uma LACUNA REAL, declarada no comentário de cada
 * bloco — não um erro deste arquivo.
 */
export const CATALOGO_SEMANTICO: CampoSemantico[] = [
  // ---- área do terreno — ESTÁVEL: mesma chave nos 3 slots ----
  { slot: "regularizacao", chave: "areaTerreno", rotuloHumano: "Área do Terreno", dominio: "area_terreno", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaTerreno", rotuloHumano: "Área do Terreno", dominio: "area_terreno", unidade: "m2" },
  { slot: "slot_05", chave: "areaTerreno", rotuloHumano: "Área do lote", dominio: "area_terreno", unidade: "m2" },

  // ---- área construída total — só existe como domínio de verdade no Slot 5. Em Regularização
  // e Aceite, a chave parecida ("areaTotal"/"areaAceite") é área A REGULARIZAR/DO ACEITE, não
  // área construída — ver bloco "area_a_regularizar" abaixo. Nunca inventar aqui.
  { slot: "slot_05", chave: "areaTotal", rotuloHumano: "Área total de construção", dominio: "area_construida_total", unidade: "m2" },
  { slot: "slot_05", chave: "areaTotalPrivativa", rotuloHumano: "Área total privativa", dominio: "area_construida_total", unidade: "m2" },

  // ---- área ocupada (projeção no térreo) — LACUNA REAL: nenhum slot tem este campo geral
  // hoje. Os campos abaixo são sub-conceitos ESTREITOS (só a atividade comercial), não a área
  // ocupada da edificação inteira — catalogados num domínio PRÓPRIO pra não se misturarem com
  // "área ocupada" geral por engano.
  // (sem entradas em area_ocupada — de propósito; ver observação no topo do arquivo)

  // ---- área impermeável — mesmo domínio, chave MUDA entre slots ----
  { slot: "regularizacao", chave: "areaImpermeavel", rotuloHumano: "Área Impermeável", dominio: "area_impermeavel", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaImpermeavel", rotuloHumano: "Área Impermeável", dominio: "area_impermeavel", unidade: "m2" },
  { slot: "slot_05", chave: "areaImpermeabilizada", rotuloHumano: "Área Impermeabilizada do Terreno", dominio: "area_impermeavel", unidade: "m2" },

  // ---- área permeável — LACUNA em Regularização/Aceite (não têm este campo na LIP; a
  // permeabilidade lá é tratada só via caixa de recarga). Só Slot 5 declara.
  { slot: "slot_05", chave: "areaPermeavelProjetada", rotuloHumano: "Área Permeável Projetada", dominio: "area_permeavel", unidade: "m2" },

  // ---- área aprovada/existente — mesmo domínio, chave e rótulo mudam ----
  { slot: "regularizacao", chave: "areaAprovada", rotuloHumano: "Área Aprovada (se existir)", dominio: "area_aprovada_existente", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaExistente", rotuloHumano: "Área Existente Aprovada (m²)", dominio: "area_aprovada_existente", unidade: "m2" },
  // Slot 5: sem campo equivalente na LIP hoje (projeto novo, não tem "existente aprovada" prévia
  // como conceito central) — lacuna real, não inventada.

  // ---- área a regularizar/do aceite — domínio EXCLUSIVO de Regularização/Aceite; Slot 5 não
  // tem (é aprovação de projeto novo, não regularização de algo já construído). "areaTotal" de
  // Regularização e "areaAceite" de Aceite SEI são este domínio, NUNCA área construída total.
  { slot: "regularizacao", chave: "areaTotal", rotuloHumano: "Área a ser Regularizada TOTAL", dominio: "area_a_regularizar", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaAceite", rotuloHumano: "Á. do Aceite (TOTAL)", dominio: "area_a_regularizar", unidade: "m2" },

  // ---- recuo — granularidade bem diferente entre slots (nenhuma correspondência 1:1 real);
  // catalogado mesmo assim porque cada chave, isoladamente, é uma medida real e nomeada.
  { slot: "regularizacao", chave: "areaRecuo", rotuloHumano: "Área Construída em Recuo Frontal", dominio: "area_recuo", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaNaoVerticalRecuo", rotuloHumano: "Á. não Vertical no Recuo", dominio: "area_recuo", unidade: "m2" },
  { slot: "aceite_sei", chave: "areaVerticalRecuo", rotuloHumano: "Á. em Ed. Vertical no Recuo", dominio: "area_recuo", unidade: "m2" },
  // Slot 5: sem campo de área de recuo identificado na LIP (auditoria de 05/09/2026) — lacuna
  // real; pode existir só na leitura de planta (fora do LIP estruturado).

  // ---- altura — dois formatos incompatíveis, nunca comparáveis diretamente ----
  { slot: "regularizacao", chave: "vistoriaMais12m", rotuloHumano: "Mais de 12m de altura?", dominio: "altura_edificacao_booleano", unidade: "booleano" },
  { slot: "aceite_sei", chave: "vistoriaMais12m", rotuloHumano: "Mais de 12m de altura?", dominio: "altura_edificacao_booleano", unidade: "booleano" },
  { slot: "slot_05", chave: "alturaDaEdificacao", rotuloHumano: "Altura da edificação — térreo à laje de cobertura (m)", dominio: "altura_edificacao_metros", unidade: "metros" },

  // ---- caixa de recarga — 3 sub-domínios reais, nunca tratados como um só ----
  { slot: "regularizacao", chave: "volMin", rotuloHumano: "Vol. Mínimo da Caixa", dominio: "volume_minimo_exigido_caixa", unidade: "m3" },
  { slot: "aceite_sei", chave: "volMin", rotuloHumano: "Vol. Mínimo da Caixa", dominio: "volume_minimo_exigido_caixa", unidade: "m3" },
  { slot: "slot_05", chave: "volumeExigidoDaCaixa", rotuloHumano: "Volume Exigido da Caixa — ICCAP (m³)", dominio: "volume_minimo_exigido_caixa", unidade: "m3" },

  { slot: "regularizacao", chave: "volAt", rotuloHumano: "Vol. Atendido da Caixa", dominio: "volume_atendido_caixa", unidade: "m3" },
  { slot: "aceite_sei", chave: "volAt", rotuloHumano: "Vol. Atendido da Caixa", dominio: "volume_atendido_caixa", unidade: "m3" },
  { slot: "slot_05", chave: "volumeDaCaixaDeRecarga", rotuloHumano: "Volume da Caixa de Recarga", dominio: "volume_atendido_caixa", unidade: "m3" },

  { slot: "slot_05", chave: "volumeNaArtDeCaixa", rotuloHumano: "Volume Declarado na ART de Caixa (m³)", dominio: "volume_declarado_art_caixa", unidade: "m3" },
  // Regularização/Aceite: o volume declarado na ART não é campo numérico próprio na LIP (só o
  // documento artCx/nroArtCx, sem valor extraído) — lacuna real, não inventada.
];

function chavePorSlot(slot: Slot, chave: string): CampoSemantico | undefined {
  return CATALOGO_SEMANTICO.find((c) => c.slot === slot && c.chave === chave);
}

/** Domínio semântico de um campo real, ou `null` se a chave não está catalogada pra este slot
 *  (nunca inventa domínio — ausência aqui deve sempre virar "base insuficiente" em quem chama). */
export function dominioDoCampo(slot: Slot, chave: string): DominioSemantico | null {
  return chavePorSlot(slot, chave)?.dominio ?? null;
}

export function rotuloDoCampo(slot: Slot, chave: string): string | null {
  return chavePorSlot(slot, chave)?.rotuloHumano ?? null;
}

export function unidadeDoCampo(slot: Slot, chave: string): Unidade | null {
  return chavePorSlot(slot, chave)?.unidade ?? null;
}

export type RegraComparacaoSemantica = {
  domA: DominioSemantico;
  domB: DominioSemantico;
  /** Regra em prosa, pra aparecer como `regra` no ResultadoCruzamento. */
  descricao: string;
};

/**
 * Só pares de MESMO domínio são comparáveis hoje — é a regra mais segura possível: dois campos
 * do mesmo domínio são, por definição, a mesma grandeza medida duas vezes (ex.: área impermeável
 * do Slot 5 vs área impermeável de um documento lido). Comparação ENTRE domínios diferentes (ex.:
 * "área ocupada" × "área do terreno", que seria uma regra legítima de ocupação de lote) fica
 * registrada aqui como declaradamente NÃO ATIVA — falta o campo essencial (área ocupada) em
 * todos os 3 slots; ativar exigiria antes um campo real pra alimentá-la, não uma decisão de
 * código. Nenhuma pressa em inventar isso.
 */
export function podeComparar(domA: DominioSemantico, domB: DominioSemantico): RegraComparacaoSemantica | null {
  if (domA !== domB) return null;
  return {
    domA, domB,
    descricao: `mesmo domínio semântico (${domA}) — comparação direta`,
  };
}
