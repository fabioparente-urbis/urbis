import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function gravarRegistroMRP({
  processo_codigo,
  tipo_processo,
  tipo_despacho,
  numero_despacho,
  analise_id,
  numero_revisao,
  cookie_header,
}: {
  processo_codigo: string;
  tipo_processo: string;
  tipo_despacho: string;
  numero_despacho: string | null;
  analise_id: string | null;
  numero_revisao: number | null;
  cookie_header: string;
}) {
  const { data: proc } = await supabase
    .from("processos")
    .select("dados, analista_id, tipo_processo")
    .eq("codigo", processo_codigo)
    .maybeSingle();

  const dados = (proc as any)?.dados || {};
  const analistaId = (proc as any)?.analista_id;

  let numero_analise: number | null = null;
  if (analise_id) {
    const { data: analise } = await supabase
      .from("analises")
      .select("numero_analise")
      .eq("id", analise_id)
      .maybeSingle();
    numero_analise = (analise as any)?.numero_analise ?? null;
  }

  const { data: tabela } = await supabase.from("mrp_pontuacao").select("*").order("ordem");
  const { calcularPontos } = await import("@/lib/mrp-pontuacao");
  const area = Number((dados?.areaTotal?.valor ?? "0").toString().replace(",", ".")) || 0;
  const pontos = tabela ? calcularPontos(tipo_despacho, area, tabela) : 2.5;

  const payload = {
    usuario_id: analistaId,
    processo_codigo,
    tipo_processo: "Regularização",
    interessado: dados?.proprietario?.valor ?? null,
    assunto: "Regularização",
    porte: area > 1000 ? "Grande Porte" : "Médio Porte",
    area_construida: area,
    bairro: dados?.bairro?.valor ?? null,
    numero_sei: dados?.processo?.valor ?? processo_codigo,
    numero_fisico: dados?.processoFisico?.valor ?? null,
    tipo_despacho,
    numero_despacho: numero_despacho || null,
    numero_analise,
    numero_revisao,
    data_despacho: new Date().toISOString(),
    pontos,
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    auto_gerado: true,
  };

  if (numero_despacho) {
    await supabase.from("mrp_registros")
      .upsert(payload, { onConflict: "usuario_id,numero_despacho", ignoreDuplicates: false })
      .select().maybeSingle();
  } else {
    await supabase.from("mrp_registros").insert(payload).select().maybeSingle();
  }

  console.log(`[MRP-AUTO] gravado: ${processo_codigo} | ${tipo_despacho} | pontos=${pontos}`);
}
