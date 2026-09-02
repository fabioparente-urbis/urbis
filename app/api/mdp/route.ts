import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPerfilIrrestrito, gerenciaDoPerfil } from "@/lib/perfis";
import { normalizarBusca } from "@/lib/texto";
import { usuarioDaRequisicao } from "@/lib/autorizacao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Nome do interessado do processo. Mesma cadeia de fallback usada pelos
 * geradores de documento (`dados.proprietario` → `interessado` →
 * `nome_proprietario`), para que a listagem do MDP mostre exatamente o
 * nome que saiu impresso no despacho.
 */
async function interessadoDoProcesso(
  codigo: string,
  informado?: string | null,
): Promise<string | null> {
  if (typeof informado === "string" && informado.trim()) return informado.trim();
  const { data } = await supabase
    .from("processos").select("dados").eq("codigo", codigo).maybeSingle();
  const d = (data?.dados ?? {}) as Record<string, { valor?: string } | undefined>;
  const nome = d.proprietario?.valor || d.interessado?.valor || d.nome_proprietario?.valor;
  return typeof nome === "string" && nome.trim() ? nome.trim() : null;
}

// POST — salva registro MDP (chamado após geração do documento)
export async function POST(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { processo_codigo, assunto_id, tipo, numero, destinatario, data_despacho, conteudo } = body;

  if (!processo_codigo || !tipo)
    return NextResponse.json({ ok: false, erro: "processo_codigo e tipo obrigatórios" }, { status: 400 });

  // Interessado: resolvido aqui para que nenhum caller precise mandá-lo.
  // Gravado junto do despacho (e não lido por join na hora de exibir) para
  // preservar quem constava na época da emissão.
  const interessado = await interessadoDoProcesso(processo_codigo, body.interessado);

  const payload = {
    processo_codigo,
    assunto_id: assunto_id || null,
    interessado,
    busca_norm: normalizarBusca(interessado, processo_codigo),
    tipo,
    numero: numero || null,
    destinatario: destinatario || null,
    data_despacho: data_despacho || null,
    conteudo: conteudo || {},
    usuario_id: usuario.id,
  };

  // Reemissão: o mesmo número, no mesmo processo e do mesmo tipo, É o mesmo
  // documento — não um segundo. Antes daqui, reemitir um despacho criava
  // uma linha nova no MDP e o despacho aparecia duplicado na lista. Agora
  // atualiza o registro existente (o conteúdo muda: o checklist foi
  // revisado entre uma emissão e outra).
  if (numero) {
    const { data: existente } = await supabase
      .from("mdp_registros")
      .select("id")
      .eq("processo_codigo", processo_codigo)
      .eq("tipo", tipo)
      .eq("numero", numero)
      .maybeSingle();

    if (existente?.id) {
      const { error: errUp } = await supabase
        .from("mdp_registros").update(payload).eq("id", existente.id);
      if (errUp) return NextResponse.json({ ok: false, erro: errUp.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: existente.id, reemissao: true });
    }
  }

  const { data, error } = await supabase
    .from("mdp_registros")
    .insert(payload)
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// GET — lista registros (com filtro de acesso por perfil)
export async function GET(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const processo = url.searchParams.get("processo") || null;
  const search = url.searchParams.get("search") || null;
  const page = parseInt(url.searchParams.get("page") || "0");
  const PAGE_SIZE = 30;

  const irrestrito = isPerfilIrrestrito(usuario.perfis);
  const gerencia = gerenciaDoPerfil(usuario.perfis);

  let query = supabase
    .from("mdp_registros")
    .select(`
      id, processo_codigo, tipo, numero, destinatario, data_despacho, conteudo, criado_em,
      assunto_id, interessado,
      usuario:usuario_id ( nome, gerencia ),
      assunto:assunto_id ( slug, nome )
    `, { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (processo) {
    query = query.eq("processo_codigo", processo);
  }

  // Busca por interessado OU número do processo, ignorando acentos e caixa.
  // Antes desta correção o parâmetro era lido e descartado — a caixa de
  // busca da tela não filtrava nada.
  if (search) {
    const termo = normalizarBusca(search);
    // Limpa os metacaracteres do PostgREST antes de entrar no .or(),
    // pelo mesmo motivo das demais rotas: evitar injeção de filtro.
    const limpo = termo.replace(/[,()*]/g, "").trim();
    if (limpo) {
      query = query.or(`busca_norm.ilike.%${limpo}%,processo_codigo.ilike.%${limpo}%`);
    }
  }

  // Filtro por slot. UUID validado antes de interpolar.
  const assuntoFiltro = url.searchParams.get("assunto_id");
  if (assuntoFiltro && /^[0-9a-f-]{36}$/i.test(assuntoFiltro)) {
    query = query.eq("assunto_id", assuntoFiltro);
  }

  if (!irrestrito) {
    if (gerencia) {
      // Gerência: vê registros dos analistas da sua gerência + os seus próprios
      const { data: analistas } = await supabase
        .from("usuarios")
        .select("id")
        .eq("gerencia", gerencia);
      const ids = (analistas || []).map((u: any) => u.id);
      if (ids.length > 0) {
        query = query.in("usuario_id", ids);
      } else {
        query = query.eq("usuario_id", usuario.id);
      }
    } else {
      // Analista: só os seus
      query = query.eq("usuario_id", usuario.id);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data || [], total: count || 0 });
}
