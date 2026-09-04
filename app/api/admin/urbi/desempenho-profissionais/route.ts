import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { selecionarEmLotes } from "@/lib/urbi/dossieProcesso";

/**
 * Fase N do plano de Inteligência URBIS — base auditável de desempenho por profissional
 * (arquiteto/engenheiro autor/responsável, tabela `profissionais`), NUNCA ranking. Mesmo
 * espírito da Recorrência (Fase H): declarar lacuna quando a amostra é pequena, em vez de
 * publicar número que não sustenta conclusão nenhuma.
 *
 * ACHADO DA AUDITORIA (04/09/2026), que molda esta rota inteira: `profissionais` e
 * `processo_profissionais` vieram de UM backfill único (`scripts/backfill_profissionais.mjs`,
 * janela de 20min em 17/07/2026) — não existe caminho de escrita vivo alimentando essas tabelas
 * hoje. 25 profissionais, 31 vínculos, no máximo 3 processos distintos por profissional. Com o
 * limiar mínimo abaixo (5, mesmo valor da Fase H, por consistência), NENHUM profissional atinge
 * amostra suficiente na data desta auditoria — isso é o resultado ESPERADO e correto desta
 * rodada, não um bug: a rota existe pra quando a base crescer (ou for corrigida), sem forçar
 * conclusão que o dado de hoje não sustenta.
 *
 * Nunca rotula "alto"/"baixo desempenho" — só conta fato bruto (processos distintos, primeira
 * passada sem retorno, retorno comprovado, arquivamento/indeferimento por tag confiável).
 * Nenhuma nota, score ou ordenação por volume: a lista sai em ordem alfabética.
 *
 * Identidade "validada" = profissional tem CAU ou CREA (não só nome — nome sozinho já teve
 * colisão documentada nesta base antes do soft-merge existir). Profissional sem identificador
 * forte aparece na lista, marcado como identidade não validada — nunca some em silêncio.
 */
const AMOSTRA_MINIMA_PROCESSOS = 5;
const TAGS_ARQUIVAMENTO = new Set(["indeferimento", "arquivamento"]);

