#!/usr/bin/env node
/**
 * GLB 일괄 최적화 스크립트
 *
 * 파이프라인 (순서 중요):
 *   1. resize : 텍스처 최대 1024x1024 (Draco가 있으면 여기서 디코드됨)
 *   2. etc1s  : 모든 텍스처 KTX2(ETC1S) 압축 — 용량/VRAM 최소화
 *   3. draco  : 지오메트리 Draco 재압축 (반드시 마지막)
 *
 * 주의: `dedup`/`prune` 은 Draco 뒤에 두면 디코드해버려 파일이 팽창한다.
 * 앞에 두더라도 어떤 모델에서는 draco 재인코드 효율을 떨어뜨려 일단 제외.
 *
 * 사용: node scripts/optimize-glb.mjs [--file <path>] [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { readdir, stat, unlink, rename } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = "public/models";
const MAX_TEXTURE = 1024;

// gltf-transform etc1s/uastc 커맨드는 PATH의 `ktx` 바이너리를 사용한다.
// 로컬 벤더된 KTX-Software를 우선 사용하도록 PATH를 prepend.
const VENDOR_KTX_BIN = resolve(
  fileURLToPath(new URL("./vendor/ktx/bin", import.meta.url)),
);
const CHILD_ENV = {
  ...process.env,
  PATH: `${VENDOR_KTX_BIN}:${process.env.PATH || ""}`,
};

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
  const r = spawnSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: CHILD_ENV,
  });
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

    // 3. Draco 지오메트리 (재)압축 — 반드시 마지막.
    run("npx", ["@gltf-transform/cli", "draco", tmp2, finalTmp]);

    if (!DRY_RUN) {
      await rename(finalTmp, file);
    }

    const after = (await stat(DRY_RUN ? finalTmp : file)).size;
    if (DRY_RUN) await unlink(finalTmp).catch(() => {});

    return { before, after };
  } finally {
    for (const t of [tmp1, tmp2]) {
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
    `   texture: ${MAX_TEXTURE}px max ETC1S (KTX2) · geometry: Draco\n`,
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
