/**
 * lib/profissionais/sincronizar.ts — sincronização ao vivo do módulo Profissionais.
 *
 * Achado real (08/09/2026, testando a Fase 3 do plano Assessor Ativo): `profissionais` e
 * `processo_profissionais` (migration `2026_07_16_create_profissionais.sql`) foram povoadas
 * UMA VEZ SÓ, por `scripts/backfill_profissionais.mjs`, e nunca mais atualizadas — qualquer
 * Responsável Técnico digitado ou corrigido num processo depois daquela carga nunca entra nesse
 * registro. Resultado: `/api/profissionais/historico` (e portanto a bolha `urbi:dica` E o
 * sinaleiro da Fase 3) nunca reconhece um RT novo, mesmo repetido em vários processos recentes.
 *
 * A própria migration já previa isso — `processo_profissionais.origem` aceita `'lip'` desde o
 * início, ao lado de `'backfill_jsonb'` e `'manual'`. Esta função é essa origem chegando: chamada
 * a cada `POST /api/processo/salvar` (todos os slots, mesmo campo LIP em todos), reaproveitando
 * EXATAMENTE a mesma extração/normalização/cascata de identidade que `scripts/backfill_profissionais.mjs`
 * e `app/api/profissionais/historico/route.ts` já usam — nunca uma regra nova.
 *
 * Nunca bloqueia nem falha o save do LIP: quem chama envolve isto em try/catch e ignora erro.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SENTINELAS = new Set([
  "NP", "N.P.", "N.P", "CAU-NP", "CREA-NP", "N/A", "NA", "-", "--", "",
  "NAO POSSUI", "NÃO POSSUI", "SEM", "SEM RESPONSAVEL", "SEM RESPONSÁVEL",
]);

function normalizarNome(nome: string): string {
  return nome
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ehSentinela(valor?: string | null): boolean {
  if (!valor) return true;
  const norm = valor.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return SENTINELAS.has(norm);
}

/** Mesmos 2 campos/papéis do backfill — únicos que o LIP guarda hoje (ver
 *  scripts/backfill_profissionais.mjs e ROTULO_PAPEL em app/api/profissionais/historico/route.ts). */
const CAMPOS_RT: { campo: string; papel: string }[] = [
  { campo: "nome_responsavel_arq", papel: "autor_arquiteto" },
  { campo: "nome_responsavel_eng", papel: "responsavel_engenheiro" },
];

function valorCampo(dados: Record<string, any>, chave: string): string {
  const v = dados?.[chave];
  return typeof v?.valor === "string" ? v.valor.trim() : "";
}

/** Chaves que a sincronização realmente lê — usado por quem chama pra decidir se vale a pena
 *  rodar (evita bater no banco a cada autosave de campo que não tem nada a ver com RT). */
const CHAVES_RELEVANTES = ["cau", "crea", "nome_responsavel_arq", "nome_responsavel_eng"];

/** Compara só as chaves relevantes entre o `dados` salvo antes e o novo — processo recém-criado
 *  (`anterior === null`) sempre precisa sincronizar, se tiver algo preenchido. */
export function precisaResincronizarProfissionais(
  anterior: Record<string, any> | null | undefined,
  novo: Record<string, any> | null | undefined,
): boolean {
  if (!novo) return false;
  if (!anterior) return CHAVES_RELEVANTES.some((c) => valorCampo(novo, c) !== "");
  return CHAVES_RELEVANTES.some((c) => valorCampo(anterior, c) !== valorCampo(novo, c));
}

/** Segue a cadeia de soft-merge até o profissional "vivo" — mesmo padrão e mesmo teto de voltas
 *  de app/api/profissionais/historico/route.ts, pra nunca gravar vínculo num registro fundido. */
