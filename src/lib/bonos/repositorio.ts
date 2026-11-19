import crypto from "node:crypto";
import { db } from "@/lib/db";
import {
  calcularAgentes,
  calcularPromotor,
  calcularFactura,
  type AgenteCalculo,
  type FilaProduccion,
  type RamoCalculo,
  type RepartoCalculo,
  type ResultadoAgente,
  type ResultadoPromotor,
  type Tasas,
} from "./calculo";
import { mesesDeBimestre, normalizarClave, normalizarNombre, redondear } from "./normalizar";

// ---------- Configuración ----------

export interface ConfigBonos {
  tasaIva: number;
  retIsr: number;
  retIva: number;
  subpromo: string;
  promotorNombre: string;
  promotorEmail: string;
  factorPromotor: number;
  promotorIva: boolean;
  promotorRetenciones: boolean;
  correoCopia: string;
  portalUrl: string;
  datosFacturacion: string;
}

export const CONFIG_INICIAL: ConfigBonos = {
  tasaIva: 0.16,
  retIsr: 0.1,
  retIva: 0.16 * (2 / 3),
  subpromo: "GERARDO",
  promotorNombre: "GERARDO (EMNSULA)",
  promotorEmail: "",
  factorPromotor: 0.6,
  promotorIva: true,
  promotorRetenciones: false,
  correoCopia: "",
  portalUrl: "",
  datosFacturacion: "",
};

export const RAMOS_INICIALES: [string, string, number][] = [
  ["AUTOS", "AUTOS -DAÑOS", 0.09],
  ["NEGOCIOS ESPECIALES AUTOS", "AUTOS -DAÑOS", 0],
  ["ASISTENCIAS AUTOS", "AUTOS -DAÑOS", 0],
  ["CARGA", "TRASPORTE", 0.07],
  ["AVIONES", "AUTOS -DAÑOS", 0],
  ["DIVERSOS", "AUTOS -DAÑOS", 0.09],
  ["INCENDIO", "AUTOS -DAÑOS", 0.09],
  ["OTROS RAMOS DE INCENDIO", "AUTOS -DAÑOS", 0],
  ["RESPONSABILIDAD CIVIL", "AUTOS -DAÑOS", 0.09],
  ["RESPONSABILIDAD CIVIL VIAJERO", "AUTOS -DAÑOS", 0],
  ["ASISTENCIAS DAÑOS", "AUTOS -DAÑOS", 0],
  ["ACCIDENTES GRUPO Y COLECTIVO", "VIDA - ACCI", 0.035],
  ["ACCIDENTES", "VIDA - ACCI", 0.035],
  ["VIDA", "VIDA - ACCI", 0],
  ["VENTA MASIVA", "VIDA - ACCI", 0],
  ["VIDA GRUPO Y COLECTIVO", "VIDA - ACCI", 0.035],
  ["NEGOCIOS ESPECIALES VIDA", "VIDA - ACCI", 0],
  ["NEGOCIOS ESPECIALES DAÑOS", "AUTOS -DAÑOS", 0],
];

let semillaHecha = false;
function asegurarSemilla(): void {
  if (semillaHecha) return;
  const ins = db.prepare("INSERT OR IGNORE INTO bono_ramos (subgrupo, grupo_bono, porcentaje) VALUES (?, ?, ?)");
  const hay = db.prepare("SELECT COUNT(*) AS n FROM bono_ramos").get() as { n: number };
  if (hay.n === 0) db.transaction(() => RAMOS_INICIALES.forEach((r) => ins.run(...r)))();
  semillaHecha = true;
}

export function obtenerConfig(): ConfigBonos {
  const filas = db.prepare("SELECT clave, valor FROM bono_config").all() as { clave: string; valor: string }[];
  const guardada = Object.fromEntries(filas.map((f) => [f.clave, JSON.parse(f.valor)]));
  return { ...CONFIG_INICIAL, ...guardada };
}

