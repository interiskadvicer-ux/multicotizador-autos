import { NextResponse } from "next/server";
import type { CotizacionRequest } from "@/domain/types";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { resolverDescuento } from "@/insurers/base";
import { hdi } from "@/insurers/hdi";
import { HdiNoConfigurado } from "@/lib/hdi/client";
import {
  CONDUCTO_HDI,
  catalogosEmisionHdi,
  emitirHdi,
  ubicacionHdi,
  type EmisionHdi,
} from "@/lib/hdi/emision";

const ROLES = ["ADMIN", "POLIZAS"] as const;

function errorHdi(err: unknown) {
  if (err instanceof HdiNoConfigurado)
    return NextResponse.json({ error: err.message }, { status: 503 });
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Error de HDI." },
    { status: 502 },
  );
}

// Catálogos de emisión; con ?cp= devuelve estado, ciudad y colonias del CP.
export async function GET(req: Request) {
  const { error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  const cp = new URL(req.url).searchParams.get("cp");
  try {
    if (cp !== null) {
      if (!/^\d{5}$/.test(cp))
        return NextResponse.json(
          { error: "Código postal inválido." },
          { status: 422 },
        );
      return NextResponse.json(await ubicacionHdi(cp));
    }
    return NextResponse.json(await catalogosEmisionHdi());
  } catch (err) {
    return errorHdi(err);
  }
}

function texto(v: unknown, max = 120): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function esEmisionValida(b: unknown): b is {
  request: CotizacionRequest;
  emision: EmisionHdi;
} {
  if (!b || typeof b !== "object") return false;
  const { request, emision } = b as Record<string, unknown>;
  const r = request as CotizacionRequest | undefined;
  const e = emision as EmisionHdi | undefined;
  if (!r?.vehiculo || !texto(r.vehiculo.claveHdi) || !texto(r.paquete))
    return false;
  if (!e?.contratante || !e.fiscal || !e.unidad) return false;
  const c = e.contratante;
  return (
    [
      c.nombre,
      c.apellidoPaterno,
      c.rfc,
      c.fechaNacimiento,
      c.estadoCivil,
      c.ocupacion,
      c.email,
      c.telefono,
      c.calle,
      c.numeroExterior,
      c.cp,
      c.colonia,
      e.fiscal.regimenFiscal,
      e.unidad.numeroSerie,
    ].every((v) => texto(v)) &&
    (c.sexo === "M" || c.sexo === "F") &&
    Object.hasOwn(CONDUCTO_HDI, e.medioPago)
  );
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([...ROLES]);
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
  if (!esEmisionValida(body))
    return NextResponse.json(
      { error: "Faltan datos requeridos para emitir con HDI." },
      { status: 422 },
    );
  const { request, emision } = body;
  const descuento = resolverDescuento(request, hdi.id, hdi.descuentoDefault);
  try {
    const poliza = await emitirHdi(
      request,
      descuento,
      request.vehiculo.claveHdi!.trim(),
      emision,
    );
    registrarActividad(
      sesion,
      "EMITIR",
      `Emitió con HDI la póliza ${poliza.poliza} (cotización ${poliza.cotizacion}, ${request.paquete}${poliza.pago ? `, pago ${poliza.pago.resultado} folio ${poliza.pago.folio}` : ", sin pago en línea"})`,
    );
    return NextResponse.json(poliza);
  } catch (err) {
    return errorHdi(err);
  }
}
