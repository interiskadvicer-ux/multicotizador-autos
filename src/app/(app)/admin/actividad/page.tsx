import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import ActividadManager from "@/components/ActividadManager";

export default async function ActividadPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN"])) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Reporte de actividad
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Registro de acciones por usuario. Filtra y descarga en Excel.
        </p>
      </header>
      <ActividadManager />
    </main>
  );
}