export function guardarConfig(parcial: Partial<ConfigBonos>): ConfigBonos {
  const stmt = db.prepare(
    "INSERT INTO bono_config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
  );
  db.transaction(() => {
    for (const k of Object.keys(CONFIG_INICIAL) as (keyof ConfigBonos)[]) {
      if (parcial[k] === undefined) continue;
      const tipo = typeof CONFIG_INICIAL[k];
      const v = parcial[k];
      if (typeof v !== tipo) continue;
      if (tipo === "number" && (!Number.isFinite(v as number) || (v as number) < 0)) continue;
      stmt.run(k, JSON.stringify(typeof v === "string" ? v.trim().slice(0, 2000) : v));
    }
  })();
  return obtenerConfig();
}

function tasasAgente(c: ConfigBonos): Tasas {
  return { iva: c.tasaIva, retIsr: c.retIsr, retIva: c.retIva };
}

function tasasPromotor(c: ConfigBonos): Tasas {
  return {
    iva: c.promotorIva ? c.tasaIva : 0,
    retIsr: c.promotorRetenciones ? c.retIsr : 0,
    retIva: c.promotorRetenciones ? c.retIva : 0,
  };
}

// ---------- Catálogo ----------

export interface AgenteBono {
  id: number;
  nombre: string;
  subpromo: string;
  porcentaje: number;
  email: string | null;
  activo: boolean;
  claves: string[];
}

export function listarAgentes(): AgenteBono[] {
  const filas = db
    .prepare(
      `SELECT a.*, GROUP_CONCAT(c.clave, ',') AS claves
       FROM bono_agentes a LEFT JOIN bono_claves c ON c.agente_id = a.id
       GROUP BY a.id ORDER BY a.nombre`,
    )
    .all() as { id: number; nombre: string; subpromo: string; porcentaje: number; email: string | null; activo: number; claves: string | null }[];
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    subpromo: f.subpromo,
    porcentaje: f.porcentaje,
    email: f.email,
    activo: f.activo === 1,
    claves: f.claves ? f.claves.split(",") : [],
  }));
}

export function actualizarAgente(
  id: number,
  datos: { subpromo?: string; porcentaje?: number; email?: string | null; activo?: boolean },
): void {
  const actual = db.prepare("SELECT * FROM bono_agentes WHERE id = ?").get(id) as
    | { subpromo: string; porcentaje: number; email: string | null; activo: number }
    | undefined;
  if (!actual) throw new Error("Agente no encontrado.");
  const email = datos.email === undefined ? actual.email : datos.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido.");
  const porcentaje = datos.porcentaje ?? actual.porcentaje;
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 1) throw new Error("Porcentaje inválido.");
  db.prepare("UPDATE bono_agentes SET subpromo = ?, porcentaje = ?, email = ?, activo = ? WHERE id = ?").run(
    normalizarNombre(datos.subpromo ?? actual.subpromo) || "SIN ASIGNAR",
    porcentaje,
    email,
    datos.activo === undefined ? actual.activo : datos.activo ? 1 : 0,
    id,
  );
}

function agentePorNombre(nombre: string): number | undefined {
  const f = db.prepare("SELECT id FROM bono_agentes WHERE nombre = ?").get(nombre) as { id: number } | undefined;
  return f?.id;
}

function agentePorClave(clave: string): number | undefined {
  const f = db.prepare("SELECT agente_id FROM bono_claves WHERE clave = ?").get(clave) as { agente_id: number } | undefined;
  return f?.agente_id;
}

function vincularClave(clave: string, agenteId: number): void {
  if (clave) db.prepare("INSERT OR IGNORE INTO bono_claves (clave, agente_id) VALUES (?, ?)").run(clave, agenteId);
}

// Encuentra el agente por clave o nombre; si no existe lo crea sin asignar
// para que el administrador le ponga subpromotoría y porcentaje.
function resolverAgente(claveCruda: unknown, nombreCrudo: unknown, nuevos: Set<string>): number {
  const clave = normalizarClave(claveCruda);
  const nombre = normalizarNombre(nombreCrudo) || `CLAVE ${clave}`;
  let id = clave ? agentePorClave(clave) : undefined;
  if (id) return id;
  id = agentePorNombre(nombre);
  if (!id) {
    id = Number(db.prepare("INSERT INTO bono_agentes (nombre) VALUES (?)").run(nombre).lastInsertRowid);
    nuevos.add(nombre);
  }
  vincularClave(clave, id);
  return id;
}

