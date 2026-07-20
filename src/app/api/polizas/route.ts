import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { crearPoliza, listarPolizasConEstado } from "@/lib/polizas";
import { registrarActividad } from "@/lib/activity";
import { parsePolizaInput } from "@/lib/validate-poliza";
import { jsonError, parseJsonBody } from "@/lib/http";

export async function GET() {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  void sesion;
  return NextResponse.json({ polizas: listarPolizasConEstado() });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const { data: body, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;

  const parsed = parsePolizaInput(body);
  if (parsed.error !== null) {
    return jsonError(parsed.error, 422);
  }

  const poliza = crearPoliza(parsed.data, sesion.id);
  registrarActividad(
    sesion,
    "POLIZA_CREAR",
    `Alta de póliza ${poliza.numeroPoliza} (${poliza.aseguradora})`,
  );
  return NextResponse.json({ poliza }, { status: 201 });
}