async function resolverProfissionalVivo(id: string): Promise<string> {
  let atual = id;
  for (let voltas = 0; voltas < 5; voltas++) {
    const { data } = await supabaseAdmin
      .from("profissionais").select("id, merged_into_id").eq("id", atual).maybeSingle();
    if (!data?.merged_into_id) return atual;
    atual = data.merged_into_id;
  }
  return atual;
}

async function acharOuCriarProfissional(nome: string, cauValido: string | null, creaValido: string | null): Promise<string | null> {
  const nomeNorm = normalizarNome(nome);

  // Mesma cascata de identidade de app/api/profissionais/historico/route.ts: CAU > CREA > nome.
  let existente: { id: string; cau: string | null; crea: string | null } | null = null;
  if (cauValido) {
    const { data } = await supabaseAdmin.from("profissionais").select("id, cau, crea").eq("cau", cauValido).limit(1).maybeSingle();
    existente = data;
  }
  if (!existente && creaValido) {
    const { data } = await supabaseAdmin.from("profissionais").select("id, cau, crea").eq("crea", creaValido).limit(1).maybeSingle();
    existente = data;
  }
  if (!existente) {
    const { data } = await supabaseAdmin.from("profissionais").select("id, cau, crea").eq("nome_normalizado", nomeNorm).limit(1).maybeSingle();
    existente = data;
  }

  if (existente) {
    const profId = await resolverProfissionalVivo(existente.id);
    // Só PREENCHE CAU/CREA que faltarem — nunca sobrescreve um valor já gravado (dado real de
    // cadastro profissional não pode ser corrigido silenciosamente por um save de LIP).
    const patch: Record<string, string> = {};
    if (cauValido && !existente.cau) patch.cau = cauValido;
    if (creaValido && !existente.crea) patch.crea = creaValido;
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("profissionais").update({ ...patch, atualizado_em: new Date().toISOString() }).eq("id", profId);
    }
    return profId;
  }

  const { data, error } = await supabaseAdmin
    .from("profissionais")
    .insert({ nome_original: nome, nome_normalizado: nomeNorm, cau: cauValido, crea: creaValido })
    .select("id").maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/**
 * Chamada a cada save do LIP (`app/api/processo/salvar/route.ts`), com o `id` interno (UUID) do
 * processo e o `dados` recém-gravado. Sincroniza só os 2 campos de RT — mesmo escopo do backfill.
 */
export async function sincronizarProfissionaisDoLip(processoId: string, dados: Record<string, any> | null | undefined): Promise<void> {
  if (!dados || typeof dados !== "object") return;

  const cauBruto = valorCampo(dados, "cau");
  const creaBruto = valorCampo(dados, "crea");
  const cauValido = !ehSentinela(cauBruto) ? cauBruto.toUpperCase().trim() : null;
  const creaValido = !ehSentinela(creaBruto) ? creaBruto.toUpperCase().trim() : null;

  for (const { campo, papel } of CAMPOS_RT) {
    const nome = valorCampo(dados, campo);
    if (ehSentinela(nome)) continue;

    const profId = await acharOuCriarProfissional(nome, cauValido, creaValido);
    if (!profId) continue;

    // Nome mudou pra outra pessoa no mesmo papel deste processo: o vínculo anterior deixa de
    // estar ativo (nunca apagado — só sai da contagem de histórico), nunca fica "grudado" num
    // profissional que já não é mais o responsável ali.
    await supabaseAdmin
      .from("processo_profissionais")
      .update({ ativo: false })
      .eq("processo_id", processoId).eq("papel", papel).neq("profissional_id", profId).eq("ativo", true);

    const confianca = cauValido || creaValido ? "media" : "baixa"; // mesma regra do backfill: nunca "alta" sem CPF/CNPJ
    await supabaseAdmin
      .from("processo_profissionais")
      .upsert(
        {
          processo_id: processoId, profissional_id: profId, papel,
          origem: "lip", confianca, valor_original: nome, campo_original: campo, ativo: true,
        },
        { onConflict: "processo_id,profissional_id,papel" },
      );
  }
}
