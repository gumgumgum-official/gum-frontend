/**
 * 체험 완료 후 시작 화면으로 복귀할 때: 다음 이용자용으로 **게시판 투표(localStorage만)** 제거.
 * GLB 캐시·전체 localStorage 삭제는 하지 않아 재로딩 버벅임을 줄임.
 * (서버 상태는 `postMonitorComplete`로 이미 idle 처리)
 */

import { invalidateVoteBundleCache } from "../../lib/voteBundleCache.js";
import { clearGgumddiMyVotesFromLocalStorage } from "../../lib/voteApi.js";

/**
 * NOTE:
 * 현재는 동기 작업(투표 localStorage 키 제거)만 수행하지만,
 * 호출부(`await resetClientForNextKioskVisitor()`) 인터페이스 호환과
 * 향후 비동기 정리 작업 확장을 위해 `async`를 유지한다.
 *
 * @returns {Promise<void>}
 */
export async function resetClientForNextKioskVisitor() {
  try {
    invalidateVoteBundleCache();
    clearGgumddiMyVotesFromLocalStorage();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] ggumddi vote keys:", err);
  }
}
