/**
 * lib/urbi/radarJob.ts — Radar silencioso independente de sessão/navegador (rodada isolada,
 * 05/09/2026).
 *
 * ── AUDITORIA (mesma data, só leitura, script descartável) ────────────────────────────────────
 * Confirmado: `pg_cron`/`pg_net` estavam DISPONÍVEIS no projeto Supabase (não instalados) — é o
 * mecanismo NATIVO da própria plataforma pra "chamar uma rota HTTP em agenda", sem inventar
 * worker externo nem biblioteca nova. `supabase_vault` já estava instalado, usado pra nunca
 * gravar o segredo do job em texto puro em arquivo versionado algum.
 *
 * ACHADO REAL (antes desta rodada): o Radar já existia (Camada 1), mas os ticks só disparavam de
 * `components/urbi/UrbiGlobal.tsx` — client-side, exigindo alguém com sessão válida numa aba
 * aberta. Sem isso, o Radar simplesmente não rodava. Esta rodada substitui essa dependência por
 * `cron.schedule` (dentro do próprio Postgres) chamando esta função via `/api/urbi/radar/job`,
 * autenticado por SEGREDO COMPARTILHADO (nunca sessão humana, nunca cookie) — ver
 * `URBI_RADAR_CRON_SECRET`.
 *
 * Reaproveita 100% da lógica factual já existente (`detectarMudancas`/`processarProximoPendente`,
 * lib/urbi/radar.ts) — nada novo é calculado aqui, só o "quando/como disparar" muda. Nunca chama
 * Gemini, nunca escreve em LIP/MAC/MDP/documento/despacho/numeração.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectarMudancas, processarProximoPendente, limparRetratosDeProcessosExcluidos, type VisibilidadeUsuario, type StatusRadar } from "./radar";

/** Cadência real do agendamento (ver script de aplicação do cron) — usado só pra declarar
 *  "pode estar atrasada" com uma tolerância (3x a cadência), nunca como prazo prometido. */
const CADENCIA_ESPERADA_MIN = 1;
const TOLERANCIA_ATRASO_MIN = CADENCIA_ESPERADA_MIN * 3;

/** Conta técnica do job — nunca uma sessão humana. `irrestrito:true` faz `processosVisiveis()`
 *  ignorar `userId` por completo (mesmo caminho de código já usado por Admin/Diretora). */
export const USUARIO_SISTEMA: VisibilidadeUsuario = {
  userId: "urbi-radar-sistema", irrestrito: true, gerencia: null, perfis: ["Sistema"],
};

const MAX_ITENS_PADRAO = 10;
const MAX_MS_PADRAO = 20_000;
/** Lock travado por mais tempo que isto é tratado como morto (processo interrompido sem liberar
 *  o próprio lock) — bem acima do teto de tempo de uma execução normal (MAX_MS_PADRAO). */
const LIMITE_LOCK_MS = 5 * 60_000;

export type ResultadoJobRadar =
  | { ok: true; executado: false; motivo: string }
  | { ok: true; executado: true; detectados: number; enfileirados: number; processados: number; falhas: number }
  | { ok: false; erro: string };

/** Mensagem sanitizada — nunca stack trace bruto, nunca payload/conteúdo de processo. */
function sanitizarErro(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e);
  return bruto.slice(0, 300).replace(/\n/g, " ");
}

async function liberarLockExpirado(): Promise<void> {
  await supabaseAdmin.from("urbi_radar_execucoes")
    .update({ estado: "erro", concluido_em: new Date().toISOString(), erro: "lock expirado — execução anterior não finalizou a tempo" })
    .eq("estado", "em_execucao")
    .lt("iniciado_em", new Date(Date.now() - LIMITE_LOCK_MS).toISOString());
}

/**
 * Uma execução do job: detecta mudanças (lote, já existente) + processa até `maxItens` itens da
 * fila ou `maxMs` de tempo, o que vier primeiro — nunca uma varredura completa da Pilha inteira
 * numa chamada só. Lock via índice único parcial em `urbi_radar_execucoes` (estado='em_execucao')
 * impede duas execuções simultâneas; uma segunda chamada concorrente sai imediatamente sem
 * processar nada, nunca derruba a que já está rodando.
 */
