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
import { resolverSlot } from "@/lib/assuntos";

export type GravarRegistroInput = {
  processo_codigo: string;
  tipo_processo: string;
  tipo_despacho: TipoDespacho;
  numero_despacho?: string | null;
  analise_id?: string | null;     // id em analises_mac (preferido)
  cookie_header: string;           // request.headers.get('cookie')
  numero_revisao?: number | null;  // vindo do body se já souber
  data_despacho?: string | null;   // data de emissão escolhida ("dd/mm/aaaa")
};

// "dd/mm/aaaa" → Date local ao meio-dia (evita escorregar de dia em UTC).
function parseDataBR(s?: string | null): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

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
      .select("dados, analista_id, tipo_processo, assunto_id, numero_processo_fisico")
      .eq("codigo", input.processo_codigo)
      
      .maybeSingle();

    if (!proc) return { ok: false, motivo: "processo não encontrado" };

    // Mesma resolução usada pelo caminho cliente (/api/mrp/registros) —
    // os dois fazem upsert na MESMA linha, então precisam concordar.
    const slot = await resolverSlot({
      processo_codigo: input.processo_codigo,
      tipo_processo: input.tipo_processo,
      assunto_id: (proc as any).assunto_id,
    });

    const metricas = extrairMetricasProcesso((proc as any).dados);
    const pontos = calcularPontos(metricas.porte, metricas.area);
    const usuarioId = analise?.analista_id || (proc as any).analista_id || analistaId;

    // Gerência de quem assina, congelada nesta data. Vem do cadastro do
    // usuário — nunca da obra. Se a pessoa mudar de lotação depois, os
    // despachos já emitidos continuam contando na gerência de origem.
    const { data: autor } = await supabaseAdmin
      .from("usuarios").select("gerencia").eq("id", usuarioId).maybeSingle();
    const gerencia = (autor as { gerencia?: string | null } | null)?.gerencia ?? null;
    const numeroRev = input.numero_revisao ?? analise?.numero_revisao ?? null;
    // Data de emissão escolhida no modal; sem ela, "agora".
    const agora = parseDataBR(input.data_despacho) ?? new Date();

    // 3) Upsert idempotente
    const payload = {
      usuario_id: usuarioId,
      processo_codigo: input.processo_codigo,
      tipo_processo: slot.slug ?? input.tipo_processo,
      assunto_id: slot.assunto_id,
      interessado: metricas.interessado || null,
      // Assunto da OBRA (extraído do LIP), não o nome do slot.
      assunto: metricas.assunto || null,
      porte: metricas.porte,   // PP | MP | GP — porte da edificação
      gerencia,                // GERECCO | GERAED | GERAGP — do analista
      area_construida: metricas.area,
      bairro: metricas.bairro || null,
      setor: metricas.setor || null,
      numero_sei: input.processo_codigo,
      numero_fisico: (proc as any).numero_processo_fisico
        || (proc as any).dados?.numero_processo_fisico?.valor
        || null,
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
