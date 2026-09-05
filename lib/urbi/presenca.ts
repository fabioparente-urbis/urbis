/**
 * lib/urbi/presenca.ts — telemetria NEUTRA de presença no URBIS (rodada isolada, 05/09/2026).
 *
 * Único significado permitido: houve ou não interação recente com o URBIS. NUNCA
 * "produtividade", "ocioso" ou "analista não está trabalhando" — fechar a aba, expirar a sessão
 * ou perder conexão nunca vira conclusão nenhuma aqui, só ausência de novo evento.
 *
 * Separado de propósito de `urbis_sessoes`/`/api/sessao/*` (essa mede tempo pra MRP) — este
 * módulo nunca lê nem escreve naquela tabela, e o contrário também nunca acontece.
 *
 * Só duas transições existem — dedupe é sempre contra o ÚLTIMO evento do MESMO usuário: se já
 * for do mesmo tipo, não insere de novo (satisfaz "não duplicar enquanto o estado não mudar").
 * Nunca chama Gemini, nunca lê LIP/MAC/documento/conversa.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TipoEventoPresenca = "sem_interacao_urbis" | "interacao_retomada";
const TIPOS_VALIDOS: TipoEventoPresenca[] = ["sem_interacao_urbis", "interacao_retomada"];

export type ResultadoRegistroPresenca =
  | { ok: true; inserido: boolean }
  | { ok: false; erro: string };

/** Registra uma transição de presença, com dedupe contra o último evento deste usuário. */
export async function registrarEventoPresenca(
  usuarioId: string,
  tipo: string,
  sessaoEfemera?: string | null,
): Promise<ResultadoRegistroPresenca> {
  if (!TIPOS_VALIDOS.includes(tipo as TipoEventoPresenca)) {
    return { ok: false, erro: "tipo de evento inválido" };
  }

  const { data: ultimo, error: erroUltimo } = await supabaseAdmin
    .from("urbi_presenca_eventos")
    .select("tipo_evento")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimo) return { ok: false, erro: erroUltimo.message };

  if (ultimo?.tipo_evento === tipo) {
    return { ok: true, inserido: false }; // mesmo estado — não duplica
  }

  const { error: erroInsert } = await supabaseAdmin.from("urbi_presenca_eventos").insert({
    usuario_id: usuarioId,
    tipo_evento: tipo,
    sessao_efemera: sessaoEfemera && typeof sessaoEfemera === "string" ? sessaoEfemera.slice(0, 100) : null,
    origem: "web",
    versao_contrato: 1,
  });
  if (erroInsert) return { ok: false, erro: erroInsert.message };
  return { ok: true, inserido: true };
}

export type EventoPresencaAdmin = {
  usuario_id: string;
  usuario_nome: string | null;
  tipo_evento: TipoEventoPresenca;
  criado_em: string;
};

type EstadoPresenca = "interação recente" | "sem interação há mais de 30 min";

export type EstadoPresencaUsuario = {
  usuario_id: string;
  usuario_nome: string | null;
  ultimo_tipo: TipoEventoPresenca;
  ultimo_evento_em: string;
  estado: EstadoPresenca;
};

function estadoDoTipo(tipo: TipoEventoPresenca): EstadoPresenca {
  return tipo === "sem_interacao_urbis" ? "sem interação há mais de 30 min" : "interação recente";
}

/**
 * Só leitura, sem checar perfil — a rota admin decide quem pode ver (mesmo padrão de
 * lib/urbi/radar.ts: a função é dado puro, a autorização mora na rota). Nunca calcula nada além
 * de "qual foi o último evento de cada usuário" — não soma tempo, não rankeia, não compara.
 */
export async function obterPresencaUrbi(limiteEventos = 50): Promise<{
  ultimos_eventos: EventoPresencaAdmin[];
  por_usuario: EstadoPresencaUsuario[];
}> {
  const { data: eventos } = await supabaseAdmin
    .from("urbi_presenca_eventos")
    .select("usuario_id, tipo_evento, criado_em, usuarios(nome)")
    .order("criado_em", { ascending: false })
    .limit(500);

  const linhas = (eventos ?? []) as any[];
  const ultimosEventos: EventoPresencaAdmin[] = linhas.slice(0, limiteEventos).map((e) => ({
    usuario_id: e.usuario_id,
    usuario_nome: e.usuarios?.nome ?? null,
    tipo_evento: e.tipo_evento,
    criado_em: e.criado_em,
  }));

  const porUsuario = new Map<string, EstadoPresencaUsuario>();
  for (const e of linhas) {
    if (porUsuario.has(e.usuario_id)) continue; // já vimos o mais recente (ordenado desc)
    porUsuario.set(e.usuario_id, {
      usuario_id: e.usuario_id,
      usuario_nome: e.usuarios?.nome ?? null,
      ultimo_tipo: e.tipo_evento,
      ultimo_evento_em: e.criado_em,
      estado: estadoDoTipo(e.tipo_evento),
    });
  }

  return { ultimos_eventos: ultimosEventos, por_usuario: [...porUsuario.values()] };
}
