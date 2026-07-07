import type { NextConfig } from "next";
import path from "path";

// Denne konfiguration er tilpasset det delte Nordicway-webhotel:
// - "typescript.ignoreBuildErrors" og "eslint.ignoreDuringBuilds": kontoen
//   har et lavt loft for antal samtidige processer/tråde (LVE-begrænsning),
//   og type-/lint-tjek under build kunne i sig selv udløse det.
// - "experimental.cpus: 1" + "workerThreads: false": begrænser hvor mange
//   parallelle build-workers Next selv starter.
// - webpack: fjerner minificering (den indbyggede Rust-minifier initialiserer
//   en trådpulje ud fra antal CPU-kerner, hvilket gentagne gange har ramt
//   kontoens trådloft, selv med ovenstående indstillinger) og sikrer at
//   "@/..."-alias'et virker uafhængigt af hvordan node_modules er symlinket
//   ind i webpack's opløsning på denne server.
const nextConfig: NextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: 1,
    // true (in-process worker threads) i stedet for false: med false forsøger
    // Next at forke separate OS-processer til statisk sidegenerering, hvilket
    // gentagne gange ramte kontoens proces-/trådloft (LVE) med et stille
    // "SIGABRT" som eneste symptom. Worker-tråde deler processen med den
    // forælder-proces der allerede kører, og undgår dermed problemet.
    workerThreads: true,
  },
  webpack: (config) => {
    config.resolve.symlinks = false;
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname),
    };
    config.optimization.minimize = false;
    return config;
  },
};

export default nextConfig;
