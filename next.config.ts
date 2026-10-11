import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Les migrations SQL sont lues à l'exécution (PGlite) : on les embarque dans le bundle serveur.
  outputFileTracingIncludes: { "/**": ["./supabase/migrations/*.sql"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
