import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_FIXO = "Fábio Parente Martins Santos";

/**
 * Normaliza os perfis recebidos do client: dedup, remove vazios,
 * e garante "Administrador" no array quando o nome for o ADMIN_FIXO.
 * `perfil` (singular) é tratado como fallback quando `perfis` não vem.
 */
// Perfis de chefia sem meta de produtividade. Administrador NÃO entra:
// acumula chefia e produção.
const PERFIS_SEM_META = [
  "Diretora", "Diretor", "Gerente",
  "Gerência GERECCO", "Gerência GERAED", "Gerência GERAGP", "Gerência GERAP",
];

function ehChefia(perfis: string[]): boolean {
  return perfis.some((p) => PERFIS_SEM_META.includes(p));
}

/**
 * Registra a virada de meta quando alguém entra ou sai da chefia.
 * A vigência começa no dia 1º do mês corrente: meses já fechados continuam
 * avaliados pela regra que valia neles. Sem isso, promover um analista a
 * gerente apagaria retroativamente a meta dos meses em que ele produziu —
 * e rebaixar um gerente criaria meta em meses que ele não tinha.
 * Falha aqui não derruba a edição do usuário; apenas registra no log.
 */
async function registrarViradaDeMeta(usuarioId: string, perfisAntes: string[], perfisDepois: string[]) {
  const antes = ehChefia(perfisAntes);
  const depois = ehChefia(perfisDepois);
  if (antes === depois) return;
  const hoje = new Date();
  const vigenteDesde = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const { error } = await supabase
    .from("mrp_meta_historico")
    .upsert(
      { usuario_id: usuarioId, isento: depois, meta: null, vigente_desde: vigenteDesde },
      { onConflict: "usuario_id,vigente_desde" },
    );
  if (error) console.error("[mrp] falha ao registrar virada de meta:", error.message);
}

function normalizarPerfis(input: { nome?: string; perfil?: string; perfis?: unknown }): string[] {
  const raw: string[] = Array.isArray(input.perfis)
    ? (input.perfis as unknown[]).map((p) => String(p)).filter(Boolean)
    : input.perfil
      ? [String(input.perfil)]
      : [];
  const set = new Set(raw);
  if (input.nome && input.nome.trim() === ADMIN_FIXO) {
    set.add("Administrador");
  }
  return Array.from(set);
}

