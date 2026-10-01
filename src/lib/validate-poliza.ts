import { ESTATUS_PAGO, type EstatusPago, type PolizaInput } from "@/domain/admin";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Valida y normaliza el cuerpo recibido para crear/actualizar una póliza.
export function parsePolizaInput(
  body: unknown,
): { data: PolizaInput; error: null } | { data: null; error: string } {
  if (!body || typeof body !== "object") {
    return { data: null, error: "Solicitud inválida." };
  }
  const b = body as Record<string, unknown>;

  const numeroPoliza = String(b.numeroPoliza ?? "").trim();
  const ramo = String(b.ramo ?? "").trim();
  const aseguradora = String(b.aseguradora ?? "").trim();
  const asegurado = String(b.asegurado ?? "").trim();
  const vigenciaInicio = String(b.vigenciaInicio ?? "").trim();
  const vigenciaFin = String(b.vigenciaFin ?? "").trim();
  const primaNeta = Number(b.primaNeta);
  const primaTotal = Number(b.primaTotal);
  const notas =
    typeof b.notas === "string" && b.notas.trim() ? b.notas.trim() : undefined;
  const vehiculo =
    typeof b.vehiculo === "string" && b.vehiculo.trim()
      ? b.vehiculo.trim()
      : undefined;
  const numeroSerie =
    typeof b.numeroSerie === "string" && b.numeroSerie.trim()
      ? b.numeroSerie.trim().toUpperCase()
      : undefined;
  const estatusPagoRaw =
    typeof b.estatusPago === "string" ? b.estatusPago.trim() : "";
  const estatusPago =
    ESTATUS_PAGO.find((e) => e.value === estatusPagoRaw)?.value ?? null;

  if (!numeroPoliza) return { data: null, error: "El número de póliza es obligatorio." };
  if (!ramo) return { data: null, error: "El ramo es obligatorio." };
  if (!aseguradora) return { data: null, error: "La aseguradora es obligatoria." };
  if (!asegurado) return { data: null, error: "El asegurado es obligatorio." };
  if (!Number.isFinite(primaNeta) || primaNeta < 0)
    return { data: null, error: "La prima neta no es válida." };
  if (!Number.isFinite(primaTotal) || primaTotal < 0)
    return { data: null, error: "La prima total no es válida." };
  if (!RE_FECHA.test(vigenciaInicio))
    return { data: null, error: "La vigencia inicial no es válida." };
  if (!RE_FECHA.test(vigenciaFin))
    return { data: null, error: "La vigencia final no es válida." };
  if (estatusPagoRaw && !estatusPago)
    return { data: null, error: "El estatus de pago no es válido." };
  if (vigenciaFin < vigenciaInicio)
    return {
      data: null,
      error: "La vigencia final no puede ser anterior a la inicial.",
    };

  return {
    data: {
      numeroPoliza,
      ramo,
      aseguradora,
      asegurado,
      primaNeta,
      primaTotal,
      vigenciaInicio,
      vigenciaFin,
      notas,
      vehiculo,
      numeroSerie,
      estatusPago: estatusPago as EstatusPago | null,
    },
    error: null,
  };
}
