"use client";

import { useEffect, useState } from "react";
import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type {
  CatalogosEmisionHdi,
  EmisionHdi as DatosEmision,
  MedioPagoHdi,
  PolizaHdi,
  UbicacionHdi,
} from "@/lib/hdi/emision";
import { formatMXN } from "@/lib/format";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

const MEDIOS: { value: MedioPagoHdi; label: string }[] = [
  { value: "CREDITO", label: "Tarjeta de crédito (pago en línea)" },
  { value: "DEBITO", label: "Tarjeta de débito (pago en línea)" },
  { value: "SIN_PAGO", label: "Emitir sin pago en línea" },
];

interface Props {
  request: CotizacionRequest;
  resultado: CotizacionResultado;
  onCerrar: () => void;
}

function descargarPdf(base64: string, nombre: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EmisionHdi({ request, resultado, onCerrar }: Props) {
  const [catalogos, setCatalogos] = useState<CatalogosEmisionHdi | null>(null);
  const [ubicacion, setUbicacion] = useState<UbicacionHdi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [poliza, setPoliza] = useState<PolizaHdi | null>(null);

  const [c, setC] = useState({
    nombre: "",
    segundoNombre: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    rfc: "",
    fechaNacimiento: request.conductor.fechaNacimiento,
    sexo: request.conductor.genero,
    estadoCivil: "",
    ocupacion: "",
    email: request.conductor.email ?? "",
    telefono: request.conductor.telefono ?? "",
    calle: "",
    numeroExterior: "",
    numeroInterior: "",
    cp: request.conductor.cp || request.vehiculo.cp,
    colonia: "",
  });
  const [regimenFiscal, setRegimenFiscal] = useState("");
  const [unidad, setUnidad] = useState({ numeroSerie: "", numeroMotor: "", placas: "" });
  const [medioPago, setMedioPago] = useState<MedioPagoHdi>("CREDITO");
  const [tarjeta, setTarjeta] = useState({
    idBanco: "",
    numero: "",
    titular: "",
    vencimiento: "",
    cvv: "",
  });

  useEffect(() => {
    fetch("/api/hdi/emision")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar los catálogos de HDI.");
        setCatalogos(data);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setUbicacion(null);
    if (!/^\d{5}$/.test(c.cp)) return;
    let vigente = true;
    fetch(`/api/hdi/emision?cp=${c.cp}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Código postal no encontrado en HDI.");
        if (vigente) setUbicacion(data);
      })
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [c.cp]);

  function campo<K extends keyof typeof c>(k: K, v: (typeof c)[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
  }

  async function emitir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const emision: DatosEmision = {
      contratante: {
        ...c,
        rfc: c.rfc.trim().toUpperCase(),
        nombre: c.nombre.trim().toUpperCase(),
        segundoNombre: c.segundoNombre.trim().toUpperCase() || undefined,
        apellidoPaterno: c.apellidoPaterno.trim().toUpperCase(),
        apellidoMaterno: c.apellidoMaterno.trim().toUpperCase() || undefined,
        numeroInterior: c.numeroInterior.trim() || undefined,
      },
      fiscal: { regimenFiscal },
      unidad: {
        numeroSerie: unidad.numeroSerie.trim().toUpperCase(),
        numeroMotor: unidad.numeroMotor.trim().toUpperCase() || undefined,
        placas: unidad.placas.trim().toUpperCase() || undefined,
      },
      medioPago,
      tarjeta:
        medioPago === "SIN_PAGO"
          ? undefined
          : { ...tarjeta, numero: tarjeta.numero.replace(/\D/g, "") },
    };
    try {
      const r = await fetch("/api/hdi/emision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: { ...request, paquete: resultado.paquete, paquetes: undefined },
          emision,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "HDI no emitió la póliza.");
      setPoliza(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "HDI no emitió la póliza.");
    } finally {
      setTarjeta((t) => ({ ...t, numero: "", cvv: "", vencimiento: "" }));
      setEnviando(false);
    }
  }

  if (poliza) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <h4 className="font-semibold">Póliza HDI emitida: {poliza.poliza}</h4>
        <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <div>Cotización HDI: {poliza.cotizacion}</div>
          <div>Prima total: {formatMXN(poliza.primaTotal)}</div>
          {poliza.pago && (
            <>
              <div>Pago: {poliza.pago.resultado}</div>
              <div>Folio de pago: {poliza.pago.folio}</div>
              <div>Importe cobrado: {poliza.pago.importe}</div>
              <div>Recibo: {poliza.pago.recibo}</div>
              <div>Tarjeta: {poliza.pago.tarjeta}</div>
            </>
          )}
        </dl>
        {poliza.avisoPdf && <p className="text-xs text-amber-700">{poliza.avisoPdf}</p>}
        <div className="flex gap-2">
          {poliza.pdfBase64 && (
            <button
              type="button"
              onClick={() => descargarPdf(poliza.pdfBase64!, `HDI-Poliza-${poliza.poliza}.pdf`)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Descargar póliza y recibo (PDF)
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const conTarjeta = medioPago !== "SIN_PAGO";
  return (
    <form
      onSubmit={emitir}
      autoComplete="off"
      className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/40 p-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">
          Emitir con HDI · {resultado.paquete} ·{" "}
          {resultado.prima && formatMXN(resultado.prima.primaTotal)}
        </h4>
        <button type="button" onClick={onCerrar} className="text-xs text-slate-500 hover:underline">
          Cancelar
        </button>
      </div>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Contratante (persona física)
        </legend>
        <Campo label="Nombre" value={c.nombre} onChange={(v) => campo("nombre", v)} required />
        <Campo label="Segundo nombre" value={c.segundoNombre} onChange={(v) => campo("segundoNombre", v)} />
        <Campo label="Apellido paterno" value={c.apellidoPaterno} onChange={(v) => campo("apellidoPaterno", v)} required />
        <Campo label="Apellido materno" value={c.apellidoMaterno} onChange={(v) => campo("apellidoMaterno", v)} />
        <Campo label="RFC" value={c.rfc} onChange={(v) => campo("rfc", v.toUpperCase())} required maxLength={13} />
        <Campo label="Fecha de nacimiento" type="date" value={c.fechaNacimiento} onChange={(v) => campo("fechaNacimiento", v)} required />
        <div>
          <label className={labelCls}>Sexo</label>
          <select className={inputCls} value={c.sexo} onChange={(e) => campo("sexo", e.target.value as "M" | "F")}>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </div>
        <Opciones label="Estado civil" value={c.estadoCivil} onChange={(v) => campo("estadoCivil", v)} opciones={catalogos?.estadosCiviles} />
        <Opciones label="Ocupación" value={c.ocupacion} onChange={(v) => campo("ocupacion", v)} opciones={catalogos?.ocupaciones} />
        <Opciones label="Régimen fiscal" value={regimenFiscal} onChange={setRegimenFiscal} opciones={catalogos?.regimenesFiscales} />
        <Campo label="Correo" type="email" value={c.email} onChange={(v) => campo("email", v)} required />
        <Campo label="Teléfono" value={c.telefono} onChange={(v) => campo("telefono", v.replace(/\D/g, ""))} required maxLength={10} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Domicilio
        </legend>
        <Campo label="Calle" value={c.calle} onChange={(v) => campo("calle", v)} required />
        <Campo label="No. exterior" value={c.numeroExterior} onChange={(v) => campo("numeroExterior", v)} required />
        <Campo label="No. interior" value={c.numeroInterior} onChange={(v) => campo("numeroInterior", v)} />
        <Campo label="Código postal" value={c.cp} onChange={(v) => campo("cp", v.replace(/\D/g, ""))} required maxLength={5} />
        <div className="sm:col-span-2">
          <label className={labelCls}>Colonia</label>
          <select className={inputCls} value={c.colonia} onChange={(e) => campo("colonia", e.target.value)} required>
            <option value="">{ubicacion ? "Selecciona…" : "Captura el CP…"}</option>
            {ubicacion?.colonias.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
        <div className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">
          {ubicacion ? `${ubicacion.ciudad}, ${ubicacion.estado}` : ""}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Vehículo
        </legend>
        <Campo label="No. de serie (17)" value={unidad.numeroSerie} onChange={(v) => setUnidad((u) => ({ ...u, numeroSerie: v.toUpperCase() }))} required maxLength={17} />
        <Campo label="No. de motor" value={unidad.numeroMotor} onChange={(v) => setUnidad((u) => ({ ...u, numeroMotor: v }))} />
        <Campo label="Placas" value={unidad.placas} onChange={(v) => setUnidad((u) => ({ ...u, placas: v }))} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pago
        </legend>
        <div className="sm:col-span-2">
          <label className={labelCls}>Forma de cobro</label>
          <select className={inputCls} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPagoHdi)}>
            {MEDIOS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        {conTarjeta && (
          <>
            <Opciones label="Banco" value={tarjeta.idBanco} onChange={(v) => setTarjeta((t) => ({ ...t, idBanco: v }))} opciones={catalogos?.bancos} />
            <Campo label="Titular de la tarjeta" value={tarjeta.titular} onChange={(v) => setTarjeta((t) => ({ ...t, titular: v.toUpperCase() }))} required />
            <Campo label="Número de tarjeta" value={tarjeta.numero} onChange={(v) => setTarjeta((t) => ({ ...t, numero: v.replace(/[^\d ]/g, "") }))} required maxLength={19} inputMode="numeric" autoComplete="cc-number" />
            <Campo label="Vencimiento (mm/aa)" value={tarjeta.vencimiento} onChange={(v) => setTarjeta((t) => ({ ...t, vencimiento: v }))} required maxLength={5} placeholder="mm/aa" autoComplete="cc-exp" />
            <Campo label="CVV" type="password" value={tarjeta.cvv} onChange={(v) => setTarjeta((t) => ({ ...t, cvv: v.replace(/\D/g, "") }))} required maxLength={4} inputMode="numeric" autoComplete="cc-csc" />
            <p className="self-end pb-2 text-[11px] text-slate-500">
              Los datos de la tarjeta se envían solo a HDI; no se guardan.
            </p>
          </>
        )}
      </fieldset>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={enviando || !catalogos || !ubicacion}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {enviando
            ? "Emitiendo con HDI…"
            : conTarjeta
              ? "Pagar y emitir"
              : "Emitir póliza"}
        </button>
      </div>
    </form>
  );
}

function Campo({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function Opciones({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones?: { clave: string; descripcion: string }[];
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">{opciones ? "Selecciona…" : "Cargando…"}</option>
        {opciones?.map((o) => (
          <option key={o.clave} value={o.clave}>{o.descripcion}</option>
        ))}
      </select>
    </div>
  );
}
