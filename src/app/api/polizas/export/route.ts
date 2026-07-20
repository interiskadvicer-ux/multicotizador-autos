import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  listarPolizasConEstado,
  vencimientos,
  type PolizaConEstado,
} from "@/lib/polizas";
import { excelPolizas, nombreArchivo } from "@/lib/excel";
import { registrarActividad } from "@/lib/activity";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const tipo = new URL(req.url).searchParams.get("tipo");
  const soloVencimientos = tipo === "vencimientos";

  const titulo = soloVencimientos ? "Vencimientos" : "Pólizas";

  let buffer: ArrayBuffer;
  let datos: PolizaConEstado[];
  try {
    datos = soloVencimientos ? vencimientos() : listarPolizasConEstado();
    buffer = await excelPolizas(datos, titulo);
  } catch (err) {
    console.error("[export/polizas] No se pudo generar el Excel:", err);
    return NextResponse.json(
      { error: "No se pudo generar el archivo de Excel." },
      { status: 500 },
    );
  }

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
