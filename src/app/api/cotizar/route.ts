import { NextResponse } from "next/server";
import type { CotizacionRequest } from "@/domain/types";
import { cotizarTodas } from "@/lib/quote-service";

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

  const resultados = await cotizarTodas(body);
  return NextResponse.json({ resultados });
}
