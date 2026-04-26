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

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' })
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`

    // PUT
    const putRes = await aws.fetch(endpoint, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': contentType, 'Content-Length': String(buffer.length) },
    })
    if (!putRes.ok) {
      const txt = await putRes.text()
      throw new Error(`R2 PUT retornou ${putRes.status}: ${txt}`)
    }

    // URL assinada GET via aws4fetch
    const expires = 3600
    const signedReq = await aws.sign(endpoint, {
      method: 'GET',
      aws: { signQuery: true },
    })
    const url = signedReq.url + `&X-Amz-Expires=${expires}`

    return NextResponse.json({ ok: true, key, url })
  } catch (error: any) {
    console.error('Erro no upload:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
