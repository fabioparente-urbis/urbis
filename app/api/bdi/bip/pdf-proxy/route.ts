import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { autenticar } from '@/lib/auth'
import { AwsClient } from 'aws4fetch'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (auth instanceof NextResponse) return auth

  const leiId = req.nextUrl.searchParams.get('lei_id')
  if (!leiId) return new NextResponse('lei_id obrigatorio', { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('bdi_documentos_lei')
    .select('url_pdf')
    .eq('id', leiId)
    .single()

  if (error || !data?.url_pdf) return new NextResponse('PDF nao encontrado', { status: 404 })

  const aws = new AwsClient({
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    region: 'auto',
    service: 's3',
  })

  const r2Res = await aws.fetch(data.url_pdf, { method: 'GET' })

  if (!r2Res.ok) {
    const txt = await r2Res.text().catch(() => '')
    return new NextResponse('Erro R2: ' + r2Res.status + ' ' + txt.slice(0, 300), { status: 502 })
  }

  const buffer = await r2Res.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(buffer.byteLength),
    },
  })
}
