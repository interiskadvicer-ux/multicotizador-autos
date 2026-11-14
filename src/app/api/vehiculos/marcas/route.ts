import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { marcasVehiculo } from "@/lib/vehiculos-catalogo";

export async function GET() {
  const { error } = await requireApiSesion([
    "ADMIN",
    "POLIZAS",
    "COTIZADOR",
    "AGENTE",
  ]);
  if (error) return error;
  return NextResponse.json({ marcas: await marcasVehiculo() });
}
