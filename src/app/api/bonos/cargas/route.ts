import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { leerLibro, leerProduccion } from "@/lib/bonos/importar";
import { guardarProduccion, importarCatalogo, listarCargas, sembrarRepartoInicial } from "@/lib/bonos/repositorio";
import { etiquetaMes } from "@/lib/bonos/normalizar";

export const runtime = "nodejs";
const TAMANO_MAXIMO = 25 * 1024 * 1024;

export async function GET() {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  return NextResponse.json({ cargas: listarCargas() });
}

// Sube el reporte de El Potosí de un mes (requiere año y mes) o un libro de
// cierre con hoja BASE 1 (carga su catálogo y todos los meses que contenga).
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Selecciona el archivo de Excel." }, { status: 422 });
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: "El archivo excede 25 MB." }, { status: 413 });
  }
  const anio = Number(form?.get("anio"));
  const mes = Number(form?.get("mes"));
  const ponderadoTexto = String(form?.get("ponderado") ?? "").trim();
  const ponderado = ponderadoTexto ? Number(ponderadoTexto) : undefined;
  if (ponderado !== undefined && (!Number.isFinite(ponderado) || ponderado < 0 || ponderado > 5)) {
    return NextResponse.json({ error: "Ponderado inválido." }, { status: 422 });
  }

  let lectura;
  try {
    lectura = leerProduccion(await leerLibro(await archivo.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el archivo." }, { status: 422 });
  }

  const agentesNuevos = new Set<string>();
  const ramosNuevos = new Set<string>();
  const meses: string[] = [];
  let catalogo = 0;
  if (lectura.tipo === "REPORTE") {
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: "Indica el año y mes de cierre del reporte." }, { status: 422 });
    }
    const r = guardarProduccion(anio, mes, lectura.filas!, archivo.name, sesion.id, ponderado);
    r.agentesNuevos.forEach((a) => agentesNuevos.add(a));
    r.ramosNuevos.forEach((a) => ramosNuevos.add(a));
    meses.push(etiquetaMes(anio, mes));
  } else {
    catalogo = importarCatalogo(lectura.catalogo ?? []);
    sembrarRepartoInicial();
    for (const m of lectura.meses ?? []) {
      const r = guardarProduccion(m.anio, m.mes, m.filas, archivo.name, sesion.id);
      r.agentesNuevos.forEach((a) => agentesNuevos.add(a));
      r.ramosNuevos.forEach((a) => ramosNuevos.add(a));
    }
    if (lectura.meses?.length) {
      const a = lectura.meses[0];
      const b = lectura.meses[lectura.meses.length - 1];
      meses.push(`${etiquetaMes(a.anio, a.mes)} a ${etiquetaMes(b.anio, b.mes)} (${lectura.meses.length} meses)`);
    }
  }
  registrarActividad(sesion, "BONOS_CARGAR", `${archivo.name}: ${meses.join(", ")}`);
  return NextResponse.json({
    tipo: lectura.tipo,
    meses,
    catalogo,
    agentesNuevos: Array.from(agentesNuevos),
    ramosNuevos: Array.from(ramosNuevos),
    cargas: listarCargas(),
  });
}
