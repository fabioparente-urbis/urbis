import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { LIMITE_CHAMADAS_CHAT_HORA, OPERACOES_CHAT_URBI } from "@/lib/urbi/limites";

/**
 * app/api/admin/urbi/prontidao-piloto/route.ts — Fase V da Inteligência URBIS (05/09/2026):
 * painel SÓ LEITURA que resume tudo que precisa ser olhado antes de um humano decidir ligar
 * `chat_gemini_ativo`. Não altera a chave, não chama Gemini, não muda o teto — cada campo aqui
 * é agregação de tabela que já existe, com a fonte declarada.
 */

const NOME_SLOT: Record<string, string> = { regularizacao: "Regularização SEI", aceite_sei: "Aceite SEI", slot_05: "Aprovação de Projeto" };

async function emLotes<T>(
  ids: string[],
  tamanho: number,
  buscar: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; erro: string | null }> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    const { data, error } = await buscar(ids.slice(i, i + tamanho));
    if (error) return { data: saida, erro: error.message };
    saida.push(...(data ?? []));
  }
  return { data: saida, erro: null };
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [
    { data: configChat },
    { count: chamadasNaUltimaHora },
    { data: processosVivos },
    { data: analisesTodas, error: erroAnalises },
    { count: sugestoesTotal },
    { data: sugestoesPorEstadoBruto },
    { data: errosRecentes },
  ] = await Promise.all([
    supabaseAdmin.from("urbi_config").select("valor").eq("chave", "chat_gemini_ativo").maybeSingle(),
    supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true }).eq("modulo", "URBI").in("operacao", OPERACOES_CHAT_URBI).gte("criado_em", umaHoraAtras).eq("status", "ok"),
    supabaseAdmin.from("processos").select("codigo, tipo_processo").is("excluido_em", null),
    supabaseAdmin.from("analises_mac").select("processo_codigo").is("excluido_em", null),
    supabaseAdmin.from("urbi_sugestoes").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("urbi_sugestoes").select("estado"),
    supabaseAdmin.from("urbis_api_calls").select("operacao, motivo_erro, criado_em").eq("modulo", "URBI").eq("status", "erro").order("criado_em", { ascending: false }).limit(10),
  ]);
  if (erroAnalises) return NextResponse.json({ ok: false, erro: erroAnalises.message }, { status: 500 });

  // "Dossiê disponível" = processo ativo com pelo menos 1 análise MAC registrada — abaixo disso
  // o dossiê ainda responde (nunca falha por ausência), mas fica quase todo vazio (sem
  // cruzamento, sem evolução de checklist, nada pro Co-Analista comentar de fato). Declarado
  // aqui explicitamente porque é uma escolha de definição, não um fato do banco.
  const processosComAnalise = new Set((analisesTodas ?? []).map((a: any) => a.processo_codigo));
  const porSlot = new Map<string, { total: number; comDossie: number }>();
  for (const p of (processosVivos ?? []) as any[]) {
    const slot = p.tipo_processo ?? "desconhecido";
    if (!porSlot.has(slot)) porSlot.set(slot, { total: 0, comDossie: 0 });
    const linha = porSlot.get(slot)!;
    linha.total++;
    if (processosComAnalise.has(p.codigo)) linha.comDossie++;
  }
  const dossiePorSlot = [...porSlot.entries()].map(([slot, v]) => ({
    slot, nome_slot: NOME_SLOT[slot] ?? slot, processos_com_dossie: v.comDossie, processos_ativos_total: v.total,
  }));

  // Cobertura BIP por slot — mesma mecânica de app/api/mac/vinculos-fila/route.ts e
  // .../cobertura-slot5/route.ts, versão resumida (só o total/vinculado, sem prioridade nem
  // pendentes — este painel é visão geral, não fila de trabalho).
  async function coberturaBip(tipoProcesso: string): Promise<{ total: number; vinculado: number }> {
    const { data: modelo } = await supabaseAdmin.from("mac_checklist_modelos").select("id").eq("tipo_processo", tipoProcesso).maybeSingle();
    if (!modelo) return { total: 0, vinculado: 0 };
    const { data: itens } = await supabaseAdmin.from("mac_checklist_itens").select("id").eq("modelo_id", modelo.id).eq("ativo", true);
    const ids = (itens ?? []).map((i: any) => i.id);
    const { data: vinculos } = await emLotes<{ mac_item_id: string }>(ids, 150, (lote) => supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id").in("mac_item_id", lote));
    return { total: ids.length, vinculado: new Set(vinculos.map((v) => v.mac_item_id)).size };
  }
  const [bipRegularizacao, bipAceiteSei, bipSlot5] = await Promise.all([
    coberturaBip("regularizacao"), coberturaBip("aceite_sei"), coberturaBip("slot_05"),
  ]);
  const coberturaBipPorSlot = [
    { slot: "regularizacao", nome_slot: NOME_SLOT.regularizacao, ...bipRegularizacao },
    { slot: "aceite_sei", nome_slot: NOME_SLOT.aceite_sei, ...bipAceiteSei },
    { slot: "slot_05", nome_slot: NOME_SLOT.slot_05, ...bipSlot5 },
  ];

  const sugestoesPorEstado = new Map<string, number>();
  for (const s of (sugestoesPorEstadoBruto ?? []) as any[]) sugestoesPorEstado.set(s.estado, (sugestoesPorEstado.get(s.estado) ?? 0) + 1);

  const chatAtivo = configChat?.valor === "true";
  const bipAprovadoRegOuAceite = bipRegularizacao.vinculado + bipAceiteSei.vinculado;

  // Checklist — cada item diz o que verifica e o estado hoje. "decisao_humana:true" é item que
  // NENHUM dado sozinho decide — fica sempre pendente de leitura de alguém, nunca "ok" automático.
  const checklist = [
    {
      item: "Kill switch entendido",
      ok: true,
      decisao_humana: false,
      detalhe: `chat_gemini_ativo está "${chatAtivo ? "true" : "false"}" agora — ${chatAtivo ? "chat CHAMA Gemini de verdade" : "chat não chama Gemini, custo zero"}.`,
    },
    {
      item: "Teto de chamadas revisado",
      ok: true,
      decisao_humana: false,
      detalhe: `${LIMITE_CHAMADAS_CHAT_HORA} chamadas/hora (lib/urbi/limites.ts) — ${chamadasNaUltimaHora ?? 0} usadas na última hora.`,
    },
    {
      item: "Pelo menos 1 vínculo BIP aprovado em Regularização ou Aceite SEI (via a fila da Fase Q/T)",
      ok: bipAprovadoRegOuAceite > 0,
      decisao_humana: false,
      detalhe: bipAprovadoRegOuAceite > 0
        ? `${bipAprovadoRegOuAceite} vínculo(s) aprovado(s) hoje nesses 2 assuntos.`
        : "Nenhum ainda — o lote inicial (/admin/vinculos-lip-bip → Lote inicial) está pronto pra revisão, mas ninguém aprovou nada até agora.",
    },
    {
      item: "Roteiro de teste humano (1 processo por slot, Fase U) executado e sem surpresa",
      ok: false,
      decisao_humana: true,
      detalhe: "Só quem rodou o roteiro sabe — nenhum dado no banco prova isso sozinho.",
    },
    {
      item: "Sem erro recorrente recente no chat/BIP",
      ok: (errosRecentes ?? []).length === 0,
      decisao_humana: false,
      detalhe: (errosRecentes ?? []).length === 0 ? "Nenhum erro nos últimos registros." : `${(errosRecentes ?? []).length} erro(s) recente(s) — ver lista abaixo antes de decidir.`,
    },
    {
      item: "Decisão final de ligar o chat",
      ok: false,
      decisao_humana: true,
      detalhe: "Ativação é sempre humana, sempre temporária (pode desligar a qualquer momento) e sempre auditável (urbi_config.atualizado_por + auditoria_eventos). Nenhum item acima liga sozinho.",
    },
  ];

  return NextResponse.json({
    ok: true,
    data: {
      chat_ativo: chatAtivo,
      chat_ativo_fonte: "urbi_config.chat_gemini_ativo",
      limite_chamadas_hora: LIMITE_CHAMADAS_CHAT_HORA,
      chamadas_na_ultima_hora: chamadasNaUltimaHora ?? 0,
      limite_fonte: "lib/urbi/limites.ts — mesma constante que app/api/urbi/chat/route.ts aplica de verdade.",
      dossie_por_slot: dossiePorSlot,
      dossie_fonte: "processos ativos com pelo menos 1 análise MAC registrada (analises_mac) — abaixo disso o dossiê responde, mas fica quase vazio.",
      cobertura_bip_por_slot: coberturaBipPorSlot,
      sugestoes: {
        total: sugestoesTotal ?? 0,
        por_estado: [...sugestoesPorEstado.entries()].map(([estado, total]) => ({ estado, total })),
      },
      sugestoes_fonte: "urbi_sugestoes — todas, não só 'nova' (visão geral de /admin/urbi mostra só 'nova').",
      erros_recentes: errosRecentes ?? [],
      erros_recentes_fonte: "urbis_api_calls (modulo=URBI, status=erro, últimos 10)",
      checklist,
    },
  });
}
