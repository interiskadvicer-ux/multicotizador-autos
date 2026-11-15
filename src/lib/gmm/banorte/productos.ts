import esencial from "./esencial.json";
import total from "./total.json";
import transforma from "./transforma.json";
import { LibroExcel, ErrorExcel, type LibroJson, type Valor } from "../excel-motor";

// Cotizadores de GMM Individual de Banorte (Excel 03/2026), evaluados con el
// motor de fórmulas. Cada campo apunta a su celda de captura en COTIZACION y
// toma sus opciones de la misma lista desplegable del Excel.

export type ProductoBanorte = "ESENCIAL" | "TOTAL" | "TRANSFORMA";

interface Campo {
  clave: string;
  etiqueta: string;
  celda: string;
  opciones: string; // rango con la lista desplegable del Excel
  formato?: "dinero" | "porcentaje";
}

interface Config {
  nombre: string;
  libro: LibroJson;
  campos: Campo[];
  filas: number[]; // filas de asegurados en COTIZACION (C nombre, D sexo, E edad)
  sexo: { F: string; M: string };
  pagos: number; // primera fila de la tabla Anual/Semestral/Trimestral/Mensual (G..J)
  mensajes: string[];
}

const C = (celda: string) => `COTIZACION!${celda}`;

const PRODUCTOS: Record<ProductoBanorte, Config> = {
  ESENCIAL: {
    nombre: "Banorte Esencial",
    libro: esencial as unknown as LibroJson,
    campos: [
      { clave: "tipo", etiqueta: "Tipo de póliza", celda: C("D8"), opciones: C("H239:H240") },
      { clave: "vigencia", etiqueta: "Primera vigencia en Banorte", celda: C("D9"), opciones: C("H241:H242") },
      { clave: "cotizacion", etiqueta: "Tipo de cotización", celda: C("D10"), opciones: C("E272:E273") },
      { clave: "sa", etiqueta: "Suma asegurada", celda: C("D11"), opciones: C("C271:C298"), formato: "dinero" },
      { clave: "ded", etiqueta: "Deducible", celda: C("D12"), opciones: C("C231:C235"), formato: "dinero" },
      { clave: "estado", etiqueta: "Estado", celda: C("D14"), opciones: C("C310:C341") },
      { clave: "elimDed", etiqueta: "Eliminación de deducible por accidente", celda: C("D16"), opciones: C("I234:I235") },
      { clave: "vision", etiqueta: "Visión incremental", celda: C("D18"), opciones: C("I230:I231") },
      { clave: "enfGrave", etiqueta: "Indemnización por enfermedad grave", celda: C("D19"), opciones: C("H271:H278"), formato: "dinero" },
    ],
    filas: [27, 28, 29, 30, 31, 32, 33, 34],
    sexo: { F: "M", M: "H" },
    pagos: 27,
    mensajes: ["E8", "E9", "E12", "E19", "B44"],
  },
  TOTAL: {
    nombre: "Banorte Total",
    libro: total as unknown as LibroJson,
    campos: [
      { clave: "tipo", etiqueta: "Tipo de póliza", celda: C("D7"), opciones: C("G241:G242") },
      { clave: "vigencia", etiqueta: "Primera vigencia en Banorte", celda: C("D8"), opciones: C("G243:G244") },
      { clave: "cotizacion", etiqueta: "Tipo de cotización", celda: C("D9"), opciones: C("E275:E276") },
      { clave: "sa", etiqueta: "Suma asegurada", celda: C("D10"), opciones: C("C274:C296"), formato: "dinero" },
      { clave: "ded", etiqueta: "Deducible", celda: C("D11"), opciones: C("C236:C242"), formato: "dinero" },
      { clave: "coa", etiqueta: "Coaseguro", celda: C("D12"), opciones: C("E230:E232"), formato: "porcentaje" },
      { clave: "estado", etiqueta: "Estado", celda: C("D13"), opciones: C("C316:C347") },
      { clave: "elimDed", etiqueta: "Eliminación de deducible por accidente", celda: C("D15"), opciones: C("H237:H238") },
      { clave: "parto", etiqueta: "Incremento en parto o cesárea", celda: C("D16"), opciones: C("B257:B258") },
      { clave: "saParto", etiqueta: "Suma asegurada parto o cesárea", celda: C("D17"), opciones: C("C258:C260"), formato: "dinero" },
      { clave: "vision", etiqueta: "Visión incremental", celda: C("D18"), opciones: C("H233:H234") },
      { clave: "enfGrave", etiqueta: "Indemnización por enfermedad grave", celda: C("D19"), opciones: C("G274:G281"), formato: "dinero" },
      { clave: "extranjero", etiqueta: "Cobertura total en el extranjero", celda: C("D20"), opciones: C("H233:H234") },
      { clave: "emergencia", etiqueta: "Emergencia en el extranjero", celda: C("D21"), opciones: C("H233:H234") },
      { clave: "zona", etiqueta: "Zona cobertura en el extranjero", celda: C("D22"), opciones: C("A263:A265") },
      { clave: "thq", etiqueta: "Incremento THQ", celda: C("D25"), opciones: C("F255:F260"), formato: "porcentaje" },
    ],
    filas: [30, 31, 32, 33, 34, 35, 36, 37],
    sexo: { F: "M", M: "H" },
    pagos: 30,
    mensajes: ["E7", "E11", "E15", "E17", "E19", "E20", "B45"],
  },
  TRANSFORMA: {
    nombre: "Banorte Plan Transforma",
    libro: transforma as unknown as LibroJson,
    campos: [
      { clave: "tipo", etiqueta: "Tipo de póliza", celda: C("D7"), opciones: "FACTORES!R37:R38" },
      { clave: "nivel", etiqueta: "Nivel hospitalario", celda: C("D8"), opciones: "FACTORES!R17:R18" },
      { clave: "cotizacion", etiqueta: "Tipo de cotización", celda: C("D9"), opciones: "FACTORES!R21:R22" },
      { clave: "sa", etiqueta: "Suma asegurada", celda: C("D10"), opciones: "FACTORES!U3:U26", formato: "dinero" },
      { clave: "tipoDed", etiqueta: "Tipo de deducible", celda: C("D11"), opciones: "FACTORES!H22:H23" },
      { clave: "ded", etiqueta: "Deducible", celda: C("D12"), opciones: "FACTORES!G4:G13", formato: "dinero" },
      { clave: "coa", etiqueta: "Coaseguro", celda: C("D13"), opciones: "FACTORES!K3:K5" },
      { clave: "estado", etiqueta: "Estado", celda: C("D14"), opciones: "FACTORES!N3:N34" },
      { clave: "elimDed", etiqueta: "Eliminación de deducible por accidente", celda: C("D17"), opciones: "FACTORES!AC35:AC36" },
      { clave: "nacional", etiqueta: "Cobertura nacional", celda: C("D18"), opciones: "FACTORES!AC21:AC22" },
      { clave: "parto", etiqueta: "Incremento en parto o cesárea", celda: C("D19"), opciones: "FACTORES!K21:K23", formato: "dinero" },
      { clave: "vision", etiqueta: "Visión incremental", celda: C("D20"), opciones: "FACTORES!AC21:AC22" },
      { clave: "enfGrave", etiqueta: "Indemnización por enfermedad grave", celda: C("D21"), opciones: "FACTORES!X11:X18", formato: "dinero" },
      { clave: "extranjero", etiqueta: "Cobertura total en el extranjero", celda: C("D22"), opciones: "FACTORES!AC30:AC31" },
      { clave: "thq", etiqueta: "Incremento THQ", celda: C("D24"), opciones: "FACTORES!K11:K16", formato: "porcentaje" },
    ],
    filas: [30, 31, 32, 33, 34, 35, 36, 37],
    sexo: { F: "MUJER", M: "HOMBRE" },
    pagos: 30,
    mensajes: ["E7", "E19", "E21", "E22"],
  },
};

