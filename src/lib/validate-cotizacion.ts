import type { DatosCotizacion } from "@/lib/cotizaciones";

const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const RE_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Valida lo que llega al guardar una cotización. Al solicitar emisión se
// exigen la opción elegida, el contratante y los datos del vehículo.
export function parseDatosCotizacion(
  body: unknown,
): { data: DatosCotizacion; error: null } | { data: null; error: string } {
  if (!body || typeof body !== "object") return { data: null, error: "Solicitud inválida." };
  const b = body as Record<string, unknown>;
  const request = b.request as DatosCotizacion["request"] | undefined;
  const resultados = b.resultados as DatosCotizacion["resultados"] | undefined;
  if (!request?.vehiculo || !request?.conductor || !Array.isArray(resultados)) {
    return { data: null, error: "Faltan los datos de la cotización." };
  }
  const estado = b.estado === "EMISION_SOLICITADA" ? "EMISION_SOLICITADA" : "GUARDADA";

  const s = b.seleccion as Record<string, unknown> | null | undefined;
  const seleccion =
    s && typeof s.aseguradoraId === "string" && typeof s.paquete === "string"
      ? { aseguradoraId: s.aseguradoraId, paquete: s.paquete as DatosCotizacion["request"]["paquete"] }
      : null;

  const c = b.contratante as Record<string, unknown> | null | undefined;
  const contratante = c
    ? {
        tipoPersona: c.tipoPersona === "MORAL" ? ("MORAL" as const) : ("FISICA" as const),
        nombre: str(c.nombre),
        rfc: str(c.rfc, 13).toUpperCase(),
        email: str(c.email),
        telefono: str(c.telefono, 20),
        calle: str(c.calle),
        colonia: str(c.colonia),
        municipio: str(c.municipio),
        estado: str(c.estado),
        cp: str(c.cp, 5),
      }
    : null;

  const v = b.detalleVehiculo as Record<string, unknown> | null | undefined;
  const detalleVehiculo = v
    ? {
        serie: str(v.serie, 17).toUpperCase(),
        motor: str(v.motor, 30).toUpperCase(),
        placas: str(v.placas, 10).toUpperCase(),
        color: str(v.color, 30),
      }
    : null;

  if (estado === "EMISION_SOLICITADA") {
    if (!seleccion) return { data: null, error: "Elige la aseguradora y el paquete." };
    const elegido = resultados.find(
      (r) => r.aseguradoraId === seleccion.aseguradoraId && r.paquete === seleccion.paquete,
    );
    if (!elegido || elegido.status !== "success") {
      return { data: null, error: "La opción elegida no tiene prima disponible." };
    }
    if (!contratante?.nombre) return { data: null, error: "Captura el nombre del contratante." };
    if (!RE_RFC.test(contratante.rfc)) return { data: null, error: "El RFC del contratante no es válido." };
    if (!contratante.calle || !contratante.colonia || !/^\d{5}$/.test(contratante.cp)) {
      return { data: null, error: "Completa el domicilio del contratante." };
    }
    if (!detalleVehiculo || !RE_VIN.test(detalleVehiculo.serie)) {
      return { data: null, error: "El número de serie (VIN) debe tener 17 caracteres." };
    }
  }

  return {
    data: { request, resultados, seleccion, contratante, detalleVehiculo, estado },
    error: null,
  };
}
