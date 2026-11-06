/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 es un módulo nativo; no debe empaquetarse por Next.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "pdfjs-dist"],
    // Sin caché de navegación para páginas dinámicas: el dashboard y los
    // listados deben reflejar pagos y emisiones recién registrados.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
