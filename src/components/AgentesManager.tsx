"use client";

import { useEffect, useState } from "react";
import type { EstadoSolicitud, SolicitudAgente } from "@/lib/agentes";

const ETIQUETA_DOC: Record<string, string> = {
  CONTRATO_CONFIDENCIALIDAD: "Contrato de confidencialidad",
  CONTRATO_SERVICIOS: "Contrato de servicios",
  CSF: "Constancia de situación fiscal",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio",
  IDENTIFICACION: "Identificación",
};

const ESTADO_META: Record<EstadoSolicitud, { label: string; cls: string }> = {
  PENDIENTE: { label: "En revisión", cls: "bg-amber-50 text-amber-700" },
  AUTORIZADA: { label: "Autorizado", cls: "bg-emerald-50 text-emerald-700" },
  RECHAZADA: { label: "Rechazado", cls: "bg-red-50 text-red-700" },
};

interface Props {
  plantillas: { tipo: string; label: string; cargada: boolean }[];
}

export default function AgentesManager({ plantillas }: Props) {
  const [solicitudes, setSolicitudes] = useState<SolicitudAgente[]>([]);
  const [filtro, setFiltro] = useState<EstadoSolicitud | "TODAS">("PENDIENTE");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [plantillasCargadas, setPlantillasCargadas] = useState(
    Object.fromEntries(plantillas.map((p) => [p.tipo, p.cargada])),
  );

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch("/api/agentes/solicitudes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las solicitudes.");
      setSolicitudes(data.solicitudes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function revisar(s: SolicitudAgente, accion: "AUTORIZAR" | "RECHAZAR") {
    let motivo: string | null = null;
    if (accion === "RECHAZAR") {
      motivo = window.prompt(`Motivo del rechazo de ${s.nombre}:`);
      if (!motivo?.trim()) return;
    } else if (!window.confirm(`¿Autorizar a ${s.nombre}? Podrá entrar al portal de inmediato.`)) {
      return;
    }
    setOcupado(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/agentes/solicitudes/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, motivo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar.");
      setSolicitudes((prev) => prev.map((x) => (x.id === s.id ? data.solicitud : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setOcupado(null);
    }
  }

  async function subirPlantilla(tipo: string, archivo: File | undefined) {
    if (!archivo) return;
    const form = new FormData();
    form.set("archivo", archivo);
    setError(null);
    const res = await fetch(`/api/registro/plantillas/${tipo}`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "No se pudo subir la plantilla.");
    else setPlantillasCargadas((p) => ({ ...p, [tipo]: true }));
  }

  const visibles = solicitudes.filter((s) => filtro === "TODAS" || s.estado === filtro);
  const conteo = (e: EstadoSolicitud) => solicitudes.filter((s) => s.estado === e).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Contratos para firma</h2>
        <p className="mt-1 text-xs text-slate-500">
          Los PDFs que subas aquí se pueden descargar desde la página pública de registro.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {plantillas.map((p) => (
            <div key={p.tipo} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="font-medium text-slate-700">{p.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                {plantillasCargadas[p.tipo] ? (
                  <a href={`/api/registro/plantillas/${p.tipo}`} className="text-sky-700 hover:underline">
                    Descargar PDF actual
                  </a>
                ) : (
                  "Sin cargar"
                )}
              </div>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => subirPlantilla(p.tipo, e.target.files?.[0])}
                className="mt-2 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {(["PENDIENTE", "AUTORIZADA", "RECHAZADA", "TODAS"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filtro === f ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f === "TODAS" ? `Todas (${solicitudes.length})` : `${ESTADO_META[f].label} (${conteo(f)})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No hay solicitudes en este estado.
        </p>
      ) : (
        <div className="space-y-4">
          {visibles.map((s) => {
            const meta = ESTADO_META[s.estado];
            return (
              <article key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{s.nombre}</h3>
                    <p className="text-xs text-slate-500">
                      {s.email} · {s.telefono} · RFC {s.rfc}
                      {s.estadoRepublica && ` · ${s.estadoRepublica}`}
                      {s.cedula && ` · Cédula ${s.cedula}`}
                    </p>
                    <p className="text-xs text-slate-400">Registrado: {s.createdAt}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {s.documentos.map((d) => (
                    <li key={d.id} className="text-sm">
                      <a
                        href={`/api/agentes/solicitudes/${s.id}/documentos/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 hover:underline"
                      >
                        {ETIQUETA_DOC[d.tipo] ?? d.tipo}
                      </a>
                      <span className="ml-1 text-xs text-slate-400">
                        ({Math.ceil(d.tamano / 1024)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
                {s.motivoRechazo && (
                  <p className="mt-3 text-xs text-red-600">Motivo: {s.motivoRechazo}</p>
                )}
                {s.estado === "PENDIENTE" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={ocupado === s.id}
                      onClick={() => revisar(s, "AUTORIZAR")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Autorizar
                    </button>
                    <button
                      type="button"
                      disabled={ocupado === s.id}
                      onClick={() => revisar(s, "RECHAZAR")}
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
