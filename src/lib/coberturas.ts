import type { CoberturasPersonalizadas } from "@/domain/types";

export const ETIQUETA_COBERTURA: Record<keyof CoberturasPersonalizadas, string> =
  {
    responsabilidadCivil: "RC",
    gastosMedicos: "Gastos médicos",
    deducibleDanosMateriales: "Deducible daños materiales",
    deducibleRoboTotal: "Deducible robo total",
  };

function formatoValor(clave: keyof CoberturasPersonalizadas, v: number): string {
  if (clave === "deducibleDanosMateriales" || clave === "deducibleRoboTotal") {
    return `${v}%`;
  }
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

// Elige, entre las opciones que admite la aseguradora, la más cercana al valor
// solicitado. Si no coincide exactamente, agrega un aviso a `ajustes`.
export function masCercano(
  clave: keyof CoberturasPersonalizadas,
  solicitado: number,
  opciones: number[],
  ajustes: string[],
): number {
  if (!opciones.length) return solicitado;
  const elegido = opciones.reduce((mejor, o) =>
    Math.abs(o - solicitado) < Math.abs(mejor - solicitado) ? o : mejor,
  );
  if (elegido !== solicitado) {
    ajustes.push(
      `${ETIQUETA_COBERTURA[clave]}: ${formatoValor(clave, solicitado)} no disponible, se aplicó ${formatoValor(clave, elegido)}.`,
    );
  }
  return elegido;
}

// Acota el valor solicitado a un rango [min, max] admitido por la aseguradora.
export function acotar(
  clave: keyof CoberturasPersonalizadas,
  solicitado: number,
  min: number | undefined,
  max: number | undefined,
  ajustes: string[],
): number {
  let v = solicitado;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  if (v !== solicitado) {
    ajustes.push(
      `${ETIQUETA_COBERTURA[clave]}: ${formatoValor(clave, solicitado)} fuera de rango, se aplicó ${formatoValor(clave, v)}.`,
    );
  }
  return v;
}