export async function GET() {
  const { data, error } = await supabase.from("usuarios").select("*").order("nome");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

// Normaliza usuarios.gerencia: aceita 'GERECCO'|'GERAED'|'GERAGP' ou null. Qualquer outro
// valor (incluindo ''/undefined/'DIRAAP') vira null = analista DIRAAP direto.
function normalizarGerencia(v: unknown): "GERECCO" | "GERAED" | "GERAGP" | "GERAP" | null {
  if (v === "GERECCO" || v === "GERAED" || v === "GERAGP" || v === "GERAP") return v;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome, email, matricula, telefone, cargo, cau_crea, status, senha } = body;
    if (!nome || !email || !senha)
      return NextResponse.json({ ok: false, erro: "Nome, email e senha obrigatórios" }, { status: 400 });

    const perfis = normalizarPerfis({ nome, perfil: body.perfil, perfis: body.perfis });
    const perfilPrincipal = perfis[0] || "Analista";
    // gerencia faz sentido apenas para analistas (DIRAAP). Para os demais, null.
    const ehAnalista = perfis.includes("Analista");
    const gerencia = ehAnalista ? normalizarGerencia(body.gerencia) : null;

    // Regra: perfil Administrador só para o nome fixo
    if (perfis.includes("Administrador") && nome.trim() !== ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".` }, { status: 400 });

    // Regra: só pode existir 1 administrador no sistema
    if (perfis.includes("Administrador")) {
      const { data: admins } = await supabase
        .from("usuarios")
        .select("id")
        .or("perfil.eq.Administrador,perfis.cs.{Administrador}");
      if (admins && admins.length > 0)
        return NextResponse.json({ ok: false, erro: "Já existe um Administrador cadastrado no sistema." }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (authError) return NextResponse.json({ ok: false, erro: authError.message }, { status: 400 });

    const { error: dbError } = await supabase.from("usuarios").insert({
      nome, email, matricula, telefone, cargo,
      perfil: perfilPrincipal,
      perfis,
      gerencia,
      status: status || "Ativo",
      urbi_ativo: body.urbi_ativo === true,
    });

    if (dbError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      // Propaga code (23505 = unique_violation) para a UI tratar.
      return NextResponse.json(
        { ok: false, erro: dbError.message, code: (dbError as any).code },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, nome, email, matricula, telefone, cargo, cau_crea, status, senha } = body;
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

    const perfis = normalizarPerfis({ nome, perfil: body.perfil, perfis: body.perfis });
    const perfilPrincipal = perfis[0] || "Analista";
    const ehAnalista = perfis.includes("Analista");
    const gerencia = ehAnalista ? normalizarGerencia(body.gerencia) : null;

    // Regra: não permite remover/alterar o admin fixo
    const { data: atual } = await supabase.from("usuarios").select("perfil, perfis, nome").eq("id", id).maybeSingle();
    const atualPerfis: string[] = Array.isArray((atual as any)?.perfis) ? (atual as any).perfis : [];
    const atualEraAdmin = atual?.perfil === "Administrador" || atualPerfis.includes("Administrador");
    if (atualEraAdmin && atual?.nome === ADMIN_FIXO) {
      if (!perfis.includes("Administrador"))
        return NextResponse.json({ ok: false, erro: "Não é permitido remover o perfil Administrador do usuário fixo." }, { status: 400 });
      if ((nome || "").trim() !== ADMIN_FIXO)
        return NextResponse.json({ ok: false, erro: `O nome do Administrador não pode ser alterado.` }, { status: 400 });
    }

    // Regra: perfil Administrador só para o nome fixo
    if (perfis.includes("Administrador") && (nome || "").trim() !== ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".` }, { status: 400 });

    const reducao_meta = typeof body.reducao_meta === "number" ? body.reducao_meta : (parseInt(body.reducao_meta) || 0);
    const atualizacao: any = { nome, email, matricula, telefone, cargo, cau_crea: cau_crea ?? null, perfil: perfilPrincipal, perfis, gerencia, status, reducao_meta, urbi_ativo: body.urbi_ativo === true };
    if (status === "Inativo") atualizacao.descadastrado_em = new Date().toISOString();
    if (status === "Ativo") atualizacao.descadastrado_em = null;

    const { error: dbError } = await supabase.from("usuarios").update(atualizacao).eq("id", id);
    if (dbError)
      return NextResponse.json(
        { ok: false, erro: dbError.message, code: (dbError as any).code },
        { status: 500 },
      );

    // Entrou ou saiu da chefia? Registra a vigência a partir deste mês.
    await registrarViradaDeMeta(id, atualPerfis, perfis);

    if (senha) {
      const { data: userData } = await supabase.from("usuarios").select("email").eq("id", id).maybeSingle();
      if (userData?.email) {
        const { data: authUser } = await supabase.auth.admin.listUsers();
        const user = authUser?.users?.find((u) => u.email === userData.email);
        if (user) await supabase.auth.admin.updateUserById(user.id, { password: senha });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

// #1 — Exclusão real de usuário
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

    // Protege o admin fixo
    const { data: usuario } = await supabase.from("usuarios").select("perfil, nome, email").eq("id", id).maybeSingle();
    if (usuario?.perfil === "Administrador" && usuario?.nome === ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: "O Administrador fixo não pode ser excluído." }, { status: 400 });

    // Remove do Auth do Supabase
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u) => u.email === usuario?.email);
    if (authUser) await supabase.auth.admin.deleteUser(authUser.id);

    // Remove da tabela usuarios
    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}