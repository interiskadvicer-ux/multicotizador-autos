import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  actualizarPoliza,
  eliminarPoliza,
  obtenerPoliza,
} from "@/lib/polizas";
import { registrarActividad } from "@/lib/activity";
import { parsePolizaInput } from "@/lib/validate-poliza";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Póliza no válida." }, { status: 400 });
  }
  if (!obtenerPoliza(id)) {
    return NextResponse.json(
      { error: "Póliza no encontrada." },
      { status: 404 },
    );
  }

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
    return NextResponse.json(
      { error: "Póliza no encontrada." },
      { status: 404 },
    );
  }

  eliminarPoliza(id);
  registrarActividad(
    sesion,
    "POLIZA_ELIMINAR",
    `Eliminación de póliza ${existente.numeroPoliza}`,
  );
  return NextResponse.json({ ok: true });
}
