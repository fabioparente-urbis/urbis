import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// ===========================================================================
// Backup & Restauração — acesso restrito ao Administrador autenticado
// ===========================================================================
// Grupos de tabelas conforme briefing. Cada grupo é exportado como um único
// arquivo JSON e importado de volta com upsert por `id`.
//
// A identidade e os perfis são validados por lib/auth.ts contra o banco.
// ===========================================================================

type Tipo =
  | "processos"
  | "usuarios"
  | "prompts"
  | "config"
  | "mrp"
  | "map"
  | "bdi"
  | "mdp"
  | "mhd"
  | "urbi"
  | "tudo";

// Cada grupo reflete o vocabulário do CLAUDE.md (módulos principais + satélites).
// "tudo" NÃO é união destes grupos — é a lista mestra logo abaixo, para que
// nenhuma tabela real do banco fique de fora do Backup Geral por esquecimento
// de alguém adicionar um novo módulo a um grupo nomeado.
const TABELAS: Record<Exclude<Tipo, "tudo">, string[]> = {
  processos: [
    "processos",
    "analises_mac",
    "mac_historico",
    "mac_checklist_itens_historico",
    "mac_execucoes",
    "mac_resultados_item",
    "mac_resultados_revisoes",
    "mac_slot5_filtros",
    "mac_vinculos_propostas",
    "mac_bip_vinculos",
    "mac_lip_vinculos",
    "lip_resultados",
    "lip_jobs",
    "documentos",
    "documentos_processo",
    "processo_historico",
    "processo_profissionais",
    "bip_anotacoes_usuario",
    "bip_historico_anotacoes",
  ],
  usuarios: ["usuarios", "profissionais"],
  prompts: ["lip_prompts"],
  config: [
    "lip_abas",
    "lip_campos",
    "mac_checklist_modelos",
    "mac_checklist_itens",
    "logradouros",
    "assuntos",
    "despacho_padroes",
    "obs_cod",
  ],
  mrp: ["mrp_registros", "mrp_calendario", "mrp_pontuacao", "mrp_pontuacao_historico", "mrp_meta_historico"],
  map: ["auditoria_eventos", "auditoria_log", "auditoria_sessoes"],
  bdi: ["bdi_documentos_lei", "bdi_lei_fragmentos", "bdi_snapshots"],
  // MDP — Despachos e Pareceres (registro do que SAIU).
  mdp: ["mdp_registros"],
  // MHD — Histórico e Documentos (memória do que ENTROU, por hash).
  mhd: [
    "mhd_documentos",
    "mhd_versoes",
    "mhd_conteudos",
    "mhd_eventos",
    "mhd_interpretacoes_visao",
    "mhd_resultados_campo",
  ],
  // URBI — assistente, regras de bloqueio, radar e a numeração única de
  // despachos/pareceres (fonte compartilhada por todos os slots).
  urbi: [
    "urbi_config",
    "urbi_legislacao",
    "urbi_historico",
    "urbi_sugestoes",
    "urbi_regras_bloqueio",
    "urbi_radar_retratos",
    "urbi_radar_execucoes",
    "urbi_atendimento_ativo",
    "urbi_comandos_voz",
    "urbi_presenca_eventos",
    "urbis_config",
    "urbis_sessoes",
    "urbis_api_calls",
    "urbis_aportes",
    "urbis_numeracao_faixas",
    "urbis_numeracao_uso",
  ],
};

// Lista mestra do "tudo" — tabelas-pai antes das filhas, para não disparar
// erros de FK quando restaurar do zero. Fonte única de verdade: se uma
// tabela nova aparecer no banco, ela entra aqui, não só num grupo nomeado.
const ORDEM_IMPORT_TUDO: string[] = [
  // Identidade / catálogos
  "usuarios",
  "profissionais",
  "lip_abas",
  "lip_campos",
  "lip_prompts",
  "mac_checklist_modelos",
  "mac_checklist_itens",
  "logradouros",
  "assuntos",
  "despacho_padroes",
  "obs_cod",
  "urbi_config",
  "urbi_legislacao",
  "urbi_regras_bloqueio",
  "urbis_config",
  "urbis_numeracao_faixas",
  // Processos e dependentes diretos
  "processos",
  "documentos",
  "documentos_processo",
  "processo_historico",
  "processo_profissionais",
  "analises_mac",
  "mac_historico",
  "mac_checklist_itens_historico",
  "mac_execucoes",
  "mac_resultados_item",
  "mac_resultados_revisoes",
  "mac_slot5_filtros",
  "mac_vinculos_propostas",
  "mac_bip_vinculos",
  "mac_lip_vinculos",
  "lip_resultados",
  "lip_jobs",
  "bip_anotacoes_usuario",
  "bip_historico_anotacoes",
  // MDP — despachos/pareceres emitidos (referencia assuntos/usuarios)
  "mdp_registros",
  // MHD — documentos por hash (pai → versão → conteúdo/eventos)
  "mhd_documentos",
  "mhd_conteudos",
  "mhd_versoes",
  "mhd_interpretacoes_visao",
  "mhd_resultados_campo",
  "mhd_eventos",
  // Numeração — uso depende da faixa já importada acima
  "urbis_numeracao_uso",
  // URBI — satélites de conversa/sessão/radar
  "urbi_historico",
  "urbi_sugestoes",
  "urbi_radar_retratos",
  "urbi_radar_execucoes",
  "urbi_atendimento_ativo",
  "urbi_comandos_voz",
  "urbi_presenca_eventos",
  "urbis_sessoes",
  "urbis_api_calls",
  "urbis_aportes",
  // MRP — produtividade
  "mrp_pontuacao",
  "mrp_pontuacao_historico",
  "mrp_meta_historico",
  "mrp_calendario",
  "mrp_registros",
  // MAP — auditoria
  "auditoria_sessoes",
  "auditoria_log",
  "auditoria_eventos",
  // BDI — banco de dados inteligente
  "bdi_documentos_lei",
  "bdi_lei_fragmentos",
  "bdi_snapshots",
];

