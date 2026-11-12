// Catálogo de vehículos de General de Seguros: marcas → submarcas →
// versiones por modelo. La clave de la versión (`amis`) es la claveGs que
// requiere la cotización.

import { bloques, llamarGs, valor } from "./client";

const SERVICIO = "catalogoAutosWS";
const MODULO = "catalogoAutos";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface VehiculoGs {
  claveGs: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoGs {
  marca: string;
  submarca?: string;
  anio: number;
}

interface Entrada {
  id: string;
  nombre: string;
}

const cache = new Map<string, { expira: number; valor: Promise<Entrada[]> }>();

function conCache(clave: string, cargar: () => Promise<Entrada[]>): Promise<Entrada[]> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const promesa = cargar();
  cache.set(clave, { expira: Date.now() + TTL_MS, valor: promesa });
  promesa.catch(() => cache.delete(clave));
  return promesa;
}

function soloAlfanumerico(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Coincidencia exacta alfanumérica ("Mazda 2" ↔ "MAZDA2"); si no hay, el
// nombre de catálogo más corto que sea prefijo del buscado o lo contenga.
function buscarEquivalente(entradas: Entrada[], buscado: string): Entrada | undefined {
  const objetivo = soloAlfanumerico(buscado);
  const exacta = entradas.find((e) => soloAlfanumerico(e.nombre) === objetivo);
  if (exacta) return exacta;
  return entradas
    .filter((e) => {
      const n = soloAlfanumerico(e.nombre);
      return n && (objetivo.startsWith(n) || n.startsWith(objetivo));
    })
    .sort((a, b) => soloAlfanumerico(a.nombre).length - soloAlfanumerico(b.nombre).length)[0];
}

function entradas(xml: string, bloque: string, campoId: string, campoNombre: string): Entrada[] {
  return bloques(xml, bloque)
    .map((b) => ({ id: valor(b, campoId), nombre: valor(b, campoNombre) }))
    .filter((e) => e.id && e.id !== "0" && e.nombre);
}

function marcas(): Promise<Entrada[]> {
  return conCache("marcas", async () =>
    entradas(await llamarGs(SERVICIO, MODULO, "wsListarMarcas", []), "marcas", "id", "nombre"),
  );
}

function submarcas(idMarca: string): Promise<Entrada[]> {
  return conCache(`submarcas:${idMarca}`, async () =>
    entradas(
      await llamarGs(SERVICIO, MODULO, "wsListarSubMarcas", [["idMarca", idMarca]]),
      "submarcas",
      "id",
      "nombre",
    ),
  );
}

async function versiones(idSubmarca: string, anio: number): Promise<Entrada[]> {
  const xml = await llamarGs(SERVICIO, MODULO, "wsListarVersiones", [
    ["idSubmarca", idSubmarca],
    ["modelo", anio],
  ]);
  return entradas(xml, "versiones", "amis", "descripcion");
}

// GS agrupa marcas: Jeep, Dodge y RAM vienen en CHRYSLER ("JEEP GRAND
// CHEROKEE"), Chevrolet y GMC en GENERAL MOTORS, MINI en BMW.
const MARCAS_AGRUPADAS: Record<string, string> = {
  JEEP: "CHRYSLER",
  DODGE: "CHRYSLER",
  RAM: "CHRYSLER",
  CHEVROLET: "GENERAL MOTORS",
  GMC: "GENERAL MOTORS",
  PONTIAC: "GENERAL MOTORS",
  MINI: "BMW",
};

function marcaGs(entradas: Entrada[], buscada: string): Entrada | undefined {
  const exacta = buscarEquivalente(entradas, buscada);
  if (exacta) return exacta;
  const agrupada = MARCAS_AGRUPADAS[soloAlfanumerico(buscada)];
  return agrupada ? buscarEquivalente(entradas, agrupada) : undefined;
}

// Submarcas de GS que corresponden al modelo buscado, sin el prefijo de marca
// ("JEEP CHEROKEE SPORT", "MAZDA 2" → "2") ni "NUEVO". Si hay coincidencia
// exacta se usa solo esa; si no, todas las que empiezan con el modelo
// ("JETTA" → "JETTA A7", "JETTA CLASICO"…); la versión se filtra por año.
export function submarcasGs(lista: Entrada[], buscada: string, marca: string): Entrada[] {
  const prefijos = [soloAlfanumerico(marca), "NUEVO", "NEW"].filter(Boolean);
  const sinPrefijo = (nombre: string) => {
    let n = soloAlfanumerico(nombre);
    for (const p of prefijos) if (n.startsWith(p) && n.length > p.length) n = n.slice(p.length);
    return n;
  };
  const objetivos = Array.from(new Set([soloAlfanumerico(buscada), sinPrefijo(buscada)])).filter(
    Boolean,
  );
  const nombres = lista.map((e) => ({ e, n: sinPrefijo(e.nombre) }));
  const exactas = nombres.filter(({ n }) => objetivos.includes(n));
  if (exactas.length) return exactas.map(({ e }) => e);
  return nombres
    .filter(({ n }) => n && objetivos.some((o) => n.startsWith(o)))
    .slice(0, 8)
    .map(({ e }) => e);
}

export async function buscarVehiculos(filtros: BusquedaVehiculoGs): Promise<VehiculoGs[]> {
  const marca = marcaGs(await marcas(), filtros.marca);
  if (!marca) return [];
  const lista = await submarcas(marca.id);
  const elegidas = filtros.submarca
    ? submarcasGs(lista, filtros.submarca, filtros.marca)
    : lista;
  const porSubmarca = await Promise.all(
    elegidas.map(async (sub) =>
      (await versiones(sub.id, filtros.anio)).map((v) => ({
        claveGs: v.id,
        marca: marca.nombre,
        submarca: sub.nombre.trim(),
        anio: filtros.anio,
        descripcion: v.nombre,
      })),
    ),
  );
  return porSubmarca.flat();
}
