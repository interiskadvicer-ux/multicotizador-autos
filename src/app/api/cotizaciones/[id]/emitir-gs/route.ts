import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import type { SesionUsuario } from "@/domain/admin";
import { conEmisionExclusiva, emitirCotizacion, obtenerCotizacion } from "@/lib/cotizaciones";
import { registrarActividad } from "@/lib/activity";
import { guardarCaratula } from "@/lib/polizas";
import { ambienteEmisionGs } from "@/lib/gs/config";
import { emitirCotizacionGs, faltantesEmisionGs } from "@/lib/gs/emision";

async function cargar(id: string) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return { error };
  const cot = obtenerCotizacion(Number(id));
  if (!cot || cot.seleccion?.aseguradoraId !== "generalseguros") {
    return {
      error: NextResponse.json(
        { error: "Cotización de General de Seguros no encontrada." },
        { status: 404 },
      ),
    };
  }
  return { sesion, cot };
}

// Datos faltantes y ambiente en el que se emitiría.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await cargar(params.id);
  if (r.error) return r.error;
  return NextResponse.json({ ambiente: ambienteEmisionGs(), faltantes: faltantesEmisionGs(r.cot) });
}

// Emite la póliza en General de Seguros y la registra en el control de pólizas
// con su carátula.
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
  const ambiente = ambienteEmisionGs();
  let poliza;
  try {
    poliza = await emitirCotizacionGs(cot, vigenciaInicio);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "General de Seguros no emitió la póliza.";
    registrarActividad(sesion, "GS_EMISION_ERROR", `Cotización #${cot.id} (${ambiente}): ${mensaje}`);
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
  const pdfCaratula = poliza.documentos.find((d) => d.pdf && /car[aá]tula|p[oó]liza/i.test(d.nombre))?.pdf
    ?? poliza.documentos.find((d) => d.pdf)?.pdf;
  const caratula = pdfCaratula ? guardarCaratula(pdfCaratula) : null;
  const numeroPoliza = poliza.poliza;
  const notas = `Emitida en General de Seguros (${poliza.ambiente}) · cotización GS ${poliza.idCotizacion}`;
  const polizaId = emitirCotizacion(cot, numeroPoliza, vigenciaInicio, notas, sesion.id, caratula, {
    primaTotal: poliza.primaTotal,
  });
  registrarActividad(
    sesion,
    "COTIZACION_EMITIDA",
    `Cotización #${cot.id} → póliza General de Seguros ${numeroPoliza} (registro #${polizaId})`,
  );
  return NextResponse.json({
    resultado: {
      numeroPoliza,
      ambiente: poliza.ambiente,
      primaTotal: poliza.primaTotal,
      caratulaGuardada: Boolean(caratula),
    },
    documentos: poliza.documentos
      .filter((d) => /^https:\/\//i.test(d.liga))
      .map((d) => ({ etiqueta: d.nombre || "Documento", url: d.liga })),
    cotizacion: obtenerCotizacion(cot.id),
  });
}
