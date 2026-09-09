import { NextResponse } from "next/server";
import type {
  CoberturasPersonalizadas,
  CotizacionRequest,
} from "@/domain/types";
import { cotizarPaquetes } from "@/lib/quote-service";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";

const PAQUETES_VALIDOS = new Set(["AMPLIA", "LIMITADA", "RC"]);

const LIMITES_COBERTURAS: Record<
  keyof CoberturasPersonalizadas,
  { min: number; max: number }
> = {
  responsabilidadCivil: { min: 500_000, max: 20_000_000 },
  gastosMedicos: { min: 50_000, max: 5_000_000 },
  deducibleDanosMateriales: { min: 0, max: 30 },
  deducibleRoboTotal: { min: 0, max: 30 },
};

function sonCoberturasValidas(cob: unknown): boolean {
  if (cob === undefined || cob === null) return true;
  if (!cob || typeof cob !== "object") return false;
  const c = cob as Record<string, unknown>;
  return (Object.keys(LIMITES_COBERTURAS) as (keyof CoberturasPersonalizadas)[]).every(
    (k) => {
      const v = c[k];
      if (v === undefined) return true;
      const { min, max } = LIMITES_COBERTURAS[k];
      return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
    },
  );
}

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
  if (!sonCoberturasValidas(b.coberturasPersonalizadas)) return false;
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
