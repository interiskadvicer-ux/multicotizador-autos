// Catálogo vehicular de HDI en cascada: marcas → tipos (submarcas) →
// versiones → transmisiones. HDI no garantiza ObtenerInformacionVehiculo, así
// que el vehículo viaja por marca, tipo, versión y transmisión, con
// idVehiculo vacío. Se recorren automóviles residentes y pick ups.

import { getHdiConfig } from "./config";
import { bloques, llamarHdi, valor, xmlCampos, type Campos } from "./client";

export const TIPO_VEHICULO_AUTO = 4579;
export const TIPO_VEHICULO_PICKUP = 3829;
const TIPOS_VEHICULO = [TIPO_VEHICULO_AUTO, TIPO_VEHICULO_PICKUP] as const;
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_VERSIONES = 40;
const CONCURRENCIA = 5;

export interface VehiculoHdi {
  // `${tipoVehiculo}|${idMarca}|${idTipo}|${idVersion}|${idTransmision}`.
  claveHdi: string;
  tipoVehiculo: number;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoHdi {
  marca: string;
  submarca?: string;
  anio: number;
}

export interface ClaveHdi {
  tipoVehiculo: number;
  idMarca: string;
  idTipo: string;
  idVersion: string;
  idTransmision: string;
}

interface Entrada {
  id: string;
  nombre: string;
}

export function formatearClaveHdi(clave: ClaveHdi): string {
  return [
    clave.tipoVehiculo,
    clave.idMarca,
    clave.idTipo,
    clave.idVersion,
    clave.idTransmision,
  ].join("|");
}

// "4579|3514|MX-5|35 ANIVERSARIO|3800" → { tipoVehiculo: 4579, idMarca:
// "3514", idTipo: "MX-5", ... }. Tipo y versión de HDI son texto, por eso el
// separador es "|". Se acepta el formato anterior "4579-2389654|..." pero
// se descarta el idVehiculo.
export function parsearClaveHdi(clave: string): ClaveHdi | undefined {
  const partes = clave.split("|").map((x) => x.trim());
  if (partes.length !== 5) return undefined;
  const [tipo, idMarca, idTipo, idVersion, idTransmision] = partes;
  const m = /^(\d+)(?:-\d+)?$/.exec(tipo);
  if (!m || !/^\d+$/.test(idMarca) || !idTipo || !idVersion) return undefined;
  if (!/^\d+$/.test(idTransmision)) return undefined;
  return {
    tipoVehiculo: Number(m[1]),
    idMarca,
    idTipo,
    idVersion,
    idTransmision,
  };
}

const cache = new Map<string, { expira: number; valor: Promise<Entrada[]> }>();

function conCache(
  clave: string,
  cargar: () => Promise<Entrada[]>,
): Promise<Entrada[]> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const promesa = cargar();
  cache.set(clave, { expira: Date.now() + TTL_MS, valor: promesa });
  promesa.catch(() => cache.delete(clave));
  return promesa;
}

async function enLotes<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCIA) {
    resultados.push(
      ...(await Promise.all(items.slice(i, i + CONCURRENCIA).map(fn))),
    );
  }
  return resultados;
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
function buscarEquivalente(
  entradas: Entrada[],
  buscado: string,
): Entrada | undefined {
  const objetivo = soloAlfanumerico(buscado);
  const exacta = entradas.find((e) => soloAlfanumerico(e.nombre) === objetivo);
  if (exacta) return exacta;
  return entradas
    .filter((e) => {
      const n = soloAlfanumerico(e.nombre);
      return n && (objetivo.startsWith(n) || n.startsWith(objetivo));
    })
    .sort(
      (a, b) =>
        soloAlfanumerico(a.nombre).length - soloAlfanumerico(b.nombre).length,
    )[0];
}

function entradas(xml: string, item: string): Entrada[] {
  return bloques(xml, item)
    .map((b) => ({ id: valor(b, "Clave"), nombre: valor(b, "Descripcion") }))
    .filter((e) => e.id && e.id !== "0" && e.nombre);
}

