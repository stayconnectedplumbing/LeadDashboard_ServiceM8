import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  preview: {
    host: "0.0.0.0",
    allowedHosts: ["leaddashboard-production-adcb.up.railway.app", "*.up.railway.app", "localhost"]
  }
});
