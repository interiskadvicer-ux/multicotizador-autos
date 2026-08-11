"use client";

import { useMemo, useState } from "react";
import type { CotizacionRequest, Paquete } from "@/domain/types";
import {
  ANIOS,
  FORMAS_PAGO,
  MARCAS,
  PAQUETES,
} from "@/domain/catalogs";
import { ASEGURADORAS } from "@/insurers/registry";
import type { VehiculoQualitas } from "@/lib/qualitas/tarifas";
import type { VehiculoBanorte } from "@/lib/banorte/catalogos";

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

  const [paquete, setPaquete] = useState<Paquete>("AMPLIA");
  const [formaPago, setFormaPago] = useState(FORMAS_PAGO[0].value);

  const [descuentos, setDescuentos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ASEGURADORAS.map((a) => [a.id, String(a.descuentoDefault)]),
    ),
  );

  const [claveBanorte, setClaveBanorte] = useState("");

  const [catBuscando, setCatBuscando] = useState<"" | "qualitas" | "banorte">(
    "",
  );
  const [catError, setCatError] = useState<Record<string, string>>({});
  const [catResultados, setCatResultados] = useState<
    Record<string, OpcionVehiculo[]>
  >({});

  const modelos = useMemo(() => MARCAS[marca] ?? [], [marca]);

  async function buscarCatalogo(
    aseguradora: "qualitas" | "banorte",
    nombre: string,
    url: string,
    normalizar: (data: { vehiculos?: unknown[] }) => OpcionVehiculo[],
  ) {
    setCatBuscando(aseguradora);
    setCatError((e) => ({ ...e, [aseguradora]: "" }));
    setCatResultados((r) => ({ ...r, [aseguradora]: [] }));
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
    } catch {
      setCatError((e) => ({
        ...e,
        [aseguradora]: `Error de red al consultar el catálogo de ${nombre}.`,
      }));
    } finally {
      setCatBuscando("");
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

  function elegirVehiculo(aseguradora: "qualitas" | "banorte", v: OpcionVehiculo) {
    if (aseguradora === "qualitas") setClaveAmis(v.clave);
    else setClaveBanorte(v.clave);
    if (v.version && !version) setVersion(v.version);
    setCatResultados((r) => ({ ...r, [aseguradora]: [] }));
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
      },
      conductor: {
        nombre,
        fechaNacimiento,
        genero,
        cp: cpVehiculo,
        email: email || undefined,
        telefono: telefono || undefined,
      },
      paquete,
      formaPago,
      descuentos: Object.fromEntries(
        Object.entries(descuentos).map(([id, v]) => {
          const n = Number(v);
          return [id, Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0];
        }),
      ),
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
              onChange={(e) => setModelo(e.target.value)}
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
              onChange={(e) => setAnio(Number(e.target.value))}
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
          <p className="text-xs font-semibold text-amber-800">
            Claves del vehículo por aseguradora
          </p>
          <p className="mt-1 text-[11px] text-amber-700">
            Cada aseguradora identifica el vehículo con su propia clave y la
            necesita para cotizar en real. Busca en su catálogo y elige la
            versión: la clave se llena sola. Si la dejas vacía, esa aseguradora
            se cotiza de forma simulada.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    disabled={catBuscando !== ""}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    {catBuscando === c.id ? "Buscando…" : "Buscar en catálogo"}
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
                {(catResultados[c.id]?.length ?? 0) > 0 && (
                  <ul className="mt-2 max-h-48 divide-y divide-amber-100 overflow-auto rounded-lg border border-amber-200 bg-white">
                    {catResultados[c.id].map((v) => (
                      <li key={`${v.clave}-${v.etiqueta}`}>
                        <button
                          type="button"
                          onClick={() => elegirVehiculo(c.id, v)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-amber-50"
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
          Cobertura
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PAQUETES.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setPaquete(p.value)}
              className={`rounded-xl border p-3 text-left transition ${
                paquete === p.value
                  ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-semibold text-slate-800">
                {p.label}
              </div>
              <div className="mt-1 text-xs text-slate-500">{p.descripcion}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
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

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-sky-700">
          Descuentos por aseguradora
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Ajusta el % de descuento comercial que aplica cada aseguradora. Se
          descuenta de la prima neta.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ASEGURADORAS.map((a) => (
            <div key={a.id}>
              <label className={labelCls}>{a.nombre}</label>
              <div className="relative">
                <input
                  className={`${inputCls} pr-7`}
                  value={descuentos[a.id] ?? ""}
                  onChange={(e) =>
                    setDescuentos((prev) => ({
                      ...prev,
                      [a.id]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    }))
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
            </div>
          ))}
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
