import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Guarda de escrita: exige usuário logado E perfil irrestrito (Administrador / Diretora).
// Retorna NextResponse (401/403) quando deve bloquear; null quando autoriza.
async function exigirAdmin(req: NextRequest): Promise<NextResponse | null> {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito)
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  // Sessão 4: o GET passou a aceitar ?assunto_id=<uuid> para filtrar as
  // abas pertencentes a um assunto específico. Sem o parâmetro, retorna
  // todas as abas ativas (compatibilidade com callsites legados — será
  // removido depois que todo consumidor passar a enviar o filtro).
  const { searchParams } = new URL(req.url);
  const assuntoId = searchParams.get("assunto_id");

  let query = supabase
    .from("lip_abas")
    .select("*, lip_campos(*)")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (assuntoId) query = query.eq("assunto_id", assuntoId);

  const { data: abas, error } = await query;

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // Ordena campos dentro de cada aba
  const abasOrdenadas = (abas ?? []).map((aba: any) => ({
    ...aba,
    lip_campos: (aba.lip_campos || []).sort((a: any, b: any) => a.ordem - b.ordem),
  }));

  return NextResponse.json({ ok: true, data: abasOrdenadas });
}

// Criar aba
export async function POST(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { tipo, ...body } = await req.json();

  if (tipo === "aba") {
    // Sessão 4: aba precisa nascer vinculada a um assunto. A ordem é
    // calculada apenas dentro do mesmo assunto para que cada conjunto
    // tenha sua própria sequência (1, 2, 3...) independente.
    if (!body.assunto_id) {
      return NextResponse.json({ ok: false, erro: "assunto_id obrigatório para criar aba" }, { status: 400 });
    }

    const { data: ultima } = await supabase
      .from("lip_abas")
      .select("ordem")
      .eq("assunto_id", body.assunto_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("lip_abas")
      .insert({
        nome: body.nome,
        dica: body.dica || "",
        assunto_id: body.assunto_id,
        ordem: (ultima?.ordem ?? -1) + 1,
      })
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (tipo === "clonar") {
    // Sessão 4: clona todas as abas (e seus campos) de um assunto-origem
    // para um assunto-destino. Usado pela tela admin quando o usuário
    // habilita um novo assunto e quer partir da estrutura de Regularização
    // em vez de montar tudo do zero.
    //
    // Pré-condições (validadas no front também):
    //   - origem != destino;
    //   - destino não pode já ter abas (evita duplicação acidental).
    const { origem_assunto_id, destino_assunto_id } = body;
    if (!origem_assunto_id || !destino_assunto_id) {
      return NextResponse.json({ ok: false, erro: "origem_assunto_id e destino_assunto_id obrigatórios" }, { status: 400 });
    }
    if (origem_assunto_id === destino_assunto_id) {
      return NextResponse.json({ ok: false, erro: "Origem e destino não podem ser o mesmo assunto" }, { status: 400 });
    }

    // Confere se destino está vazio
    const { data: destinoAbas, error: errDestino } = await supabase
      .from("lip_abas")
      .select("id")
      .eq("assunto_id", destino_assunto_id)
      .limit(1);
    if (errDestino) return NextResponse.json({ ok: false, erro: errDestino.message }, { status: 500 });
    if ((destinoAbas?.length ?? 0) > 0) {
      return NextResponse.json({ ok: false, erro: "Assunto destino já possui abas. Exclua antes de clonar." }, { status: 400 });
    }

    // Busca abas+campos da origem
    const { data: abasOrigem, error: errOrigem } = await supabase
      .from("lip_abas")
      .select("*, lip_campos(*)")
      .eq("assunto_id", origem_assunto_id)
      .order("ordem", { ascending: true });
    if (errOrigem) return NextResponse.json({ ok: false, erro: errOrigem.message }, { status: 500 });
    if (!abasOrigem || abasOrigem.length === 0) {
      return NextResponse.json({ ok: false, erro: "Assunto origem não possui abas para clonar" }, { status: 400 });
    }

    // Insere abas no destino e mapeia id antigo → novo
    let totalAbas = 0;
    let totalCampos = 0;
    for (const abaOrig of abasOrigem) {
      const { data: novaAba, error: errInsAba } = await supabase
        .from("lip_abas")
        .insert({
          nome: abaOrig.nome,
          dica: abaOrig.dica ?? "",
          ordem: abaOrig.ordem,
          ativo: abaOrig.ativo ?? true,
          assunto_id: destino_assunto_id,
        })
        .select()
        .single();
      if (errInsAba) return NextResponse.json({ ok: false, erro: `Erro ao clonar aba "${abaOrig.nome}": ${errInsAba.message}` }, { status: 500 });
      totalAbas++;

      const campos = (abaOrig.lip_campos ?? []).map((c: any) => ({
        aba_id: novaAba.id,
        chave: c.chave,
        label: c.label,
        tipo: c.tipo,
        opcoes: c.opcoes,
        placeholder: c.placeholder ?? "",
        valor_padrao: c.valor_padrao ?? "",
        ordem: c.ordem,
        ativo: c.ativo ?? true,
      }));
      if (campos.length > 0) {
        const { error: errInsCampos } = await supabase.from("lip_campos").insert(campos);
        if (errInsCampos) return NextResponse.json({ ok: false, erro: `Erro ao clonar campos da aba "${abaOrig.nome}": ${errInsCampos.message}` }, { status: 500 });
        totalCampos += campos.length;
      }
    }

    return NextResponse.json({ ok: true, data: { abasClonadas: totalAbas, camposClonados: totalCampos } });
  }

  if (tipo === "campo") {
    const { data: ultimo } = await supabase
      .from("lip_campos")
      .select("ordem")
      .eq("aba_id", body.aba_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("lip_campos")
      .insert({
        aba_id: body.aba_id,
        chave: body.chave,
        label: body.label,
        tipo: body.tipo || "texto",
        opcoes: body.opcoes || null,
        placeholder: body.placeholder || "",
        valor_padrao: body.valor_padrao || "",
        ordem: (ultimo?.ordem ?? -1) + 1,
      })
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}

// Editar aba ou campo
export async function PUT(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { tipo, id, ...body } = await req.json();

  if (tipo === "aba") {
    const { error } = await supabase
      .from("lip_abas")
      .update({ nome: body.nome, dica: body.dica })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "campo") {
    const { error } = await supabase
      .from("lip_campos")
      .update({
        label: body.label,
        tipo: body.tipo,
        opcoes: body.opcoes || null,
        placeholder: body.placeholder || "",
        valor_padrao: body.valor_padrao || "",
      })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "ordem_campo") {
    const { error } = await supabase
      .from("lip_campos")
      .update({ ordem: body.ordem })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "ordem_aba") {
    const { error } = await supabase
      .from("lip_abas")
      .update({ ordem: body.ordem })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}

// Excluir aba ou campo
export async function DELETE(req: NextRequest) {
  const bloqueio = await exigirAdmin(req);
  if (bloqueio) return bloqueio;

  const { tipo, id } = await req.json();

  if (tipo === "aba") {
    const { error } = await supabase.from("lip_abas").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (tipo === "campo") {
    const { error } = await supabase.from("lip_campos").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "Tipo inválido" }, { status: 400 });
}