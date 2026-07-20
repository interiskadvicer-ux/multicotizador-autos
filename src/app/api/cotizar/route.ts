import { NextResponse } from "next/server";
import type { CotizacionRequest } from "@/domain/types";
import { cotizarTodas } from "@/lib/quote-service";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { jsonError, parseJsonBody } from "@/lib/http";

function esRequestValido(body: unknown): body is CotizacionRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const v = b.vehiculo as Record<string, unknown> | undefined;
  const c = b.conductor as Record<string, unknown> | undefined;
  if (!v || !c) return false;
  return (
    typeof v.marca === "string" &&
    typeof v.modelo === "string" &&
    typeof v.anio === "number" &&
    typeof v.cp === "string" &&
    typeof c.fechaNacimiento === "string" &&
    (b.paquete === "AMPLIA" || b.paquete === "LIMITADA" || b.paquete === "RC")
  );
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([
    "ADMIN",
    "POLIZAS",
    "COTIZADOR",
  ]);
  if (error) return error;

  const { data: body, error: bodyError } = await parseJsonBody(
    req,
    "Cuerpo JSON inválido.",
  );
  if (bodyError) return bodyError;

  if (!esRequestValido(body)) {
    return jsonError(
      "Faltan campos requeridos en la solicitud de cotización.",
      422,
    );
  }

  const resultados = await cotizarTodas(body);
  registrarActividad(
    sesion,
    "COTIZAR",
    `Cotizó ${body.vehiculo.marca} ${body.vehiculo.modelo} ${body.vehiculo.anio} (${body.paquete})`,
  );
  return NextResponse.json({ resultados });
}
