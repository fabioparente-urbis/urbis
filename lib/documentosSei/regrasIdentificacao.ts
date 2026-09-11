/**
 * lib/documentosSei/regrasIdentificacao.ts — Fase 4 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md.
 *
 * Carrega as regras de identificação (`ASSINATURAS_PECA` de pecas.ts,
 * `ASSINATURAS_CONTEUDO` de fatiar.ts) da tabela `documentos_sei_regras_identificacao`
 * em vez do array hardcoded, para o analista editar pela tela
 * (app/admin/regras-identificacao) sem depender de deploy.
 *
 * Cache em memória de processo (TTL curto) — evita 1 consulta ao banco por
 * página de PDF; uma regra nova vale em até `CACHE_MS` sem reiniciar nada.
 * Se o banco falhar ou a tabela estiver vazia, cai no array `padrao` do
 * próprio chamador (pecas.ts/fatiar.ts) — o caminho de leitura NUNCA para por
 * causa desta tabela, condição inegociável do plano (§6: "o caminho de leitura
 * que funciona hoje não é alterado em nenhuma fase").
 *
 * `supabaseAdmin` é importado DINAMICAMENTE (dentro do try), nunca no topo do arquivo: o módulo
 * dele cria o client Supabase na hora do import e derruba o processo se faltar variável de
 * ambiente (`supabaseUrl is required`). fatiar.ts/pecas.ts são usados por scripts standalone
 * (ex.: scripts/conferir_documentos_sei.mts) que a própria documentação promete rodar "sem .env" —
 * um import estático aqui quebraria essa promessa para todo script que só importa o fatiador.
 */

export type RegraRegex<P extends string> = { papel: P; re: RegExp };

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; regras: RegraRegex<any>[] }>();

export async function carregarRegras<P extends string>(
  tabela: "peca" | "conteudo",
  papeisValidos: ReadonlySet<P>,
  padrao: RegraRegex<P>[],
  compilar: (regexSource: string) => RegExp,
): Promise<RegraRegex<P>[]> {
  const cacheado = cache.get(tabela);
  if (cacheado && Date.now() - cacheado.at < CACHE_MS) return cacheado.regras;

  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data, error } = await supabaseAdmin
      .from("documentos_sei_regras_identificacao")
      .select("papel, regex")
      .eq("tabela", tabela)
      .eq("ativo", true)
      .order("ordem");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("nenhuma regra cadastrada no banco");

    const regras: RegraRegex<P>[] = [];
    for (const linha of data as { papel: string; regex: string }[]) {
      if (!papeisValidos.has(linha.papel as P)) continue; // papel que o código não conhece — nunca inventa comportamento
      try {
        regras.push({ papel: linha.papel as P, re: compilar(linha.regex) });
      } catch {
        // regex inválida cadastrada por engano — ignora só esta linha, não derruba a classificação inteira
      }
    }
    if (regras.length === 0) throw new Error("nenhuma regra válida sobrou depois de filtrar");

    cache.set(tabela, { at: Date.now(), regras });
    return regras;
  } catch (e) {
    console.error(`[regrasIdentificacao] falha ao carregar '${tabela}' do banco, usando padrão do código:`, e);
    // cacheia o fallback também, para não martelar o banco a cada página enquanto o erro persiste
    cache.set(tabela, { at: Date.now(), regras: padrao });
    return padrao;
  }
}

/** Para a tela de admin: uma regra salva/excluída passa a valer na próxima leitura, sem esperar o TTL. */
export function invalidarCacheRegras(tabela?: "peca" | "conteudo") {
  if (tabela) cache.delete(tabela);
  else cache.clear();
}
