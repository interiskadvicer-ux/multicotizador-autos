import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import { listarPolizasConEstado } from "@/lib/polizas";
import { contarCotizacionesPorEstado, listarCotizaciones } from "@/lib/cotizaciones";
import { contarSolicitudesPendientes } from "@/lib/agentes";
import { totalCobrado } from "@/lib/pagos";
import { formatMXN } from "@/lib/format";

export const dynamic = "force-dynamic";

function Kpi({
  titulo,
  valor,
  detalle,
  href,
  tono = "slate",
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  href?: string;
  tono?: "slate" | "amber" | "red" | "emerald" | "sky";
}) {
  const tonos = {
    slate: "text-slate-900",
    amber: "text-amber-600",
    red: "text-red-600",
    emerald: "text-emerald-600",
    sky: "text-sky-700",
  };
  const contenido = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className={`mt-2 text-2xl font-bold ${tonos[tono]}`}>{valor}</div>
      {detalle && <div className="mt-1 text-xs text-slate-500">{detalle}</div>}
    </div>
  );
  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

export default async function DashboardPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  const esAdmin = sesion.rol === "ADMIN";
  const vePolizas = tieneAcceso(sesion.rol, ["ADMIN", "POLIZAS", "AGENTE"]);
  const polizas = vePolizas
    ? listarPolizasConEstado(sesion.rol === "AGENTE" ? sesion.id : undefined)
    : [];
  const vigentes = polizas.filter((p) => p.estado !== "VENCIDA");
  const porVencer = polizas.filter((p) => p.estado === "POR_VENCER");
  const proximas = polizas.filter((p) => p.estado === "PROXIMA");
  const vencidas = polizas.filter((p) => p.estado === "VENCIDA");
  const primaVigente = vigentes.reduce((s, p) => s + p.primaNeta, 0);
  const porCobrar = polizas.filter((p) => p.estadoPago !== "PAGADA");
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toLocaleDateString("en-CA");
  const cobradoMes = vePolizas
    ? totalCobrado(inicioMes, sesion.rol === "AGENTE" ? sesion.id : undefined)
    : 0;

  const usuarioFiltro = esAdmin ? undefined : sesion.id;
  const conteo = contarCotizacionesPorEstado(usuarioFiltro);
  const recientes = listarCotizaciones(usuarioFiltro).slice(0, 5);
  const renovaciones = polizas
    .filter((p) => p.estado === "POR_VENCER" || p.estado === "PROXIMA")
    .slice(0, 5);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hola, {sesion.nombre.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {esAdmin ? "Resumen general del portal." : "Resumen de tu cartera y cotizaciones."}
          </p>
        </div>
        <Link
          href="/cotizar"
          className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Cotizar auto
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {vePolizas && (
          <>
            <Kpi
              titulo="Prima neta vigente"
              valor={formatMXN(primaVigente)}
              detalle={`${vigentes.length} pólizas vigentes`}
              href="/polizas"
              tono="sky"
            />
            <Kpi
              titulo="Renovaciones ≤30 días"
              valor={String(porVencer.length)}
              detalle={`${proximas.length} más en 31–60 días`}
              href="/polizas"
              tono="amber"
            />
            <Kpi titulo="Pólizas vencidas" valor={String(vencidas.length)} href="/polizas" tono="red" />
            <Kpi
              titulo="Prima cobrada este mes"
              valor={formatMXN(cobradoMes)}
              detalle={`${porCobrar.length} pólizas por cobrar · ${formatMXN(
                porCobrar.reduce((s, p) => s + p.saldo, 0),
              )}`}
              href={sesion.rol === "AGENTE" ? "/polizas" : "/cobranza"}
              tono="emerald"
            />
          </>
        )}
        <Kpi
          titulo="Cotizaciones guardadas"
          valor={String(conteo.GUARDADA)}
          href="/cotizaciones"
        />
        <Kpi
          titulo="Emisiones solicitadas"
          valor={String(conteo.EMISION_SOLICITADA)}
          detalle={`${conteo.EMITIDA} emitidas`}
          href="/cotizaciones"
          tono="emerald"
        />
        {esAdmin && (
          <Kpi
            titulo="Agentes por autorizar"
            valor={String(contarSolicitudesPendientes())}
            href="/admin/agentes"
            tono="amber"
          />
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Cotizaciones recientes</h2>
            <Link href="/cotizaciones" className="text-xs font-medium text-sky-700 hover:underline">
              Ver todas
            </Link>
          </div>
          {recientes.length === 0 ? (
            <p className="text-sm text-slate-400">Aún no hay cotizaciones guardadas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recientes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/cotizar?id=${c.id}`} className="min-w-0 hover:underline">
                    <div className="truncate font-medium text-slate-800">
                      #{c.id} · {c.cliente || "Sin cliente"}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {c.vehiculo}
                      {esAdmin && c.usuarioNombre ? ` · ${c.usuarioNombre}` : ""}
                    </div>
                  </Link>
                  <span className="shrink-0 text-right text-xs text-slate-600">
                    {c.primaTotal != null ? formatMXN(c.primaTotal) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {vePolizas && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Próximas renovaciones</h2>
              <Link href="/polizas" className="text-xs font-medium text-sky-700 hover:underline">
                Ver pólizas
              </Link>
            </div>
            {renovaciones.length === 0 ? (
              <p className="text-sm text-slate-400">No hay renovaciones en los próximos 60 días.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {renovaciones.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">
                        {p.numeroPoliza} · {p.asegurado}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.aseguradora} · vence {p.vigenciaFin}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.estado === "POR_VENCER" ? "bg-orange-50 text-orange-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {p.diasParaVencer} d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
