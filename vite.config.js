import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Vercel 등 배포 시 루트 기준으로 asset/source 경로 해석
  // 서브경로 배포 시 Vercel에서 VITE_BASE_URL=/gum-frontend/ 등으로 설정
  base: process.env.VITE_BASE_URL || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three";
          }
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router")
          ) {
            return "react-vendor";
          }
        },
      },
    },
    // three.js 단일 청크가 minify 후 ~650KB 수준이므로 허용
    chunkSizeWarningLimit: 700,
  },
});
