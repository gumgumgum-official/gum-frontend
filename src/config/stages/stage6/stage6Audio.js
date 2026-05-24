import { applyExtendedAudioVolume } from "../../../utils/common/audioGain.js";

/** Stage6 전체 효과음·음성 배율 (기존 baseVolume × 배율) */
export const STAGE6_AUDIO_VOLUME_MULTIPLIER = 3;

/**
 * @param {number} baseVolume 설계 기준 볼륨(0~1+)
 * @returns {number}
 */
export function stage6ScaledVolume(baseVolume) {
  const v = Number(baseVolume);
  if (!Number.isFinite(v)) return STAGE6_AUDIO_VOLUME_MULTIPLIER;
  return Math.max(0, v * STAGE6_AUDIO_VOLUME_MULTIPLIER);
}

/**
 * @param {HTMLAudioElement} audio
 * @param {number} baseVolume 설계 기준 볼륨(0~1+)
 */
export function applyStage6AudioVolume(audio, baseVolume) {
  applyExtendedAudioVolume(audio, stage6ScaledVolume(baseVolume));
}
