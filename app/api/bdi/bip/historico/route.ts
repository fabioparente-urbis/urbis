import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { autenticar } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth
  const leiId = req.nextUrl.searchParams.get('lei_id')
  if (!leiId) return NextResponse.json({ ok: false, erro: 'lei_id obrigatório.' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('bip_historico_anotacoes')
    .select('id, acao, pagina, elemento_id, criado_em')
    .eq('lei_id', leiId)
    .eq('usuario_id', auth.userId)
    .order('criado_em', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { lei_id, acao, pagina, elemento_id } = body
  if (!lei_id || !acao) return NextResponse.json({ ok: false, erro: 'lei_id e acao obrigatórios.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('bip_historico_anotacoes').insert({
    usuario_id: auth.userId, lei_id, acao,
    pagina: pagina ?? null, elemento_id: elemento_id ?? null,
  })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
