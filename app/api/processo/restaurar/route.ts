import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar, verificarOwnership } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const { auditoria_id, codigo } = body

    if (!auditoria_id || !codigo) {
      return NextResponse.json(
        { ok: false, erro: 'auditoria_id e codigo são obrigatórios' },
        { status: 400 }
      )
    }

    // Busca o evento de auditoria
    const { data: evento, error: erroEvento } = await supabaseAdmin
      .from('auditoria_log')
      .select('dados_antes, registro_id')
      .eq('id', auditoria_id)
      .maybeSingle()

    if (erroEvento || !evento) {
      return NextResponse.json(
        { ok: false, erro: 'Evento de auditoria não encontrado' },
        { status: 404 }
      )
    }

    // Verifica ownership do processo alvo do restore
    const { data: processo, error: erroProcesso } = await supabaseAdmin
      .from('processos')
      .select('analista_id')
      .eq('id', evento.registro_id)
      .maybeSingle()

    if (erroProcesso || !processo) {
      return NextResponse.json(
        { ok: false, erro: 'Processo não encontrado' },
        { status: 404 }
      )
    }

    const ownerErr = verificarOwnership(auth, processo.analista_id)
    if (ownerErr) return ownerErr

    const dadosRestaurar = evento.dados_antes?.dados
    if (!dadosRestaurar) {
      return NextResponse.json(
        { ok: false, erro: 'Snapshot não disponível para este evento' },
        { status: 400 }
      )
    }

    // Aplica o snapshot como novo estado
    const { error: erroUpdate } = await supabaseAdmin
      .from('processos')
      .update({
        dados: dadosRestaurar,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', evento.registro_id)

    if (erroUpdate) {
      return NextResponse.json(
        { ok: false, erro: erroUpdate.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, dados: dadosRestaurar })

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: e?.message || 'Erro interno' },
      { status: 500 }
    )
  }
}