import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 서브패스 배포 시 마지막 `/` 포함 (VITE_BASE_URL 누락 보정) */
function viteBaseFromEnv() {
  const raw = process.env.VITE_BASE_URL?.trim();
  if (!raw || raw === "/") return "/";
  const leadsWithSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return leadsWithSlash.endsWith("/") ? leadsWithSlash : `${leadsWithSlash}/`;
}

export default defineConfig({
  // Vercel 등 배포 시 루트 기준으로 asset/source 경로 해석
  // 서브경로 배포 시 Vercel에서 VITE_BASE_URL=/gum-frontend/ 등으로 설정
  base: viteBaseFromEnv(),
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
