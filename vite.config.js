import { defineConfig } from "vite";
export default defineConfig({
  server: {
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": {
        target: process.env.DEV_API_TARGET || "http://127.0.0.1:4000",
        changeOrigin: false,
      },
    },
  },
});
