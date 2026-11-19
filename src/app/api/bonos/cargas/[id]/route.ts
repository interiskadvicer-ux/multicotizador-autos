import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { actualizarPonderado, eliminarCarga, listarCargas } from "@/lib/bonos/repositorio";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    actualizarPonderado(Number(params.id), Number(body.ponderado));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  return NextResponse.json({ cargas: listarCargas() });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  eliminarCarga(Number(params.id));
  return NextResponse.json({ cargas: listarCargas() });
}
