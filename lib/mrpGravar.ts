// ============================================================
// Server-only: grava um registro MRP automaticamente após a
// emissão de um despacho. Rede de segurança do lado do servidor —
// o cliente (page → /api/mrp/registros) também grava. Ambos usam
// a MESMA trava de unicidade real da tabela, (usuario_id,
// numero_despacho), então convergem para a MESMA linha (sem
// duplicar). Falhas são silenciosas: o despacho NÃO deve quebrar
// se o MRP estiver indisponível.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calcularPontos,
  extrairMetricasProcesso,
  type TipoDespacho,
} from "@/lib/mrp";

export type GravarRegistroInput = {
  processo_codigo: string;
  tipo_processo: string;
  tipo_despacho: TipoDespacho;
  numero_despacho?: string | null;
  analise_id?: string | null;     // id em analises_mac (preferido)
  cookie_header: string;           // request.headers.get('cookie')
  numero_revisao?: number | null;  // vindo do body se já souber
};

/**
 * Grava (upsert) um registro em mrp_registros. Falhas são silenciosas
 * — o despacho do MAC NÃO deve quebrar se o MRP estiver indisponível.
 * Retorna { ok, motivo? } só para logging.
 */
export async function gravarRegistroMRP(input: GravarRegistroInput): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const analistaId = input.cookie_header.match(/urbis_id=([^;]+)/)?.[1];
    if (!analistaId) return { ok: false, motivo: "sem urbis_id no cookie" };

    // 1) Carrega análise correspondente (para puxar numero_analise, criado_em)
    let analise: any = null;
    if (input.analise_id) {
      const { data } = await supabaseAdmin
        .from("analises_mac")
        .select("id, numero_analise, numero_revisao, criado_em, analista_id")
        .eq("id", input.analise_id).maybeSingle();
      analise = data;
    } else {
      const { data } = await supabaseAdmin
        .from("analises_mac")
        .select("id, numero_analise, numero_revisao, criado_em, analista_id")
        .eq("processo_codigo", input.processo_codigo)
        
        .order("numero_analise", { ascending: false })
        .limit(1).maybeSingle();
      analise = data;
    }

    // 2) Carrega processo + dados
    const { data: proc } = await supabaseAdmin
      .from("processos")
      .select("dados, analista_id, tipo_processo, numero_processo_fisico")
      .eq("codigo", input.processo_codigo)
      
      .maybeSingle();

    if (!proc) return { ok: false, motivo: "processo não encontrado" };

    const metricas = extrairMetricasProcesso((proc as any).dados);
    const pontos = calcularPontos(metricas.porte, metricas.area);
    const usuarioId = analise?.analista_id || (proc as any).analista_id || analistaId;
    const numeroRev = input.numero_revisao ?? analise?.numero_revisao ?? null;
    const agora = new Date();

    // 3) Upsert idempotente
    const payload = {
      usuario_id: usuarioId,
      processo_codigo: input.processo_codigo,
      tipo_processo: input.tipo_processo,
      interessado: metricas.interessado || null,
      assunto: metricas.assunto || null,
      porte: metricas.porte,
      area_construida: metricas.area,
      bairro: metricas.bairro || null,
      setor: metricas.setor || null,
      numero_sei: input.processo_codigo,
      numero_fisico: (proc as any).numero_processo_fisico || null,
      tipo_despacho: input.tipo_despacho,
      numero_despacho: input.numero_despacho ?? null,
      numero_analise: analise?.numero_analise ?? null,
      numero_revisao: numeroRev,
      data_inicio: analise?.criado_em ?? null,
      data_despacho: agora.toISOString(),
      pontos,
      mes: agora.getMonth() + 1,
      ano: agora.getFullYear(),
      auto_gerado: true,
    };

    // Só grava quando há numero_despacho: a ÚNICA trava de unicidade da
    // tabela é (usuario_id, numero_despacho) — a mesma que o cliente usa,
    // então o upsert converge para a MESMA linha (sem duplicar). Sem
    // numero_despacho não há chave de dedupe; não gravamos aqui para não
    // arriscar linha duplicada (esse caso fica a cargo do cliente).
    if (!input.numero_despacho) {
      return { ok: false, motivo: "sem numero_despacho — gravação delegada ao cliente" };
    }

    const { error } = await supabaseAdmin
      .from("mrp_registros")
      .upsert(payload, {
        onConflict: "usuario_id,numero_despacho",
        ignoreDuplicates: false,
      });

    if (error) return { ok: false, motivo: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motivo: e?.message ?? "erro desconhecido" };
  }
}
