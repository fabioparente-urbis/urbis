/**
 * lib/urbi/indeferimentoImovelDuplicado.ts — indeferimento automático quando o URBI detecta
 * que o imóvel já tem outra Regularização/Aceite SEI que conta (condição COND_IMOVEL_DUPLICADO,
 * ver lib/bdi/vigia.ts). Pedido do Fábio, 10/09/2026: "se já tem alvará de regularização, não
 * pode nem ser analisado, indeferir e pronto... o analista vai ver o URBI falando e vai aceitar.
 * O URBI cria o documento com o texto padrão e já põe pra baixar e tudo."
 *
 * Roda a partir de QUALQUER tela onde o card bloqueante do URBI aparece — LIP ou MAC (ver
 * components/urbi/UrbiGlobal.tsx) — reproduzindo o MESMO mecanismo que já existe no botão
 * manual "Baixar Indeferimento" das telas do MAC (app/analise-regularizacao e
 * app/analise-aceite-sei): número de parecer (peek), gera o .docx, registra em mdp_registros,
 * grava a tag no processo, só então consome o número (commit).
 *
 * A autorização é o próprio clique do analista no botão "Indeferir" do card — sem esse clique,
 * nada aqui roda (CLAUDE.md: "nunca emitir documento no lugar do analista"; o clique É a
 * autorização, pedido explícito do Fábio quando perguntado sobre isso).
 *
 * Client-side só (usa fetch de navegador e cria o link de download) — não roda no servidor.
 */

export const MOTIVO_IMOVEL_DUPLICADO =
  'Imóvel já possui Alvará de Regularização e/ou Aceite anterior — Conforme a Lei Complementar nº 314, de 05 de novembro de 2018, Artigo 8º, Parágrafo único: "O Alvará de Regularização e/ou Alvará de Aceite será concedido uma única vez para cada imóvel."';

export type ConflitoImovel = { codigo: string; tipoProcesso: string; status: string };

export type ResultadoIndeferimentoAutomatico =
  | { ok: true }
  | { ok: false; erro: string };

function rotasPorTipo(tipoProcesso: string): { despacho: string; analise: string } {
  const t = tipoProcesso.toLowerCase();
  return t.startsWith("regularizacao")
    ? { despacho: "/api/despacho-regularizacao", analise: "/api/analise-regularizacao" }
    : { despacho: "/api/despacho-aceite-sei", analise: "/api/analise-aceite-sei" };
}

