"use client";

import { useMemo, useState } from "react";
import type { CotizacionRequest } from "@/domain/types";
import { ANIOS, FORMAS_PAGO, MARCAS, PAQUETES } from "@/domain/catalogs";
import type { VehiculoQualitas } from "@/lib/qualitas/tarifas";
import type { VehiculoBanorte } from "@/lib/banorte/catalogos";
import type { VehiculoAfirme } from "@/lib/afirme/catalogos";
import type { VehiculoZurich } from "@/lib/zurich/catalogos";
import type { VehiculoHdi } from "@/lib/hdi/catalogos";
import type { VehiculoElPotosi } from "@/lib/elpotosi/catalogos";

type AseguradoraCatalogo =
  | "qualitas"
  | "banorte"
  | "afirme"
  | "zurich"
  | "hdi"
  | "elpotosi";

interface Props {
  onCotizar: (request: CotizacionRequest) => void;
  cargando: boolean;
}

// Opción de vehículo normalizada: cada aseguradora tiene su propio catálogo y
// su propia clave, pero en la UI se eligen igual.
interface OpcionVehiculo {
  clave: string;
  etiqueta: string;
  version?: string;
}

const marcas = Object.keys(MARCAS);

const ASEGURADORAS_CATALOGO: AseguradoraCatalogo[] = [
  "qualitas",
  "banorte",
  "afirme",
  "zurich",
  "hdi",
  "elpotosi",
];

function tokens(texto: string): Set<string> {
  const lista = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  const unidos = lista.slice(1).map((t, i) => lista[i] + t);
  return new Set([...lista, ...unidos]);
}

function similitud(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  ta.forEach((t) => {
    if (tb.has(t)) comunes++;
  });
  return comunes / (ta.size + tb.size - comunes);
}

const NO_PARTICULAR =
  /\b(SERV\.?\s?PUB|SERVPUB|SERVICIO PUBLICO|TAXI|TURISTA|TURISTAS|FRONTERIZ|CARGA|COMERCIAL)\w*/;

function masParecida(
  referencia: string,
  opciones: OpcionVehiculo[],
  uso: "PARTICULAR" | "COMERCIAL",
): OpcionVehiculo | undefined {
  let mejor: OpcionVehiculo | undefined;
  let mejorScore = 0;
  for (const o of opciones) {
    let score = similitud(referencia, o.version || o.etiqueta);
    if (
      uso === "PARTICULAR" &&
      NO_PARTICULAR.test(
        o.etiqueta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(),
      )
    ) {
      score *= 0.5;
    }
    if (score > mejorScore) {
      mejor = o;
      mejorScore = score;
    }
  }
  return mejor;
}