export interface AgenteCatalogo {
  clave: string;
  nombre: string;
  subpromo: string;
  porcentaje: number;
}

export function importarCatalogo(agentes: AgenteCatalogo[]): number {
  let n = 0;
  db.transaction(() => {
    for (const a of agentes) {
      const nombre = normalizarNombre(a.nombre);
      if (!nombre) continue;
      const clave = normalizarClave(a.clave);
      let id = agentePorNombre(nombre);
      const porClave = !id && clave ? agentePorClave(clave) : undefined;
      if (porClave) {
        // Misma clave con nombre corregido: se queda el nombre más reciente.
        db.prepare("UPDATE bono_agentes SET nombre = ? WHERE id = ?").run(nombre, porClave);
        id = porClave;
      }
      if (id) {
        db.prepare("UPDATE bono_agentes SET subpromo = ?, porcentaje = ? WHERE id = ?").run(
          normalizarNombre(a.subpromo) || "SIN ASIGNAR",
          a.porcentaje,
          id,
        );
      } else {
        id = Number(
          db
            .prepare("INSERT INTO bono_agentes (nombre, subpromo, porcentaje) VALUES (?, ?, ?)")
            .run(nombre, normalizarNombre(a.subpromo) || "SIN ASIGNAR", a.porcentaje).lastInsertRowid,
        );
      }
      vincularClave(clave, id);
      n++;
    }
  })();
  return n;
}

export function importarCorreos(filas: { clave: string; nombre: string; email: string }[]): { actualizados: number; sinCoincidencia: string[] } {
  let actualizados = 0;
  const sinCoincidencia: string[] = [];
  db.transaction(() => {
    for (const f of filas) {
      const email = f.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      const clave = normalizarClave(f.clave);
      const id = (clave ? agentePorClave(clave) : undefined) ?? agentePorNombre(normalizarNombre(f.nombre));
      if (!id) {
        sinCoincidencia.push(f.nombre || f.clave);
        continue;
      }
      db.prepare("UPDATE bono_agentes SET email = ? WHERE id = ?").run(email, id);
      actualizados++;
    }
  })();
  return { actualizados, sinCoincidencia };
}

export interface Reparto {
  id: number;
  origenId: number;
  origen: string;
  destinoId: number;
  destino: string;
  porcentaje: number;
}

export function listarRepartos(): Reparto[] {
  return db
    .prepare(
      `SELECT r.id, r.origen_id AS origenId, o.nombre AS origen, r.destino_id AS destinoId,
              d.nombre AS destino, r.porcentaje
       FROM bono_repartos r JOIN bono_agentes o ON o.id = r.origen_id JOIN bono_agentes d ON d.id = r.destino_id
       ORDER BY o.nombre`,
    )
    .all() as Reparto[];
}

export function guardarReparto(origenId: number, destinoId: number, porcentaje: number): void {
  if (origenId === destinoId) throw new Error("El agente que cede y el que recibe deben ser distintos.");
  if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 1) throw new Error("Porcentaje inválido.");
  db.prepare(
    `INSERT INTO bono_repartos (origen_id, destino_id, porcentaje) VALUES (?, ?, ?)
     ON CONFLICT(origen_id, destino_id) DO UPDATE SET porcentaje = excluded.porcentaje`,
  ).run(origenId, destinoId, porcentaje);
}

export function eliminarReparto(id: number): void {
  db.prepare("DELETE FROM bono_repartos WHERE id = ?").run(id);
}

