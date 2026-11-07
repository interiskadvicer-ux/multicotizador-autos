import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { ubicacionPorCp } from "@/lib/sepomex";

export async function GET(_req: Request, { params }: { params: { cp: string } }) {
  const { error } = await requireApiSesion();
  if (error) return error;
  const ubicacion = ubicacionPorCp(params.cp);
  if (!ubicacion) {
    return NextResponse.json({ error: "Código postal no encontrado." }, { status: 404 });
  }
  return NextResponse.json(ubicacion, {
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
