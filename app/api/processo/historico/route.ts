import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar, verificarOwnership } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fallback para chaves que não existem mais no LIP (processos antigos).
// O rótulo bom vem do próprio LIP do assunto — ver `rotulosDoAssunto`.
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

/**
 * Rótulos de campo lidos do LIP do assunto do processo. Sem isto, o
 * histórico mostrava a chave crua (`seiCheadv`, `unidComerciais`…) para
 * tudo que não estivesse no mapa fixo — que só conhece a Regularização.
 */
async function rotulosDoAssunto(assunto_id: string | null): Promise<Record<string, string>> {
  if (!assunto_id) return {}
  const { data: abas } = await supabaseAdmin
    .from('lip_abas').select('id').eq('assunto_id', assunto_id)
  const ids = (abas ?? []).map((a: any) => a.id)
  if (ids.length === 0) return {}
  const { data: campos } = await supabaseAdmin
    .from('lip_campos').select('chave, label').in('aba_id', ids)
  const mapa: Record<string, string> = {}
  for (const c of campos ?? []) if (c.chave && c.label) mapa[c.chave] = c.label
  return mapa
}

function diffDados(antes: any, depois: any, rotulos: Record<string, string>): { campo: string; de: string; para: string }[] {
  if (!antes || !depois) return []
  const alterados: { campo: string; de: string; para: string }[] = []
  const todosCampos = new Set([...Object.keys(antes), ...Object.keys(depois)])
  for (const chave of todosCampos) {
    const valorAntes = antes[chave]?.valor ?? ''
    const valorDepois = depois[chave]?.valor ?? ''
    if (valorAntes !== valorDepois) {
      alterados.push({
        campo: rotulos[chave] ?? LABEL_CAMPO[chave] ?? chave,
        de: valorAntes,
        para: valorDepois,
      })
    }
  }
  return alterados
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('id')

  if (!codigo) {
    return NextResponse.json({ ok: false, erro: 'ID não informado' }, { status: 400 })
  }

  // Busca o uuid do processo pelo codigo (e analista_id para checar ownership)
  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from('processos')
    .select('id, analista_id, assunto_id')
    .eq('codigo', codigo)
    .maybeSingle()

  console.log('[HISTORICO] codigo:', codigo)
  console.log('[HISTORICO] processo:', processo)
  console.log('[HISTORICO] erroProcesso:', erroProcesso)

  if (erroProcesso || !processo) {
    return NextResponse.json({ ok: true, data: [] })
  }

  const ownerErr = verificarOwnership(auth, processo.analista_id)
  if (ownerErr) return ownerErr

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

  const rotulos = await rotulosDoAssunto((processo as any).assunto_id ?? null)

  const eventos = (data ?? []).map((ev) => {
    const dadosAntes = ev.dados_antes?.dados ?? null
    const dadosDepois = ev.dados_depois?.dados ?? null
    const campos = diffDados(dadosAntes, dadosDepois, rotulos)
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