import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarPolizasConEstado, vencimientos } from "@/lib/polizas";
import { excelPolizas, nombreArchivo } from "@/lib/excel";
import { registrarActividad } from "@/lib/activity";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS", "AGENTE"]);
  if (error) return error;

  const tipo = new URL(req.url).searchParams.get("tipo");
  const soloVencimientos = tipo === "vencimientos";

  const agenteId = sesion.rol === "AGENTE" ? sesion.id : undefined;
  const datos = soloVencimientos
    ? vencimientos(agenteId)
    : listarPolizasConEstado(agenteId);
  const titulo = soloVencimientos ? "Vencimientos" : "Pólizas";
  const buffer = await excelPolizas(datos, titulo);
  const nombre = nombreArchivo(
    soloVencimientos ? "vencimientos" : "polizas",
  );

  registrarActividad(
    sesion,
    "EXPORT_POLIZAS",
    `Exportó ${titulo} a Excel (${datos.length} registros)`,
  );

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
