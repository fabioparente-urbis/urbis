import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

    // Upload via aws4fetch
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`
    const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' })
    const res = await aws.fetch(endpoint, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': contentType, 'Content-Length': String(buffer.length) },
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`R2 retornou ${res.status}: ${txt}`)
    }

    // Gera URL assinada para GET (para o analisar baixar)
    const R2 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
    const url = await getSignedUrl(R2, new GetObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 3600 })

    return NextResponse.json({ ok: true, key, url })
  } catch (error: any) {
    console.error('Erro no upload:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
