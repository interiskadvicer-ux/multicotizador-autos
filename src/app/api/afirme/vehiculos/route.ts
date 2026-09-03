import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarVehiculos,
  type BusquedaVehiculoAfirme,
} from "@/lib/afirme/catalogos";
import { AfirmeNoConfigurado } from "@/lib/afirme/client";

// Búsqueda en el catálogo de vehículos de Afirme para obtener la
// claveAfirme a partir de marca / submarca / año.
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
  const filtros: BusquedaVehiculoAfirme = {
    marca,
    submarca: searchParams.get("submarca")?.trim() || undefined,
    anio,
  };

  try {
    const vehiculos = await buscarVehiculos(filtros);
    return NextResponse.json({ vehiculos });
  } catch (err) {
    if (err instanceof AfirmeNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo consultar el catálogo de Afirme: ${err.message}`
            : "No se pudo consultar el catálogo de Afirme.",
      },
      { status: 502 },
    );
  }
}
