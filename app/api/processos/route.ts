import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar, verificarOwnership } from "@/lib/auth";
import { triar, type EntradaVigia, type LinhaRetrabalho } from "@/lib/bdi/vigia";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sentinela usada para forcar lista vazia quando a gerencia nao possui
// analistas cadastrados (evita 'in' com array vazio retornar resultados
// indesejados pelo driver). UUID nulo nao colidirá com nenhum id real.
const SENTINELA_ID_VAZIO = "00000000-0000-0000-0000-000000000000";

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const { userId, irrestrito, perfis, gerencia } = auth;

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || "";
    const tipo = searchParams.get("tipo") || "";
    const status = searchParams.get("status") || "";
    const analista = searchParams.get("analista") || "";

    let query = supabase
      .from("processos")
      .select("id, codigo, numero_sei, tipo_processo, assunto_id, status, criado_em, atualizado_em, dados, analista_id, tags, lip_incompleto, porte, area_construida")
      // Lixeira: o que foi excluído some da lista, mas continua no banco
      // e aparece em /admin/lixeira, de onde pode voltar.
      .is("excluido_em", null)
      .order("atualizado_em", { ascending: false })
      .limit(200);

    // A busca por interessado e numero de despacho depende de campos dentro
    // de jsonb (dados.proprietario / tags[].numero_despacho), que o filtro
    // .ilike do PostgREST nao alcança de forma confiável em arrays. Como o
    // volume de processos é pequeno, filtramos em memória após a query.
    const buscaLimpa = busca.replace(/[,()*]/g, " ").trim().toLowerCase();
    if (tipo) query = query.eq("tipo_processo", tipo);
    if (status) query = query.eq("status", status);

    // Visibilidade de processos (briefing Cowork — item 2):
    // - Admin / Diretora / Diretor       → todos (perfis irrestritos)
    // - Gerência GERECCO/MP/GP                → processos dos analistas da sua gerência
    // - Analista com gerencia != null    → apenas os próprios (atribuídos)
    // - Analista com gerencia = null     → apenas os próprios (atribuídos)
    //   (antes via todos os processos — bug fixado conforme briefing:
    //   "Analistas só devem ver processos atribuídos a eles.")
    const ehGerenteDeGerencia = perfis.some((p) => p && p.startsWith("Gerência "));

    if (irrestrito) {
      // Admin/Diretora podem usar o filtro opcional ?analista
      if (analista) query = query.eq("analista_id", analista);
    } else if (ehGerenteDeGerencia && gerencia) {
      // Coleta ids dos analistas da mesma gerencia
      const { data: ids } = await supabase
        .from("usuarios")
        .select("id")
        .eq("gerencia", gerencia);
      const idList = (ids ?? []).map((u) => u.id);
      if (analista) {
        // Intersecciona com o filtro vindo do cliente: so passa se o analista
        // pedido pertencer a essa gerencia.
        query = query.eq("analista_id", idList.includes(analista) ? analista : SENTINELA_ID_VAZIO);
      } else if (idList.length > 0) {
        query = query.in("analista_id", idList);
      } else {
        query = query.eq("analista_id", SENTINELA_ID_VAZIO);
      }
    } else {
      // Qualquer outro perfil (Analista com ou sem gerência, ou perfis
      // não-gerenciais): vê apenas os processos atribuídos a si. Qualquer
      // ?analista vindo do cliente é ignorado.
      query = query.eq("analista_id", userId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    let resultado = data ?? [];
    if (buscaLimpa) {
      resultado = resultado.filter((p: any) => {
        const codigo = (p.codigo || "").toLowerCase();
        const numeroSei = (p.numero_sei || "").toLowerCase();
        const interessado = (p.dados?.proprietario?.valor || "").toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags : [];
        const temDespachoBatendo = tags.some((t: any) =>
          (t.numero_despacho || "").toLowerCase().includes(buscaLimpa)
        );
        return (
          codigo.includes(buscaLimpa) ||
          numeroSei.includes(buscaLimpa) ||
          interessado.includes(buscaLimpa) ||
          temDespachoBatendo
        );
      });
    }

    // Classificação do vigia (lib/bdi/vigia.ts), a mesma usada em /api/bdi/vigia
    // (um processo por vez): aqui roda para a lista inteira já visível, numa
    // única consulta extra a vw_bdi_retrabalho — é contagem agregada, sem
    // recorte de perfil, então busca sem restrição de analista/gerência.
    const codigos = resultado.map((p: any) => p.codigo).filter(Boolean);
    const retrabalhoPorCodigo = new Map<string, LinhaRetrabalho>();
    if (codigos.length > 0) {
      const { data: linhasRetrabalho } = await supabase
        .from("vw_bdi_retrabalho")
        .select("processo_codigo, trocas_totais, virou_nao_conforme")
        .in("processo_codigo", codigos);
      for (const linha of linhasRetrabalho ?? []) {
        retrabalhoPorCodigo.set((linha as any).processo_codigo, linha as LinhaRetrabalho);
      }
    }

    resultado = resultado.map((p: any) => {
      const entrada: EntradaVigia = {
        processo: {
          codigo: p.codigo,
          tipo_processo: p.tipo_processo,
          area_construida: p.area_construida,
          dados: p.dados,
          tags: p.tags,
        },
        retrabalho: retrabalhoPorCodigo.get(p.codigo) ?? { trocas_totais: 0, virou_nao_conforme: 0 },
      };
      return { ...p, triagem: triar(entrada).classe };
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, status, analista_id, lip_incompleto, laudo_campos_ocultos } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const atualizacao: any = { atualizado_em: new Date().toISOString() };
    if (status !== undefined) atualizacao.status = status;
    if (analista_id !== undefined) atualizacao.analista_id = analista_id;
    if (lip_incompleto !== undefined) atualizacao.lip_incompleto = lip_incompleto;
    if (Array.isArray(laudo_campos_ocultos)) atualizacao.laudo_campos_ocultos = laudo_campos_ocultos;

    const { error } = await supabase.from("processos").update(atualizacao).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Duas mudanças aqui, ambas por causa do mesmo susto: esta rota
    // apagava a linha do banco DE VEZ e SEM autenticação nenhuma — um
    // clique errado levava junto o LIP, o histórico e o vínculo com as
    // análises, sem registro de quem fez.
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const { id, motivo } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const { data: alvo } = await supabase
      .from("processos").select("id, analista_id, excluido_em").eq("id", id).maybeSingle();
    if (!alvo) return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });
    // Dono ou perfil irrestrito — mesma regra do salvar.
    const ownerErr = verificarOwnership(ctx, (alvo as any).analista_id);
    if (ownerErr) return ownerErr;

    const { error } = await supabase.from("processos").update({
      excluido_em: new Date().toISOString(),
      excluido_por: ctx.userId,
      excluido_motivo: typeof motivo === "string" ? motivo.slice(0, 300) : null,
    }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    await supabase.from("auditoria_log").insert({
      tabela: "processos", registro_id: id, operacao: "ENVIADO_PARA_LIXEIRA",
      dados_antes: null, dados_depois: { por: ctx.userId, motivo: motivo ?? null },
    });
    return NextResponse.json({ ok: true, lixeira: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
