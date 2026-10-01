import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { AfirmeError, AfirmeNoConfigurado } from "@/lib/afirme/client";
import { consultarPolizaAfirme } from "@/lib/afirme/polizas";

// Datos de una póliza Afirme ya emitida para autollenar el alta (solo lectura).
export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const numero = new URL(req.url).searchParams.get("numero")?.trim() ?? "";
  try {
    const consulta = await consultarPolizaAfirme(numero);
    registrarActividad(
      sesion,
      "AFIRME_CONSULTA",
      `Consultó en Afirme la póliza ${numero}`,
    );
    return NextResponse.json(consulta);
  } catch (err) {
    if (err instanceof AfirmeNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AfirmeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