function tabelasDe(tipo: Tipo): string[] {
  if (tipo === "tudo") return ORDEM_IMPORT_TUDO;
  return TABELAS[tipo];
}

// Chave de upsert por tabela. Toda tabela usa "id" — exceto estas duas, cuja
// chave primária real é outra coluna (ver supabase/schema/01_tabelas.sql).
const CHAVE_UPSERT: Record<string, string> = {
  urbi_atendimento_ativo: "processo_codigo",
  urbi_regras_bloqueio: "chave",
};

function chaveUpsertDe(tabela: string): string {
  return CHAVE_UPSERT[tabela] ?? "id";
}

function ehTipoValido(t: string | null): t is Tipo {
  return (
    t === "processos" ||
    t === "usuarios" ||
    t === "prompts" ||
    t === "config" ||
    t === "mrp" ||
    t === "map" ||
    t === "bdi" ||
    t === "mdp" ||
    t === "mhd" ||
    t === "urbi" ||
    t === "tudo"
  );
}

async function bloqueioAdmin(req: NextRequest): Promise<NextResponse | null> {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfis.includes("Administrador")) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito ao Administrador." },
      { status: 403 },
    );
  }
  return null;
}

// ---------- GET: exportar ---------------------------------------------------
export async function GET(req: NextRequest) {
  const bloqueio = await bloqueioAdmin(req);
  if (bloqueio) return bloqueio;

  const tipoParam = new URL(req.url).searchParams.get("tipo");
  if (!ehTipoValido(tipoParam)) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Parâmetro 'tipo' inválido. Use: processos | usuarios | prompts | config | mrp | map | bdi | mdp | mhd | urbi | tudo.",
      },
      { status: 400 },
    );
  }

  const lista = tabelasDe(tipoParam);
  const dados: Record<string, unknown[]> = {};
  const erros: Record<string, string> = {};

  for (const tabela of lista) {
    const { data, error } = await supabaseAdmin.from(tabela).select("*");
    if (error) {
      erros[tabela] = error.message;
      dados[tabela] = [];
    } else {
      dados[tabela] = data ?? [];
    }
  }

  return NextResponse.json({
    ok: true,
    tipo: tipoParam,
    gerado_em: new Date().toISOString(),
    tabelas: lista,
    dados,
    ...(Object.keys(erros).length ? { erros } : {}),
  });
}

// ---------- POST: importar --------------------------------------------------
export async function POST(req: NextRequest) {
  const bloqueio = await bloqueioAdmin(req);
  if (bloqueio) return bloqueio;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, erro: "JSON inválido no corpo da requisição." },
      { status: 400 },
    );
  }

  const tipo = body?.tipo as string | undefined;
  const dados = body?.dados as Record<string, unknown[]> | undefined;

  if (!ehTipoValido(tipo ?? null)) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Campo 'tipo' inválido. Use: processos | usuarios | prompts | config | mrp | map | bdi | mdp | mhd | urbi | tudo.",
      },
      { status: 400 },
    );
  }
  if (!dados || typeof dados !== "object") {
    return NextResponse.json(
      { ok: false, erro: "Campo 'dados' obrigatório (objeto { tabela: linhas[] })." },
      { status: 400 },
    );
  }

  const permitidas = new Set(tabelasDe(tipo as Tipo));
  // Para "tudo", respeita a ordem pai → filho. Para os outros tipos, mantém
  // a ordem original do grupo.
  const ordem =
    tipo === "tudo"
      ? ORDEM_IMPORT_TUDO.filter((t) => permitidas.has(t))
      : tabelasDe(tipo as Tipo);

  const relatorio: Record<
    string,
    { inseridos: number; erro?: string; ignorado?: boolean }
  > = {};

  for (const tabela of ordem) {
    const linhas = dados[tabela];
    if (!Array.isArray(linhas)) {
      relatorio[tabela] = { inseridos: 0, ignorado: true };
      continue;
    }
    if (linhas.length === 0) {
      relatorio[tabela] = { inseridos: 0 };
      continue;
    }

    // Upsert pela chave primária real da tabela (ver CHAVE_UPSERT acima).
    const { error, count } = await supabaseAdmin
      .from(tabela)
      .upsert(linhas as any[], { onConflict: chaveUpsertDe(tabela), count: "exact" });

    if (error) {
      relatorio[tabela] = { inseridos: 0, erro: error.message };
    } else {
      relatorio[tabela] = { inseridos: count ?? linhas.length };
    }
  }

  const houveErro = Object.values(relatorio).some((r) => r.erro);
  return NextResponse.json({
    ok: !houveErro,
    tipo,
    importado_em: new Date().toISOString(),
    relatorio,
  });
}
