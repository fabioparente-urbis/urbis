/**
 * app/api/mac/slot-05/manutencao/route.ts — ações de manutenção da análise do Slot 5:
 * limpar o MAC e marcar/desmarcar "MAC não concluído".
 *
 * Isolada do Slot 1: só toca análise com tipo_processo = slot_05 e o processo do trio do Slot 5.
 *
 * "Limpar MAC" zera as respostas da análise em aberto — não apaga a análise nem o histórico
 * (`mac_historico` guarda o que foi limpo, item a item, como qualquer outra mudança de status).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, acao, valor, analiseId } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    // ── MAC não concluído ────────────────────────────────────────────────────
    if (acao === "mac_incompleto") {
      const { error } = await supabaseAdmin.from("processos")
        .update({ mac_incompleto: valor === true })
        .eq("id", resolucao.processo.id);
      if (error) {
        // Coluna ausente = migration não rodada. Diz isso em vez de estourar 500 opaco.
        const faltando = /column .*mac_incompleto/i.test(error.message);
        return NextResponse.json({
          ok: false,
          erro: faltando
            ? "a coluna mac_incompleto ainda não existe — rode a migration 2026_08_17_mac_slot5_filtros.sql"
            : error.message,
        }, { status: faltando ? 503 : 500 });
      }
      return NextResponse.json({ ok: true, macIncompleto: valor === true });
    }

    // ── Limpar MAC ───────────────────────────────────────────────────────────
    if (acao === "limpar") {
      // A análise que a TELA está mostrando. Sem `analiseId` a rota limpava sempre a de maior
      // número — quem estivesse na Análise 1 via a 1 zerar na tela e a 3 zerar no banco.
      let q = supabaseAdmin.from("analises_mac")
        .select("id, numero_analise, itens, analista_id, aceites")
        .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
        .is("excluido_em", null);
      if (analiseId) q = q.eq("id", analiseId);
      const { data: analises } = await q.order("numero_analise", { ascending: false }).limit(1);
      const alvo = (analises ?? [])[0] as any;
      if (!alvo) {
        return NextResponse.json({
          ok: false,
          erro: analiseId
            ? "a análise informada não existe neste processo do Slot 5"
            : "nenhuma análise para limpar",
        }, { status: 404 });
      }

      const anteriores = (alvo.itens ?? {}) as Record<string, string>;
      const limpos = Object.keys(anteriores).length;

      // Trilha: registra a limpeza item a item, para o histórico não perder o que existia.
      if (limpos) {
        const modeloId = await modeloDoSlot5();
        const { data: checkItens } = modeloId
          ? await supabaseAdmin.from("mac_checklist_itens")
            .select("id, grupo, texto, ref").eq("modelo_id", modeloId).limit(2000)
          : { data: [] as any[] };
        const idx = new Map(((checkItens ?? []) as any[]).map((i: any) => [i.id, i]));

        await supabaseAdmin.from("mac_historico").insert(
          Object.keys(anteriores).map((itemId) => {
            const it = idx.get(itemId) as any;
            return {
              analise_id: alvo.id,
              processo_codigo: codigo,
              tipo_processo: TIPO_PROCESSO_SLOT5,
              analista_id: usuario.id,   // quem limpou, não o dono da análise
              checklist_item_id: itemId,
              aba: it?.grupo ?? null,
              item_texto: it?.texto ?? null,
              referencia_legal: it?.ref ?? null,
              status_anterior: anteriores[itemId],
              status_novo: "limpo",
            };
          }),
        );
      }

      /* "Limpar" apaga RESPOSTAS. Dentro de `aceites`, só `filtros` é resposta (quais o analista
       * aceitou/recusou); a sigla da unidade territorial e os números que ele informou à mão
       * (depósito/produção, pátio, capacidade, alunos) são dado do processo e ficam de pé — zerar
       * junto obrigaria a redigitar tudo depois de um "Limpar MAC". */
      const aceitesAntes = (alvo.aceites ?? {}) as Record<string, unknown>;
      const aceitesDepois = { ...aceitesAntes, filtros: {} };

      const { error } = await supabaseAdmin.from("analises_mac")
        .update({ itens: {}, fontes: {}, aceites: aceitesDepois }).eq("id", alvo.id);
      if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

      return NextResponse.json({ ok: true, limpos, analise: alvo.numero_analise });
    }

    return NextResponse.json({ ok: false, erro: "ação desconhecida" }, { status: 400 });
  } catch (e: any) {
    console.error("[MAC/slot-05/manutencao]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
