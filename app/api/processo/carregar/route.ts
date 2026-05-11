import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { autenticar, verificarOwnership } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('id')

  if (!codigo) {
    return NextResponse.json({ ok: false, erro: 'ID não informado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('processos')
    .select('id, dados, analista_id')
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, erro: 'Processo não encontrado' }, { status: 404 })
  }

  const ownerErr = verificarOwnership(auth, data.analista_id)
  if (ownerErr) return ownerErr

  // Mantem o shape original da resposta (sem expor analista_id)
  return NextResponse.json({ ok: true, data: { id: data.id, dados: data.dados } })
}