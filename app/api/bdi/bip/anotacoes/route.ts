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
    .from('bip_anotacoes_usuario')
    .select('pagina, camada_vetorial, clipes_marcadores')
    .eq('lei_id', leiId)
    .eq('usuario_id', auth.userId)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { lei_id, pagina, camada_vetorial, clipes_marcadores } = body
  if (!lei_id || pagina === undefined) return NextResponse.json({ ok: false, erro: 'lei_id e pagina obrigatórios.' }, { status: 400 })
  const payload: any = { usuario_id: auth.userId, lei_id, pagina }
  if (camada_vetorial !== undefined) payload.camada_vetorial = camada_vetorial
  if (clipes_marcadores !== undefined) payload.clipes_marcadores = clipes_marcadores
  const { error } = await supabaseAdmin
    .from('bip_anotacoes_usuario')
    .upsert(payload, { onConflict: 'usuario_id,lei_id,pagina' })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
