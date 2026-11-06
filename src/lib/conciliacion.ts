// Conciliación de estados de cuenta de aseguradoras contra las pólizas
// registradas: busca cada número de póliza en el texto del PDF y propone el
// monto que aparece en el mismo renglón.

export interface PolizaConciliable {
  id: number;
  numeroPoliza: string;
  asegurado: string;
  aseguradora: string;
  primaTotal: number;
  pagado: number;
}

export interface Coincidencia {
  polizaId: number;
  numeroPoliza: string;
  asegurado: string;
  aseguradora: string;
  primaTotal: number;
  pagado: number;
  saldo: number;
  linea: string;
  montosLinea: number[];
  montoSugerido: number;
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const sinCeros = (s: string) => s.replace(/^0+/, "");

export function extraerMontos(linea: string): number[] {
  const re = /-?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\$?\s?\d+\.\d{2}\b/g;
  return (linea.match(re) ?? [])
    .map((m) => Number(m.replace(/[$,\s]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// Un número de póliza puede venir partido por espacios o guiones
// ("0123 456789"); se prueban hasta 4 tokens consecutivos.
function lineaContiene(linea: string, numero: string): boolean {
  const objetivo = normalizar(numero);
  if (objetivo.length < 4) return false;
  const tokens = linea.split(/\s+/).map(normalizar).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    let acumulado = "";
    for (let j = i; j < Math.min(tokens.length, i + 4); j++) {
      acumulado += tokens[j];
      if (acumulado === objetivo || sinCeros(acumulado) === sinCeros(objetivo)) {
        return true;
      }
      if (acumulado.length >= objetivo.length) break;
    }
  }
  return false;
}

export function conciliar(
  texto: string,
  polizas: PolizaConciliable[],
): Coincidencia[] {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const resultado: Coincidencia[] = [];
  for (const p of polizas) {
    const idx = lineas.findIndex((l) => lineaContiene(l, p.numeroPoliza));
    if (idx < 0) continue;
    const linea = lineas[idx];
    let montos = extraerMontos(linea);
    if (montos.length === 0 && idx + 1 < lineas.length) {
      montos = extraerMontos(lineas[idx + 1]);
    }
    const saldo = Math.max(0, Math.round((p.primaTotal - p.pagado) * 100) / 100);
    const referencia = saldo > 0 ? saldo : p.primaTotal;
    const montoSugerido = montos.length
      ? montos.reduce((a, b) =>
          Math.abs(b - referencia) < Math.abs(a - referencia) ? b : a,
        )
      : referencia;
    resultado.push({
      polizaId: p.id,
      numeroPoliza: p.numeroPoliza,
      asegurado: p.asegurado,
      aseguradora: p.aseguradora,
      primaTotal: p.primaTotal,
      pagado: p.pagado,
      saldo,
      linea: linea.slice(0, 240),
      montosLinea: montos,
      montoSugerido,
    });
  }
  return resultado;
}

// "Quálitas" ~ "QUALITAS COMPAÑIA DE SEGUROS": compara sin acentos y por
// inclusión para tolerar nombres capturados a mano.
export function mismaAseguradora(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return true;
  return x.includes(y) || y.includes(x);
}
