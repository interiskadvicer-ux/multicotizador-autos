import type { TipoReporte } from "@/lib/bonos/repositorio";

export function leerParametros(url: URL | Record<string, unknown>) {
  const get = (k: string) => (url instanceof URL ? url.searchParams.get(k) : url[k]);
  const tipo = String(get("tipo")) === "PROMOTOR" ? "PROMOTOR" : ("AGENTE" as TipoReporte);
  const anio = Number(get("anio"));
  const periodo = Number(get("periodo"));
  const max = tipo === "AGENTE" ? 6 : 12;
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100 || !Number.isInteger(periodo) || periodo < 1 || periodo > max) {
    return null;
  }
  return { tipo, anio, periodo };
}
