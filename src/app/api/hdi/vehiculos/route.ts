import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarVehiculos,
  type BusquedaVehiculoHdi,
} from "@/lib/hdi/catalogos";
import { HdiNoConfigurado } from "@/lib/hdi/client";

// Búsqueda en el catálogo vehicular de HDI para obtener la
// claveHdi a partir de marca / submarca / año.
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

  const anio = Number(searchParams.get("anio"));
  if (!Number.isFinite(anio) || anio <= 0) {
    return NextResponse.json(
      { error: "Indica el año del vehículo." },
      { status: 422 },
    );
  }
  const filtros: BusquedaVehiculoHdi = {
    marca,
    submarca: searchParams.get("submarca")?.trim() || undefined,
    anio,
  };

  try {
    const vehiculos = await buscarVehiculos(filtros);
    return NextResponse.json({ vehiculos });
  } catch (err) {
    if (err instanceof HdiNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo consultar el catálogo de HDI: ${err.message}`
            : "No se pudo consultar el catálogo de HDI.",
      },
      { status: 502 },
    );
  }
}