function consulta(
  accion: string,
  request: string,
  campos: Campos,
): Promise<string> {
  return llamarHdi(
    accion,
    `<pub:${request}>${xmlCampos(campos)}</pub:${request}>`,
  );
}

function marcas(tipo: number, anio: number): Promise<Entrada[]> {
  const cfg = getHdiConfig();
  return conCache(`marcas:${tipo}:${anio}`, async () =>
    entradas(
      await consulta("ObtenerMarcas", "ObtenerMarcasRequest", [
        ["IdModelo", anio],
        ["IdTipoVehiculo", tipo],
        ["usuario", cfg.usuario],
      ]),
      "Marcas",
    ),
  );
}

function tipos(
  tipo: number,
  anio: number,
  idMarca: string,
): Promise<Entrada[]> {
  return conCache(`tipos:${tipo}:${anio}:${idMarca}`, async () =>
    entradas(
      await consulta("ObtenerTipos", "ObtenerTiposRequest", [
        ["IdMarca", idMarca],
        ["IdModelo", anio],
        ["IdTipoVehiculo", tipo],
      ]),
      "Tipos",
    ),
  );
}

async function versiones(
  tipo: number,
  anio: number,
  idMarca: string,
  idTipo: string,
): Promise<Entrada[]> {
  const cfg = getHdiConfig();
  return entradas(
    await consulta("ObtenerVersiones", "ObtenerVersionesRequest", [
      ["IdMarca", idMarca],
      ["IdModelo", anio],
      ["IdTipo", idTipo],
      ["IdTipoVehiculo", tipo],
      ["usuario", cfg.usuario],
    ]),
    "Versiones",
  );
}

async function transmisiones(
  tipo: number,
  anio: number,
  idMarca: string,
  idTipo: string,
  idVersion: string,
): Promise<Entrada[]> {
  return entradas(
    await consulta("ObtenerTransmisiones", "ObtenerTransmisionesRequest", [
      ["IdMarca", idMarca],
      ["IdModelo", anio],
      ["IdTipo", idTipo],
      ["IdTipoVehiculo", tipo],
      ["IdVersion", idVersion],
    ]),
    "Transmisiones",
  );
}

async function buscarPorTipo(
  tipo: number,
  filtros: BusquedaVehiculoHdi,
): Promise<VehiculoHdi[]> {
  const marca = buscarEquivalente(
    await marcas(tipo, filtros.anio),
    filtros.marca,
  );
  if (!marca) return [];
  const lista = await tipos(tipo, filtros.anio, marca.id);
  const elegidos = filtros.submarca
    ? [buscarEquivalente(lista, filtros.submarca)].filter((s): s is Entrada =>
        Boolean(s),
      )
    : lista;

  const combinaciones: Array<{
    sub: Entrada;
    version: Entrada;
    transmision: Entrada;
  }> = [];
  for (const sub of elegidos) {
    const vers = (await versiones(tipo, filtros.anio, marca.id, sub.id)).slice(
      0,
      MAX_VERSIONES,
    );
    const porVersion = await enLotes(vers, async (version) => ({
      version,
      trans: await transmisiones(
        tipo,
        filtros.anio,
        marca.id,
        sub.id,
        version.id,
      ),
    }));
    for (const { version, trans } of porVersion) {
      for (const transmision of trans)
        combinaciones.push({ sub, version, transmision });
    }
  }

  return combinaciones.map(({ sub, version, transmision }) => ({
    claveHdi: formatearClaveHdi({
      tipoVehiculo: tipo,
      idMarca: marca.id,
      idTipo: sub.id,
      idVersion: version.id,
      idTransmision: transmision.id,
    }),
    tipoVehiculo: tipo,
    marca: marca.nombre,
    submarca: sub.nombre,
    anio: filtros.anio,
    descripcion: `${version.nombre} ${transmision.nombre}`,
  }));
}

export async function buscarVehiculos(
  filtros: BusquedaVehiculoHdi,
): Promise<VehiculoHdi[]> {
  const porTipo = await Promise.all(
    TIPOS_VEHICULO.map((t) => buscarPorTipo(t, filtros)),
  );
  return porTipo.flat();
}
