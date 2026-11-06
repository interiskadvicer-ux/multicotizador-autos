/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 es un módulo nativo; no debe empaquetarse por Next.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "pdfjs-dist"],
  },
};

export default nextConfig;
