import { NextRequest, NextResponse } from "next/server";

const ROTAS_PUBLICAS = ["/login"];
const ROTAS_ADMIN = ["/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("urbis_token")?.value;
  const perfil = req.cookies.get("urbis_perfil")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (ROTAS_ADMIN.some((r) => pathname.startsWith(r))) {
    if (perfil !== "Administrador") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)"],
};
