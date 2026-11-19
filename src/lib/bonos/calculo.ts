import { redondear } from "./normalizar";

export const GRUPO_AUTOS_DANOS = "AUTOS -DAÑOS";
export const GRUPO_VIDA_ACCIDENTES = "VIDA - ACCI";
export const GRUPO_TRANSPORTE = "TRASPORTE";

export interface AgenteCalculo {
  id: number;
  nombre: string;
  subpromo: string;
  porcentaje: number;
}

export interface RamoCalculo {
  grupo: string;
  porcentaje: number;
}

export interface RepartoCalculo {
  origenId: number;
  destinoId: number;
  porcentaje: number;
}

export interface FilaProduccion {
  agenteId: number;
  subgrupo: string;
  primaCobrada: number;
}

export interface Tasas {
  iva: number;
  retIsr: number;
  retIva: number;
}

export interface Factura {
  bono: number;
  iva: number;
  retIsr: number;
  retIva: number;
  total: number;
}

export interface RepartoAplicado {
  agenteId: number;
  nombre: string;
  porcentaje: number;
  importe: number;
}

export interface ResultadoAgente extends Factura {
  agenteId: number;
  nombre: string;
  base: number;
  porcentaje: number;
  recibe: RepartoAplicado[];
  cede: RepartoAplicado[];
}

export interface ResultadoPromotorFila {
  agenteId: number;
  nombre: string;
  primaAutosDanos: number;
  bonoAutosDanos: number;
  porcentajeAgente: number;
  bonoAgente: number;
  diferencia: number;
  primaVida: number;
  bonoVida: number;
  primaTransporte: number;
  bonoTransporte: number;
  totalSinAgente: number;
}

export interface ResultadoPromotor extends Factura {
  filas: ResultadoPromotorFila[];
  totales: Omit<ResultadoPromotorFila, "agenteId" | "nombre" | "porcentajeAgente">;
  ponderado: number;
  factor: number;
  subtotal: number;
}

export function calcularFactura(bono: number, tasas: Tasas): Factura {
  const b = redondear(bono);
  const iva = redondear(bono * tasas.iva);
  const retIsr = redondear(bono * tasas.retIsr);
  const retIva = redondear(bono * tasas.retIva);
  return { bono: b, iva, retIsr, retIva, total: redondear(b + iva - retIsr - retIva) };
}

interface Acumulado {
  autosDanos: number;
  bonoAutosDanos: number;
  vida: number;
  bonoVida: number;
  transporte: number;
  bonoTransporte: number;
}

function acumular(
  filas: FilaProduccion[],
  ramos: Map<string, RamoCalculo>,
): Map<number, Acumulado> {
  const res = new Map<number, Acumulado>();
  for (const f of filas) {
    const ramo = ramos.get(f.subgrupo);
    if (!ramo || ramo.porcentaje <= 0) continue;
    let a = res.get(f.agenteId);
    if (!a) {
      a = { autosDanos: 0, bonoAutosDanos: 0, vida: 0, bonoVida: 0, transporte: 0, bonoTransporte: 0 };
      res.set(f.agenteId, a);
    }
    const bono = f.primaCobrada * ramo.porcentaje;
    if (ramo.grupo === GRUPO_AUTOS_DANOS) {
      a.autosDanos += f.primaCobrada;
      a.bonoAutosDanos += bono;
    } else if (ramo.grupo === GRUPO_VIDA_ACCIDENTES) {
      a.vida += f.primaCobrada;
      a.bonoVida += bono;
    } else if (ramo.grupo === GRUPO_TRANSPORTE) {
      a.transporte += f.primaCobrada;
      a.bonoTransporte += bono;
    }
  }
  return res;
}

