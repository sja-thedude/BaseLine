import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The worker (wrangler dev on :8787) serves /api; Vite proxies to it in dev.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", sourcemap: false },
});
