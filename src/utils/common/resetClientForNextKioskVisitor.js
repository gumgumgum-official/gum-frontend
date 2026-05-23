/**
 * 체험 완료 후 다음 이용자용 **게시판 투표(localStorage만)** 제거.
 * Stage3 세션·React 오버레이 리셋은 호출부에서 별도 처리
 * (`dispatchKioskSoftRestartUiCleanup`, StartPage `?complete=1` 등).
 * GLB Map 캐시·전체 localStorage 삭제는 하지 않고, 웜업 Promise만 초기화해
 * 다음 루프에서 idle·critical 선로드를 다시 스케줄한다.
 */

import { invalidateVoteBundleCache } from "../../lib/voteBundleCache.js";
import { clearGgumddiMyVotesFromLocalStorage } from "../../lib/voteApi.js";
import { resetKioskExhibitionWarmupState } from "./kioskExhibitionWarmup.js";
import { resetStage6AudioUnlock } from "../stages/stage6/stage6AudioUnlock.js";

/**
 * NOTE:
 * 현재는 동기 작업(투표 localStorage 키 제거)만 수행하지만,
 * 호출부(`await resetClientForNextKioskVisitor()`) 인터페이스 호환과
 * 향후 비동기 정리 작업 확장을 위해 `async`를 유지한다.
 *
 * @returns {Promise<void>}
 */
export async function resetClientForNextKioskVisitor() {
  resetStage6AudioUnlock();
  resetKioskExhibitionWarmupState();
  try {
    invalidateVoteBundleCache();
    clearGgumddiMyVotesFromLocalStorage();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] ggumddi vote keys:", err);
  }
}
