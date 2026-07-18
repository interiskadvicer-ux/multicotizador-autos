import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSesion } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/session";
import { registrarActividad } from "@/lib/activity";

export async function POST() {
  const sesion = await getSesion();
  if (sesion) {
    registrarActividad(sesion, "LOGOUT", "Cierre de sesión");
  }
  cookies().delete(COOKIE_SESION);
  return NextResponse.json({ ok: true });
}
