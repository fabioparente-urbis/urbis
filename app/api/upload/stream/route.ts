import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'

export const runtime = 'nodejs'
export const maxDuration = 60

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const key = `lip/${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = new Upload({
      client: R2,
      params: {
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'application/pdf',
      },
    })

    await upload.done()

    const url = await getSignedUrl(
      R2,
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: key,
      }),
      { expiresIn: 3600 }
    )

    return NextResponse.json({ ok: true, key, url })
  } catch (error: any) {
    console.error('Erro no upload stream:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
