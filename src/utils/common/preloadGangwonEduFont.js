/** 강원교육현옥샘체 — index.html CDN dynamic subset용 사전 로드 */

const FONT_FAMILY = '"GangwonEdu Hyeonok"';

/** @type {Map<string, Promise<void>>} */
const preloadBySample = new Map();

/**
 * CDN dynamic subset: 표시 전에 쓸 글자를 넘기면 해당 글리프를 미리 받는다.
 * @param {string} text
 * @param {number} [fontSizePx=22]
 * @returns {Promise<void>}
 */
export function preloadGangwonEduHyeonokForText(text, fontSizePx = 22) {
  const sample = String(text ?? "");
  if (!sample) return Promise.resolve();

  const key = `${fontSizePx}:${sample}`;
  const cached = preloadBySample.get(key);
  if (cached) return cached;

  const fontSpec = `${fontSizePx}px ${FONT_FAMILY}`;
  const promise = Promise.allSettled([
    document.fonts.ready,
    document.fonts.load(fontSpec, sample),
    document.fonts.load(`400 ${fontSpec}`, sample),
  ]).then(() => {});

  preloadBySample.set(key, promise);
  return promise;
}

/**
 * @param {{ label?: string, messages?: { text?: string }[] }} cfg
 * @returns {Promise<void>}
 */
export function preloadTentSceneSubtitleFonts(cfg) {
  const label = cfg.label ?? "";
  const messageText = (cfg.messages ?? []).map((m) => m?.text ?? "").join("");
  const sample = [...new Set(`${label}${messageText}✦`)].join("");
  return preloadGangwonEduHyeonokForText(sample, 22);
}
