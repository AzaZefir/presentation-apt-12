import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" важно, чтобы build работал при открытии dist/index.html как файла
export default defineConfig({
  base: "presentation-apt-12",
  plugins: [react()],
});
