import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { RECEITAS } from "@/lib/visao/receitas";
import { CHAVES_QUADRO_AREAS, CHECKLIST_ATIVACAO_VISAO } from "@/lib/visao/quadroAreas";

/**
 * Fase K, item 7 — só INFORMA o que existe hoje em `lib/visao/`, sem processar nada. Não tem
 * verbo POST/ação nenhuma nesta rota: o objetivo explícito é "explicar cobertura, campos
 * esperados e limitações — sem botão de processamento real". Todo o conteúdo vem do CÓDIGO
 * (`RECEITAS`, lib/visao/receitas.ts), nunca de uma tabela — não existe "receita" como registro
 * de banco hoje, é tudo versionado em arquivo por decisão de governança (ver comentário no topo
 * de lib/visao/receitas.ts).
 *
 * Fase O (04/09/2026): "ativa"/"preparada" deixou de ser "está ou não em RECEITAS" — as duas
 * agora vêm do MESMO array, distinguidas pelo campo `Receita.ativa`. Fonte única, sem duplicar
 * metadado entre este arquivo e lib/visao/quadroAreas.ts.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const ativas = RECEITAS.filter((r) => r.ativa).map((r) => ({
    id: r.id,
    versao: r.versao,
    papel: r.papel,
    chaves: r.chaves,
    alvo: r.localizacao.alvo,
    modelo: r.modelo,
    status: "ativa" as const,
    observacao: "Em produção — RECEITAS (lib/visao/receitas.ts) é lida por executarVisao a cada leitura de pasta do Slot 5. Chama o Gemini de verdade e gera custo real quando o documento com o papel certo está presente e a visão está ligada.",
  }));

  const preparadas = RECEITAS.filter((r) => !r.ativa).map((r) => {
    const ehQuadroAreas = r.id === "prancha.quadro_areas_completo";
    return {
      id: r.id,
      versao: r.versao,
      papel: r.papel,
      chaves: ehQuadroAreas ? [...CHAVES_QUADRO_AREAS, "areasPorPavimento (lista, tamanho variável)"] : r.chaves,
      alvo: r.localizacao.alvo,
      modelo: r.modelo,
      status: "preparada" as const,
      observacao: "No catálogo (RECEITAS) desde a Fase O, mas com ativa:false — executarVisao pula esta receita ANTES de checar orçamento ou montar o recorte, sempre, mesmo com a visão geral ligada. Nunca chama Gemini, nunca processa documento real, nunca gera sugestão automática enquanto ativa for false.",
      cobertura: ehQuadroAreas ? [
        "área do terreno, área construída total, área permeável, área impermeável, área a regularizar (quando declarada)",
        "áreas por pavimento — lista de tamanho variável, uma linha por pavimento declarado no quadro, nunca inventada",
        "classificação do tipo de quadro encontrado (quadro de áreas / memorial de cálculo / tabela mista / ambíguo)",
        "texto bruto de evidência (transcrição do quadro, pra conferência humana)",
        "confiança por campo e por linha de pavimento",
        "sinalização determinística de necessidade de conferência humana (nunca decidida pelo modelo)",
        "comparação × LIP/MAC/documento pronta e testada em modo seco, sem chamar modelo (lib/visao/quadroAreasComparacao.ts, scripts/testar_quadro_areas.mts seção 9)",
      ] : undefined,
      limitacoes: ehQuadroAreas ? [
        "faixa de plausibilidade das áreas (1 a 500.000 m²) é provisória — não calibrada contra dado real ainda",
        "sem regra de coerência entre os campos (ex.: impermeável ≤ terreno) — exigiria assumir uma relação jurídica que este desenho não tem autoridade pra fixar",
        "comparação × MAC está preparada na função, mas sem fonte real: nenhum item MAC guarda valor numérico de área hoje",
        "reutilizável por outros slots em tese (papel/chaves não dependem de Slot 5), mas só Slot 5 tem hoje o mecanismo de upload/papel de documento que alimentaria isto",
        "chaves ainda não registradas na matriz (lib/rastreabilidade/lipSlot5.ts) — item do checklist de ativação, não feito",
      ] : undefined,
      checklistAtivacao: ehQuadroAreas ? [...CHECKLIST_ATIVACAO_VISAO] : undefined,
    };
  });

  return NextResponse.json({ ok: true, data: { ativas, preparadas } });
}
