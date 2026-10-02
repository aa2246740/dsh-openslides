import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The hoisted react copy lives under apps/web/node_modules (oauth's
      // optional react ^18 peer claimed the root). Point the rollup resolver at
      // the real 19.3.0 tree so lucide-react can see it.
      react: path.dirname(require.resolve("react/package.json", { paths: [__dirname] })),
      "react-dom": path.dirname(require.resolve("react-dom/package.json", { paths: [__dirname] })),
      "@open-slidestudio/pptd": path.resolve(__dirname, "../../packages/pptd/src"),
      "@open-slidestudio/agent-core": path.resolve(__dirname, "../../packages/agent-core/src"),
      "@open-slidestudio/exporter-pptx": path.resolve(__dirname, "../../packages/exporter-pptx/src"),
      "@open-slidestudio/design-brain": path.resolve(__dirname, "../../packages/design-brain/src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
