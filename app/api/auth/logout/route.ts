import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("urbis_token");
  res.cookies.delete("urbis_perfil");
  res.cookies.delete("urbis_nome");
  res.cookies.delete("urbis_id");
  return res;
}
