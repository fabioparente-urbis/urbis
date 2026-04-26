import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const key = `lip/${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!

    // Upload via fetch direto para API S3 do R2
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`

    const { AwsClient } = await import('aws4fetch')
    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'auto',
      service: 's3',
    })

    const res = await aws.fetch(endpoint, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': file.type || 'application/pdf' },
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`R2 retornou ${res.status}: ${txt}`)
    }

    return NextResponse.json({ ok: true, key, url: endpoint })
  } catch (error: any) {
    console.error('Erro no upload:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
