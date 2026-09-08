import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("urbis_token");
  // Sem apagar o refresh, o middleware reabriria a sessão no primeiro clique depois do "Sair" —
  // o logout precisa matar a capacidade de renovar, não só o token da vez (08/09/2026).
  res.cookies.delete("urbis_refresh");
  res.cookies.delete("urbis_perfil");
  res.cookies.delete("urbis_nome");
  res.cookies.delete("urbis_id");
  return res;
}