export async function executarIndeferimentoImovelDuplicado(
  codigo: string,
  conflito: ConflitoImovel,
): Promise<ResultadoIndeferimentoAutomatico> {
  try {
    const resProc = await fetch(`/api/processos?busca=${encodeURIComponent(codigo)}`, { credentials: "include" });
    const jsonProc = await resProc.json().catch(() => null);
    const linha = jsonProc?.ok ? (jsonProc.data as any[]).find((p) => p.codigo === codigo) ?? jsonProc.data[0] : null;
    if (!linha) return { ok: false, erro: "Processo não encontrado." };
    const tipoProcesso = String(linha.tipo_processo ?? "");
    const assuntoId = linha.assunto_id ?? null;
    const { despacho: rotaDespacho, analise: rotaAnalise } = rotasPorTipo(tipoProcesso);

    // Análise em andamento, se houver — reproduz o padrão null-tolerante das telas do MAC
    // (indeferimento não exige checklist preenchido: "impossibilidade de análise" é justamente
    // não dar pra chegar a analisar).
    const resAn = await fetch(`${rotaAnalise}?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" });
    const jsonAn = await resAn.json().catch(() => null);
    const listaAnalises: any[] = jsonAn?.ok ? jsonAn.data : [];
    let analiseAtual: any = listaAnalises.length > 0 ? listaAnalises[0] : null;

    if (analiseAtual) {
      await fetch(rotaAnalise, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: analiseAtual.id,
          itens: analiseAtual.itens || {}, fontes: analiseAtual.fontes || {}, aceites: analiseAtual.aceites || {},
          observacoes: analiseAtual.observacoes || "", observacoes_por_aba: analiseAtual.observacoes_por_aba || {},
          status: "indeferido", numero_revisao: analiseAtual.numero_revisao ?? 0,
          historico_analises: analiseAtual.historico_analises || [],
        }),
      });
    } else {
      const resNova = await fetch(rotaAnalise, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: codigo, itens: {}, fontes: {}, aceites: {}, observacoes: "", observacoes_por_aba: {},
          status: "indeferido", modelo_id: "00000000-0000-0000-0000-000000000001",
        }),
      });
      const jsonNova = await resNova.json().catch(() => null);
      if (jsonNova?.ok) analiseAtual = jsonNova.data;
    }

    const peek = await fetch(`/api/numeracao/proximo?tipo=parecer&processo=${encodeURIComponent(codigo)}&modo=peek`, { credentials: "include" });
    const jPeek = await peek.json().catch(() => null);
    if (!jPeek?.ok) {
      return {
        ok: false,
        erro: jPeek?.esgotado
          ? "Faixa de pareceres esgotada. Acesse Configurações → Numeração para cadastrar nova faixa."
          : "Nenhuma faixa de parecer cadastrada. Acesse Configurações → Numeração.",
      };
    }
    const numeroParecer = String(jPeek.numero).padStart(3, "0");
    const dataEmissao = new Date().toLocaleDateString("pt-BR");

    const outroTipo = conflito.tipoProcesso.toLowerCase().startsWith("regularizacao") ? "Regularização SEI" : "Aceite SEI";
    const observacoes = `Detectado automaticamente pelo URBI: o processo ${conflito.codigo} (${outroTipo}, status ${conflito.status}) já trata do mesmo imóvel.`;

    const analisesHistorico = listaAnalises
      .slice()
      .sort((a, b) => a.numero_analise - b.numero_analise)
      .filter((a) => a.numero_analise <= (analiseAtual?.numero_analise ?? 1))
      .map((a) => ({ numero: a.numero_analise, data: a.data_despacho || a.data_parecer || dataEmissao, ultima: a.numero_analise === 5 }));

    const resDoc = await fetch(rotaDespacho, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processo: codigo, tipo: "indeferimento", numeroDespacho: numeroParecer,
        naoConformes: [MOTIVO_IMOVEL_DUPLICADO], observacoes, fotos: [],
        analises: analisesHistorico, assunto_id: assuntoId, data: dataEmissao,
      }),
    });
    if (!resDoc.ok) return { ok: false, erro: "Falha ao gerar o documento de indeferimento." };

    const blob = await resDoc.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `indeferimento_${codigo}.docx`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);

    // MDP e tag: fire-and-forget, mesmo padrão das telas do MAC — falha aqui não desfaz o
    // documento já baixado nem o número que está prestes a ser consumido.
    fetch("/api/mdp", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processo_codigo: codigo, assunto_id: assuntoId || null, tipo: "indeferimento",
        numero: numeroParecer, destinatario: null, data_despacho: dataEmissao,
        conteudo: { motivos: [MOTIVO_IMOVEL_DUPLICADO], observacoes },
      }),
    }).catch(() => {});

    fetch("/api/processo/tag", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo,
        tag: { tipo: "indeferimento", numero_analise: analiseAtual?.numero_analise, numero_despacho: numeroParecer, data: dataEmissao },
      }),
    }).catch(() => {});

    // Consome o número SOMENTE depois do documento pronto (CLAUDE.md) — com retry, mesmo padrão
    // das telas do MAC.
    const numCommit = parseInt(numeroParecer, 10);
    let commitOk = false;
    for (let t = 1; t <= 3 && !commitOk; t++) {
      try {
        const rc = await fetch(
          `/api/numeracao/proximo?tipo=parecer&processo=${encodeURIComponent(codigo)}&modo=commit&numero=${encodeURIComponent(numCommit)}&data=${encodeURIComponent(dataEmissao)}${analiseAtual?.id ? `&analise_id=${encodeURIComponent(analiseAtual.id)}&analise_numero=${analiseAtual.numero_analise}` : ""}`,
          { credentials: "include" },
        );
        if (rc.ok || rc.status === 409) { commitOk = true; break; }
      } catch { /* rede — tenta de novo */ }
      if (t < 3) await new Promise((r) => setTimeout(r, t * 800));
    }
    if (!commitOk) {
      return { ok: false, erro: "Documento gerado, mas a numeração de parecer não foi confirmada. Confira em Configurações → Numeração." };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro desconhecido." };
  }
}
