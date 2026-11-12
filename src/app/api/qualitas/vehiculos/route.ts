import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarVehiculos,
  QBCenterNoConfigurado,
  type BusquedaVehiculo,
} from "@/lib/qualitas/tarifas";

// Búsqueda en el catálogo de vehículos de Quálitas (WSTarifas) para obtener la
// ClaveAmis a partir de marca / línea / versión / año.
export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS", "COTIZADOR"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const filtros: BusquedaVehiculo = {
    marca: searchParams.get("marca") || undefined,
    tipo: searchParams.get("tipo") || undefined,
    version: searchParams.get("version") || undefined,
    modelo: searchParams.get("modelo") || undefined,
    camis: searchParams.get("camis") || undefined,
  };

  if (!filtros.marca && !filtros.tipo && !filtros.camis) {
    return NextResponse.json(
      { error: "Indica al menos la marca o la clave del vehículo." },
      { status: 422 },
    );
  }

  try {
    const vehiculos = await buscarVehiculos(filtros);
    return NextResponse.json({ vehiculos });
  } catch (err) {
    if (err instanceof QBCenterNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo consultar el catálogo de Quálitas: ${err.message}`
            : "No se pudo consultar el catálogo de Quálitas.",
      },
      { status: 502 },
    );
  }
}
