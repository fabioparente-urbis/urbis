import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { autenticar, verificarOwnership } from '@/lib/auth'

function normalizarTipo(tipo: unknown): "ACEITE" | "REGULARIZACAO" | "APROVACAO" | null {
  if (tipo === undefined || tipo === null || tipo === "") return null
  const t = String(tipo)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
  if (t === "ACEITE") return "ACEITE"
  if (t === "APROVACAO") return "APROVACAO"
  if (t === "REGULARIZACAO") return "REGULARIZACAO"
  return null
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('id')
  const tipo = normalizarTipo(searchParams.get('tipo'))

  if (!codigo) {
    return NextResponse.json({ ok: false, erro: 'ID não informado' }, { status: 400 })
  }

  // Com tipo: pega o único processo daquele par (codigo, tipo).
  // Sem tipo: mantém comportamento legado — primeira ocorrência (mais antiga).
  let query = supabase
    .from('processos')
    .select('id, dados, analista_id, tipo_processo, assunto_id')
    .eq('codigo', codigo)

  if (tipo) query = query.eq('tipo_processo', tipo)

  const { data, error } = await query.limit(1).maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, erro: 'Processo não encontrado' }, { status: 404 })
  }

  const ownerErr = verificarOwnership(auth, data.analista_id)
  if (ownerErr) return ownerErr

  // Sessão 4: retorna assunto_id para o ProcessoClient saber qual
  // conjunto de abas/campos do LIP carregar.
  return NextResponse.json({
    ok: true,
    data: {
      id: data.id,
      dados: data.dados,
      tipo_processo: data.tipo_processo,
      assunto_id: data.assunto_id,
    },
  })
}
