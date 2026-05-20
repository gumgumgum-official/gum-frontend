// Stage6 공항 안내방송 자막/싱크 설정

/** 공항 안내방송 자막 싱크 보정(초) */
export const STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC = 0.75;

/** 안내방송 종료 후 공중전화 벨 울림까지 대기(ms) */
export const STAGE6_TEL_ACTIVATE_DELAY_AFTER_ANNOUNCEMENT_MS = 8000;

/** 공항 안내방송 자막 큐 */
export const STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES = [
  {
    startSec: 1.7,
    endSec: 7.1,
    text: "잠시 후, 껌딱지 항공 GUM 2026편이\n여러분의 일상을 향해 이륙할 예정입니다.",
  },
  {
    startSec: 8.1,
    endSec: 13.6,
    text: "비행기로 이동하시기 전,\n공항 구석구석에 숨겨진 추억들을 마지막으로 한 번만 더 눈에 담아주세요.",
  },
  {
    startSec: 19.1,
    endSec: 22.6,
    text: "혹시 두고 가시는 소중한 마음은 없으신가요?",
  },
  {
    startSec: 23.6,
    endSec: 28.6,
    text: "포토 부스에서 찍은 '스티커 사진'은\n여러분의 가슴 속에 영원히 저장될 예정이니\n걱정 마세요!",
  },
  {
    startSec: 31.6,
    endSec: 37.1,
    text: "이곳에서의 기억이 여러분의 일상에\n말랑말랑한 껌딱지처럼 착! 달라붙어\n기분 좋은 힘이 되었으면 좋겠습니다.",
  },
];
