// ============================================================
// GET    /api/mrp/registros — lista com filtros
//   query: usuario_id, processo_codigo, mes, ano, tipo_processo,
//          tipo_despacho, porte, revisao, bairro, q (busca em assunto/interessado)
// POST   /api/mrp/registros — admin pode inserir manualmente
// PUT    /api/mrp/registros — admin pode editar
// DELETE /api/mrp/registros — admin pode remover
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { calcularPontos } from "@/lib/mrp-pontuacao";
import { inferirPorte, extrairMetricasProcesso, type DadosProcesso } from "@/lib/mrp";
import { resolverSlot } from "@/lib/assuntos";

async function podeVer(
  auth: { userId: string; irrestrito: boolean; gerencia: string | null },
  alvoId: string | null,
): Promise<boolean> {
  if (!alvoId) return auth.irrestrito;
  if (alvoId === auth.userId) return true;
  if (auth.irrestrito) return true;
  if (auth.gerencia) {
    const { data: alvo } = await supabaseAdmin
      .from("usuarios").select("gerencia").eq("id", alvoId).maybeSingle();
    return (alvo as any)?.gerencia === auth.gerencia;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const usuarioId = searchParams.get("usuario_id") ?? auth.userId;
  if (!(await podeVer(auth, usuarioId))) {
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
  }

  let q = supabaseAdmin.from("mrp_registros").select("*").eq("usuario_id", usuarioId);

  const mes = searchParams.get("mes");
  const ano = searchParams.get("ano");
  const tipoProcesso = searchParams.get("tipo_processo");
  const tipoDespacho = searchParams.get("tipo_despacho");
  const porte = searchParams.get("porte");
  const gerencia = searchParams.get("gerencia");
  const bairro = searchParams.get("bairro");
  const revisao = searchParams.get("revisao");
  const processoCodigo = searchParams.get("processo_codigo");
  const busca = searchParams.get("q");

  if (mes) q = q.eq("mes", Number(mes));
  if (ano) q = q.eq("ano", Number(ano));
  if (tipoProcesso) q = q.eq("tipo_processo", tipoProcesso);
  if (tipoDespacho) q = q.eq("tipo_despacho", tipoDespacho);
  if (porte) q = q.eq("porte", porte);
  if (gerencia) q = q.eq("gerencia", gerencia);
  if (bairro) q = q.eq("bairro", bairro);
  if (revisao === "true") q = q.eq("revisao", true);
  if (revisao === "false") q = q.eq("revisao", false);
  if (processoCodigo) q = q.eq("processo_codigo", processoCodigo);
  // Remove caracteres com significado no filtro PostgREST (,()* ) antes de
  // interpolar — evita quebra/injeção na cláusula .or().
  const buscaLimpa = (busca ?? "").replace(/[,()*]/g, " ").trim();
  if (buscaLimpa) q = q.or(`assunto.ilike.%${buscaLimpa}%,interessado.ilike.%${buscaLimpa}%,observacoes.ilike.%${buscaLimpa}%`);

  const { data, error } = await q.order("data_despacho", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  // Qualquer usuário autenticado pode inserir registro manual.
  // (A restrição irrestrito permanece apenas em PUT e DELETE.)

  const body = await req.json();
  // Analista comum só pode registrar para si mesmo.
  if (!auth.irrestrito && body.usuario_id && body.usuario_id !== auth.userId) {
    return NextResponse.json({ ok: false, erro: "Sem permissão para registrar em nome de outro analista" }, { status: 403 });
  }
  // Se não informado, usa o próprio usuário autenticado.
  if (!body.usuario_id) body.usuario_id = auth.userId;

  // Área: extraída do processo pelo parser robusto, e não do que o cliente
  // mandou. As telas do MAC usavam `replace(",", ".")`, que não remove o
  // ponto de milhar — "3.158,00" virava 0 e derrubava a pontuação de 4,5
  // para 2,5. O servidor é a fonte de verdade; o valor do cliente só entra
  // em registro manual, onde não há processo de onde extrair.
  if (body.auto_gerado && body.processo_codigo) {
    const { data: proc } = await supabaseAdmin
      .from("processos").select("dados").eq("codigo", body.processo_codigo).maybeSingle();
    if (proc) {
      const m = extrairMetricasProcesso((proc as { dados?: DadosProcesso }).dados);
      if (m.area > 0) body.area_construida = m.area;
    }
  }

  // Se auto_gerado e pontos não informados, calcula pela tabela ANTES da validação
  if (body.auto_gerado && body.pontos === undefined) {
    const { data: tabela } = await supabaseAdmin.from("mrp_pontuacao").select("*").order("ordem");
    if (tabela) {
      body.pontos = calcularPontos(body.tipo_despacho || "", Number(body.area_construida || 0), tabela);
    }
  }
  if (!body.processo_codigo || !body.tipo_despacho || body.pontos === undefined) {
    return NextResponse.json({ ok: false, erro: "Campos obrigatórios faltando" }, { status: 400 });
  }
  const data_despacho = body.data_despacho ?? new Date().toISOString();
  const dt = new Date(data_despacho);
  const usuarioId = body.usuario_id || auth.userId;

  // Slot: resolvido a partir do processo, NUNCA de um default de texto.
  // Antes daqui saía `"Regularização"` quando o cliente não mandava
  // tipo_processo, o que divergia do slug gravado pelo caminho servidor
  // (mrpGravar) na mesma linha do upsert.
  const slot = await resolverSlot({
    processo_codigo: body.processo_codigo,
    tipo_processo: body.tipo_processo,
    assunto_id: body.assunto_id,
  });

  // Gerência de quem assina, lida do cadastro no momento da emissão.
  const { data: autor } = await supabaseAdmin
    .from("usuarios").select("gerencia").eq("id", usuarioId).maybeSingle();
  const gerenciaAutor = (autor as { gerencia?: string | null } | null)?.gerencia ?? null;

  const payload = {
    usuario_id: usuarioId,
    processo_codigo: body.processo_codigo,
    tipo_processo: slot.slug ?? body.tipo_processo ?? null,
    assunto_id: slot.assunto_id,
    interessado: body.interessado ?? null,
    // `assunto` é o assunto da OBRA. Se vier o nome do slot (cliente antigo),
    // descarta — esse dado já vive em assunto_id.
    assunto: body.assunto && String(body.assunto).toLowerCase().trim() !== String(slot.nome ?? "").toLowerCase().trim()
      ? body.assunto
      : null,
    // Porte da EDIFICAÇÃO pela área. Antes daqui saía "GERAED", que é
    // gerência — os dois conceitos dividiam esta coluna.
    porte: inferirPorte(Number(body.area_construida ?? 0), body.porte),
    // Gerência do analista, congelada na emissão.
    gerencia: body.gerencia ?? gerenciaAutor,
    area_construida: Number(body.area_construida ?? 0),
    bairro: body.bairro ?? null,
    numero_sei: body.numero_sei ?? null,
    numero_fisico: body.numero_fisico ?? null,
    setor: body.setor ?? null,
    tipo_despacho: body.tipo_despacho,
    numero_despacho: body.numero_despacho ?? null,
    numero_analise: body.numero_analise ?? null,
    numero_revisao: body.numero_revisao ?? null,
    data_inicio: body.data_inicio ?? null,
    data_despacho,
    pontos: Number(body.pontos),
    observacoes: body.observacoes ?? null,
    mes: dt.getMonth() + 1,
    ano: dt.getFullYear(),
    auto_gerado: false,
  };
  // auto_gerado: upsert por (usuario_id, numero_despacho) — evita duplicata na reemissão
  const isUpsert = body.auto_gerado && body.numero_despacho;
  const { data, error } = isUpsert
    ? await supabaseAdmin.from("mrp_registros")
        .upsert(payload, { onConflict: "usuario_id,numero_despacho", ignoreDuplicates: false })
        .select().maybeSingle()
    : await supabaseAdmin.from("mrp_registros")
        .insert(payload).select().maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.irrestrito) return NextResponse.json({ ok: false, erro: "Apenas admin/diretora" }, { status: 403 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const patch: any = {};
  for (const k of [
    "interessado", "assunto", "assunto_id", "porte", "gerencia", "area_construida", "bairro", "setor", "numero_sei", "numero_fisico",
    "tipo_despacho", "numero_despacho", "numero_analise", "numero_revisao",
    "data_inicio", "data_despacho", "pontos", "observacoes",
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.data_despacho) {
    const dt = new Date(body.data_despacho);
    patch.mes = dt.getMonth() + 1;
    patch.ano = dt.getFullYear();
  }

  const { error } = await supabaseAdmin.from("mrp_registros").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.irrestrito) return NextResponse.json({ ok: false, erro: "Apenas admin/diretora" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("mrp_registros").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
