#!/usr/bin/env node
/**
 * GLB 일괄 최적화 스크립트
 *
 * 파이프라인 (텍스처 → KTX2, 지오메트리 → Meshopt):
 *   1. resize   : 텍스처 최대 1024x1024
 *   2. etc1s    : 모든 텍스처 KTX2(ETC1S) 압축 — 용량/VRAM 최소화
 *   3. meshopt  : 지오메트리 Meshopt 압축 (애니메이션/skinned mesh 안전)
 *   4. dedup    : 중복 accessor/texture 제거
 *
 * 사용: node scripts/optimize-glb.mjs [--file <path>] [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { readdir, stat, unlink, rename, copyFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = "public/models";
const MAX_TEXTURE = 1024;
const MESHOPT_LEVEL = "medium";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SINGLE_FILE = (() => {
  const i = args.indexOf("--file");
  return i >= 0 ? args[i + 1] : null;
})();

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".glb")) out.push(p);
  }
  return out;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    const err = r.stderr?.toString() || r.stdout?.toString() || "";
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${r.status}):\n${err}`,
    );
  }
  return r.stdout?.toString() || "";
}

function fmt(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function optimizeOne(file) {
  const before = (await stat(file)).size;
  const tmp1 = `${file}.tmp1.glb`;
  const tmp2 = `${file}.tmp2.glb`;
  const tmp3 = `${file}.tmp3.glb`;
  const finalTmp = `${file}.new.glb`;

  try {
    // 1. resize textures → 1024 max
    run("npx", [
      "@gltf-transform/cli",
      "resize",
      file,
      tmp1,
      "--width",
      String(MAX_TEXTURE),
      "--height",
      String(MAX_TEXTURE),
    ]);

    // 2. KTX2(ETC1S) — 모든 텍스처 압축
    run("npx", ["@gltf-transform/cli", "etc1s", tmp1, tmp2]);

    // 3. Meshopt 지오메트리 압축 (애니메이션 안전)
    run("npx", [
      "@gltf-transform/cli",
      "meshopt",
      tmp2,
      tmp3,
      "--level",
      MESHOPT_LEVEL,
    ]);

    // 4. dedup — 중복 제거 (prune은 skinned mesh 의존 데이터 지울 수 있어 제외)
    run("npx", ["@gltf-transform/cli", "dedup", tmp3, finalTmp]);

    // 원자적 교체
    if (!DRY_RUN) {
      await rename(finalTmp, file);
    }

    const after = (await stat(DRY_RUN ? finalTmp : file)).size;
    if (DRY_RUN) await unlink(finalTmp).catch(() => {});

    return { before, after };
  } finally {
    // tmp 정리
    for (const t of [tmp1, tmp2, tmp3]) {
      await unlink(t).catch(() => {});
    }
  }
}

async function main() {
  const files = SINGLE_FILE ? [SINGLE_FILE] : await walk(ROOT);
  console.log(
    `\n🎯 ${files.length} GLB 파일 최적화 시작${DRY_RUN ? " (DRY RUN)" : ""}`,
  );
  console.log(
    `   texture: ${MAX_TEXTURE}px max, ETC1S · geometry: Meshopt ${MESHOPT_LEVEL}\n`,
  );

  let totalBefore = 0;
  let totalAfter = 0;
  const failed = [];

  for (const file of files) {
    const rel = relative(".", file);
    process.stdout.write(`→ ${rel} ... `);
    try {
      const { before, after } = await optimizeOne(file);
      totalBefore += before;
      totalAfter += after;
      const pct = ((1 - after / before) * 100).toFixed(0);
      console.log(`${fmt(before)} → ${fmt(after)}  (-${pct}%)`);
    } catch (err) {
      console.log(`❌`);
      console.error(`   ${err.message.split("\n")[0]}`);
      failed.push({ file: rel, error: err.message });
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `합계: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (-${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`,
  );
  if (failed.length) {
    console.log(`\n⚠️  ${failed.length}개 실패:`);
    failed.forEach((f) => console.log(`   ${f.file}: ${f.error.split("\n")[0]}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