export const PRODUCTOS_BANORTE = Object.keys(PRODUCTOS) as ProductoBanorte[];

const texto = (v: Valor) => (v instanceof ErrorExcel || v === null ? "" : String(v).trim());

function lista(libro: LibroExcel, rango: string): (string | number)[] {
  const [hoja, r] = rango.split("!");
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(r)!;
  const out: (string | number)[] = [];
  for (let f = Number(m[2]); f <= Number(m[4]); f++) {
    const v = libro.valor(`${hoja}!${m[1]}${f}`);
    if (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) out.push(v);
  }
  return out;
}

export interface CampoGmm {
  clave: string;
  etiqueta: string;
  formato?: "dinero" | "porcentaje";
  opciones: (string | number)[];
  valor: string | number;
}

export function camposBanorte(producto: ProductoBanorte): { nombre: string; campos: CampoGmm[] } {
  const cfg = PRODUCTOS[producto];
  const libro = new LibroExcel(cfg.libro);
  return {
    nombre: cfg.nombre,
    campos: cfg.campos.map((c) => {
      const v = libro.valor(c.celda);
      return {
        clave: c.clave,
        etiqueta: c.etiqueta,
        formato: c.formato,
        opciones: lista(libro, c.opciones),
        valor: typeof v === "number" ? v : texto(v),
      };
    }),
  };
}

