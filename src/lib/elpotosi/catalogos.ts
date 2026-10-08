// Catálogo vehicular de El Potosí en cascada: tipo (AUT / PIC) → marcas →
// modelos (submarcas) → versiones. La clave del vehículo se arma como
// `tipo-marca-modelo-version`, p. ej. AUT-120-001-07.

import { getElPotosiConfig, llamarElPotosi, urlCotizador } from "./client";

const TIPOS = ["AUT", "PIC"] as const;
export type TipoVehiculoElPotosi = (typeof TIPOS)[number];
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_MODELOS = 10;

export interface VehiculoElPotosi {
  claveElPotosi: string;
  tipo: TipoVehiculoElPotosi;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoElPotosi {
  marca: string;
  submarca?: string;
  anio: number;
}

export interface ClaveElPotosi {
  tipo: TipoVehiculoElPotosi;
  marca: string;
  modelo: string;
  version: string;
}

interface Entrada {
  ID: string;
  DESCRIPCION: string;
}

export function parsearClaveElPotosi(clave: string): ClaveElPotosi | undefined {
  const m = /^(AUT|PIC)-(\w+)-(\w+)-(\w+)$/i.exec(clave.trim());
  if (!m) return undefined;
  return {
    tipo: m[1].toUpperCase() as TipoVehiculoElPotosi,
    marca: m[2],
    modelo: m[3],
    version: m[4],
  };
}

const cache = new Map<string, { expira: number; valor: Promise<unknown> }>();

export function conCache<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor as Promise<T>;
  const promesa = cargar();
  cache.set(clave, { expira: Date.now() + TTL_MS, valor: promesa });
  promesa.catch(() => cache.delete(clave));
  return promesa;
}

function catalogo(nombre: string, body: Record<string, unknown>): Promise<Entrada[]> {
  const cfg = getElPotosiConfig();
  return conCache(`${nombre}:${JSON.stringify(body)}`, () =>
    llamarElPotosi<Entrada[]>(`${cfg.urlCatalogos}/${nombre}`, {
      usuario: cfg.usuario,
      ...body,
    }),
  );
}

function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function coincide(catalogo: string, buscado: string): boolean {
  const a = normalizar(catalogo);
  const b = normalizar(buscado);
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a)));
}

export async function buscarVehiculos(
  f: BusquedaVehiculoElPotosi,
): Promise<VehiculoElPotosi[]> {
  const resultados: VehiculoElPotosi[] = [];
  for (const tipo of TIPOS) {
    const marcas = await catalogo("marcas", { tipoVehiculo: tipo, anio: f.anio });
    const marca = marcas.find((m) => normalizar(m.DESCRIPCION) === normalizar(f.marca));
    if (!marca) continue;
    const modelos = await catalogo("modelos", {
      tipoVehiculo: tipo,
      anio: f.anio,
      marca: marca.ID,
    });
    const elegidos = (
      f.submarca ? modelos.filter((m) => coincide(m.DESCRIPCION, f.submarca!)) : modelos
    ).slice(0, MAX_MODELOS);
    for (const modelo of elegidos) {
      const versiones = await catalogo("versiones", {
        tipoVehiculo: tipo,
        anio: f.anio,
        marca: marca.ID,
        modelo: modelo.ID,
      });
      for (const v of versiones) {
        resultados.push({
          claveElPotosi: `${tipo}-${marca.ID}-${modelo.ID}-${v.ID}`,
          tipo,
          marca: marca.DESCRIPCION,
          submarca: modelo.DESCRIPCION,
          anio: f.anio,
          descripcion: v.DESCRIPCION.replace(/\s*Año:\s*\d+\s*$/i, ""),
        });
      }
    }
  }
  return resultados;
}

interface Asentamiento {
  c_Estado: string;
  c_Cve_Ciudad: string;
}
interface Municipio {
  c_Estado: string;
  c_Mnpio: string;
  c_Cve_Ciudad: string;
}

// Estado y municipio de El Potosí a partir del código postal.
export function ubicacionPorCp(
  cp: string,
): Promise<{ estado: string; municipio: string }> {
  const { usuario } = getElPotosiConfig();
  return conCache(`cp:${cp}`, async () => {
    const asentamientos = await llamarElPotosi<Asentamiento[]>(
      urlCotizador("Sepomex/ObtenerAsentamientos", { CodUsr: usuario, CodigoPostal: cp }),
    );
    const a = asentamientos[0];
    if (!a) throw new Error(`El Potosí no reconoce el código postal ${cp}.`);
    const municipios = await conCache(`municipios:${a.c_Estado}`, () =>
      llamarElPotosi<Municipio[]>(
        urlCotizador("Sepomex/ObtenerMunicipios", { CodUsr: usuario, C_Estado: a.c_Estado }),
      ),
    );
    const m = municipios.find((x) => x.c_Cve_Ciudad === a.c_Cve_Ciudad);
    if (!m) throw new Error(`El Potosí no tiene municipio para el CP ${cp}.`);
    return { estado: a.c_Estado, municipio: m.c_Mnpio };
  });
}
