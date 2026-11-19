import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { crearCotizacion, listarCotizaciones } from "@/lib/cotizaciones";
import { parseDatosCotizacion } from "@/lib/validate-cotizacion";
import { registrarActividad } from "@/lib/activity";
import { resultadosAutenticos } from "@/lib/firma-cotizacion";

const ROLES_COTIZAN = ["ADMIN", "POLIZAS", "COTIZADOR", "AGENTE"] as const;

export async function GET() {
  const { sesion, error } = await requireApiSesion([...ROLES_COTIZAN]);
  if (error) return error;
  const soloPropias = sesion.rol !== "ADMIN";
  return NextResponse.json({
    cotizaciones: listarCotizaciones(soloPropias ? sesion.id : undefined),
  });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([...ROLES_COTIZAN]);
  if (error) return error;
  const parsed = parseDatosCotizacion(await req.json().catch(() => null));
  if (parsed.error !== null) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }
  if (sesion.rol === "AGENTE") {
    if (!resultadosAutenticos(parsed.data.resultados)) {
      return NextResponse.json(
        { error: "Las primas no coinciden con la cotización. Vuelve a cotizar." },
        { status: 422 },
      );
    }
    delete parsed.data.request.descuentos;
  }
  const id = crearCotizacion(sesion.id, parsed.data);
  registrarActividad(
    sesion,
    parsed.data.estado === "EMISION_SOLICITADA" ? "EMISION_SOLICITAR" : "COTIZACION_GUARDAR",
    `Cotización #${id}`,
  );
  return NextResponse.json({ id }, { status: 201 });
}
