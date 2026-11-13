"use client";

import { useEffect, useState } from "react";
import QuoteForm from "@/components/QuoteForm";
import QuoteResults from "@/components/QuoteResults";
import type {
  CoberturasPersonalizadas,
  CotizacionRequest,
  CotizacionResultado,
  Paquete,
} from "@/domain/types";
import type {
  Contratante,
  CotizacionGuardada,
  DetalleVehiculo,
  EstadoCotizacion,
  SeleccionCotizacion,
} from "@/lib/cotizaciones";
import { ASEGURADORAS } from "@/insurers/registry";
import { formatMXN } from "@/lib/format";
import type { UbicacionCp } from "@/lib/sepomex";
import DatosArt492 from "@/components/DatosArt492";
import DatosGs from "@/components/DatosGs";

const PASOS = ["Datos y coberturas", "Comparativo", "Contratante", "Vehículo", "Resumen"];

const ETIQUETA_PAQUETE: Record<Paquete, string> = {
  AMPLIA_PLUS: "Amplia Plus",
  AMPLIA: "Amplia",
  LIMITADA: "Limitada",
  RC: "Básica (RC)",
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

// Mismos campos que exige validate-cotizacion.ts para solicitar emisión.
const OBLIGATORIOS_EMISION = new Set(["nombre", "rfc", "calle", "colonia", "cp", "serie"]);

function NotaObligatorios() {
  return (
    <p className="text-xs text-slate-500">
      <span className="text-red-600">*</span> Datos obligatorios para solicitar la emisión
    </p>
  );
}
const btnPrimario =
  "rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60";
const btnSecundario =
  "rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60";

const CONTRATANTE_VACIO: Contratante = {
  tipoPersona: "FISICA",
  nombre: "",
  rfc: "",
  email: "",
  telefono: "",
  calle: "",
  colonia: "",
  municipio: "",
  estado: "",
  cp: "",
};

const VEHICULO_VACIO: DetalleVehiculo = { serie: "", motor: "", placas: "", color: "" };

function descuentosIniciales(): Record<string, number> {
  return Object.fromEntries(ASEGURADORAS.map((a) => [a.id, a.descuentoDefault]));
}

async function pedirCotizacion(request: CotizacionRequest): Promise<CotizacionResultado[]> {
  const res = await fetch("/api/cotizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo completar la cotización.");
  }
  const data = await res.json();
  return data.resultados as CotizacionResultado[];
}

interface Props {
  puedeDescontar: boolean;
  cotizacionId: number | null;
}

