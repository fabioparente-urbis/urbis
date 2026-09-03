import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Estatísticas agregadas de produtividade/conformidade por analista e por
// autor técnico — dado sensível o bastante para restringir a Administrador.
// Deliberadamente mais estrito que o `ctx.irrestrito` padrão do projeto
// (que também inclui Diretora): reproduz o mesmo gate que já existe no
// client desta tela (app/admin/bdi/page.tsx: `perfil !== "Administrador"`).
//
// ============================================================
// FILTRO GLOBAL DE ASSUNTO (02/09/2026)
//
// `?assunto=<slug>` filtra TODAS as views abaixo pelo mesmo slot — sem
// hardcode: o slug vem de `assuntos` (mesma tabela que já alimenta o
// dropdown "ABRIR PROCESSO" da Home e o filtro de tipo da Pilha), então um
// slot novo aparece automaticamente, sem precisar de deploy.
//
// AUDITORIA (feita antes de codar, nenhuma migration aplicada) — cada view
// tem uma coluna diferente pra identificar o assunto, ou nenhuma:
//   · `assunto` (nome, via JOIN a `assuntos` já na view): vw_bdi_por_assunto,
//     vw_bdi_por_bairro, vw_bdi_analistas_desempenho, vw_bdi_nao_conformidades
//     — filtro direto por nome.
//   · `tipo_processo` (slug, lowercased, das views que eu mesmo escrevi
//     sobre `processos`/`mac_historico`): vw_bdi_tempo_etapas,
//     vw_bdi_exigencias_por_contexto, vw_bdi_campos_criticos,
//     vw_bdi_retorno_por_slot, vw_bdi_cobertura_satelite — filtro direto por
//     slug.
//   · `tipo_processo` cru de `mrp_registros` (texto livre, não é FK):
//     vw_bdi_produtividade_mensal — filtro por slug, mas com ressalva: grafia
//     histórica pode divergir (ver lib/assuntos.ts, comentário sobre "4
//     grafias para a mesma coisa" antes da normalização de 24/07/2026);
//     usa `ilike` em vez de igualdade exata por isso.
//   · só `processo_codigo`, sem tipo_processo nem assunto: vw_bdi_retrabalho,
//     vw_bdi_retrabalho_por_passada — filtro indireto: busca os códigos de
//     processo do assunto selecionado (`processos.assunto_id`) e filtra por
//     `processo_codigo IN (...)`.
//   · sem NENHUMA coluna de processo/assunto/agregação por assunto:
//     vw_bdi_resumo_geral, vw_bdi_por_analista — não dá pra filtrar a view
//     em si; quando um assunto é selecionado, os dois são DERIVADOS das
//     views já filtradas acima (vw_bdi_por_assunto, vw_bdi_por_bairro,
//     vw_bdi_analistas_desempenho), sem nenhuma consulta nova.
//   · NÃO FILTRÁVEIS SEM ALTERAR A VIEW (migration), deixadas de fora do
//     filtro de propósito, sempre mostrando o total:
//       - vw_bdi_desempenho_referencia: agrega só por `referencia_legal`,
//         não seleciona `tipo_processo` nem nada equivalente — a coluna
//         existe em `mac_historico`, mas não chega até a view.
//       - vw_bdi_numeracao_saldo: numeração é transversal aos slots por
//         desenho do sistema (CLAUDE.md — "exceção deliberada... fonte
//         única para todos os slots"), não pertence a um assunto; a view
//         é por usuário/tipo de documento, não por processo.
// ============================================================
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito ao Administrador." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const assuntoSlug = (searchParams.get("assunto") || "").trim();

  // Resolve o slug pro par (id, nome) só uma vez — sem hardcode de slot
  // nenhum, é a mesma tabela dinâmica que /api/admin/assuntos expõe.
  let assuntoAtivo: { id: string; nome: string } | null = null;
  if (assuntoSlug) {
    const { data } = await supabaseAdmin.from("assuntos").select("id, nome").eq("slug", assuntoSlug).maybeSingle();
    if (data) assuntoAtivo = { id: data.id, nome: data.nome };
    // slug desconhecido (ex.: query forjada): cai no comportamento de "Tudo"
    // em vez de devolver erro — mais seguro que travar o painel inteiro.
  }

  // Códigos de processo do assunto selecionado — usado pelas duas views que
  // não têm tipo_processo/assunto próprio (vw_bdi_retrabalho e
  // vw_bdi_retrabalho_por_passada) e também pra recalcular "por assunto"
  // (ver abaixo). Uma query só, reaproveitada.
  //
  // ACHADO 02/09/2026: vw_bdi_por_assunto (e vw_bdi_resumo_geral) não
  // filtram `excluido_em` — um processo na lixeira ainda entra na contagem.
  // Como não dá pra alterar a view (sem migration), "por assunto" deixou de
  // vir da view: é recalculado aqui, direto de `processos` + `assuntos`,
  // sempre com `excluido_em IS NULL`. Mesmo formato de linha que a view
  // devolvia, pra não mudar a tela. Este recálculo vale tanto filtrado
  // quanto em "Tudo" — o problema não era só de Regularização, é da view
  // inteira; só apareceu ali porque é onde há processo excluído hoje.
  let qCodigosDoAssunto = supabaseAdmin.from("processos").select("codigo").is("excluido_em", null);
  if (assuntoAtivo) qCodigosDoAssunto = qCodigosDoAssunto.eq("assunto_id", assuntoAtivo.id);

  let qProcessosParaContagem = supabaseAdmin.from("processos").select("assunto_id, porte, area_construida, eh_retorno").is("excluido_em", null);
  if (assuntoAtivo) qProcessosParaContagem = qProcessosParaContagem.eq("assunto_id", assuntoAtivo.id);

  const [resCodigos, resAssuntos, resProcessosContagem] = await Promise.all([
    qCodigosDoAssunto,
    // Mesmo corte da view antiga (`a.nome !~~ 'Slot%'`): só esconde os
    // slots-placeholder inativos (Slot 03, Slot 06...); Regularização,
    // Aceite SEI e Aprovação de Projeto não batem nesse padrão.
    supabaseAdmin.from("assuntos").select("id, nome").not("nome", "ilike", "Slot%"),
    qProcessosParaContagem,
  ]);
  const falhaBase = [resCodigos, resAssuntos, resProcessosContagem].find((r) => r.error)?.error;
  if (falhaBase) {
    console.error("[bdi/stats] falha ao consultar base de contagem:", falhaBase.message);
    return NextResponse.json(
      { ok: false, erro: `Falha ao consultar estatísticas do BDI: base de contagem — ${falhaBase.message}` },
      { status: 500 },
    );
  }
  const codigosDoAssunto: string[] = (resCodigos.data ?? []).map((p: any) => p.codigo).filter(Boolean);
  const assuntosTabela = resAssuntos.data;
  const processosParaContagem = resProcessosContagem.data;

  const nomePorAssuntoId = new Map((assuntosTabela ?? []).map((a: any) => [a.id, a.nome as string]));
  const gruposPorAssunto = new Map<string, { assunto: string; total_processos: number; area_total: number; total_retornos: number; porte: string | null }>();
  for (const p of (processosParaContagem ?? []) as any[]) {
    const nome = nomePorAssuntoId.get(p.assunto_id);
    if (!nome) continue; // sem assunto, ou assunto "Slot NN" placeholder — mesmo corte da view antiga
    const chave = `${nome}::${p.porte ?? ""}`;
    const atual = gruposPorAssunto.get(chave) ?? { assunto: nome, total_processos: 0, area_total: 0, total_retornos: 0, porte: p.porte ?? null };
    atual.total_processos += 1;
    atual.area_total += Number(p.area_construida ?? 0);
    if (p.eh_retorno) atual.total_retornos += 1;
    gruposPorAssunto.set(chave, atual);
  }
  const porAssuntoData = [...gruposPorAssunto.values()].map((g) => ({
    assunto: g.assunto,
    total_processos: g.total_processos,
    area_total: g.area_total,
    area_media: g.total_processos > 0 ? g.area_total / g.total_processos : 0,
    total_retornos: g.total_retornos,
    porte: g.porte,
    count_porte: g.total_processos,
  }));

  let qPorBairro = supabaseAdmin.from("vw_bdi_por_bairro").select("*").order("total_processos", { ascending: false }).limit(20);
  let qProdutividade = supabaseAdmin.from("vw_bdi_produtividade_mensal").select("*").order("ano", { ascending: false }).order("mes", { ascending: false });
  let qAnalistas = supabaseAdmin.from("vw_bdi_analistas_desempenho").select("*");
  let qNaoConformidades = supabaseAdmin.from("vw_bdi_nao_conformidades").select("*").limit(30);
  let qRetrabalho = supabaseAdmin.from("vw_bdi_retrabalho").select("*").order("trocas_totais", { ascending: false }).limit(20);
  let qExigenciasContexto = supabaseAdmin.from("vw_bdi_exigencias_por_contexto").select("*").order("processos", { ascending: false }).limit(40);
  let qCamposCriticos = supabaseAdmin.from("vw_bdi_campos_criticos").select("*").order("campos_vazios", { ascending: false }).limit(30);
  let qTempoEtapas = supabaseAdmin.from("vw_bdi_tempo_etapas").select("*").order("dias", { ascending: false }).limit(30);
  let qRetornoPorSlot = supabaseAdmin.from("vw_bdi_retorno_por_slot").select("*");
  let qCoberturaSatelite = supabaseAdmin.from("vw_bdi_cobertura_satelite").select("*");
  let qRetrabalhoPorPassada = supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("*");
  // Não filtradas — ver auditoria no cabeçalho do arquivo.
  const qDesempenhoReferencia = supabaseAdmin.from("vw_bdi_desempenho_referencia").select("*").order("reprovou", { ascending: false }).limit(20);
  const qNumeracao = supabaseAdmin.from("vw_bdi_numeracao_saldo").select("*").order("restantes", { ascending: true });

  if (assuntoAtivo) {
    qPorBairro = qPorBairro.eq("assunto", assuntoAtivo.nome);
    qAnalistas = qAnalistas.eq("assunto", assuntoAtivo.nome);
    qNaoConformidades = qNaoConformidades.eq("assunto", assuntoAtivo.nome);
    qProdutividade = qProdutividade.ilike("tipo_processo", assuntoSlug);
    qExigenciasContexto = qExigenciasContexto.eq("tipo_processo", assuntoSlug);
    qCamposCriticos = qCamposCriticos.eq("tipo_processo", assuntoSlug);
    qTempoEtapas = qTempoEtapas.eq("tipo_processo", assuntoSlug);
    qRetornoPorSlot = qRetornoPorSlot.eq("tipo_processo", assuntoSlug);
    qCoberturaSatelite = qCoberturaSatelite.eq("tipo_processo", assuntoSlug);
    // Lista vazia é um IN() válido que não devolve nada — correto quando o
    // assunto não tem processo nenhum, em vez de cair no "Tudo" por engano.
    qRetrabalho = qRetrabalho.in("processo_codigo", codigosDoAssunto);
    qRetrabalhoPorPassada = qRetrabalhoPorPassada.in("processo_codigo", codigosDoAssunto);
  }

  const [porBairro, produtividade, analistas, naoConformidades,
         retrabalho, exigenciasContexto, desempenhoReferencia, camposCriticos, numeracao,
         tempoEtapas, retornoPorSlot, coberturaSatelite, retrabalhoPorPassada] = await Promise.all([
    qPorBairro, qProdutividade, qAnalistas, qNaoConformidades,
    qRetrabalho, qExigenciasContexto, qDesempenhoReferencia, qCamposCriticos, qNumeracao,
    qTempoEtapas, qRetornoPorSlot, qCoberturaSatelite, qRetrabalhoPorPassada,
  ]);
  const porAssunto = { data: porAssuntoData, error: null as any };

  // vw_bdi_resumo_geral e vw_bdi_por_analista não têm coluna de assunto —
  // ambos DERIVADOS agora, sempre (não só quando filtrado): resumo vem de
  // porAssuntoData (já corrigido pra excluído), mais contagem distinta de
  // bairro/analista das views correspondentes já buscadas acima.
  const totalProcessos = porAssuntoData.reduce((s, r) => s + r.total_processos, 0);
  const areaTotal = porAssuntoData.reduce((s, r) => s + r.area_total, 0);
  const totalRetornos = porAssuntoData.reduce((s, r) => s + r.total_retornos, 0);
  const bairrosDistintos = new Set((porBairro.data ?? []).map((r: any) => r.bairro).filter(Boolean));
  const analistasDistintos = new Set((analistas.data ?? []).map((r: any) => r.analista).filter(Boolean));
  const resumo = {
    data: {
      total_processos: totalProcessos,
      total_analistas: analistasDistintos.size,
      area_total_construida: areaTotal,
      area_media: totalProcessos > 0 ? areaTotal / totalProcessos : 0,
      total_retornos: totalRetornos,
      total_bairros: bairrosDistintos.size,
    },
    error: null as any,
  };

  let porAnalista: { data: any; error: any };
  if (!assuntoAtivo) {
    porAnalista = await supabaseAdmin.from("vw_bdi_por_analista").select("*");
  } else {
    // Mesmas colunas de vw_bdi_por_analista, lidas de vw_bdi_analistas_desempenho
    // (que já tem tudo isso por analista, só que quebrado também por assunto —
    // como só um assunto está ativo, a quebra vira a mesma linha).
    porAnalista = {
      data: (analistas.data ?? []).map((r: any) => ({
        analista: r.analista, gerencia: r.gerencia,
        total_processos: r.total_processos, area_total: r.area_total,
        tempo_medio_horas: r.tempo_medio_horas,
      })),
      error: null,
    };
  }

  const porView: Record<string, { error: { message: string } | null }> = {
    vw_bdi_resumo_geral: resumo, vw_bdi_por_assunto: porAssunto, vw_bdi_por_analista: porAnalista,
    vw_bdi_por_bairro: porBairro, vw_bdi_produtividade_mensal: produtividade,
    vw_bdi_analistas_desempenho: analistas, vw_bdi_nao_conformidades: naoConformidades,
    vw_bdi_retrabalho: retrabalho, vw_bdi_exigencias_por_contexto: exigenciasContexto,
    vw_bdi_desempenho_referencia: desempenhoReferencia, vw_bdi_campos_criticos: camposCriticos,
    vw_bdi_numeracao_saldo: numeracao, vw_bdi_tempo_etapas: tempoEtapas,
    vw_bdi_retorno_por_slot: retornoPorSlot, vw_bdi_cobertura_satelite: coberturaSatelite,
    vw_bdi_retrabalho_por_passada: retrabalhoPorPassada,
  };
  const falhas = Object.entries(porView)
    .filter(([, r]) => r.error)
    .map(([nome, r]) => `${nome}: ${r.error!.message}`);
  if (falhas.length > 0) {
    console.error("[bdi/stats] falha ao consultar view(s):", falhas.join(" | "));
    return NextResponse.json(
      { ok: false, erro: `Falha ao consultar estatísticas do BDI: ${falhas.join("; ")}` },
      { status: 500 },
    );
  }

  // vw_bdi_analises_em_andamento (supabase/migrations/2026_09_02_bdi_analises_em_andamento.sql)
  // — NÃO APLICADA ainda. Consultada à parte, isolada, porque uma falha
  // aqui (view não existe) não pode derrubar o resto do painel — é a
  // diferença entre "esta seção está pendente" e "o BDI inteiro quebrou".
  // Assim que a migration for aplicada, esta consulta passa a funcionar
  // sozinha, sem precisar de mais nenhuma mudança de código.
  let qAnalisesEmAndamento = supabaseAdmin.from("vw_bdi_analises_em_andamento").select("*");
  if (assuntoAtivo) qAnalisesEmAndamento = qAnalisesEmAndamento.eq("tipo_processo", assuntoSlug);
  const { data: analisesEmAndamentoData, error: erroAnalisesEmAndamento } = await qAnalisesEmAndamento;
  const analisesEmAndamentoPendente = !!erroAnalisesEmAndamento;
  if (erroAnalisesEmAndamento) {
    console.warn("[bdi/stats] vw_bdi_analises_em_andamento indisponível (migration não aplicada?):", erroAnalisesEmAndamento.message);
  }

  return NextResponse.json({
    ok: true,
    assunto_filtrado: assuntoAtivo ? { slug: assuntoSlug, nome: assuntoAtivo.nome } : null,
    // Views que continuam mostrando o total mesmo com um assunto selecionado
    // — ver auditoria no cabeçalho do arquivo.
    nao_filtraveis: ["vw_bdi_desempenho_referencia", "vw_bdi_numeracao_saldo"],
    analises_em_andamento: analisesEmAndamentoData ?? [],
    analises_em_andamento_pendente: analisesEmAndamentoPendente,
    resumo: resumo.data ?? {},
    por_assunto: porAssunto.data ?? [],
    por_analista: porAnalista.data ?? [],
    por_bairro: porBairro.data ?? [],
    produtividade: produtividade.data ?? [],
    analistas: analistas.data ?? [],
    retrabalho: retrabalho.data ?? [],
    exigencias_contexto: exigenciasContexto.data ?? [],
    desempenho_referencia: desempenhoReferencia.data ?? [],
    campos_criticos: camposCriticos.data ?? [],
    numeracao: numeracao.data ?? [],
    nao_conformidades: naoConformidades.data ?? [],
    tempo_etapas: tempoEtapas.data ?? [],
    retorno_por_slot: retornoPorSlot.data ?? [],
    cobertura_satelite: coberturaSatelite.data ?? [],
    retrabalho_por_passada: retrabalhoPorPassada.data ?? [],
  });
}
