/**
 * ScoreState.js - localStorage(ggeomddjagi_records)를 통한 점수 및 TOP 3 관리
 * PRD: 파일 분리 원칙
 */
const STORAGE_KEY = "ggeomddjagi_records";

/**
 * @returns {{ name: string, score: number, date: string }[]}
 */
export function loadRecords() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {{ name: string, score: number, date: string }} record
 */
export function saveRecord(record) {
  const all = loadRecords();
  all.push(record);
  all.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 10)));
}

/**
 * @param {number} score
 * @returns {boolean}
 */
export function isNewRecord(score) {
  const records = loadRecords();
  if (records.length < 3) return true;
  return score > (records[2]?.score ?? 0);
}

/**
 * @returns {{ name: string, score: number, date: string }[]} TOP 3
 */
export function getTop3() {
  return loadRecords().slice(0, 3);
}
