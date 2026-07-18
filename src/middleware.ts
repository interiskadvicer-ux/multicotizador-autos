import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESION, verificarToken } from "@/lib/session";

// Rutas de página públicas (no requieren sesión).
const RUTAS_PUBLICAS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_SESION)?.value;
  const sesion = token ? await verificarToken(token) : null;

  // Usuario autenticado que visita /login → mándalo al inicio.
  if (sesion && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (RUTAS_PUBLICAS.includes(pathname)) {
    return NextResponse.next();
  }

  // Resto de páginas requieren sesión.
  if (!sesion) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Aplica a páginas; excluye APIs (validan por su cuenta), estáticos y assets.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts).*)"],
};
