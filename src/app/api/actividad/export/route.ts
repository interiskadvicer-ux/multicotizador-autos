import { requireApiSesion } from "@/lib/api-auth";
import {
  filtrosActividadDesdeUrl,
  listarActividad,
  registrarActividad,
} from "@/lib/activity";
import { excelActividad, nombreArchivo } from "@/lib/excel";
import { excelResponse } from "@/lib/http";

export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const registros = listarActividad(filtrosActividadDesdeUrl(req));

  const buffer = await excelActividad(registros);
  registrarActividad(
    sesion,
    "EXPORT_ACTIVIDAD",
    `Exportó reporte de actividad (${registros.length} registros)`,
  );

  return excelResponse(buffer, nombreArchivo("actividad"));
}
