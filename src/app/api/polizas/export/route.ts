import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  listarPolizasConEstado,
  listarRecibos,
  vencimientos,
} from "@/lib/polizas";
import { excelPagos, excelPolizas, nombreArchivo } from "@/lib/excel";
import { registrarActividad } from "@/lib/activity";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const tipo = params.get("tipo");

  if (tipo === "pagos") {
    const aseguradora = params.get("aseguradora")?.trim().toLowerCase();
    const estatus = params.get("estatus");
    const polizas = listarPolizasConEstado().filter(
      (p) =>
        (!aseguradora || p.aseguradora.toLowerCase().includes(aseguradora)) &&
        (!estatus ||
          (estatus === "SIN_DATO" ? !p.estatusPago : p.estatusPago === estatus)),
    );
    const ids = new Set(polizas.map((p) => p.id));
    const recibos = listarRecibos().filter((r) => ids.has(r.policyId));
    const buffer = await excelPagos(polizas, recibos);
    registrarActividad(
      sesion,
      "EXPORT_PAGOS",
      `Exportó reporte de pagos a Excel (${polizas.length} pólizas, ${recibos.length} recibos)`,
    );
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${nombreArchivo("pagos")}"`,
      },
    });
  }

  const soloVencimientos = tipo === "vencimientos";

  const datos = soloVencimientos ? vencimientos() : listarPolizasConEstado();
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
