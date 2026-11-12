import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { crearPoliza, listarPolizasConEstado } from "@/lib/polizas";
import { registrarActividad } from "@/lib/activity";
import { parsePolizaInput } from "@/lib/validate-poliza";

export async function GET() {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  void sesion;
  return NextResponse.json({ polizas: listarPolizasConEstado() });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = parsePolizaInput(body);
  if (parsed.error !== null) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const poliza = crearPoliza(parsed.data, sesion.id);
  registrarActividad(
    sesion,
    "POLIZA_CREAR",
    `Alta de póliza ${poliza.numeroPoliza} (${poliza.aseguradora})`,
  );
  return NextResponse.json({ poliza }, { status: 201 });
}
