/**
 * 풍선 첫 획득 연출 — 캐릭터·팔로워가 살짝 떠올라 한 바퀴 빠르게 회전한다.
 * characterController와 gumFollowerController가 이 값을 공유해
 * 두 연출의 타이밍·동작이 어긋나지 않게 한다.
 */

/** 연출 지속 시간(초) */
export const BALLOON_CELEBRATION_DURATION = 0.7;

/** 공중에 떠오르는 최대 높이(월드 유닛) */
const FLOAT_HEIGHT = 0.5;

/**
 * 기본 변환 위에 더해줄 떠오름·회전 오프셋.
 * @param {number} progress 0(시작)~1(끝)
 * @returns {{ floatY: number, spin: number }}
 */
export function getBalloonCelebrationOffsets(progress) {
  const p = Math.min(1, Math.max(0, progress));
  // 0 → 위 → 0 으로 이어지는 부드러운 상승·하강 아치
  const floatY = Math.sin(p * Math.PI) * FLOAT_HEIGHT;
  // easeInOutQuad 로 가속·감속하며 정확히 한 바퀴(2π) 회전
  const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const spin = eased * Math.PI * 2;
  return { floatY, spin };
}
