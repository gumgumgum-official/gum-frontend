/**
 * WeedSpawner.js - 일반/황금 잡초 랜덤 스폰 로직
 * PRD: 파일 분리 원칙
 */
const MAX_WEEDS = 7;
const GOLDEN_CHANCE = 0.15;

/**
 * @param {{ id: number, x: number, y: number, golden: boolean }[]} existingWeeds
 * @param {number} nextId
 * @returns {{ id: number, x: number, y: number, golden: boolean } | null}
 */
export function spawn(existingWeeds, nextId) {
  if (!existingWeeds || existingWeeds.length >= MAX_WEEDS) return null;
  const golden = Math.random() < GOLDEN_CHANCE;
  const x = 8 + Math.random() * 84;
  const y = 15 + Math.random() * 72;
  return { id: nextId, x, y, golden };
}

/**
 * @param {number} count
 * @param {number} startId
 * @returns {{ id: number, x: number, y: number, golden: boolean }[]}
 */
export function spawnInitial(count, startId) {
  const weeds = [];
  for (let i = 0; i < count; i++) {
    const w = spawn(weeds, startId + i);
    if (w) weeds.push(w);
  }
  return weeds;
}

export { MAX_WEEDS, GOLDEN_CHANCE };
