import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { RECEITAS } from "@/lib/visao/receitas";
import { QUADRO_AREAS_COMPLETO, CHAVES_QUADRO_AREAS } from "@/lib/visao/quadroAreas";

/**
 * Fase K, item 7 — só INFORMA o que existe hoje em `lib/visao/`, sem processar nada. Não tem
 * verbo POST/ação nenhuma nesta rota: o objetivo explícito é "explicar cobertura, campos
 * esperados e limitações — sem botão de processamento real". Todo o conteúdo vem do CÓDIGO
 * (RECEITAS ativas + a preparatória desta fase), nunca de uma tabela — não existe "receita"
 * como registro de banco hoje, é tudo versionado em arquivo por decisão de governança (ver
 * comentário no topo de lib/visao/receitas.ts).
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const ativas = RECEITAS.map((r) => ({
    id: r.id,
    versao: r.versao,
    papel: r.papel,
    chaves: r.chaves,
    alvo: r.localizacao.alvo,
    modelo: r.modelo,
    status: "ativa" as const,
    observacao: "Em produção — RECEITAS (lib/visao/receitas.ts) é lida por executarVisao a cada leitura de pasta do Slot 5. Chama o Gemini de verdade e gera custo real quando o documento com o papel certo está presente e a visão está ligada.",
  }));

  const preparadas = [{
    id: QUADRO_AREAS_COMPLETO.id,
    versao: QUADRO_AREAS_COMPLETO.versao,
    papel: QUADRO_AREAS_COMPLETO.papel,
    chaves: [...CHAVES_QUADRO_AREAS, "areasPorPavimento (lista, tamanho variável)"],
    alvo: QUADRO_AREAS_COMPLETO.localizacao.alvo,
    modelo: QUADRO_AREAS_COMPLETO.modelo,
    status: "preparada" as const,
    observacao: "NÃO está em RECEITAS — nunca chama Gemini, nunca processa documento real, nunca gera sugestão automática. Definida em lib/visao/quadroAreas.ts, com parser e comparador (lib/visao/quadroAreasComparacao.ts) testados só com fixture sintética (scripts/testar_quadro_areas.mts).",
    cobertura: [
      "área do terreno, área construída total, área permeável, área impermeável, área a regularizar (quando declarada)",
      "áreas por pavimento — lista de tamanho variável, uma linha por pavimento declarado no quadro, nunca inventada",
      "classificação do tipo de quadro encontrado (quadro de áreas / memorial de cálculo / tabela mista / ambíguo)",
      "texto bruto de evidência (transcrição do quadro, pra conferência humana)",
      "confiança por campo e por linha de pavimento",
      "sinalização determinística de necessidade de conferência humana (nunca decidida pelo modelo)",
    ],
    limitacoes: [
      "faixa de plausibilidade das áreas (1 a 500.000 m²) é provisória — não calibrada contra dado real ainda",
      "sem regra de coerência entre os campos (ex.: impermeável ≤ terreno) — exigiria assumir uma relação jurídica que este desenho não tem autoridade pra fixar",
      "comparação × MAC está preparada na função, mas sem fonte real: nenhum item MAC guarda valor numérico de área hoje",
      "reutilizável por outros slots em tese (papel/chaves não dependem de Slot 5), mas só Slot 5 tem hoje o mecanismo de upload/papel de documento que alimentaria isto",
      "para ativar: registrar as chaves na matriz (lib/rastreabilidade/lipSlot5.ts) e mover a receita pra dentro de RECEITAS — nenhuma das duas coisas foi feita",
    ],
  }];

  return NextResponse.json({ ok: true, data: { ativas, preparadas } });
}
