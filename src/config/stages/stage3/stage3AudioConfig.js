/** Stage3 인트로·배경 루프 등 오디오 볼륨 */

export const STAGE3_AUDIO_CONFIG = {
  /** 인트로(새소리) 재생 볼륨 (0~1) */
  introVolume: 0.6,
  /** 인트로 종료 후 루프 배경음 페이드 인 목표 볼륨 (0~1) */
  backgroundAmbientVolume: 0.03,
  /** 글자 타격 크랙 효과음 볼륨 — 배경음의 90% */
  crackVolume: 0.027,
  /** 글자 최종 파열 효과음 볼륨 — 배경음의 90% */
  crackFinalVolume: 0.027,
  /** 꽃 피어나는 효과음 볼륨 — 배경음의 90% */
  flowerMagicVolume: 0.027,
};