// Bono de cada agente de la subpromotoría: prima computable de Autos/Daños
// × % del agente. Un reparto mueve parte del % de un agente (origen) a otro
// (destino); el costo total para la promotoría no cambia.
function bonosAgentes(
  agentes: AgenteCalculo[],
  acumulado: Map<number, Acumulado>,
  repartos: RepartoCalculo[],
) {
  const porId = new Map(agentes.map((a) => [a.id, a]));
  const res = new Map<number, { base: number; bono: number; recibe: RepartoAplicado[]; cede: RepartoAplicado[] }>();
  for (const a of agentes) {
    const base = acumulado.get(a.id)?.autosDanos ?? 0;
    res.set(a.id, { base, bono: base * a.porcentaje, recibe: [], cede: [] });
  }
  // Un agente no puede ceder más de su propio %: si los repartos lo exceden se reducen en proporción.
  const cedido = new Map<number, number>();
  for (const r of repartos) cedido.set(r.origenId, (cedido.get(r.origenId) ?? 0) + r.porcentaje);
  for (const r of repartos) {
    const origen = res.get(r.origenId);
    const destino = res.get(r.destinoId);
    if (!origen || !destino) continue;
    const total = cedido.get(r.origenId)!;
    const tope = porId.get(r.origenId)!.porcentaje;
    const importe = origen.base * (total > tope ? (r.porcentaje * tope) / total : r.porcentaje);
    origen.bono -= importe;
    destino.bono += importe;
    origen.cede.push({ agenteId: r.destinoId, nombre: porId.get(r.destinoId)!.nombre, porcentaje: r.porcentaje, importe: redondear(importe) });
    destino.recibe.push({ agenteId: r.origenId, nombre: porId.get(r.origenId)!.nombre, porcentaje: r.porcentaje, importe: redondear(importe) });
  }
  return res;
}

export function calcularAgentes(
  agentes: AgenteCalculo[],
  filas: FilaProduccion[],
  ramos: Map<string, RamoCalculo>,
  repartos: RepartoCalculo[],
  tasas: Tasas,
): ResultadoAgente[] {
  const acumulado = acumular(filas, ramos);
  const bonos = bonosAgentes(agentes, acumulado, repartos);
  return agentes.map((a) => {
    const b = bonos.get(a.id)!;
    return {
      agenteId: a.id,
      nombre: a.nombre,
      base: redondear(b.base),
      porcentaje: a.porcentaje,
      recibe: b.recibe,
      cede: b.cede,
      ...calcularFactura(b.bono, tasas),
    };
  });
}

// Bono mensual del promotor: bono de sus agentes en Autos/Daños menos lo que
// se les paga, más Vida/Accidentes y Transporte, × ponderado × factor.
export function calcularPromotor(
  agentes: AgenteCalculo[],
  filas: FilaProduccion[],
  ramos: Map<string, RamoCalculo>,
  repartos: RepartoCalculo[],
  ponderado: number,
  factor: number,
  tasas: Tasas,
): ResultadoPromotor {
  const acumulado = acumular(filas, ramos);
  const bonos = bonosAgentes(agentes, acumulado, repartos);
  const vacio = { autosDanos: 0, bonoAutosDanos: 0, vida: 0, bonoVida: 0, transporte: 0, bonoTransporte: 0 };
  const filasRes: ResultadoPromotorFila[] = agentes.map((a) => {
    const ac = acumulado.get(a.id) ?? vacio;
    const bonoAgente = bonos.get(a.id)!.bono;
    const diferencia = ac.bonoAutosDanos - bonoAgente;
    return {
      agenteId: a.id,
      nombre: a.nombre,
      primaAutosDanos: ac.autosDanos,
      bonoAutosDanos: ac.bonoAutosDanos,
      porcentajeAgente: a.porcentaje,
      bonoAgente,
      diferencia,
      primaVida: ac.vida,
      bonoVida: ac.bonoVida,
      primaTransporte: ac.transporte,
      bonoTransporte: ac.bonoTransporte,
      totalSinAgente: diferencia + ac.bonoVida + ac.bonoTransporte,
    };
  });
  const campos = [
    "primaAutosDanos", "bonoAutosDanos", "bonoAgente", "diferencia", "primaVida",
    "bonoVida", "primaTransporte", "bonoTransporte", "totalSinAgente",
  ] as const;
  const totales = Object.fromEntries(
    campos.map((c) => [c, redondear(filasRes.reduce((s, f) => s + f[c], 0))]),
  ) as ResultadoPromotor["totales"];
  const redondeadas = filasRes.map((f) => {
    const r = { ...f };
    for (const c of campos) r[c] = redondear(f[c]);
    return r;
  });
  const sumaSinAgente = filasRes.reduce((s, f) => s + f.totalSinAgente, 0);
  const bono = sumaSinAgente * ponderado * factor;
  return {
    filas: redondeadas,
    totales,
    ponderado,
    factor,
    subtotal: redondear(sumaSinAgente * ponderado),
    ...calcularFactura(bono, tasas),
  };
}
