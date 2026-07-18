import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// Layout de las páginas autenticadas: valida sesión y monta la navegación.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  return (
    <div className="min-h-screen">
      <NavBar sesion={sesion} />
      {children}
    </div>
  );
}
