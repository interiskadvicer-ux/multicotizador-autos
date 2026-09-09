import { NextResponse } from "next/server";
import type { CotizacionRequest } from "@/domain/types";
import { cotizarPaquetes } from "@/lib/quote-service";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";

const PAQUETES_VALIDOS = new Set(["AMPLIA", "LIMITADA", "RC"]);

function esRequestValido(body: unknown): body is CotizacionRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (
    b.paquetes !== undefined &&
    (!Array.isArray(b.paquetes) ||
      !b.paquetes.every((p) => typeof p === "string" && PAQUETES_VALIDOS.has(p)))
  ) {
    return false;
  }
  if (
    b.aseguradoras !== undefined &&
    (!Array.isArray(b.aseguradoras) ||
      !b.aseguradoras.every((a) => typeof a === "string"))
  ) {
    return false;
  }
  const v = b.vehiculo as Record<string, unknown> | undefined;
  const c = b.conductor as Record<string, unknown> | undefined;
  if (!v || !c) return false;
  return (
    typeof v.marca === "string" &&
    typeof v.modelo === "string" &&
    typeof v.anio === "number" &&
    typeof v.cp === "string" &&
    typeof c.fechaNacimiento === "string" &&
    typeof b.paquete === "string" &&
    PAQUETES_VALIDOS.has(b.paquete)
  );
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([
    "ADMIN",
    "POLIZAS",
    "COTIZADOR",
  ]);
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo JSON inválido." },
      { status: 400 },
    );
  }

  if (!esRequestValido(body)) {
    return NextResponse.json(
      { error: "Faltan campos requeridos en la solicitud de cotización." },
      { status: 422 },
    );
  }

  const resultados = await cotizarPaquetes(body);
  const paquetes = body.paquetes?.length ? body.paquetes : [body.paquete];
  const alcance = body.aseguradoras?.length
    ? ` [${body.aseguradoras.join(", ")}]`
    : "";
  registrarActividad(
    sesion,
    "COTIZAR",
    `Cotizó ${body.vehiculo.marca} ${body.vehiculo.modelo} ${body.vehiculo.anio} (${paquetes.join("/")})${alcance}`,
  );
  return NextResponse.json({ resultados });
}
