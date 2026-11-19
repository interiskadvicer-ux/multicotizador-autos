import type { CotizacionRequest, Paquete } from "@/domain/types";

// Paquetes en los que se ofrecen las coberturas opcionales de cada aseguradora.
export const PAQUETES_CON_ADICIONALES: readonly Paquete[] = ["AMPLIA"];

// Claves de las coberturas opcionales que el broker contrató con esta
// aseguradora; `undefined` si el paquete no admite adicionales.
export function adicionalesSolicitadas(
  request: CotizacionRequest,
  aseguradoraId: string,
): Set<string> | undefined {
  if (!PAQUETES_CON_ADICIONALES.includes(request.paquete)) return undefined;
  return new Set(request.coberturasAdicionales?.[aseguradoraId] ?? []);
}

export function sonAdicionalesValidas(v: unknown): boolean {
  if (v === undefined) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v).every(
    (l) =>
      Array.isArray(l) &&
      l.length <= 50 &&
      l.every((x) => typeof x === "string"),
  );
}

const SIGLAS = new Set([
  "RC",
  "R.C.",
  "USA",
  "LUC",
  "L.U.C.",
  "GM",
  "DM",
  "RT",
  "KM",
  "PT",
  "COPT",
]);

// Los web services mandan algunos nombres en mayúsculas ("AUTO SUSTITUTO");
// se muestran en tipo oración conservando siglas.
export function nombreVisible(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio !== limpio.toUpperCase()) return limpio;
  return limpio
    .split(" ")
    .map((p, i) => {
      if (SIGLAS.has(p.replace(/[(),]/g, ""))) return p;
      const l = p.toLowerCase();
      return i === 0 ? l.charAt(0).toUpperCase() + l.slice(1) : l;
    })
    .join(" ");
}
