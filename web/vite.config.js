import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" важно, чтобы build работал при открытии dist/index.html как файла
export default defineConfig({
  base: "/apt-presentation/",
  plugins: [react()],
  build: {
    outDir: "docs", // 🔥 ВАЖНО
  },
});