export interface SolicitudBanorte {
  producto: ProductoBanorte;
  valores: Record<string, string | number>;
  asegurados: { nombre: string; sexo: "F" | "M"; edad: number }[];
}

export interface PagoGmm {
  forma: string;
  primerRecibo: number;
  subsecuentes: number;
  total: number;
}

export interface ResultadoBanorte {
  nombre: string;
  pagos: PagoGmm[];
  avisos: string[];
  asegurados: { nombre: string; parentesco: string; sexo: "F" | "M"; edad: number; aviso: string }[];
}

export function cotizarBanorte(s: SolicitudBanorte): ResultadoBanorte {
  const cfg = PRODUCTOS[s.producto];
  if (!cfg) throw new Error("Producto no válido.");
  const libro = new LibroExcel(cfg.libro);
  for (const c of cfg.campos) {
    if (!(c.clave in s.valores)) continue;
    const v = s.valores[c.clave];
    const permitidas = lista(libro, c.opciones);
    const elegido = permitidas.find((o) => String(o) === String(v));
    if (elegido === undefined) throw new Error(`${c.etiqueta}: opción no válida.`);
    libro.poner(c.celda, elegido);
  }
  if (s.asegurados.length > cfg.filas.length) throw new Error(`Máximo ${cfg.filas.length} asegurados.`);
  cfg.filas.forEach((f, i) => {
    const a = s.asegurados[i];
    libro.poner(C(`C${f}`), a ? a.nombre : null);
    libro.poner(C(`D${f}`), a ? cfg.sexo[a.sexo] : null);
    libro.poner(C(`E${f}`), a ? a.edad : null);
  });
  const num = (celda: string) => {
    const v = libro.valor(celda);
    return typeof v === "number" ? v : 0;
  };
  const pagos: PagoGmm[] = [0, 1, 2, 3].map((i) => {
    const f = cfg.pagos + i;
    return {
      forma: texto(libro.valor(C(`G${f}`))),
      primerRecibo: num(C(`H${f}`)),
      subsecuentes: num(C(`I${f}`)),
      total: num(C(`J${f}`)),
    };
  });
  return {
    nombre: cfg.nombre,
    pagos,
    avisos: cfg.mensajes.map((m) => texto(libro.valor(C(m)))).filter((m) => m && !m.startsWith("APLICA")),
    asegurados: s.asegurados.map((a, i) => ({
      ...a,
      parentesco: texto(libro.valor(C(`B${cfg.filas[i]}`))) || (i === 0 ? "Titular" : `Asegurado ${i + 1}`),
      aviso: texto(libro.valor(C(`F${cfg.filas[i]}`))),
    })),
  };
}
