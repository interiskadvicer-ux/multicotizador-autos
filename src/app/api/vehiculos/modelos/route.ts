import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { modelosVehiculo } from "@/lib/vehiculos-catalogo";

export async function GET(req: Request) {
  const { error } = await requireApiSesion([
    "ADMIN",
    "POLIZAS",
    "COTIZADOR",
    "AGENTE",
  ]);
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const marca = searchParams.get("marca")?.trim();
  if (!marca) {
    return NextResponse.json(
      { error: "Indica la marca del vehículo." },
      { status: 422 },
    );
  }
  const anio = Number(searchParams.get("anio"));
  return NextResponse.json({
    modelos: await modelosVehiculo(
      marca,
      Number.isFinite(anio) && anio > 0 ? anio : undefined,
    ),
  });
}
