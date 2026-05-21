/**
 * guestbook PNG/SVG(래스터) → WebP, DungGeunMo.woff → woff2 (재생성용)
 * Run: node scripts/convert-guestbook-assets.mjs
 * Requires: npm install sharp && pip install fonttools brotli
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

const PNG_TARGETS = [
  "assets/guestbook/guestbook_bg.png",
  "assets/guestbook/profile_photo_bg.png",
  "assets/guestbook/profile_character.png",
  "assets/guestbook/guestbook_ribbon.png",
  "assets/guestbook/profile_card_icons.png",
];

/** Figma base64 PNG 래퍼 SVG — 31×31 표시용 2x WebP */
const CLOVER_SVG = "assets/guestbook/clover.svg";
const CLOVER_WEBP = "assets/guestbook/clover.webp";
const CLOVER_DISPLAY_PX = 31;

const WEBP_OPTS = { quality: 85, effort: 6 };

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function pngToWebp(rel) {
  const src = path.join(publicDir, rel);
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${rel}`);
    return;
  }
  const dest = src.replace(/\.png$/i, ".webp");
  const before = fs.statSync(src).size;
  await sharp(src).webp(WEBP_OPTS).toFile(dest);
  const after = fs.statSync(dest).size;
  const pct = (((before - after) / before) * 100).toFixed(1);
  console.log(`${rel} → ${path.basename(dest)}: ${fmtKb(before)} → ${fmtKb(after)} (-${pct}%)`);
}

async function cloverSvgToWebp() {
  const src = path.join(publicDir, CLOVER_SVG);
  const dest = path.join(publicDir, CLOVER_WEBP);
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${CLOVER_SVG}`);
    return;
  }
  const size = CLOVER_DISPLAY_PX * 2;
  const before = fs.statSync(src).size;
  await sharp(src).resize(size, size).webp({ quality: 90, effort: 6 }).toFile(dest);
  const after = fs.statSync(dest).size;
  const pct = (((before - after) / before) * 100).toFixed(1);
  console.log(
    `${CLOVER_SVG} → ${path.basename(dest)} (${size}×${size}): ${fmtKb(before)} → ${fmtKb(after)} (-${pct}%)`,
  );
}

function woffToWoff2() {
  const src = path.join(publicDir, "fonts/DungGeunMo.woff");
  const dest = path.join(publicDir, "fonts/DungGeunMo.woff2");
  if (!fs.existsSync(src)) {
    console.warn("skip (missing): fonts/DungGeunMo.woff");
    return;
  }
  const py = `from fontTools.ttLib import TTFont; import os; p=r'${src.replace(/\\/g, "/")}'; o=r'${dest.replace(/\\/g, "/")}'; f=TTFont(p); f.flavor='woff2'; f.save(o); print(os.path.getsize(p), os.path.getsize(o))`;
  const out = execSync(`py -c "${py}"`, { encoding: "utf8" }).trim();
  const [before, after] = out.split(/\s+/).map(Number);
  const pct = (((before - after) / before) * 100).toFixed(1);
  console.log(
    `fonts/DungGeunMo.woff → DungGeunMo.woff2: ${fmtKb(before)} → ${fmtKb(after)} (-${pct}%)`,
  );
}

for (const rel of PNG_TARGETS) {
  await pngToWebp(rel);
}
await cloverSvgToWebp();
woffToWoff2();
