// Afirme: recibos por póliza vía web service (getRecibosPolizaActual).
// Registra como pagado cada recibo de cargo en situación PAG y marca
// cancelada la póliza cuando todos sus recibos de cargo están en CAN.

import { db } from "@/lib/db";
import { mismaAseguradora } from "@/lib/conciliacion";
import { getAfirmeConfig, credencialesConfiguradas } from "@/lib/afirme/config";
import { recibosPolizaAfirme } from "@/lib/afirme/recibos";
import { esDevolucion, type Recibo, type ResultadoFuente } from "@/domain/cobranza";

const ASEGURADORA = "Afirme";

// Pólizas vencidas hace poco todavía pueden recibir pagos atrasados.
const DIAS_DESPUES_DE_VENCER = 90;

interface PolizaAfirme {
  id: number;
  numero_poliza: string;
  aseguradora: string;
}

interface ReciboGuardado {
  id_recibo: string;
  situacion: string;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function polizasPorRevisar(fechaCorte: string): PolizaAfirme[] {
  const rows = db
    .prepare(
      `SELECT id, numero_poliza, aseguradora FROM policies
       WHERE estatus <> 'CANCELADA' AND vigencia_fin >= date(?, ?)
       ORDER BY id`,
    )
    .all(fechaCorte, `-${DIAS_DESPUES_DE_VENCER} days`) as PolizaAfirme[];
  return rows.filter((p) => mismaAseguradora(p.aseguradora, ASEGURADORA) && p.aseguradora.trim());
}

// Afirme no informa la fecha de pago: si el recibo ya se conocía como
// pendiente, el pago se detectó en el día de corte; en la primera consulta
// se usa el inicio del periodo del recibo (sin pasar del día de corte).
function fechaPagoDetectada(r: Recibo, previo: ReciboGuardado | undefined, fechaCorte: string): string {
  if (previo) return fechaCorte;
  const inicio = r.vigenciaInicio;
  return inicio && inicio < fechaCorte ? inicio : fechaCorte;
}

const guardarRecibo = () =>
  db.prepare(
    `INSERT INTO policy_receipts
       (poliza_id, id_recibo, folio, numero_endoso, tipo_recibo, situacion, prima_total,
        vigencia_inicio, vigencia_fin, fecha_vencimiento, actualizado_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (poliza_id, id_recibo) DO UPDATE SET
       folio = excluded.folio, numero_endoso = excluded.numero_endoso,
       tipo_recibo = excluded.tipo_recibo, situacion = excluded.situacion,
       prima_total = excluded.prima_total, vigencia_inicio = excluded.vigencia_inicio,
       vigencia_fin = excluded.vigencia_fin, fecha_vencimiento = excluded.fecha_vencimiento,
       actualizado_at = excluded.actualizado_at`,
  );

// Guarda los recibos y registra pagos/cancelación. Regresa lo que cambió.
export function aplicarRecibos(
  polizaId: number,
  recibos: Recibo[],
  fechaCorte: string,
  aseguradora = ASEGURADORA,
): { pagosNuevos: number; cancelada: boolean } {
  return db.transaction(() => {
    const previos = new Map(
      (
        db
          .prepare("SELECT id_recibo, situacion FROM policy_receipts WHERE poliza_id = ?")
          .all(polizaId) as ReciboGuardado[]
      ).map((r) => [r.id_recibo, r]),
    );
    const insertarRecibo = guardarRecibo();
    let pagosNuevos = 0;
    for (const r of recibos) {
      insertarRecibo.run(
        polizaId, r.idRecibo, r.folio || null, r.numeroEndoso, r.tipoRecibo || null,
        r.situacion, r.primaTotal, r.vigenciaInicio, r.vigenciaFin, r.fechaVencimiento,
      );
      if (esDevolucion(r) || r.situacion !== "PAGADO") continue;
      const yaRegistrado = db
        .prepare("SELECT 1 FROM policy_payments WHERE poliza_id = ? AND recibo IN (?, ?)")
        .get(polizaId, r.idRecibo, r.folio || r.idRecibo);
      if (yaRegistrado) continue;
      // Un pago capturado a mano por el mismo importe y sin recibo es este.
      const manual = db
        .prepare(
          `SELECT id FROM policy_payments
           WHERE poliza_id = ? AND recibo IS NULL AND ABS(monto - ?) < 1
           ORDER BY fecha_pago LIMIT 1`,
        )
        .get(polizaId, r.primaTotal) as { id: number } | undefined;
      if (manual) {
        db.prepare("UPDATE policy_payments SET recibo = ? WHERE id = ?").run(r.idRecibo, manual.id);
        continue;
      }
      const previo = previos.get(r.idRecibo);
      db.prepare(
        `INSERT INTO policy_payments (poliza_id, fecha_pago, monto, origen, recibo, notas)
         VALUES (?, ?, ?, 'WS_ASEGURADORA', ?, ?)`,
      ).run(
        polizaId,
        r.fechaPago || fechaPagoDetectada(r, previo, fechaCorte),
        redondear(r.primaTotal),
        r.idRecibo,
        r.fechaPago
          ? `Pago informado por ${aseguradora} en la consulta diaria.`
          : previo
            ? `Pago detectado en la consulta diaria a ${aseguradora} (no informa la fecha exacta).`
            : `Carga inicial desde ${aseguradora}: fecha aproximada al inicio del periodo del recibo.`,
      );
      pagosNuevos++;
    }

    const cargos = recibos.filter((r) => !esDevolucion(r));
    const cancelada = cargos.length > 0 && cargos.every((r) => r.situacion === "CANCELADO");
    if (cancelada) {
      db.prepare(
        `UPDATE policies SET estatus = 'CANCELADA', fecha_cancelacion = ?, updated_at = datetime('now')
         WHERE id = ? AND estatus <> 'CANCELADA'`,
      ).run(fechaCorte, polizaId);
    }
    return { pagosNuevos, cancelada };
  })();
}

export async function sincronizarAfirme(fechaCorte: string): Promise<ResultadoFuente> {
  const resultado: ResultadoFuente = {
    aseguradora: ASEGURADORA,
    estado: "OK",
    mensaje: "",
    polizasRevisadas: 0,
    pagosNuevos: 0,
    cancelaciones: 0,
    errores: [],
  };
  if (!credencialesConfiguradas(getAfirmeConfig())) {
    return { ...resultado, estado: "SIN_CONFIGURAR", mensaje: "Faltan las credenciales del web service de Afirme." };
  }
  for (const p of polizasPorRevisar(fechaCorte)) {
    resultado.polizasRevisadas++;
    try {
      const recibos = await recibosPolizaAfirme(p.numero_poliza);
      const cambio = aplicarRecibos(p.id, recibos, fechaCorte);
      resultado.pagosNuevos += cambio.pagosNuevos;
      if (cambio.cancelada) resultado.cancelaciones++;
    } catch (err) {
      resultado.errores.push({
        numeroPoliza: p.numero_poliza,
        mensaje: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (resultado.errores.length && resultado.errores.length === resultado.polizasRevisadas) {
    resultado.estado = "ERROR";
  }
  resultado.mensaje = `${resultado.polizasRevisadas} pólizas consultadas, ${resultado.pagosNuevos} pagos nuevos, ${resultado.cancelaciones} cancelaciones, ${resultado.errores.length} con error.`;
  return resultado;
}
