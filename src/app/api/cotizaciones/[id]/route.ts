import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  ESTADOS_COTIZACION,
  actualizarCotizacion,
  cambiarEstadoCotizacion,
  obtenerCotizacion,
  type EstadoCotizacion,
} from "@/lib/cotizaciones";
import { parseDatosCotizacion } from "@/lib/validate-cotizacion";
import { registrarActividad } from "@/lib/activity";

const ROLES_COTIZAN = ["ADMIN", "POLIZAS", "COTIZADOR", "AGENTE"] as const;

async function cargar(id: string) {
  const { sesion, error } = await requireApiSesion([...ROLES_COTIZAN]);
  if (error) return { error };
  const cot = obtenerCotizacion(Number(id));
  if (!cot || (sesion.rol !== "ADMIN" && cot.usuarioId !== sesion.id)) {
    return {
      error: NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 }),
    };
  }
  return { sesion, cot };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await cargar(params.id);
  if (r.error) return r.error;
  return NextResponse.json({ cotizacion: r.cot });
}

// Dueño: actualiza datos (contratante, vehículo, selección) mientras no esté
// emitida. Admin: además cambia el estado (EMITIDA, CANCELADA) con `soloEstado`.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const r = await cargar(params.id);
  if (r.error) return r.error;
  const { sesion, cot } = r;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.soloEstado) {
    if (sesion.rol !== "ADMIN") {
      return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
    }
    const estado = String(body.estado) as EstadoCotizacion;
    if (!ESTADOS_COTIZACION.some((e) => e.value === estado)) {
      return NextResponse.json({ error: "Estado no válido." }, { status: 422 });
    }
    const numeroPoliza = String(body.numeroPoliza ?? "").trim() || null;
    if (estado === "EMITIDA" && !numeroPoliza) {
      return NextResponse.json({ error: "Captura el número de póliza." }, { status: 422 });
    }
    const notas = String(body.notasAdmin ?? "").trim() || null;
    cambiarEstadoCotizacion(cot.id, estado, numeroPoliza, notas);
    registrarActividad(sesion, "COTIZACION_ESTADO", `Cotización #${cot.id} → ${estado}`);
    return NextResponse.json({ cotizacion: obtenerCotizacion(cot.id) });
  }

  if (cot.estado === "EMITIDA" || cot.estado === "CANCELADA") {
    return NextResponse.json(
      { error: "La cotización ya no se puede modificar." },
      { status: 409 },
    );
  }
  const parsed = parseDatosCotizacion(body);
  if (parsed.error !== null) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }
  actualizarCotizacion(cot.id, parsed.data);
  if (parsed.data.estado === "EMISION_SOLICITADA" && cot.estado !== "EMISION_SOLICITADA") {
    registrarActividad(sesion, "EMISION_SOLICITAR", `Cotización #${cot.id}`);
  }
  return NextResponse.json({ cotizacion: obtenerCotizacion(cot.id) });
}
