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
  },
  server: {
    port: 5173,
    proxy: {
      // SWA Functions live at /api in production; proxy to Functions runtime in dev.
      "/api": "http://localhost:7071",
    },
  },
});
