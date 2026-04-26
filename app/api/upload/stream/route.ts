import { NextRequest, NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const filename = req.headers.get('x-filename') || 'arquivo.pdf'
    const contentType = req.headers.get('content-type') || 'application/pdf'

    const key = `lip/${Date.now()}-${filename}`
    const buffer = Buffer.from(await req.arrayBuffer())

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' })

    const res = await aws.fetch(endpoint, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': contentType },
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
