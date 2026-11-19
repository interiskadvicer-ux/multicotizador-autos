import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarActividad } from "@/lib/activity";

export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const usuarioId = params.get("usuarioId");
  const desde = params.get("desde");
  const hasta = params.get("hasta");

  const registros = listarActividad({
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  return NextResponse.json({ registros });
}
