/** Stage3 낙하 글자·타격·파편·꽃 상수 */

/** SVG 종류와 무관한 기본 목표 높이 — config.letterTargetHeight가 우선 */
export const STAGE3_LETTER_TARGET_HEIGHT = 3.24;
/** 착지면(landingY) 위로 띄우는 높이 */
export const STAGE3_SPAWN_HEIGHT = 8;
/** 글자 밑면을 지면 위로 살짝 띄우는 offset */
export const STAGE3_LETTER_LANDING_LIFT = 0.3;
export const STAGE3_GRAVITY = -35;
export const STAGE3_INITIAL_VY = -12;
export const LETTER_BOUNCE_RESTITUTION = 0.4;
export const HITS_TO_DESTROY = 12;
/** 본격 shatter 이전 표면 금 타격 횟수 */
export const CRACK_HITS_BEFORE_SHATTER = 11;
export const FINAL_SHATTER_PIECE_COUNT = 32;
/** 꽃 간 최소 거리(m) — 이보다 가까우면 스폰 생략 */
export const FLOWER_MIN_DISTANCE = 1.1;
/** fragment 재타격 시 잘려 나가는 로컬 x 구간 비율 */
export const FRACTION_PER_HIT = 0.45;
export const HIT_RANGE = 20;
export const FRAGMENT_GRAVITY_MUL = 2.8;
export const FRAGMENT_BOUNCE_RESTITUTION = 0.35;
export const FRAGMENT_GROUND_FRICTION = 0.82;
export const FRAGMENT_BURST_IMPULSE_MUL = 1.55;
export const FRAGMENT_FADE_START = 0.8;
export const FRAGMENT_FADE_END = 2.0;
export const FLOWER_BLOOM_DURATION = 3;
export const FLOWER_SCALE = 2;
export const FLOWER_Y_OFFSET = 0.15;
export const FRAGMENT_POOL_MAX = 32;
