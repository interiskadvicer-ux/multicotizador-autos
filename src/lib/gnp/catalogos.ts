// Catálogo de vehículos de GNP (Web Service Preferente). La clave de marca de
// GNP se arma con tipo de vehículo, armadora, carrocería y versión; la
// guardamos como `AUT|NI|24|16` (claveGnp).

import { conLineaPorClase } from "@/lib/lineas-vehiculo";
import { bloques, escapeXml, postGnp, valor } from "./client";
import { getGnpConfig } from "./config";

const TTL_MS = 12 * 60 * 60 * 1000;
// Automóviles y pick ups hasta 1.5 toneladas.
const TIPOS = ["AUT", "CA1"] as const;
export type TipoVehiculoGnp = (typeof TIPOS)[number];

export interface VehiculoGnp {
  claveGnp: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoGnp {
  marca: string;
  submarca?: string;
  anio: number;
}

interface Elemento {
  nombre: string;
  clave: string;
  valor: string;
}

const cache = new Map<string, { expira: number; valor: Promise<Elemento[][]> }>();

function conCache(clave: string, cargar: () => Promise<Elemento[][]>): Promise<Elemento[][]> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const promesa = cargar();
  cache.set(clave, { expira: Date.now() + TTL_MS, valor: promesa });
  promesa.catch(() => cache.delete(clave));
  return promesa;
}

// Cada <ELEMENTOS> de la respuesta es un registro; ARMADORA_VEHICULO trae un
// registro con un elemento por armadora.
async function catalogo(tipo: string, filtros: Array<[string, string]>): Promise<Elemento[][]> {
  const cfg = getGnpConfig();
  const elementos = filtros
    .map(([n, v]) => `<ELEMENTO><NOMBRE>${n}</NOMBRE><CLAVE>${escapeXml(v)}</CLAVE><VALOR>${escapeXml(v)}</VALOR></ELEMENTO>`)
    .join("");
  const xml = await postGnp(
    "/catalogos/catalogo",
    `<SOLICITUD_CATALOGO><USUARIO>${escapeXml(cfg.usuario)}</USUARIO><PASSWORD>${escapeXml(cfg.password)}</PASSWORD>` +
      `<TIPO_CATALOGO>${tipo}</TIPO_CATALOGO><ID_UNIDAD_OPERABLE>${cfg.unidadOperable}</ID_UNIDAD_OPERABLE>` +
      `<FECHA></FECHA><ELEMENTOS>${elementos}</ELEMENTOS></SOLICITUD_CATALOGO>`,
    cfg,
    false,
  );
  return bloques(xml, "ELEMENTOS").map((b) =>
    bloques(b, "ELEMENTO").map((e) => ({
      nombre: valor(e, "NOMBRE"),
      clave: valor(e, "CLAVE"),
      valor: valor(e, "VALOR"),
    })),
  );
}

function alfanumerico(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// GNP agrupa marcas: Chevrolet, GMC, Buick y Cadillac en GENERAL MOTORS;
// Jeep, Dodge y RAM en CHRYSLER; MINI en BMW.
const MARCAS_AGRUPADAS: Record<string, string[]> = {
  CHEVROLET: ["GENERALMOTORS", "GENERALMOTORS2"],
  GMC: ["GENERALMOTORS", "GENERALMOTORS2"],
  BUICK: ["GENERALMOTORS", "GENERALMOTORS2"],
  CADILLAC: ["GENERALMOTORS", "GENERALMOTORS2"],
  JEEP: ["CHRYSLER"],
  DODGE: ["CHRYSLER"],
  RAM: ["CHRYSLER"],
  MINI: ["BMW"],
};

async function armadoras(tipo: TipoVehiculoGnp, anio: number, marca: string): Promise<string[]> {
  const registros = await conCache(`armadoras:${tipo}:${anio}`, () =>
    catalogo("ARMADORA_VEHICULO", [
      ["TIPO_VEHICULO", tipo],
      ["MODELO", String(anio)],
    ]),
  );
  const buscada = alfanumerico(marca);
  const nombres = [buscada, ...(MARCAS_AGRUPADAS[buscada] ?? [])];
  return Array.from(
    new Set(registros.flat().filter((e) => nombres.includes(alfanumerico(e.nombre))).map((e) => e.clave)),
  );
}

function vehiculos(tipo: TipoVehiculoGnp, armadora: string, anio: number): Promise<Elemento[][]> {
  return conCache(`vehiculos:${tipo}:${armadora}:${anio}`, () =>
    catalogo("VEHICULOS", [
      ["TIPO_VEHICULO", tipo],
      ["ARMADORA", armadora],
      ["MODELO", String(anio)],
    ]).catch((err) => {
      // GNP responde error cuando la armadora no tiene vehículos ese año.
      if (err instanceof Error && /no coincide/i.test(err.message)) return [];
      throw err;
    }),
  );
}

// Carrocería de GNP ("NISSAN VERSA", "MAGNITE") contra el modelo buscado, sin
// el prefijo de marca.
function coincideCarroceria(carroceria: string, submarca: string, marca: string): boolean {
  const quitar = (t: string) => {
    let n = alfanumerico(t);
    for (const p of [alfanumerico(marca), ...(MARCAS_AGRUPADAS[alfanumerico(marca)] ?? [])])
      if (p && n.startsWith(p) && n.length > p.length) n = n.slice(p.length);
    return n;
  };
  const c = quitar(carroceria);
  const s = quitar(submarca);
  return Boolean(c && s && (c === s || c.startsWith(s)));
}

async function buscarDirecto(filtros: BusquedaVehiculoGnp): Promise<VehiculoGnp[]> {
  const resultados: VehiculoGnp[] = [];
  for (const tipo of TIPOS) {
    for (const armadora of await armadoras(tipo, filtros.anio, filtros.marca)) {
      for (const registro of await vehiculos(tipo, armadora, filtros.anio)) {
        const campo = (n: string) => registro.find((e) => e.nombre === n);
        const carroceria = campo("CARROCERIA");
        const version = campo("VERSION");
        if (!carroceria || !version) continue;
        if (filtros.submarca && !coincideCarroceria(carroceria.valor, filtros.submarca, filtros.marca)) continue;
        resultados.push({
          claveGnp: [tipo, armadora, carroceria.clave, version.clave].join("|"),
          marca: campo("ARMADORA")?.valor || filtros.marca,
          submarca: carroceria.valor,
          anio: filtros.anio,
          descripcion: version.valor.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return resultados;
}

export function buscarVehiculos(filtros: BusquedaVehiculoGnp): Promise<VehiculoGnp[]> {
  return conLineaPorClase(filtros, (submarca) => buscarDirecto({ ...filtros, submarca }));
}

export function parsearClaveGnp(clave: string) {
  const [tipo, armadora, carroceria, version] = clave.split("|");
  if (!TIPOS.includes(tipo as TipoVehiculoGnp) || !armadora || !carroceria || !version) return undefined;
  return { tipo: tipo as TipoVehiculoGnp, armadora, carroceria, version };
}
