import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarVehiculos,
  type BusquedaVehiculoBanorte,
} from "@/lib/banorte/catalogos";
import { BanorteNoConfigurado } from "@/lib/banorte/client";

// Búsqueda en el catálogo de vehículos de Banorte para obtener la
// claveBanorte a partir de marca / submarca / año.
export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS", "COTIZADOR"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const marca = searchParams.get("marca")?.trim();
  if (!marca) {
    return NextResponse.json(
      { error: "Indica al menos la marca del vehículo." },
      { status: 422 },
    );
  }

  const anioParam = Number(searchParams.get("anio"));
  const filtros: BusquedaVehiculoBanorte = {
    marca,
    submarca: searchParams.get("submarca")?.trim() || undefined,
    anio: Number.isFinite(anioParam) && anioParam > 0 ? anioParam : undefined,
  };

  try {
    const vehiculos = await buscarVehiculos(filtros);
    return NextResponse.json({ vehiculos });
  } catch (err) {
    if (err instanceof BanorteNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo consultar el catálogo de Banorte: ${err.message}`
            : "No se pudo consultar el catálogo de Banorte.",
      },
      { status: 502 },
    );
  }
}
