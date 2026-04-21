import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const codigo = searchParams.get('id')

  if (!codigo) {
    return NextResponse.json({ ok: false, erro: 'ID não informado' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('processos')
    .select('id, dados')
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, erro: 'Processo não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, data })
}