type ProcessoVinculado = {
  codigo: string;
  tipo_processo: string;
  tags: unknown;
};

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { data: profissionais, error: erroProfissionais } = await supabaseAdmin
    .from("profissionais")
    .select("id, nome_original, cau, crea, merged_into_id");
  if (erroProfissionais) {
    console.error("[admin/urbi/desempenho-profissionais GET] falha ao consultar profissionais:", erroProfissionais.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar profissionais." }, { status: 500 });
  }

  // Segue a cadeia de soft-merge até o profissional "vivo" — mesma lógica de
  // app/api/profissionais/historico/route.ts, aqui pré-calculada pra todos de uma vez.
  const porId = new Map((profissionais ?? []).map((p: any) => [p.id, p]));
  function resolverVivo(id: string): any {
    let atual = porId.get(id);
    let voltas = 0;
    while (atual?.merged_into_id && voltas < 5) {
      atual = porId.get(atual.merged_into_id);
      voltas++;
    }
    return atual;
  }
  const vivos = (profissionais ?? []).filter((p: any) => !p.merged_into_id);

  const { data: vinculos, error: erroVinculos } = await supabaseAdmin
    .from("processo_profissionais")
    .select("profissional_id, processos!inner(codigo, tipo_processo, excluido_em, tags)")
    .eq("ativo", true);
  if (erroVinculos) {
    console.error("[admin/urbi/desempenho-profissionais GET] falha ao consultar vínculos:", erroVinculos.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar vínculos profissional-processo." }, { status: 500 });
  }

  // Processo -> profissional vivo, deduplicado (mesmo processo pode gerar 2 vínculos, ex.:
  // arquiteto E engenheiro; e um profissional_id antigo pode apontar pra um id já mergeado).
  const processosPorProfissional = new Map<string, Map<string, ProcessoVinculado>>();
  for (const v of (vinculos ?? []) as any[]) {
    const p = v.processos;
    if (!p || p.excluido_em) continue; // processo excluído não conta
    const vivo = resolverVivo(v.profissional_id);
    if (!vivo) continue;
    if (!processosPorProfissional.has(vivo.id)) processosPorProfissional.set(vivo.id, new Map());
    processosPorProfissional.get(vivo.id)!.set(p.codigo, { codigo: p.codigo, tipo_processo: p.tipo_processo, tags: p.tags });
  }

  const todosCodigos = [...new Set([...processosPorProfissional.values()].flatMap((m) => [...m.keys()]))];
  const { data: analises, erro: erroAnalises } = await selecionarEmLotes(
    todosCodigos,
    200,
    (lote) =>
      supabaseAdmin
        .from("analises_mac")
        .select("processo_codigo, numero_analise, numero_despacho, numero_parecer")
        .in("processo_codigo", lote)
        .is("excluido_em", null),
  );
  if (erroAnalises) {
    console.error("[admin/urbi/desempenho-profissionais GET] falha ao consultar analises_mac:", erroAnalises);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar análises." }, { status: 500 });
  }

  const analisesPorProcesso = new Map<string, { numero_analise: number; fechada: boolean }[]>();
  for (const a of analises as any[]) {
    if (!analisesPorProcesso.has(a.processo_codigo)) analisesPorProcesso.set(a.processo_codigo, []);
    analisesPorProcesso.get(a.processo_codigo)!.push({
      numero_analise: Number(a.numero_analise ?? 0),
      fechada: !!(a.numero_despacho || a.numero_parecer),
    });
  }

  function temTagArquivamento(tags: unknown): boolean {
    return Array.isArray(tags) && tags.some((t: any) => t && TAGS_ARQUIVAMENTO.has(t.tipo));
  }

  const linhas = vivos
    .map((prof: any) => {
      const processos = [...(processosPorProfissional.get(prof.id)?.values() ?? [])];
      const processosDistintos = processos.length;

      let primeiraPassadaSemRetorno = 0;
      let retornoComprovado = 0;
      let arquivadoIndeferido = 0;
      let semSituacaoDefinida = 0;

      for (const proc of processos) {
        if (temTagArquivamento(proc.tags)) {
          arquivadoIndeferido++;
          continue;
        }
        const passadas = analisesPorProcesso.get(proc.codigo) ?? [];
        const maxPassada = passadas.reduce((max, p) => Math.max(max, p.numero_analise), 0);
        const passada1 = passadas.find((p) => p.numero_analise === 1);
        if (maxPassada >= 2) {
          retornoComprovado++;
        } else if (maxPassada === 1 && passada1?.fechada) {
          primeiraPassadaSemRetorno++;
        } else {
          semSituacaoDefinida++;
        }
      }

      const identidadeValidada = !!(prof.cau || prof.crea);
      return {
        profissional_id: prof.id,
        nome: prof.nome_original,
        identidade_validada: identidadeValidada,
        processos_distintos: processosDistintos,
        primeira_passada_sem_retorno: primeiraPassadaSemRetorno,
        retorno_comprovado: retornoComprovado,
        arquivado_indeferido: arquivadoIndeferido,
        sem_situacao_definida: semSituacaoDefinida,
        amostra_suficiente: identidadeValidada && processosDistintos >= AMOSTRA_MINIMA_PROCESSOS,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const comIdentidadeValidada = linhas.filter((l) => l.identidade_validada).length;
  const comAmostraSuficiente = linhas.filter((l) => l.amostra_suficiente).length;

  return NextResponse.json({
    ok: true,
    data: {
      profissionais: linhas,
      amostra_minima_processos: AMOSTRA_MINIMA_PROCESSOS,
      resumo: {
        total_profissionais_vivos: linhas.length,
        com_identidade_validada: comIdentidadeValidada,
        com_amostra_suficiente: comAmostraSuficiente,
      },
      fonte:
        "profissionais + processo_profissionais (vínculo ativo, soft-merge resolvido) cruzado com analises_mac " +
        "(passada fechada = numero_despacho ou numero_parecer commitado) e processos.tags (indeferimento/arquivamento). " +
        "profissionais/processo_profissionais vieram de um backfill único em 17/07/2026 — sem escrita nova desde então, " +
        "a amostra não cresce sozinha. Nunca ranking: ordem alfabética, sem nota nem classificação de desempenho.",
    },
  });
}
