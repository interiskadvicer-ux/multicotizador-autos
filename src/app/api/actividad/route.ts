import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { filtrosActividadDesdeUrl, listarActividad } from "@/lib/activity";

export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const registros = listarActividad(filtrosActividadDesdeUrl(req));
  return NextResponse.json({ registros });
}
