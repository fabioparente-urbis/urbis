/**
 * lib/urbi/atendimento.ts — "atendimento ativo" (Fase 2, 05/09/2026): enquanto um analista tem o
 * URBI aberto DENTRO de um processo específico, o job de servidor do Radar evita reprocessar
 * (recalcular dossiê/motor para) ESSE processo — nunca pausa o Radar inteiro, só aquele código.
 *
 * Expira por LEASE técnico: o cliente renova periodicamente enquanto a tela continua aberta; se
 * parar de renovar (navegador fechado/travado, sem aviso), o lease expira sozinho — nunca fica
 * pausado pra sempre. Totalmente separado de lib/urbi/presenca.ts (telemetria de presença
 * humana) — nunca lido/escrito por aquele módulo nem pelo contrário.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DURACAO_LEASE_MS = 3 * 60_000; // renovação esperada a cada ~60s no cliente — folga de 3x.

export async function iniciarOuRenovarAtendimento(usuarioId: string, processoCodigo: string): Promise<void> {
  const expiraEm = new Date(Date.now() + DURACAO_LEASE_MS).toISOString();
  await supabaseAdmin.from("urbi_atendimento_ativo").upsert(
    { processo_codigo: processoCodigo, usuario_id: usuarioId, expira_em: expiraEm, atualizado_em: new Date().toISOString() },
    { onConflict: "processo_codigo" },
  );
}

export async function finalizarAtendimento(processoCodigo: string): Promise<void> {
  await supabaseAdmin.from("urbi_atendimento_ativo").delete().eq("processo_codigo", processoCodigo);
}

/** Só os códigos com lease AINDA válido — usado pelo job pra pular esses processos nesta rodada. */
export async function obterProcessosEmAtendimento(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("urbi_atendimento_ativo")
    .select("processo_codigo")
    .gt("expira_em", new Date().toISOString());
  return new Set((data ?? []).map((r: any) => r.processo_codigo));
}
