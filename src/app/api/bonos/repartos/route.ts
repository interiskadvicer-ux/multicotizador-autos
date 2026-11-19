import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { eliminarReparto, guardarReparto, listarRepartos } from "@/lib/bonos/repositorio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    guardarReparto(Number(body.origenId), Number(body.destinoId), Number(body.porcentaje));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  return NextResponse.json({ repartos: listarRepartos() });
}

export async function DELETE(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  eliminarReparto(Number(new URL(req.url).searchParams.get("id")));
  return NextResponse.json({ repartos: listarRepartos() });
}
