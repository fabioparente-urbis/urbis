import { NextRequest, NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json()
    const key = `lip/${Date.now()}-${filename}`

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region: 'auto', service: 's3' })
    const endpoint = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`

    const putSigned = await aws.sign(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      aws: { signQuery: true },
    })

    const getSigned = await aws.sign(endpoint, {
      method: 'GET',
      aws: { signQuery: true },
    })

    return NextResponse.json({ url: putSigned.url, getUrl: getSigned.url, key })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
