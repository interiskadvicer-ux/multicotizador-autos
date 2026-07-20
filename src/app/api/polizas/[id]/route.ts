import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  actualizarPoliza,
  eliminarPoliza,
  obtenerPoliza,
} from "@/lib/polizas";
import { registrarActividad } from "@/lib/activity";
import { parsePolizaInput } from "@/lib/validate-poliza";
import { jsonError, parseJsonBody } from "@/lib/http";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return jsonError("Póliza no válida.", 400);
  }
  if (!obtenerPoliza(id)) {
    return jsonError("Póliza no encontrada.", 404);
  }

  const { data: body, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;

  const parsed = parsePolizaInput(body);
  if (parsed.error !== null) {
    return jsonError(parsed.error, 422);
  }

  const poliza = actualizarPoliza(id, parsed.data);
  registrarActividad(
    sesion,
    "POLIZA_EDITAR",
    `Edición de póliza ${poliza?.numeroPoliza}`,
  );
  return NextResponse.json({ poliza });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const id = Number(params.id);
  const existente = Number.isInteger(id) ? obtenerPoliza(id) : null;
  if (!existente) {
    return jsonError("Póliza no encontrada.", 404);
  }

  eliminarPoliza(id);
  registrarActividad(
    sesion,
    "POLIZA_ELIMINAR",
    `Eliminación de póliza ${existente.numeroPoliza}`,
  );
  return NextResponse.json({ ok: true });
}
