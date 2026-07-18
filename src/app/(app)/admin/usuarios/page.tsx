import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import UsuariosManager from "@/components/UsuariosManager";

export default async function UsuariosPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN"])) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-1 text-sm text-slate-600">
          Da de alta usuarios, asigna roles y controla el acceso.
        </p>
      </header>
      <UsuariosManager />
    </main>
  );
}
