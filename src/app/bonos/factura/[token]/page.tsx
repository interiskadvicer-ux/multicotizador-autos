import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { reportePorToken, obtenerConfig } from "@/lib/bonos/repositorio";
import { etiquetaPeriodo, lineasImporte } from "@/lib/bonos/correo";
import FacturaBonoForm from "@/components/bonos/FacturaBonoForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bono El Potosí – Interiskad", robots: { index: false, follow: false } };

const ESTADOS: Record<string, string> = {
  GENERADO: "Pendiente de factura",
  ENVIADO: "Pendiente de factura",
  FACTURADO: "Factura recibida, en revisión de pago",
  PAGADO: "Pagado",
};

export default function FacturaBonoPage({ params }: { params: { token: string } }) {
  const r = reportePorToken(params.token);
  if (!r) notFound();
  const config = obtenerConfig();
  const filas = lineasImporte(r);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-interisk.jpg" alt="Interiskad" className="mx-auto h-14" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Bono El Potosí</h1>
          <p className="text-sm text-slate-600">
            {r.nombre} · {etiquetaPeriodo(r)}
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {filas.map(([k, v], i) => (
                <tr key={k} className={i === filas.length - 1 ? "border-t-2 border-sky-700 font-bold" : ""}>
                  <td className="py-1.5 text-slate-700">{k}</td>
                  <td className="py-1.5 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">
            Estado: <b>{ESTADOS[r.estado]}</b>
            {r.fechaPago && <> · pagado el {r.fechaPago}</>}
          </div>
        </section>

        {config.datosFacturacion && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <h2 className="font-semibold text-slate-800">Datos para tu factura</h2>
            <p className="mt-2 whitespace-pre-line text-slate-700">{config.datosFacturacion}</p>
          </section>
        )}

        {r.estado !== "PAGADO" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">
              {r.facturaPdf ? "Reemplazar factura" : "Sube tu factura"}
            </h2>
            {r.facturaUuid && <p className="mt-1 text-xs text-slate-500">Factura recibida: UUID {r.facturaUuid}</p>}
            <FacturaBonoForm token={r.token} />
          </section>
        )}
      </div>
    </main>
  );
}