// Regla inicial acordada: Pablo recibe 1% de la prima de Eloísa.
export function sembrarRepartoInicial(): void {
  const hay = db.prepare("SELECT COUNT(*) AS n FROM bono_repartos").get() as { n: number };
  if (hay.n > 0) return;
  const origen = agentePorNombre("ELOISA EDITH ZAPATA PENA");
  const destino = agentePorNombre("PABLO STEINMAN SOSA");
  if (origen && destino) guardarReparto(origen, destino, 0.01);
}

export interface Ramo {
  subgrupo: string;
  grupo: string;
  porcentaje: number;
}

export function listarRamos(): Ramo[] {
  asegurarSemilla();
  return db
    .prepare("SELECT subgrupo, grupo_bono AS grupo, porcentaje FROM bono_ramos ORDER BY grupo_bono, subgrupo")
    .all() as Ramo[];
}

export function guardarRamo(r: Ramo): void {
  if (!Number.isFinite(r.porcentaje) || r.porcentaje < 0 || r.porcentaje > 1) throw new Error("Porcentaje inválido.");
  db.prepare(
    `INSERT INTO bono_ramos (subgrupo, grupo_bono, porcentaje) VALUES (?, ?, ?)
     ON CONFLICT(subgrupo) DO UPDATE SET grupo_bono = excluded.grupo_bono, porcentaje = excluded.porcentaje`,
  ).run(normalizarNombre(r.subgrupo), normalizarNombre(r.grupo), r.porcentaje);
}

// ---------- Producción mensual ----------

export interface FilaImportada {
  clave: string;
  agente: string;
  grupo: string;
  subgrupo: string;
  primaEmitida: number;
  primaCobrada: number;
  comision: number;
}

export interface Carga {
  id: number;
  anio: number;
  mes: number;
  nombreOriginal: string;
  filas: number;
  primaCobrada: number;
  ponderado: number;
  createdAt: string;
}