export default function QuoteForm({ onCotizar, cargando }: Props) {
  const [marca, setMarca] = useState(marcas[0]);
  const [modelo, setModelo] = useState(MARCAS[marcas[0]][0]);
  const [anio, setAnio] = useState<number>(ANIOS[0]);
  const [version, setVersion] = useState("");
  const [uso, setUso] = useState<"PARTICULAR" | "COMERCIAL">("PARTICULAR");
  const [valorFactura, setValorFactura] = useState("");
  const [cpVehiculo, setCpVehiculo] = useState("");
  const [claveAmis, setClaveAmis] = useState("");

  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [genero, setGenero] = useState<"M" | "F">("M");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");

  const [formaPago, setFormaPago] = useState(FORMAS_PAGO[0].value);

  const [claveBanorte, setClaveBanorte] = useState("");
  const [claveAfirme, setClaveAfirme] = useState("");
  const [claveZurich, setClaveZurich] = useState("");
  const [claveHdi, setClaveHdi] = useState("");
  const [claveElPotosi, setClaveElPotosi] = useState("");

  const [catBuscando, setCatBuscando] = useState<Record<string, boolean>>({});
  const [catAbierto, setCatAbierto] = useState<Record<string, boolean>>({});
  const [catElegido, setCatElegido] = useState<
    Record<string, OpcionVehiculo | undefined>
  >({});
  const [catError, setCatError] = useState<Record<string, string>>({});
  const [catResultados, setCatResultados] = useState<
    Record<string, OpcionVehiculo[]>
  >({});

  const modelos = useMemo(() => MARCAS[marca] ?? [], [marca]);

  async function buscarCatalogo(
    aseguradora: AseguradoraCatalogo,
    nombre: string,
    url: string,
    normalizar: (data: { vehiculos?: unknown[] }) => OpcionVehiculo[],
  ) {
    setCatBuscando((b) => ({ ...b, [aseguradora]: true }));
    setCatError((e) => ({ ...e, [aseguradora]: "" }));
    setCatResultados((r) => ({ ...r, [aseguradora]: [] }));
    asignarClave(aseguradora, undefined);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setCatError((e) => ({
          ...e,
          [aseguradora]: data.error || "No se pudo consultar el catálogo.",
        }));
        return;
      }
      const opciones = normalizar(data);
      if (opciones.length === 0) {
        setCatError((e) => ({
          ...e,
          [aseguradora]: `Sin coincidencias en el catálogo de ${nombre}.`,
        }));
        return;
      }
      setCatResultados((r) => ({ ...r, [aseguradora]: opciones }));
      const sugerida = version.trim()
        ? masParecida(version, opciones, uso)
        : undefined;
      if (sugerida) {
        asignarClave(aseguradora, sugerida);
        setCatAbierto((a) => ({ ...a, [aseguradora]: false }));
      } else {
        setCatAbierto((a) => ({ ...a, [aseguradora]: true }));
      }
    } catch {
      setCatError((e) => ({
        ...e,
        [aseguradora]: `Error de red al consultar el catálogo de ${nombre}.`,
      }));
    } finally {
      setCatBuscando((b) => ({ ...b, [aseguradora]: false }));
    }
  }

  function buscarQualitas() {
    const params = new URLSearchParams({
      marca,
      tipo: modelo,
      modelo: String(anio),
    });
    return buscarCatalogo(
      "qualitas",
      "Quálitas",
      `/api/qualitas/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoQualitas[]).map((v) => ({
          clave: v.claveAmis,
          etiqueta: `${v.marcaLarga || v.marca} ${v.tipo} ${v.version} (${v.modelo})`,
          version: v.version,
        })),
    );
  }

  function buscarBanorte() {
    const params = new URLSearchParams({
      marca,
      submarca: modelo,
      anio: String(anio),
    });
    return buscarCatalogo(
      "banorte",
      "Banorte",
      `/api/banorte/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoBanorte[]).map((v) => ({
          clave: v.claveBanorte,
          etiqueta: `${v.marca} ${v.submarca} ${v.descripcion} (${v.anio})`,
          version: v.descripcion,
        })),
    );
  }

  function buscarAfirme() {
    const params = new URLSearchParams({
      marca,
      submarca: modelo,
      anio: String(anio),
    });
    return buscarCatalogo(
      "afirme",
      "Afirme",
      `/api/afirme/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoAfirme[]).map((v) => ({
          clave: v.idEstilo,
          etiqueta: `${v.descripcion} (${v.anio})`,
          version: v.descripcion,
        })),
    );
  }

  function buscarZurich() {
    const params = new URLSearchParams({
      marca,
      submarca: modelo,
      anio: String(anio),
    });
    return buscarCatalogo(
      "zurich",
      "Zurich",
      `/api/zurich/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoZurich[]).map((v) => ({
          clave: v.claveZurich,
          etiqueta: `${v.marca} ${v.descripcion} (${v.anio})`,
          version: v.descripcion,
        })),
    );
  }

  function buscarHdi() {
    const params = new URLSearchParams({
      marca,
      submarca: modelo,
      anio: String(anio),
    });
    return buscarCatalogo(
      "hdi",
      "HDI",
      `/api/hdi/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoHdi[]).map((v) => ({
          clave: v.claveHdi,
          etiqueta: `${v.marca} ${v.submarca} ${v.descripcion} (${v.anio})`,
          version: v.descripcion,
        })),
    );
  }

  function buscarElPotosi() {
    const params = new URLSearchParams({
      marca,
      submarca: modelo,
      anio: String(anio),
    });
    return buscarCatalogo(
      "elpotosi",
      "El Potosí",
      `/api/elpotosi/vehiculos?${params.toString()}`,
      (data) =>
        ((data.vehiculos ?? []) as VehiculoElPotosi[]).map((v) => ({
          clave: v.claveElPotosi,
          etiqueta: `${v.marca} ${v.submarca} ${v.descripcion} (${v.anio})`,
          version: v.descripcion,
        })),
    );
  }

  function asignarClave(
    aseguradora: AseguradoraCatalogo,
    v: OpcionVehiculo | undefined,
  ) {
    const clave = v?.clave ?? "";
    if (aseguradora === "qualitas") setClaveAmis(clave);
    else if (aseguradora === "banorte") setClaveBanorte(clave);
    else if (aseguradora === "afirme") setClaveAfirme(clave);
    else if (aseguradora === "zurich") setClaveZurich(clave);
    else if (aseguradora === "hdi") setClaveHdi(clave);
    else setClaveElPotosi(clave);
    setCatElegido((el) => ({ ...el, [aseguradora]: v }));
  }

  function limpiarClaves() {
    ASEGURADORAS_CATALOGO.forEach((id) => asignarClave(id, undefined));
    setCatResultados({});
    setCatAbierto({});
    setCatError({});
  }

  function elegirVehiculo(aseguradora: AseguradoraCatalogo, v: OpcionVehiculo) {
    asignarClave(aseguradora, v);
    if (v.version) setVersion(v.version);
    setCatAbierto((a) => ({ ...a, [aseguradora]: false }));
  }

  const buscando = Object.values(catBuscando).some(Boolean);

  function buscarEnTodas() {
    const buscadores: Record<AseguradoraCatalogo, () => Promise<void>> = {
      qualitas: buscarQualitas,
      banorte: buscarBanorte,
      afirme: buscarAfirme,
      zurich: buscarZurich,
      hdi: buscarHdi,
      elpotosi: buscarElPotosi,
    };
    return Promise.all(ASEGURADORAS_CATALOGO.map((id) => buscadores[id]()));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const request: CotizacionRequest = {
      vehiculo: {
        marca,
        modelo,
        anio,
        version,
        uso,
        valorFactura: valorFactura ? Number(valorFactura) : undefined,
        cp: cpVehiculo,
        claveAmis: claveAmis.trim() || undefined,
        claveBanorte: claveBanorte.trim() || undefined,
        claveAfirme: claveAfirme.trim() || undefined,
        claveZurich: claveZurich.trim() || undefined,
        claveHdi: claveHdi.trim() || undefined,
        claveElPotosi: claveElPotosi.trim() || undefined,
      },
      conductor: {
        nombre,
        fechaNacimiento,
        genero,
        cp: cpVehiculo,
        email: email || undefined,
        telefono: telefono || undefined,
      },
      paquete: "AMPLIA",
      paquetes: PAQUETES.map((p) => p.value),
      formaPago,
    };
    onCotizar(request);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sky-700">
          Datos del vehículo
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Marca</label>
            <select
              className={inputCls}
              value={marca}
              onChange={(e) => {
                setMarca(e.target.value);
                setModelo(MARCAS[e.target.value][0]);
                limpiarClaves();
              }}
            >
              {marcas.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Modelo / Línea</label>
            <select
              className={inputCls}
              value={modelo}
              onChange={(e) => {
                setModelo(e.target.value);
                limpiarClaves();
              }}
            >
              {modelos.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Año</label>
            <select
              className={inputCls}
              value={anio}
              onChange={(e) => {
                setAnio(Number(e.target.value));
                limpiarClaves();
              }}
            >
              {ANIOS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Versión</label>
            <input
              className={inputCls}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Ej. Sense TM"
            />
          </div>
          <div>
            <label className={labelCls}>Uso</label>
            <select
              className={inputCls}
              value={uso}
              onChange={(e) =>
                setUso(e.target.value as "PARTICULAR" | "COMERCIAL")
              }
            >
              <option value="PARTICULAR">Particular</option>
              <option value="COMERCIAL">Comercial</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Valor factura (MXN, opcional)</label>
            <input
              className={inputCls}
              value={valorFactura}
              onChange={(e) =>
                setValorFactura(e.target.value.replace(/[^0-9]/g, ""))
              }
              inputMode="numeric"
              placeholder="Se estima si se deja vacío"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-800">
              Claves del vehículo por aseguradora
            </p>
            <button
              type="button"
              onClick={buscarEnTodas}
              disabled={buscando}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
            >
              {buscando ? "Buscando…" : "Buscar en todas"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-amber-700">
            Cada aseguradora identifica el vehículo con su propia clave y la
            necesita para cotizar en real. Busca en su catálogo y elige la
            versión: la clave se llena sola. Con &quot;Buscar en todas&quot; se
            preselecciona en cada aseguradora la versión más parecida a la
            capturada; revísala y cámbiala si no corresponde. Si la clave queda
            vacía, esa aseguradora se cotiza de forma simulada.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  id: "qualitas" as const,
                  etiqueta: "Quálitas (ClaveAmis)",
                  valor: claveAmis,
                  onChange: (v: string) =>
                    setClaveAmis(v.replace(/[^0-9]/g, "").slice(0, 6)),
                  placeholder: "Ej. 00465",
                  buscar: buscarQualitas,
                },
                {
                  id: "banorte" as const,
                  etiqueta: "Banorte (claveBanorte)",
                  valor: claveBanorte,
                  onChange: (v: string) =>
                    setClaveBanorte(v.toUpperCase().slice(0, 10)),
                  placeholder: "Ej. NI370",
                  buscar: buscarBanorte,
                },
                {
                  id: "afirme" as const,
                  etiqueta: "Afirme (idEstilo)",
                  valor: claveAfirme,
                  onChange: (v: string) =>
                    setClaveAfirme(v.replace(/[^0-9]/g, "").slice(0, 8)),
                  placeholder: "Ej. 109931",
                  buscar: buscarAfirme,
                },
                {
                  id: "zurich" as const,
                  etiqueta: "Zurich (clave Zurich)",
                  valor: claveZurich,
                  onChange: (v: string) =>
                    setClaveZurich(
                      v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8),
                    ),
                  placeholder: "Ej. 098C6954",
                  buscar: buscarZurich,
                },
                {
                  id: "hdi" as const,
                  etiqueta: "HDI (clave HDI)",
                  valor: claveHdi,
                  onChange: (v: string) =>
                    setClaveHdi(v.replace(/[^0-9-]/g, "").slice(0, 20)),
                  placeholder: "Ej. 4579-2389654",
                  buscar: buscarHdi,
                },
                {
                  id: "elpotosi" as const,
                  etiqueta: "El Potosí (clave El Potosí)",
                  valor: claveElPotosi,
                  onChange: (v: string) =>
                    setClaveElPotosi(
                      v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20),
                    ),
                  placeholder: "Ej. AUT-120-001-07",
                  buscar: buscarElPotosi,
                },
              ] as const
            ).map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-amber-900">
                    {c.etiqueta}
                  </label>
                  <button
                    type="button"
                    onClick={c.buscar}
                    disabled={catBuscando[c.id]}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    {catBuscando[c.id] ? "Buscando…" : "Buscar en catálogo"}
                  </button>
                </div>
                <input
                  className={`${inputCls} mt-2`}
                  value={c.valor}
                  onChange={(e) => c.onChange(e.target.value)}
                  placeholder={c.placeholder}
                />
                {catError[c.id] && (
                  <p className="mt-2 text-xs text-rose-600">{catError[c.id]}</p>
                )}
                {catElegido[c.id] && catElegido[c.id]?.clave === c.valor && (
                  <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs">
                    <span className="text-slate-700">
                      <span className="font-medium text-amber-800">
                        Versión:{" "}
                      </span>
                      {catElegido[c.id]?.etiqueta}
                    </span>
                    {(catResultados[c.id]?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCatAbierto((a) => ({ ...a, [c.id]: !a[c.id] }))
                        }
                        className="shrink-0 font-medium text-amber-700 underline hover:text-amber-900"
                      >
                        {catAbierto[c.id] ? "Cerrar" : "Cambiar"}
                      </button>
                    )}
                  </div>
                )}
                {catAbierto[c.id] && (catResultados[c.id]?.length ?? 0) > 0 && (
                  <ul className="mt-2 max-h-48 divide-y divide-amber-100 overflow-auto rounded-lg border border-amber-200 bg-white">
                    {catResultados[c.id].map((v) => (
                      <li key={`${v.clave}-${v.etiqueta}`}>
                        <button
                          type="button"
                          onClick={() => elegirVehiculo(c.id, v)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-amber-50 ${
                            catElegido[c.id]?.clave === v.clave
                              ? "bg-amber-100"
                              : ""
                          }`}
                        >
                          <span className="text-slate-700">{v.etiqueta}</span>
                          <span className="shrink-0 font-mono text-amber-700">
                            {v.clave}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sky-700">
          Datos del conductor
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del asegurado"
            />
          </div>
          <div>
            <label className={labelCls}>Fecha de nacimiento</label>
            <input
              type="date"
              className={inputCls}
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Género</label>
            <select
              className={inputCls}
              value={genero}
              onChange={(e) => setGenero(e.target.value as "M" | "F")}
            >
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Código postal</label>
            <input
              className={inputCls}
              value={cpVehiculo}
              onChange={(e) =>
                setCpVehiculo(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))
              }
              inputMode="numeric"
              placeholder="Ej. 64000"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Correo (opcional)</label>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@correo.com"
            />
          </div>
          <div>
            <label className={labelCls}>Teléfono (opcional)</label>
            <input
              className={inputCls}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              placeholder="10 dígitos"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sky-700">
          Cobertura y pago
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Se cotizan los tres paquetes (Amplia, Limitada y Básica) con todas las
          aseguradoras. El descuento por aseguradora se ajusta en el
          comparativo.
        </p>
        <div className="max-w-xs">
          <label className={labelCls}>Forma de pago</label>
          <select
            className={inputCls}
            value={formaPago}
            onChange={(e) =>
              setFormaPago(e.target.value as typeof formaPago)
            }
          >
            {FORMAS_PAGO.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <button
        type="submit"
        disabled={cargando}
        className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {cargando ? "Cotizando…" : "Cotizar con todas las aseguradoras"}
      </button>
    </form>
  );
}
