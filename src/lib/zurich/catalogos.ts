// Catálogo de vehículos de Zurich: marcas → submarcas → claves Zurich por
// modelo. Zurich separa automóviles (tipoVehiculo 1) de camiones ligeros
// (tipoVehiculo 2, pick ups), así que la búsqueda recorre ambos.

import { getZurichConfig } from "./config";
import { bloques, llamarZurich, valor, xmlCampos, type Campos } from "./client";

const CATALOGOS = "autos/consultaCatalogosAutos/publicService";
const CLAVES = "autos/consultaClavesVehiculos/publicService";
const TIPOS_VEHICULO = ["1", "2"] as const;
const TTL_MS = 12 * 60 * 60 * 1000;

export interface VehiculoZurich {
  claveZurich: string;
  tipoVehiculo: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoZurich {
  marca: string;
  submarca?: string;
  anio: number;
}

export interface DetalleVehiculoZurich {
  tipoVehiculo: string;
  descripcion: string;
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
// nombre de catálogo más largo que sea prefijo del buscado o lo contenga.
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

function entradas(xml: string, bloque: string, campoId: string): Entrada[] {
  return bloques(xml, bloque)
    .map((b) => ({ id: valor(b, campoId), nombre: valor(b, "descripcion") }))
    .filter((e) => e.id && e.id !== "0" && e.nombre);
}

function credencialesCatalogo(): Campos {
  const cfg = getZurichConfig();
  return [
    ["usuario", cfg.usuario],
    ["agente", cfg.agente],
  ];
}

function marcas(tipoVehiculo: string): Promise<Entrada[]> {
  const cfg = getZurichConfig();
  return conCache(`marcas:${tipoVehiculo}`, async () => {
    const xml = await llamarZurich(
      CATALOGOS,
      "SolicitudCatalogoMarcas",
      xmlCampos([
        ["numRequest", 11],
        ["catalogo", "MARCA"],
        ...credencialesCatalogo(),
        ["numRelacion", cfg.numRelacion],
        ["tipoVehiculo", tipoVehiculo],
      ]),
    );
    return entradas(xml, "marca", "claveMarca");
  });
}

function submarcas(tipoVehiculo: string, claveMarca: string): Promise<Entrada[]> {
  const cfg = getZurichConfig();
  return conCache(`submarcas:${tipoVehiculo}:${claveMarca}`, async () => {
    const xml = await llamarZurich(
      CATALOGOS,
      "reqCatSubMarcasAuto",
      xmlCampos([
        ["numRequest", 12],
        ["catalogo", "SUBMA"],
        ...credencialesCatalogo(),
        ["claveMarca", claveMarca],
        ["numRelacion", cfg.numRelacion],
        ["tipoVehiculo", tipoVehiculo],
      ]),
    );
    return entradas(xml, "subMarcaAuto", "claveSubMarcaAuto");
  });
}

async function claves(
  tipoVehiculo: string,
  marca: string,
  submarca: string,
  anio: number,
): Promise<Entrada[]> {
  const cfg = getZurichConfig();
  const xml = await llamarZurich(
    CLAVES,
    "reqClaveZurichAuto",
    xmlCampos([
      ["numRequest", 14],
      ["catalogo", "CAUTO"],
      ["tipoVehiculo", tipoVehiculo],
      ["marca", marca],
      ["submarca", submarca],
      ["modelo", anio],
      ["numRelacion", cfg.numRelacion],
      ...credencialesCatalogo(),
    ]),
  );
  return entradas(xml, "claveZurich", "clave");
}

async function buscarPorTipo(
  tipoVehiculo: string,
  filtros: BusquedaVehiculoZurich,
): Promise<VehiculoZurich[]> {
  const marca = buscarEquivalente(await marcas(tipoVehiculo), filtros.marca);
  if (!marca) return [];
  const lista = await submarcas(tipoVehiculo, marca.id);
  const elegidas = filtros.submarca
    ? [buscarEquivalente(lista, filtros.submarca)].filter((s): s is Entrada => Boolean(s))
    : lista;
  const porSubmarca = await Promise.all(
    elegidas.map(async (sub) =>
      (await claves(tipoVehiculo, marca.id, sub.id, filtros.anio)).map((c) => ({
        claveZurich: c.id,
        tipoVehiculo,
        marca: marca.nombre,
        submarca: sub.nombre,
        anio: filtros.anio,
        descripcion: c.nombre,
      })),
    ),
  );
  return porSubmarca.flat();
}

export async function buscarVehiculos(
  filtros: BusquedaVehiculoZurich,
): Promise<VehiculoZurich[]> {
  const porTipo = await Promise.all(
    TIPOS_VEHICULO.map((t) => buscarPorTipo(t, filtros)),
  );
  return porTipo.flat();
}

// Tipo de vehículo y descripción de una clave Zurich.
export async function detalleVehiculo(claveZurich: string): Promise<DetalleVehiculoZurich> {
  const cfg = getZurichConfig();
  const xml = await llamarZurich(
    CLAVES,
    "reqClaveZurichAutoDetalle",
    xmlCampos([
      ["numRequest", 23],
      ["catalogo", "CLAZU"],
      ...credencialesCatalogo(),
      ["claveZurich", claveZurich],
      ["numRelacion", cfg.numRelacion],
    ]),
  );
  return {
    tipoVehiculo: valor(xml, "tipoVehiculo") || "1",
    descripcion: valor(xml, "descripcion"),
  };
}
