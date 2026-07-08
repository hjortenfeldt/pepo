import type { NextConfig } from "next";

// Simpel Vercel-konfiguration. De tidligere indstillinger her (begrænset
// CPU/worker-threads, deaktiveret minificering, custom webpack-alias) var
// workarounds for Nordicways delte webhotel (LVE proces-/trådloft) og er
// ikke nødvendige på Vercel, som bygger i isolerede, fuldt dimensionerede
// containere. "ignoreBuildErrors" beholdes som sikkerhedsnet, så et build
// ikke fejler uventet på type-fejl vi endnu ikke har ryddet op i.
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
