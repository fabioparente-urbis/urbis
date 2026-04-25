import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: 'Use /api/upload/presign' }, { status: 410 })
}