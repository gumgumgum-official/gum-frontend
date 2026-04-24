/**
 * public/ 이하 .glb 파일을 크기순으로 나열.
 * `npm run gltf:glb-sizes` — 용량 점검·gltf-transform/draco/meshopt 파이프라인 우선순위 파악용
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "..", "public");

/** @param {string} dir @returns {string[]} */
function walkGlbFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkGlbFiles(full));
    } else if (st.isFile() && name.toLowerCase().endsWith(".glb")) {
      out.push(full);
    }
  }
  return out;
}

const files = walkGlbFiles(publicRoot);
const rows = files.map((abs) => ({
  rel: path.relative(path.join(__dirname, ".."), abs).replaceAll("\\", "/"),
  size: fs.statSync(abs).size,
}));
rows.sort((a, b) => b.size - a.size);
const total = rows.reduce((s, r) => s + r.size, 0);
console.log(
  "GLB under public/ (largest first). total files:",
  rows.length,
  "total bytes:",
  total,
  `(${ (total / (1024 * 1024)).toFixed(2) } MB)\n`,
);
for (const { rel, size } of rows) {
  const mb = (size / (1024 * 1024)).toFixed(2);
  console.log(String(size).padStart(12), "bytes", `(${mb} MB)`, rel);
}
