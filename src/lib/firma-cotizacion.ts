import { createHmac, timingSafeEqual } from "crypto";
import type { CotizacionResultado } from "@/domain/types";

// Firma los importes que devuelve /api/cotizar para que no puedan alterarse
// antes de guardar la cotización.
function calcular(r: CotizacionResultado): string {
  const secreto = process.env.AUTH_SECRET ?? "";
  const datos = JSON.stringify([r.aseguradoraId, r.paquete, r.status, r.prima ?? null]);
  return createHmac("sha256", secreto).update(datos).digest("hex");
}

export function firmarResultados(resultados: CotizacionResultado[]): CotizacionResultado[] {
  return resultados.map((r) => ({ ...r, firma: calcular(r) }));
}

function firmaValida(r: CotizacionResultado): boolean {
  if (typeof r.firma !== "string") return false;
  const esperada = Buffer.from(calcular(r), "hex");
  const recibida = Buffer.from(r.firma, "hex");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

const mismaPrima = (a: CotizacionResultado, b: CotizacionResultado) =>
  a.aseguradoraId === b.aseguradoraId &&
  a.paquete === b.paquete &&
  a.status === b.status &&
  JSON.stringify(a.prima ?? null) === JSON.stringify(b.prima ?? null);

// Cada resultado con prima debe venir firmado por el servidor o ser igual a
// uno ya guardado en la cotización.
export function resultadosAutenticos(
  resultados: CotizacionResultado[],
  guardados: CotizacionResultado[] = [],
): boolean {
  return resultados.every(
    (r) => !r.prima || firmaValida(r) || guardados.some((g) => mismaPrima(g, r)),
  );
}
