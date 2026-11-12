import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarVehiculos,
  type BusquedaVehiculoElPotosi,
} from "@/lib/elpotosi/catalogos";

// Búsqueda en el catálogo vehicular de El Potosí para obtener la
// claveElPotosi a partir de marca / submarca / año.
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
  const filtros: BusquedaVehiculoElPotosi = {
    marca,
    submarca: searchParams.get("submarca")?.trim() || undefined,
    anio,
  };

  try {
    const vehiculos = await buscarVehiculos(filtros);
    return NextResponse.json({ vehiculos });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo consultar el catálogo de El Potosí: ${err.message}`
            : "No se pudo consultar el catálogo de El Potosí.",
      },
      { status: 502 },
    );
  }
}
