import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import CotizacionesLista from "@/components/CotizacionesLista";

export default async function CotizacionesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const esAdmin = sesion.rol === "ADMIN";
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {esAdmin ? "Cotizaciones" : "Mis cotizaciones"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cotizaciones guardadas y solicitudes de emisión
          {esAdmin ? " de todos los usuarios y agentes." : "."}
        </p>
      </header>
      <CotizacionesLista esAdmin={esAdmin} />
    </main>
  );
}