export async function executarJobRadar(opts?: { maxItens?: number; maxMs?: number }): Promise<ResultadoJobRadar> {
  const maxItens = opts?.maxItens ?? MAX_ITENS_PADRAO;
  const maxMs = opts?.maxMs ?? MAX_MS_PADRAO;

  await liberarLockExpirado();

  const { data: lock, error: erroLock } = await supabaseAdmin
    .from("urbi_radar_execucoes")
    .insert({ estado: "em_execucao", origem: "cron" })
    .select("id")
    .single();

  if (erroLock) {
    if ((erroLock as any).code === "23505") return { ok: true, executado: false, motivo: "já há uma execução em andamento" };
    return { ok: false, erro: sanitizarErro(erroLock.message) };
  }
  const execucaoId = lock.id as string;
  const inicio = Date.now();

  try {
    // Fase 3 — processo excluído sai da cobertura: limpa qualquer linha 'pendente'/
    // 'em_atualizacao' órfã (processo excluído depois de enfileirado) antes de detectar de novo.
    await limparRetratosDeProcessosExcluidos();

    const { verificados, enfileirados } = await detectarMudancas(USUARIO_SISTEMA, 200);

    let processados = 0, falhas = 0;
    while (processados + falhas < maxItens && Date.now() - inicio < maxMs) {
      const r = await processarProximoPendente(USUARIO_SISTEMA);
      if (!r.processado) break; // fila vazia — nada mais a fazer agora
      if (r.estado === "erro") falhas++; else processados++;
    }

    await supabaseAdmin.from("urbi_radar_execucoes").update({
      estado: "concluido", concluido_em: new Date().toISOString(),
      detectados: verificados, enfileirados, processados, falhas,
    }).eq("id", execucaoId);

    return { ok: true, executado: true, detectados: verificados, enfileirados, processados, falhas };
  } catch (e) {
    const erro = sanitizarErro(e);
    await supabaseAdmin.from("urbi_radar_execucoes").update({
      estado: "erro", concluido_em: new Date().toISOString(), erro,
    }).eq("id", execucaoId);
    return { ok: false, erro };
  }
}

export type EstadoJobRadar = {
  ultima_execucao: { iniciado_em: string; concluido_em: string | null; estado: string; detectados: number | null; enfileirados: number | null; processados: number | null; falhas: number | null; erro: string | null } | null;
  execucoes_recentes: { iniciado_em: string; concluido_em: string | null; estado: string; processados: number | null; falhas: number | null }[];
  em_execucao_agora: boolean;
};

/** Só leitura — usado por /admin/urbi (transparência) e pelo cartão da Home/Pilha. */
export async function obterEstadoJobRadar(): Promise<EstadoJobRadar> {
  const { data } = await supabaseAdmin
    .from("urbi_radar_execucoes")
    .select("iniciado_em, concluido_em, estado, detectados, enfileirados, processados, falhas, erro")
    .order("iniciado_em", { ascending: false })
    .limit(20);
  const linhas = (data ?? []) as any[];
  return {
    ultima_execucao: linhas[0] ?? null,
    execucoes_recentes: linhas.slice(0, 10),
    em_execucao_agora: linhas.some((l) => l.estado === "em_execucao"),
  };
}

/**
 * Cartão curto pra Home/Pilha (OnMount) — combina cobertura de retratos (StatusRadar, já
 * existente) com o estado do JOB de servidor (quando ele rodou de fato), pra declarar
 * honestamente quando o agendamento parece atrasado ou indisponível, em vez de só mostrar a
 * cobertura como se o job estivesse rodando normalmente.
 */
export function formatarCartaoRadarComJob(status: StatusRadar, job: EstadoJobRadar): string {
  if (status.totalVisiveis === 0) return "Pré-análise da Pilha: nenhum processo visível pra pré-analisar agora.";

  const ultima = job.ultima_execucao;
  if (!ultima) {
    return `Pré-análise da Pilha: o job de servidor ainda não rodou nenhuma vez (agendamento indisponível ou recém-configurado) — ${status.comRetratoAtualizado} de ${status.totalVisiveis} processos com retrato pronto. Gemini não foi acionado.`;
  }

  const referencia = ultima.concluido_em ?? ultima.iniciado_em;
  const minutosDesde = (Date.now() - new Date(referencia).getTime()) / 60_000;
  const atrasado = minutosDesde > TOLERANCIA_ATRASO_MIN;
  const quando = new Date(referencia).toLocaleString("pt-BR");
  const parcial = status.comRetratoAtualizado < status.totalVisiveis;

  const base = `Pré-análise de servidor — última execução em ${quando} (${status.comRetratoAtualizado} de ${status.totalVisiveis} processos com retrato pronto). Gemini não foi acionado.`;
  const avisos: string[] = [];
  if (atrasado) avisos.push(`ATRASADA — sem execução concluída há ${Math.round(minutosDesde)} min (esperado a cada ${CADENCIA_ESPERADA_MIN} min).`);
  if (parcial) avisos.push(`Cobertura PARCIAL — ${status.pendentes} processo(s) ainda na fila.`);
  return avisos.length > 0 ? `${base} ${avisos.join(" ")}` : base;
}
