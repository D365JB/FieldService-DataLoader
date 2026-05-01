import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    // Sourcemaps are cheap and let production-only TDZ/closure bugs be
    // diagnosed straight from the browser console without re-running locally.
    sourcemap: true,
    // Split heavy, rarely-changing libraries into their own chunks so the
    // index chunk shrinks and updates ship without re-downloading vendor code.
    // v1.41.5 measured before split: 936kB / 258kB gzip single chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          msal: ["@azure/msal-browser"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      // SWA Functions live at /api in production; proxy to Functions runtime in dev.
      "/api": "http://localhost:7071",
    },
  },
});
