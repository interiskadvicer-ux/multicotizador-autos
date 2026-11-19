import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { autorizarSolicitud, marcarSolicitud, obtenerSolicitud } from "@/lib/agentes";
import { registrarActividad } from "@/lib/activity";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const id = Number(params.id);
  const solicitud = Number.isInteger(id) ? obtenerSolicitud(id) : null;
  if (!solicitud) {
    return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  }
  if (solicitud.estado !== "PENDIENTE") {
    return NextResponse.json({ error: "La solicitud ya fue revisada." }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as
    | { accion?: string; motivo?: string }
    | null;
  const accion = body?.accion;

  if (accion === "AUTORIZAR") {
    try {
      autorizarSolicitud(id, sesion.id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "No se pudo autorizar." },
        { status: 409 },
      );
    }
    registrarActividad(sesion, "AGENTE_AUTORIZAR", `Autorizó al agente ${solicitud.email}`);
  } else if (accion === "RECHAZAR") {
    const motivo = String(body?.motivo ?? "").trim();
    if (!motivo) {
      return NextResponse.json({ error: "Indica el motivo del rechazo." }, { status: 422 });
    }
    marcarSolicitud(id, { estado: "RECHAZADA", revisadoPor: sesion.id, motivoRechazo: motivo });
    registrarActividad(sesion, "AGENTE_RECHAZAR", `Rechazó al agente ${solicitud.email}: ${motivo}`);
  } else {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }
  return NextResponse.json({ solicitud: obtenerSolicitud(id) });
}
