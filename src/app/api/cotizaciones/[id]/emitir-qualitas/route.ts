import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import type { SesionUsuario } from "@/domain/admin";
import { conEmisionExclusiva, emitirCotizacion, obtenerCotizacion } from "@/lib/cotizaciones";
import { registrarActividad } from "@/lib/activity";
import { emitirQualitas, faltantesEmisionQualitas, ambienteEmision } from "@/lib/qualitas/emision";
import { recuperarImpresion } from "@/lib/qualitas/impresion";

async function cargar(id: string) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return { error };
  const cot = obtenerCotizacion(Number(id));
  if (!cot || cot.seleccion?.aseguradoraId !== "qualitas") {
    return {
      error: NextResponse.json({ error: "Cotización de Quálitas no encontrada." }, { status: 404 }),
    };
  }
  return { sesion, cot };
}

// Datos faltantes y ambiente en el que se emitiría.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await cargar(params.id);
  if (r.error) return r.error;
  return NextResponse.json({ ambiente: ambienteEmision(), faltantes: faltantesEmisionQualitas(r.cot) });
}

// Emite la póliza en Quálitas y la registra en el control de pólizas.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await cargar(params.id);
  if (r.error) return r.error;
  const respuesta = await conEmisionExclusiva(r.cot.id, () => emitir(req, r.sesion, r.cot.id));
  return (
    respuesta ??
    NextResponse.json({ error: "La cotización ya se está emitiendo." }, { status: 409 })
  );
}

async function emitir(req: Request, sesion: SesionUsuario, id: number) {
  const cot = obtenerCotizacion(id)!;
  if (cot.estado === "EMITIDA" || cot.estado === "CANCELADA") {
    return NextResponse.json({ error: "La cotización ya no se puede emitir." }, { status: 409 });
  }
  const body = (await req.json().catch(() => null)) as { vigenciaInicio?: string } | null;
  const vigenciaInicio = String(body?.vigenciaInicio ?? "");
  const hoy = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenciaInicio) || vigenciaInicio < hoy) {
    return NextResponse.json(
      { error: "El inicio de vigencia no puede ser anterior a hoy." },
      { status: 422 },
    );
  }
  const resultado = await emitirQualitas(cot, vigenciaInicio);
  if (!resultado.ok || !resultado.numeroPoliza) {
    registrarActividad(sesion, "QUALITAS_EMISION_ERROR", `Cotización #${cot.id}: ${resultado.error}`);
    return NextResponse.json({ error: resultado.error }, { status: 502 });
  }
  const notas = `Emitida en Quálitas (${resultado.ambiente})${
    resultado.recibos?.length ? ` · ${resultado.recibos.length} recibo(s)` : ""
  }`;
  const polizaId = emitirCotizacion(cot, resultado.numeroPoliza, vigenciaInicio, notas, sesion.id, null, {
    primaNeta: resultado.primaNeta,
    primaTotal: resultado.primaTotal,
  });
  registrarActividad(
    sesion,
    "COTIZACION_EMITIDA",
    `Cotización #${cot.id} → póliza Quálitas ${resultado.numeroPoliza} (registro #${polizaId})`,
  );
  let impresion = null;
  try {
    impresion = await recuperarImpresion(resultado.numeroPoliza, resultado.ambiente);
  } catch {
    impresion = null;
  }
  return NextResponse.json({ resultado, impresion, cotizacion: obtenerCotizacion(cot.id) });
}
