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

  // Códigos de processo do assunto selecionado — usado só pelas duas views
  // que não têm tipo_processo/assunto próprio (vw_bdi_retrabalho e
  // vw_bdi_retrabalho_por_passada). Uma query só, reaproveitada nas duas.
  let codigosDoAssunto: string[] | null = null;
  if (assuntoAtivo) {
    const { data } = await supabaseAdmin.from("processos").select("codigo").eq("assunto_id", assuntoAtivo.id).is("excluido_em", null);
    codigosDoAssunto = (data ?? []).map((p: any) => p.codigo).filter(Boolean);
  }

  let qPorAssunto = supabaseAdmin.from("vw_bdi_por_assunto").select("*");
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
    qPorAssunto = qPorAssunto.eq("assunto", assuntoAtivo.nome);
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
    qRetrabalho = qRetrabalho.in("processo_codigo", codigosDoAssunto ?? []);
    qRetrabalhoPorPassada = qRetrabalhoPorPassada.in("processo_codigo", codigosDoAssunto ?? []);
  }

  const [porAssunto, porBairro, produtividade, analistas, naoConformidades,
         retrabalho, exigenciasContexto, desempenhoReferencia, camposCriticos, numeracao,
         tempoEtapas, retornoPorSlot, coberturaSatelite, retrabalhoPorPassada] = await Promise.all([
    qPorAssunto, qPorBairro, qProdutividade, qAnalistas, qNaoConformidades,
    qRetrabalho, qExigenciasContexto, qDesempenhoReferencia, qCamposCriticos, qNumeracao,
    qTempoEtapas, qRetornoPorSlot, qCoberturaSatelite, qRetrabalhoPorPassada,
  ]);

  // vw_bdi_resumo_geral e vw_bdi_por_analista não têm coluna de assunto —
  // quando "Tudo" está selecionado, consultadas normalmente; quando um
  // assunto está ativo, DERIVADAS das views já filtradas acima (nenhuma
  // consulta nova).
  let resumo: { data: any; error: any };
  let porAnalista: { data: any; error: any };
  if (!assuntoAtivo) {
    [resumo, porAnalista] = await Promise.all([
      supabaseAdmin.from("vw_bdi_resumo_geral").select("*").maybeSingle(),
      supabaseAdmin.from("vw_bdi_por_analista").select("*"),
    ]);
  } else {
    const linhasPorAssunto = (porAssunto.data ?? []) as any[];
    const totalProcessos = linhasPorAssunto.reduce((s, r) => s + Number(r.total_processos ?? 0), 0);
    const areaTotal = linhasPorAssunto.reduce((s, r) => s + Number(r.area_total ?? 0), 0);
    const totalRetornos = linhasPorAssunto.reduce((s, r) => s + Number(r.total_retornos ?? 0), 0);
    const bairrosDistintos = new Set((porBairro.data ?? []).map((r: any) => r.bairro).filter(Boolean));
    const analistasDistintos = new Set((analistas.data ?? []).map((r: any) => r.analista).filter(Boolean));
    resumo = {
      data: {
        total_processos: totalProcessos,
        total_analistas: analistasDistintos.size,
        area_total_construida: areaTotal,
        area_media: totalProcessos > 0 ? areaTotal / totalProcessos : 0,
        total_retornos: totalRetornos,
        total_bairros: bairrosDistintos.size,
      },
      error: null,
    };
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

  return NextResponse.json({
    ok: true,
    assunto_filtrado: assuntoAtivo ? { slug: assuntoSlug, nome: assuntoAtivo.nome } : null,
    // Views que continuam mostrando o total mesmo com um assunto selecionado
    // — ver auditoria no cabeçalho do arquivo.
    nao_filtraveis: ["vw_bdi_desempenho_referencia", "vw_bdi_numeracao_saldo"],
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
