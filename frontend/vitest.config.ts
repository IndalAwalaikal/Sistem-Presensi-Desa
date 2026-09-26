import path from "node:path";
import { defineConfig } from "vitest/config";

/** Alias "@/..." agar test bisa mengimpor modul inti seperti di aplikasi. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
