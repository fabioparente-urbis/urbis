import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LABEL_CAMPO: Record<string, string> = {
  proprietario: "Proprietário", logradouro: "Logradouro", processo: "Processo Nº",
  quadra: "Quadra", lote: "Lote", bairro: "Bairro", iptu: "IPTU",
  areaTotal: "Área Total", areaForaFrontal: "Área fora do Frontal",
  areaVertical: "Área Vertical", areaRecuo: "Área em Recuo",
  areaTerreno: "Área do Terreno", areaImpermeavel: "Área Impermeável",
  despacho: "Despacho CHEADV", tipoUso: "Tipo de Uso do Solo",
  usoDefinido: "Uso sem definição", numeroUso: "Nº Uso para Aprovação",
  cnae1: "CNAE 1", cnae2: "CNAE 2", cnae3: "CNAE 3", cnae4: "CNAE 4", cnae5: "CNAE 5",
  corredor: "Corredor Viário", faixa: "Faixa de Ampliação", caixa: "Caixa de Recarga",
  volMin: "Vol. Mínimo da Caixa", volAt: "Vol. Atendido da Caixa", caixas: "Nº de Caixas",
  pav: "Nº de Pavimentos", unid: "Nº de Unidades", existente: "Área Existente Aprovada",
  outro: "Outro processo", qualOutro: "Nº do outro processo", pag: "Pág. SEI",
  embargo: "Embargo", dataEmb: "Data do Embargo", tombado: "Área tombada",
  procuracao: "Procuração", onerosa: "Onerosa",
  certidao: "Certidão de Matrícula", levantamento: "Levantamento / Arquitetura",
  artLev: "ART/RRT de Levantamento", artCx: "ART/RRT da Caixa",
  laudo: "Laudo Técnico", vistoria: "Vistoria Fiscal",
  usoSolo: "Uso do Solo para Aprovação", foto: "Foto do Google",
}

function diffDados(antes: any, depois: any): { campo: string; de: string; para: string }[] {
  if (!antes || !depois) return []
  const alterados: { campo: string; de: string; para: string }[] = []
  const todosCampos = new Set([...Object.keys(antes), ...Object.keys(depois)])
  for (const chave of todosCampos) {
    const valorAntes = antes[chave]?.valor ?? ''
    const valorDepois = depois[chave]?.valor ?? ''
    if (valorAntes !== valorDepois) {
      alterados.push({
        campo: LABEL_CAMPO[chave] ?? chave,
        de: valorAntes,
        para: valorDepois,
      })
    }
  }
  return alterados
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('id')

  if (!codigo) {
    return NextResponse.json({ ok: false, erro: 'ID não informado' }, { status: 400 })
  }

  // Busca o uuid do processo pelo codigo
  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from('processos')
    .select('id')
    .eq('codigo', codigo)
    .maybeSingle()

  console.log('[HISTORICO] codigo:', codigo)
  console.log('[HISTORICO] processo:', processo)
  console.log('[HISTORICO] erroProcesso:', erroProcesso)

  if (erroProcesso || !processo) {
    return NextResponse.json({ ok: true, data: [] })
  }

  // Busca o histórico no auditoria_log
  const { data, error } = await supabaseAdmin
    .from('auditoria_log')
    .select('id, operacao, dados_antes, dados_depois, criado_em')
    .eq('tabela', 'processos')
    .eq('registro_id', processo.id)
    .order('criado_em', { ascending: false })
    .limit(100)

  console.log('[HISTORICO] processo.id:', processo.id)
  console.log('[HISTORICO] erro auditoria:', error)
  console.log('[HISTORICO] registros encontrados:', data?.length)

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  const eventos = (data ?? []).map((ev) => {
    const dadosAntes = ev.dados_antes?.dados ?? null
    const dadosDepois = ev.dados_depois?.dados ?? null
    const campos = diffDados(dadosAntes, dadosDepois)
    return {
      id: ev.id,
      operacao: ev.operacao,
      criado_em: ev.criado_em,
      campos,
      snapshot: dadosAntes,
      meta: ev.dados_depois ?? null,
    }
  })

  return NextResponse.json({ ok: true, data: eventos })
}