export function guardarProduccion(
  anio: number,
  mes: number,
  filas: FilaImportada[],
  nombreOriginal: string,
  usuarioId: number | null,
  ponderado?: number,
): { cargaId: number; agentesNuevos: string[]; ramosNuevos: string[] } {
  asegurarSemilla();
  const nuevos = new Set<string>();
  const ramosNuevos = new Set<string>();
  let cargaId = 0;
  db.transaction(() => {
    const previa = db.prepare("SELECT id, ponderado FROM bono_cargas WHERE anio = ? AND mes = ?").get(anio, mes) as
      | { id: number; ponderado: number }
      | undefined;
    if (previa) db.prepare("DELETE FROM bono_cargas WHERE id = ?").run(previa.id);
    const total = redondear(filas.reduce((s, f) => s + f.primaCobrada, 0));
    cargaId = Number(
      db
        .prepare(
          "INSERT INTO bono_cargas (anio, mes, nombre_original, filas, prima_cobrada, ponderado, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(anio, mes, nombreOriginal.slice(0, 200), filas.length, total, ponderado ?? previa?.ponderado ?? 1, usuarioId)
        .lastInsertRowid,
    );
    const ins = db.prepare(
      `INSERT INTO bono_produccion (carga_id, anio, mes, agente_id, clave, agente, grupo, subgrupo, prima_emitida, prima_cobrada, comision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ramoExiste = db.prepare("SELECT 1 FROM bono_ramos WHERE subgrupo = ?");
    const insRamo = db.prepare("INSERT INTO bono_ramos (subgrupo, grupo_bono, porcentaje) VALUES (?, 'SIN CLASIFICAR', 0)");
    for (const f of filas) {
      const id = resolverAgente(f.clave, f.agente, nuevos);
      const subgrupo = normalizarNombre(f.subgrupo);
      if (!ramoExiste.get(subgrupo)) {
        insRamo.run(subgrupo);
        ramosNuevos.add(subgrupo);
      }
      ins.run(cargaId, anio, mes, id, normalizarClave(f.clave), normalizarNombre(f.agente), normalizarNombre(f.grupo), subgrupo, f.primaEmitida, f.primaCobrada, f.comision);
    }
  })();
  return { cargaId, agentesNuevos: Array.from(nuevos), ramosNuevos: Array.from(ramosNuevos) };
}

export function listarCargas(): Carga[] {
  return db
    .prepare(
      `SELECT id, anio, mes, nombre_original AS nombreOriginal, filas, prima_cobrada AS primaCobrada,
              ponderado, created_at AS createdAt
       FROM bono_cargas ORDER BY anio DESC, mes DESC`,
    )
    .all() as Carga[];
}

export function actualizarPonderado(id: number, ponderado: number): void {
  if (!Number.isFinite(ponderado) || ponderado < 0 || ponderado > 5) throw new Error("Ponderado inválido.");
  db.prepare("UPDATE bono_cargas SET ponderado = ? WHERE id = ?").run(ponderado, id);
}

export function eliminarCarga(id: number): void {
  db.prepare("DELETE FROM bono_cargas WHERE id = ?").run(id);
}

// ---------- Cálculo ----------

function insumos(anio: number, meses: number[]) {
  asegurarSemilla();
  const config = obtenerConfig();
  const marcadores = meses.map(() => "?").join(",");
  const filas = db
    .prepare(
      `SELECT agente_id AS agenteId, subgrupo, SUM(prima_cobrada) AS primaCobrada
       FROM bono_produccion WHERE anio = ? AND mes IN (${marcadores})
       GROUP BY agente_id, subgrupo`,
    )
    .all(anio, ...meses) as FilaProduccion[];
  const conProduccion = new Set(filas.map((f) => f.agenteId));
  const agentes = (
    db.prepare("SELECT id, nombre, subpromo, porcentaje, activo FROM bono_agentes WHERE subpromo = ? ORDER BY nombre").all(config.subpromo) as (AgenteCalculo & { activo: number })[]
  ).filter((a) => a.activo === 1 || conProduccion.has(a.id));
  const ramos = new Map<string, RamoCalculo>(
    listarRamos().map((r) => [r.subgrupo, { grupo: r.grupo, porcentaje: r.porcentaje }]),
  );
  const repartos = db
    .prepare("SELECT origen_id AS origenId, destino_id AS destinoId, porcentaje FROM bono_repartos")
    .all() as RepartoCalculo[];
  const cargas = db
    .prepare(`SELECT mes, ponderado FROM bono_cargas WHERE anio = ? AND mes IN (${marcadores})`)
    .all(anio, ...meses) as { mes: number; ponderado: number }[];
  return { config, filas, agentes, ramos, repartos, cargas };
}

export function calcularBimestre(anio: number, bimestre: number) {
  const meses = mesesDeBimestre(bimestre);
  const i = insumos(anio, meses);
  return {
    mesesCargados: i.cargas.map((c) => c.mes).sort((a, b) => a - b),
    resultados: calcularAgentes(i.agentes, i.filas, i.ramos, i.repartos, tasasAgente(i.config)),
  };
}

export function calcularMesPromotor(anio: number, mes: number) {
  const i = insumos(anio, [mes]);
  const ponderado = i.cargas[0]?.ponderado ?? 1;
  return {
    cargado: i.cargas.length > 0,
    resultado: calcularPromotor(i.agentes, i.filas, i.ramos, i.repartos, ponderado, i.config.factorPromotor, tasasPromotor(i.config)),
  };
}

// ---------- Reportes ----------

export type TipoReporte = "AGENTE" | "PROMOTOR";
export type EstadoReporte = "GENERADO" | "ENVIADO" | "FACTURADO" | "PAGADO";

export interface ReporteBono {
  id: number;
  tipo: TipoReporte;
  anio: number;
  periodo: number;
  agenteId: number | null;
  nombre: string;
  email: string | null;
  base: number;
  bono: number;
  iva: number;
  retIsr: number;
  retIva: number;
  total: number;
  detalle: unknown;
  token: string;
  estado: EstadoReporte;
  enviadoAt: string | null;
  facturaPdf: string | null;
  facturaXml: string | null;
  facturaUuid: string | null;
  facturaTotal: number | null;
  facturaRfc: string | null;
  facturadoAt: string | null;
  fechaPago: string | null;
  referenciaPago: string | null;
  pagadoAt: string | null;
}

interface FilaReporte {
  id: number; tipo: TipoReporte; anio: number; periodo: number; agente_id: number | null; nombre: string;
  email: string | null; base: number; bono: number; iva: number; ret_isr: number; ret_iva: number; total: number;
  detalle_json: string; token: string; estado: EstadoReporte; enviado_at: string | null; factura_pdf: string | null;
  factura_xml: string | null; factura_uuid: string | null; factura_total: number | null; factura_rfc: string | null;
  facturado_at: string | null; fecha_pago: string | null; referencia_pago: string | null; pagado_at: string | null;
}

function aReporte(f: FilaReporte): ReporteBono {
  return {
    id: f.id, tipo: f.tipo, anio: f.anio, periodo: f.periodo, agenteId: f.agente_id, nombre: f.nombre,
    email: f.email, base: f.base, bono: f.bono, iva: f.iva, retIsr: f.ret_isr, retIva: f.ret_iva, total: f.total,
    detalle: JSON.parse(f.detalle_json), token: f.token, estado: f.estado, enviadoAt: f.enviado_at,
    facturaPdf: f.factura_pdf, facturaXml: f.factura_xml, facturaUuid: f.factura_uuid, facturaTotal: f.factura_total,
    facturaRfc: f.factura_rfc, facturadoAt: f.facturado_at, fechaPago: f.fecha_pago, referenciaPago: f.referencia_pago,
    pagadoAt: f.pagado_at,
  };
}

export function listarReportes(tipo: TipoReporte, anio: number, periodo: number): ReporteBono[] {
  return (
    db.prepare("SELECT * FROM bono_reportes WHERE tipo = ? AND anio = ? AND periodo = ? ORDER BY nombre").all(tipo, anio, periodo) as FilaReporte[]
  ).map(aReporte);
}

export function obtenerReporte(id: number): ReporteBono | undefined {
  const f = db.prepare("SELECT * FROM bono_reportes WHERE id = ?").get(id) as FilaReporte | undefined;
  return f ? aReporte(f) : undefined;
}

export function reportePorToken(token: string): ReporteBono | undefined {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return undefined;
  const f = db.prepare("SELECT * FROM bono_reportes WHERE token = ?").get(token) as FilaReporte | undefined;
  return f ? aReporte(f) : undefined;
}

interface DatosReporte {
  agenteId: number | null;
  nombre: string;
  email: string | null;
  base: number;
  bono: number;
  iva: number;
  retIsr: number;
  retIva: number;
  total: number;
  detalle: unknown;
}

// Inserta o actualiza los reportes del periodo. Los que ya tienen factura o
// pago conservan sus importes; se informan como "bloqueados".
function guardarReportes(tipo: TipoReporte, anio: number, periodo: number, datos: DatosReporte[]) {
  let creados = 0;
  let actualizados = 0;
  const bloqueados: string[] = [];
  db.transaction(() => {
    const existentes = new Map(
      listarReportes(tipo, anio, periodo).map((r) => [r.agenteId ?? 0, r]),
    );
    for (const d of datos) {
      const previo = existentes.get(d.agenteId ?? 0);
      existentes.delete(d.agenteId ?? 0);
      if (previo && (previo.estado === "FACTURADO" || previo.estado === "PAGADO")) {
        if (Math.abs(previo.total - d.total) > 0.005) bloqueados.push(previo.nombre);
        continue;
      }
      if (previo) {
        db.prepare(
          `UPDATE bono_reportes SET nombre = ?, email = ?, base = ?, bono = ?, iva = ?, ret_isr = ?, ret_iva = ?,
             total = ?, detalle_json = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(d.nombre, d.email, d.base, d.bono, d.iva, d.retIsr, d.retIva, d.total, JSON.stringify(d.detalle), previo.id);
        actualizados++;
      } else {
        db.prepare(
          `INSERT INTO bono_reportes (tipo, anio, periodo, agente_id, nombre, email, base, bono, iva, ret_isr, ret_iva, total, detalle_json, token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(tipo, anio, periodo, d.agenteId, d.nombre, d.email, d.base, d.bono, d.iva, d.retIsr, d.retIva, d.total,
          JSON.stringify(d.detalle), crypto.randomBytes(24).toString("base64url"));
        creados++;
      }
    }
    // Reportes que ya no aplican (bono en cero tras recalcular) y aún no se facturan.
    for (const r of Array.from(existentes.values())) {
      if (r.estado === "GENERADO" || r.estado === "ENVIADO") db.prepare("DELETE FROM bono_reportes WHERE id = ?").run(r.id);
    }
  })();
  return { creados, actualizados, bloqueados };
}

export function generarReportesBimestre(anio: number, bimestre: number) {
  const { resultados } = calcularBimestre(anio, bimestre);
  const emails = new Map(listarAgentes().map((a) => [a.id, a.email]));
  const datos = resultados
    .filter((r) => r.total > 0)
    .map((r: ResultadoAgente) => ({
      agenteId: r.agenteId,
      nombre: r.nombre,
      email: emails.get(r.agenteId) ?? null,
      base: r.base,
      bono: r.bono,
      iva: r.iva,
      retIsr: r.retIsr,
      retIva: r.retIva,
      total: r.total,
      detalle: { porcentaje: r.porcentaje, recibe: r.recibe, cede: r.cede },
    }));
  return guardarReportes("AGENTE", anio, bimestre, datos);
}

export function generarReportePromotor(anio: number, mes: number) {
  const { resultado } = calcularMesPromotor(anio, mes);
  const config = obtenerConfig();
  const r: ResultadoPromotor = resultado;
  const datos = r.total > 0
    ? [{
        agenteId: null,
        nombre: config.promotorNombre,
        email: config.promotorEmail || null,
        base: r.totales.totalSinAgente,
        bono: r.bono,
        iva: r.iva,
        retIsr: r.retIsr,
        retIva: r.retIva,
        total: r.total,
        detalle: { ponderado: r.ponderado, factor: r.factor, subtotal: r.subtotal, totales: r.totales },
      }]
    : [];
  return guardarReportes("PROMOTOR", anio, mes, datos);
}

export function marcarEnviado(id: number, email: string): void {
  db.prepare(
    `UPDATE bono_reportes SET email = ?, enviado_at = datetime('now'),
       estado = CASE WHEN estado = 'GENERADO' THEN 'ENVIADO' ELSE estado END, updated_at = datetime('now') WHERE id = ?`,
  ).run(email, id);
}

export function registrarFactura(
  id: number,
  f: { pdf: string; xml: string; uuid: string | null; total: number | null; rfc: string | null },
): void {
  db.prepare(
    `UPDATE bono_reportes SET factura_pdf = ?, factura_xml = ?, factura_uuid = ?, factura_total = ?, factura_rfc = ?,
       facturado_at = datetime('now'), estado = 'FACTURADO', updated_at = datetime('now') WHERE id = ? AND estado != 'PAGADO'`,
  ).run(f.pdf, f.xml, f.uuid, f.total, f.rfc, id);
}

export function marcarPagado(id: number, fechaPago: string, referencia: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) throw new Error("Fecha de pago inválida.");
  db.prepare(
    `UPDATE bono_reportes SET estado = 'PAGADO', fecha_pago = ?, referencia_pago = ?, pagado_at = datetime('now'),
       updated_at = datetime('now') WHERE id = ?`,
  ).run(fechaPago, referencia.trim().slice(0, 120), id);
}

export function revertirPago(id: number): void {
  db.prepare(
    `UPDATE bono_reportes SET estado = CASE WHEN factura_pdf IS NOT NULL THEN 'FACTURADO'
       WHEN enviado_at IS NOT NULL THEN 'ENVIADO' ELSE 'GENERADO' END,
       fecha_pago = NULL, referencia_pago = NULL, pagado_at = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
}

export { calcularFactura };
