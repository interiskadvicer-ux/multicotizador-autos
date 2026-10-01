import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { AfirmeError, AfirmeNoConfigurado } from "@/lib/afirme/client";
import { esAseguradoraAfirme } from "@/domain/admin";
import { consultarPolizaAfirme } from "@/lib/afirme/polizas";
import { guardarConsultaPagos, listarPolizas } from "@/lib/polizas";

// Consulta en Afirme los recibos de las pólizas Afirme (todas o las indicadas
// en `ids`) y guarda su estatus de pago.
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? new Set(body.ids.map(Number).filter(Number.isInteger))
    : null;

  const polizas = listarPolizas().filter(
    (p) => esAseguradoraAfirme(p.aseguradora) && (!ids || ids.has(p.id)),
  );

  const actualizadas: { numeroPoliza: string; estatusPago: string | null }[] =
    [];
  const errores: { numeroPoliza: string; error: string }[] = [];

  for (const p of polizas) {
    try {
      const consulta = await consultarPolizaAfirme(p.numeroPoliza);
      guardarConsultaPagos(
        p.id,
        {
          recibos: consulta.recibos,
          estatusPago: consulta.estatusPago,
          estatusAseguradora: consulta.poliza.estatusPoliza,
        },
        "AFIRME",
        sesion.email,
      );
      actualizadas.push({
        numeroPoliza: p.numeroPoliza,
        estatusPago: consulta.estatusPago,
      });
    } catch (err) {
      if (err instanceof AfirmeNoConfigurado) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      if (!(err instanceof AfirmeError)) throw err;
      errores.push({ numeroPoliza: p.numeroPoliza, error: err.message });
    }
  }

  registrarActividad(
    sesion,
    "PAGOS_ACTUALIZAR",
    `Actualizó pagos Afirme: ${actualizadas.length} póliza(s), ${errores.length} con error`,
  );
  return NextResponse.json({
    consultadas: polizas.length,
    actualizadas,
    errores,
  });
}
