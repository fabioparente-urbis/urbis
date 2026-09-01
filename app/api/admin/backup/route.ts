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

type Tipo = "processos" | "usuarios" | "prompts" | "config" | "mrp" | "map" | "bdi" | "tudo";

const TABELAS: Record<Exclude<Tipo, "tudo">, string[]> = {
  processos: [
    "processos",
    "analises_mac",
    "mac_historico",
    "lip_resultados",
    "documentos",
    "documentos_processo",
    "processo_historico",
  ],
  usuarios: ["usuarios"],
  prompts: ["lip_prompts"],
  config: [
    "lip_abas",
    "lip_campos",
    "mac_checklist_modelos",
    "mac_checklist_itens",
    "urbi_config",
    "urbi_legislacao",
    "logradouros",
  ],
  mrp: ["mrp_registros", "mrp_calendario", "mrp_pontuacao", "mrp_painel_diario"],
  map: ["auditoria_eventos", "auditoria_log", "auditoria_sessoes"],
  bdi: ["bdi_documentos_lei", "bdi_lei_fragmentos", "bdi_snapshots"],
};

// Ordem de import para o tipo "tudo": tabelas-pai antes das filhas, para
// não disparar erros de FK quando restaurar do zero.
const ORDEM_IMPORT_TUDO: string[] = [
  // Estrutura / catálogos
  "usuarios",
  "lip_abas",
  "lip_campos",
  "lip_prompts",
  "mac_checklist_modelos",
  "mac_checklist_itens",
  "urbi_config",
  "urbi_legislacao",
  "logradouros",
  // Processos e dependentes
  "processos",
  "documentos",
  "documentos_processo",
  "analises_mac",
  "mac_historico",
  "lip_resultados",
  "processo_historico",
  "mrp_pontuacao",
  "mrp_calendario",
  "mrp_painel_diario",
  "mrp_registros",
  "auditoria_sessoes",
  "auditoria_log",
  "auditoria_eventos",
  "bdi_documentos_lei",
  "bdi_lei_fragmentos",
  "bdi_snapshots",
];

function tabelasDe(tipo: Tipo): string[] {
  if (tipo === "tudo") {
    const tudo = new Set<string>();
    (Object.values(TABELAS) as string[][]).forEach((arr) =>
      arr.forEach((t) => tudo.add(t)),
    );
    return Array.from(tudo);
  }
  return TABELAS[tipo];
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
        erro: "Parâmetro 'tipo' inválido. Use: processos | usuarios | prompts | config | tudo.",
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
        erro: "Campo 'tipo' inválido. Use: processos | usuarios | prompts | config | tudo.",
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

    // Upsert por id (PK). Se a tabela usar outra chave única, ajustar aqui.
    const { error, count } = await supabaseAdmin
      .from(tabela)
      .upsert(linhas as any[], { onConflict: "id", count: "exact" });

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
