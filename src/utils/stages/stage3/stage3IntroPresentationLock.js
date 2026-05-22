/**
 * Stage3 진입 연출 잠금 — 상공 카메라 인트로·진입 자막·포스터 확대/축소 애니메이션 구간
 */

/**
 * @param {{
 *   getCameraIntroState: () => { active: boolean, completed: boolean },
 *   isStampIntroAnimating: () => boolean,
 *   isInteractionLocked: () => boolean,
 * }} deps
 */
export function isStage3IntroPresentationLocked({
  getCameraIntroState,
  isStampIntroAnimating,
  isInteractionLocked,
}) {
  const cameraIntro = getCameraIntroState();
  // 미시작 상태(active=false, completed=false)도 잠금
  if (cameraIntro.active || !cameraIntro.completed) return true;
  if (isStampIntroAnimating()) return true;
  if (isInteractionLocked()) return true;
  return false;
}