export default function CotizadorWizard({ puedeDescontar, cotizacionId }: Props) {
  const [paso, setPaso] = useState(0);
  const [resultados, setResultados] = useState<CotizacionResultado[] | null>(null);
  const [ultimaSolicitud, setUltimaSolicitud] = useState<CotizacionRequest | null>(null);
  const [descuentos, setDescuentos] = useState<Record<string, number>>(descuentosIniciales);
  const [cargando, setCargando] = useState(false);
  const [recotizando, setRecotizando] = useState<string | null>(null);
  const [coberturas, setCoberturas] = useState<CoberturasPersonalizadas>({});
  const [recotizandoTodo, setRecotizandoTodo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [id, setId] = useState<number | null>(cotizacionId);
  const [estado, setEstado] = useState<EstadoCotizacion>("GUARDADA");
  const [seleccion, setSeleccion] = useState<SeleccionCotizacion | null>(null);
  const [contratante, setContratante] = useState<Contratante>(CONTRATANTE_VACIO);
  const [ubicacion, setUbicacion] = useState<UbicacionCp | null>(null);

  // Con el CP se llenan estado y municipio y se ofrecen sus colonias.
  useEffect(() => {
    const cp = contratante.cp;
    if (!/^\d{5}$/.test(cp)) {
      setUbicacion(null);
      return;
    }
    let vigente = true;
    fetch(`/api/codigos-postales/${cp}`)
      .then((r) => (r.ok ? (r.json() as Promise<UbicacionCp>) : null))
      .then((u) => {
        if (!vigente) return;
        setUbicacion(u);
        if (!u) return;
        setContratante((c) => {
          const elegida = u.colonias.find((x) => x.colonia === c.colonia);
          return {
            ...c,
            estado: u.estado,
            municipio: elegida?.municipio || u.municipio || c.municipio,
          };
        });
      })
      .catch(() => vigente && setUbicacion(null));
    return () => {
      vigente = false;
    };
  }, [contratante.cp]);
  const coloniasCp = ubicacion?.colonias ?? [];
  const [vehiculo, setVehiculo] = useState<DetalleVehiculo>(VEHICULO_VACIO);
  const [guardando, setGuardando] = useState(false);

  const bloqueada = estado === "EMITIDA" || estado === "CANCELADA";
  const maxPaso = !resultados ? 0 : !seleccion ? 1 : 4;

  useEffect(() => {
    if (!cotizacionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/cotizaciones/${cotizacionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo abrir la cotización.");
        const c = data.cotizacion as CotizacionGuardada;
        setUltimaSolicitud(c.request);
        setResultados(c.resultados);
        setDescuentos({ ...descuentosIniciales(), ...(c.request.descuentos ?? {}) });
        setCoberturas(c.request.coberturasPersonalizadas ?? {});
        setSeleccion(c.seleccion);
        setContratante(c.contratante ?? CONTRATANTE_VACIO);
        setVehiculo(c.detalleVehiculo ?? VEHICULO_VACIO);
        setEstado(c.estado);
        setPaso(c.seleccion ? 4 : 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado.");
      }
    })();
  }, [cotizacionId]);

  async function cotizar(request: CotizacionRequest) {
    const completa: CotizacionRequest = {
      ...request,
      descuentos: puedeDescontar ? descuentos : undefined,
      coberturasPersonalizadas: Object.keys(coberturas).length ? coberturas : undefined,
    };
    setCargando(true);
    setError(null);
    setAviso(null);
    setUltimaSolicitud(completa);
    setSeleccion(null);
    try {
      setResultados(await pedirCotizacion(completa));
      setContratante((c) => ({
        ...c,
        nombre: c.nombre || request.conductor.nombre,
        email: c.email || request.conductor.email || "",
        telefono: c.telefono || request.conductor.telefono || "",
        cp: c.cp || request.conductor.cp,
      }));
      setPaso(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  async function recotizar(aseguradoraId: string, descuento: number) {
    if (!ultimaSolicitud || !puedeDescontar) return;
    const nuevosDescuentos = { ...descuentos, [aseguradoraId]: descuento };
    const request: CotizacionRequest = {
      ...ultimaSolicitud,
      descuentos: nuevosDescuentos,
      aseguradoras: [aseguradoraId],
    };
    setDescuentos(nuevosDescuentos);
    setUltimaSolicitud({ ...ultimaSolicitud, descuentos: nuevosDescuentos });
    setRecotizando(aseguradoraId);
    setError(null);
    try {
      const nuevos = await pedirCotizacion(request);
      const aplicados = nuevos
        .filter((r) => r.status === "success" && r.prima)
        .map((r) => r.prima!.descuentoPorcentaje);
      if (aplicados.length) {
        const efectivo = Math.max(...aplicados);
        if (efectivo !== descuento) setDescuentos((d) => ({ ...d, [aseguradoraId]: efectivo }));
      }
      setResultados((prev) => [
        ...(prev ?? []).filter((r) => r.aseguradoraId !== aseguradoraId),
        ...nuevos,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setRecotizando(null);
    }
  }

  async function recotizarAdicionales(aseguradoraId: string, ids: string[]) {
    if (!ultimaSolicitud) return;
    const adicionales = {
      ...ultimaSolicitud.coberturasAdicionales,
      [aseguradoraId]: ids,
    };
    const siguiente = { ...ultimaSolicitud, coberturasAdicionales: adicionales };
    setUltimaSolicitud(siguiente);
    setRecotizando(aseguradoraId);
    setError(null);
    setSeleccion(null);
    try {
      const nuevos = await pedirCotizacion({
        ...siguiente,
        descuentos: puedeDescontar ? descuentos : siguiente.descuentos,
        aseguradoras: [aseguradoraId],
      });
      setResultados((prev) => [
        ...(prev ?? []).filter((r) => r.aseguradoraId !== aseguradoraId),
        ...nuevos,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setRecotizando(null);
    }
  }

  async function recotizarCoberturas(nuevas: CoberturasPersonalizadas) {
    if (!ultimaSolicitud) return;
    const request: CotizacionRequest = {
      ...ultimaSolicitud,
      descuentos: puedeDescontar ? descuentos : undefined,
      aseguradoras: undefined,
      coberturasPersonalizadas: Object.keys(nuevas).length ? nuevas : undefined,
    };
    setCoberturas(nuevas);
    setUltimaSolicitud(request);
    setRecotizandoTodo(true);
    setError(null);
    setSeleccion(null);
    try {
      setResultados(await pedirCotizacion(request));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setRecotizandoTodo(false);
    }
  }

  async function guardar(nuevoEstado: "GUARDADA" | "EMISION_SOLICITADA") {
    if (!ultimaSolicitud || !resultados) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    const payload = {
      request: ultimaSolicitud,
      resultados,
      seleccion,
      contratante,
      detalleVehiculo: vehiculo,
      estado: nuevoEstado === "GUARDADA" && estado === "EMISION_SOLICITADA" ? estado : nuevoEstado,
    };
    try {
      const res = await fetch(id ? `/api/cotizaciones/${id}` : "/api/cotizaciones", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la cotización.");
      const nuevoId = id ?? data.id;
      setId(nuevoId);
      setEstado(payload.estado);
      if (!id) window.history.replaceState(null, "", `/cotizar?id=${nuevoId}`);
      setAviso(
        payload.estado === "EMISION_SOLICITADA"
          ? `Solicitud de emisión enviada (cotización #${nuevoId}). Te avisaremos cuando la póliza esté emitida.`
          : `Cotización #${nuevoId} guardada.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  const elegido =
    seleccion && resultados
      ? resultados.find(
          (r) => r.aseguradoraId === seleccion.aseguradoraId && r.paquete === seleccion.paquete,
        )
      : undefined;

  const accionesGuardar = (
    <button
      type="button"
      onClick={() => guardar("GUARDADA")}
      disabled={guardando || bloqueada}
      className={btnSecundario}
    >
      {guardando ? "Guardando…" : "Guardar cotización"}
    </button>
  );

  const v = ultimaSolicitud?.vehiculo;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Cotizador de autos{id ? ` · Cotización #${id}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compara {ASEGURADORAS.length} aseguradoras, elige la mejor opción y solicita la emisión.
          </p>
        </div>
        {id && (
          <a href="/cotizar" className={btnSecundario}>
            Nueva cotización
          </a>
        )}
      </header>

      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PASOS.map((p, i) => {
          const disponible = i <= maxPaso;
          return (
            <li key={p}>
              <button
                type="button"
                disabled={!disponible}
                onClick={() => setPaso(i)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  paso === i
                    ? "border-sky-600 bg-sky-600 text-white"
                    : disponible
                      ? "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    paso === i ? "bg-white text-sky-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {i + 1}
                </span>
                {p}
              </button>
            </li>
          );
        })}
      </ol>

      {estado !== "GUARDADA" && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
          {estado === "EMISION_SOLICITADA" && "Emisión solicitada: la está revisando el equipo de Interiskad."}
          {estado === "EMITIDA" && "Esta cotización ya fue emitida."}
          {estado === "CANCELADA" && "Esta cotización fue cancelada."}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {aviso && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}{" "}
          <a href="/cotizaciones" className="font-semibold underline">
            Ver mis cotizaciones
          </a>
        </div>
      )}

      <div className={paso === 0 ? "" : "hidden"}>
        {id && v && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            Cotización guardada: {v.marca} {v.modelo} {v.anio} {v.version}. Si vuelves a cotizar
            con el formulario, se reemplazan los resultados de esta cotización.
          </div>
        )}
        <QuoteForm onCotizar={cotizar} cargando={cargando} />
        {cargando && (
          <div className="mt-6 flex items-center gap-3 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            Consultando web services de las aseguradoras…
          </div>
        )}
      </div>

      {paso === 1 && resultados && (
        <div className="space-y-4">
          <QuoteResults
            resultados={resultados}
            request={ultimaSolicitud}
            descuentos={descuentos}
            recotizando={recotizando}
            onRecotizar={recotizar}
            coberturas={coberturas}
            recotizandoTodo={recotizandoTodo}
            onCoberturas={recotizarCoberturas}
            onAdicionales={bloqueada ? undefined : recotizarAdicionales}
            puedeDescontar={puedeDescontar && !bloqueada}
            elegida={seleccion}
            onElegir={(c) => {
              setSeleccion(c);
              setPaso(2);
            }}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setPaso(0)} className={btnSecundario}>
              Atrás
            </button>
            {accionesGuardar}
          </div>
        </div>
      )}

      {paso === 2 && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Contratante</h2>
          <NotaObligatorios />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Tipo de persona</label>
              <select
                className={inputCls}
                value={contratante.tipoPersona}
                onChange={(e) =>
                  setContratante({ ...contratante, tipoPersona: e.target.value as Contratante["tipoPersona"] })
                }
              >
                <option value="FISICA">Física</option>
                <option value="MORAL">Moral</option>
              </select>
            </div>
            {(
              [
                ["nombre", "Nombre o razón social", "sm:col-span-2"],
                ["rfc", "RFC", ""],
                ["email", "Correo", ""],
                ["telefono", "Teléfono", ""],
                [
                  "calle",
                  seleccion?.aseguradoraId === "qualitas" || seleccion?.aseguradoraId === "generalseguros"
                    ? "Calle"
                    : "Calle y número",
                  "sm:col-span-2",
                ],
              ] as [keyof Contratante, string, string][]
            ).map(([campo, label, cls]) => (
              <div key={campo} className={cls}>
                <label className={labelCls}>
                  {label}
                  {OBLIGATORIOS_EMISION.has(campo) && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
                </label>
                <input
                  className={`${inputCls} ${campo === "rfc" ? "uppercase" : ""}`}
                  value={contratante[campo]}
                  maxLength={campo === "rfc" ? 13 : campo === "cp" ? 5 : 200}
                  disabled={bloqueada}
                  onChange={(e) => setContratante({ ...contratante, [campo]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className={labelCls}>
                Código postal
                <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                className={inputCls}
                value={contratante.cp}
                inputMode="numeric"
                maxLength={5}
                disabled={bloqueada}
                onChange={(e) =>
                  setContratante({
                    ...contratante,
                    cp: e.target.value.replace(/\D/g, "").slice(0, 5),
                    colonia: "",
                    municipio: "",
                    estado: "",
                    codigoMunicipio: "",
                    codigoColonia: "",
                    gsColonia: "",
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>
                Colonia
                <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>
              </label>
              {coloniasCp.length > 0 ? (
                <select
                  className={inputCls}
                  value={contratante.colonia}
                  disabled={bloqueada}
                  onChange={(e) => {
                    const elegida = coloniasCp.find((x) => x.colonia === e.target.value);
                    setContratante({
                      ...contratante,
                      colonia: e.target.value,
                      municipio: elegida?.municipio ?? contratante.municipio,
                      codigoMunicipio: elegida?.codigoMunicipio ?? "",
                      codigoColonia: elegida?.codigoColonia ?? "",
                      gsColonia: "",
                    });
                  }}
                >
                  <option value="">Selecciona la colonia</option>
                  {contratante.colonia && !coloniasCp.some((x) => x.colonia === contratante.colonia) && (
                    <option value={contratante.colonia}>{contratante.colonia}</option>
                  )}
                  {coloniasCp.map((x) => (
                    <option key={`${x.municipio}-${x.colonia}`} value={x.colonia}>
                      {x.colonia}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  value={contratante.colonia}
                  maxLength={200}
                  disabled={bloqueada}
                  placeholder={/^\d{5}$/.test(contratante.cp) ? "" : "Captura primero el código postal"}
                  onChange={(e) => setContratante({ ...contratante, colonia: e.target.value })}
                />
              )}
            </div>
            {(
              [
                ["municipio", "Municipio / alcaldía"],
                ["estado", "Estado"],
              ] as ["municipio" | "estado", string][]
            ).map(([campo, label]) => (
              <div key={campo}>
                <label className={labelCls}>{label}</label>
                <input
                  className={`${inputCls} ${coloniasCp.length > 0 ? "bg-slate-50" : ""}`}
                  value={contratante[campo]}
                  maxLength={200}
                  readOnly={coloniasCp.length > 0}
                  disabled={bloqueada}
                  onChange={(e) => setContratante({ ...contratante, [campo]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {seleccion?.aseguradoraId === "qualitas" && (
            <DatosArt492 contratante={contratante} onChange={setContratante} disabled={bloqueada} />
          )}
          {seleccion?.aseguradoraId === "generalseguros" && (
            <DatosGs contratante={contratante} onChange={setContratante} disabled={bloqueada} />
          )}
          {/^\d{5}$/.test(contratante.cp) && !ubicacion?.colonias.length && (
            <p className="text-xs text-amber-700">
              No encontramos las colonias de este código postal; captúralas a mano.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setPaso(1)} className={btnSecundario}>
              Atrás
            </button>
            <div className="flex gap-2">
              {accionesGuardar}
              <button type="button" onClick={() => setPaso(3)} className={btnPrimario}>
                Continuar
              </button>
            </div>
          </div>
        </section>
      )}

      {paso === 3 && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Vehículo</h2>
          <NotaObligatorios />
          {v && (
            <p className="text-sm text-slate-600">
              {v.marca} {v.modelo} {v.anio} · {v.version} · Uso {v.uso.toLowerCase()} · CP {v.cp}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["serie", "Número de serie (VIN, 17 caracteres)", 17],
                ["motor", "Número de motor", 30],
                ["placas", "Placas", 10],
                ["color", "Color", 30],
              ] as [keyof DetalleVehiculo, string, number][]
            ).map(([campo, label, max]) => (
              <div key={campo}>
                <label className={labelCls}>
                  {label}
                  {OBLIGATORIOS_EMISION.has(campo) && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
                </label>
                <input
                  className={`${inputCls} ${campo !== "color" ? "uppercase" : ""}`}
                  value={vehiculo[campo]}
                  maxLength={max}
                  disabled={bloqueada}
                  onChange={(e) => setVehiculo({ ...vehiculo, [campo]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setPaso(2)} className={btnSecundario}>
              Atrás
            </button>
            <div className="flex gap-2">
              {accionesGuardar}
              <button type="button" onClick={() => setPaso(4)} className={btnPrimario}>
                Continuar
              </button>
            </div>
          </div>
        </section>
      )}

      {paso === 4 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">Resumen</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-sky-50 p-4">
              <div className="text-xs text-slate-500">Opción elegida</div>
              {elegido?.prima ? (
                <>
                  <div className="font-semibold text-slate-900">
                    {elegido.aseguradora} · {ETIQUETA_PAQUETE[elegido.paquete]}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-sky-700">
                    {formatMXN(elegido.prima.primaTotal)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Prima neta {formatMXN(elegido.prima.primaNeta)} · Forma de pago{" "}
                    {ultimaSolicitud?.formaPago?.toLowerCase()}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">Sin opción elegida.</div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
              <div className="text-xs text-slate-500">Contratante</div>
              <div className="font-semibold text-slate-900">{contratante.nombre || "—"}</div>
              <div>RFC {contratante.rfc || "—"}</div>
              <div>
                {[contratante.calle, contratante.colonia, contratante.municipio, contratante.estado, contratante.cp]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
              <div className="text-xs text-slate-500">Vehículo</div>
              <div className="font-semibold text-slate-900">
                {v ? `${v.marca} ${v.modelo} ${v.anio}` : "—"}
              </div>
              <div>{v?.version}</div>
              <div>Serie {vehiculo.serie || "—"} · Placas {vehiculo.placas || "—"}</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setPaso(3)} className={btnSecundario}>
              Atrás
            </button>
            <div className="flex gap-2">
              {accionesGuardar}
              <button
                type="button"
                onClick={() => guardar("EMISION_SOLICITADA")}
                disabled={guardando || bloqueada || estado === "EMISION_SOLICITADA"}
                className={btnPrimario}
              >
                {estado === "EMISION_SOLICITADA" ? "Emisión solicitada" : "Solicitar emisión"}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
