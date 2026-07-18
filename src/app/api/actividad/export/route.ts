import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarActividad } from "@/lib/activity";
import { excelActividad, nombreArchivo } from "@/lib/excel";
import { registrarActividad } from "@/lib/activity";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const usuarioId = params.get("usuarioId");
  const desde = params.get("desde");
  const hasta = params.get("hasta");

  const registros = listarActividad({
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });

  const buffer = await excelActividad(registros);
  registrarActividad(
    sesion,
    "EXPORT_ACTIVIDAD",
    `Exportó reporte de actividad (${registros.length} registros)`,
  );

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${nombreArchivo(
        "actividad",
      )}"`,
    },
  });
}
