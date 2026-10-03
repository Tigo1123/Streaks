import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyStaticAssets() {
  return {
    name: "copy-static-assets",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      if (!fs.existsSync(distDir)) return;

      const swSrc = path.resolve(__dirname, "sw.js");
      const manifestSrc = path.resolve(__dirname, "manifest.webmanifest");
      const iconsSrc = path.resolve(__dirname, "icons");

      if (fs.existsSync(swSrc)) {
        fs.copyFileSync(swSrc, path.join(distDir, "sw.js"));
      }
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, path.join(distDir, "manifest.webmanifest"));
      }
      if (fs.existsSync(iconsSrc)) {
        fs.cpSync(iconsSrc, path.join(distDir, "icons"), { recursive: true });
        const assetsIcons = path.join(distDir, "assets", "icons");
        fs.cpSync(iconsSrc, assetsIcons, { recursive: true });
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyStaticAssets()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});

