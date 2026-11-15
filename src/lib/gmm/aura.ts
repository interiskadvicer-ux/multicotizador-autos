import tarifas from "./aura-tarifas.json";
import {
  aplicaMaternidad,
  type ResultadoGmm,
  type SolicitudGmm,
} from "./opciones";

// Réplica del Excel "COTIZADOR AURA - GMMI": prima de tarifa por edad y sexo
// del plan base, por los factores de suma, deducible, coaseguro, tope, zona,
// nivel hospitalario y tabulador, más asistencias (y emergencia en el extranjero).

const r2 = (n: number) => Math.round(n * 100) / 100;

function factor(tabla: (string | number)[][], clave: string | number, campo: string): number {
  const fila = tabla.find(([k]) => k === clave);
  if (!fila) throw new Error(`${campo} no válido: ${clave}.`);
  return Number(fila[1]);
}

const PAGOS: Record<SolicitudGmm["formaPago"], number> = {
  ANUAL: 1,
  SEMESTRAL: 2,
  TRIMESTRAL: 4,
  MENSUAL: 12,
};

export function cotizarAura(s: SolicitudGmm): ResultadoGmm {
  const zona = factor(tarifas.estadoZona, s.estado, "Estado");
  // AURA quita gastos de administración y utilidad en zonas 1 y 2 con deducible ≥ $50,000.
  const gastos =
    (zona === 1 || zona === 2) && s.deducible >= 50000
      ? tarifas.gastos.reducido
      : tarifas.gastos.base;

  const col = tarifas.topeCoaseguro.coaseguros.indexOf(s.coaseguro);
  const filaTope = tarifas.topeCoaseguro.filas.find(([t]) => t === s.topeCoaseguro);
  const factorTope = col < 0 || !filaTope ? null : filaTope[1 + col];
  if (factorTope == null) throw new Error("Tope de coaseguro no válido.");

  const factores =
    factor(tarifas.sumaAsegurada, s.sumaAsegurada, "Suma asegurada") *
    factor(tarifas.deducible, s.deducible, "Deducible") *
    factor(tarifas.coaseguro, s.coaseguro, "Coaseguro") *
    factor(tarifas.zona, zona, "Zona") *
    factorTope *
    factor(tarifas.nivelHospitalario, s.nivelHospitalario, "Nivel hospitalario") *
    factor(tarifas.tabulador, s.tabulador, "Tabulador de honorarios");

  const asistencias = tarifas.asistencias / (1 - gastos);
  const emergencia = s.emergenciaExtranjero ? tarifas.emergenciaExtranjero / (1 - gastos) : 0;

  const asegurados = s.asegurados.map((a) => {
    const fila = tarifas.tarifas[Math.min(Math.max(Math.floor(a.edad), 0), tarifas.tarifas.length - 1)];
    const riesgo = r2(Number(fila[a.sexo === "F" ? 0 : 1]));
    const tarifa = r2((riesgo * (1 + tarifas.inflacion)) / (1 - gastos));
    const prima = r2(r2(tarifa * factores + asistencias) + emergencia);
    return { ...a, prima };
  });

  const primaNeta = r2(asegurados.reduce((t, a) => t + a.prima, 0));
  const derechoPoliza = tarifas.derechoPoliza;
  const recargoFraccionado = r2(primaNeta * tarifas.recargoFraccionado[s.formaPago]);
  const subtotal = r2(primaNeta + derechoPoliza + recargoFraccionado);
  const iva = r2(subtotal * 0.16);
  const primaTotal = r2(subtotal + iva);
  const numeroPagos = PAGOS[s.formaPago];
  const pagoSubsecuente =
    numeroPagos === 1 ? 0 : r2(((primaNeta + recargoFraccionado) / numeroPagos) * 1.16);
  const primerPago = numeroPagos === 1 ? primaTotal : r2(pagoSubsecuente + derechoPoliza * 1.16);

  return {
    asegurados,
    primaNeta,
    derechoPoliza,
    recargoFraccionado,
    subtotal,
    iva,
    primaTotal,
    primerPago,
    pagoSubsecuente,
    numeroPagos,
    beneficioMaternidad: aplicaMaternidad(s.asegurados),
  };
}
