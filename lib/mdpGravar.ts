// ============================================================
// Server-only: grava um registro MDP após a emissão do Laudo.
//
// Por que existe: o CLAUDE.md manda todo módulo principal disparar para
// TODOS os satélites, e o Laudo era o furo — alimentava MRP, MAP e a tag
// do processo, mas nunca o MDP. O resultado é que `lipDocumentosEmitidos`
// nunca via o laudo e o registro do que SAIU ficava incompleto.
//
// O despacho grava no MDP pelo cliente (POST /api/mdp). O Laudo é gerado
// inteiro no servidor e devolve o arquivo na resposta, então grava daqui,
// espelhando o payload daquela rota.
//
// Falhas são silenciosas: o laudo NÃO deve quebrar se o MDP estiver fora.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizarBusca } from "@/lib/texto";
import { resolverUsuarioIdPorCookie } from "@/lib/auth";

export type GravarMDPLaudoInput = {
  processo_codigo: string;
  assunto_id?: string | null;
  numero_analise?: number | null;
  interessado?: string | null;
  cookie_header: string; // request.headers.get('cookie')
};

export async function gravarRegistroMDPLaudo(
  input: GravarMDPLaudoInput,
): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const usuarioId = await resolverUsuarioIdPorCookie(input.cookie_header);
    if (!usuarioId) return { ok: false, motivo: "sessão inválida" };

    const interessado =
      typeof input.interessado === "string" && input.interessado.trim()
        ? input.interessado.trim()
        : null;

    const analise = input.numero_analise ?? null;

    // Reemissão: o Laudo não consome número da faixa, então não há `numero`
    // para servir de chave como no despacho. O par (processo, análise) é o
    // que identifica o mesmo laudo — regerar a mesma análise atualiza a
    // linha em vez de criar uma segunda.
    if (analise !== null) {
      const { data: existente } = await supabaseAdmin
        .from("mdp_registros")
        .select("id")
        .eq("processo_codigo", input.processo_codigo)
        .eq("tipo", "laudo")
        .eq("conteudo->>numero_analise", String(analise))
        .maybeSingle();

      if (existente?.id) {
        await supabaseAdmin
          .from("mdp_registros")
          .update({ data_despacho: new Date().toISOString().slice(0, 10), usuario_id: usuarioId })
          .eq("id", existente.id);
        return { ok: true, motivo: "reemissão" };
      }
    }

    const { error } = await supabaseAdmin.from("mdp_registros").insert({
      processo_codigo: input.processo_codigo,
      assunto_id: input.assunto_id ?? null,
      interessado,
      busca_norm: normalizarBusca(interessado, input.processo_codigo),
      tipo: "laudo",
      numero: null,
      destinatario: null,
      data_despacho: new Date().toISOString().slice(0, 10),
      conteudo: { numero_analise: analise },
      usuario_id: usuarioId,
    });

    if (error) return { ok: false, motivo: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motivo: e?.message ?? "erro desconhecido" };
  }
}
