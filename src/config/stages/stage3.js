// Phase 3: 부셔버리자
/// <reference path="../../types.js" />

import { STAGE3_CHARACTER_CONFIG } from "./stage3/stage3CharacterConfig.js";
import { STAGE3_OBJECTS_CONFIG } from "./stage3/stage3ObjectsConfig.js";
import { STAGE3_AUDIO_CONFIG } from "./stage3/stage3AudioConfig.js";

/** @type {import("../../types.js").Stage3Config} */
export const STAGE3_CONFIG = {
  camera: {
    fov: 42.0,
    near: 0.1,
    far: 1000,
    // Stage3: 글자를 조금 더 위에서 내려다보는 느낌으로 카메라 상승
    position: { x: -0.4, y: 9.0, z: 19.5 },
    lookAt: { x: 0.0, y: 1.0, z: 0.0 },
  },
  background: {
    // 위는 연한 라벤더·핑크 하늘, 중간만 살짝 피치(노을), 아래로 로즈/라벤더
    gradient: {
      stops: [
        { t: 0, color: 0xe8d4f0 },
        { t: 0.12, color: 0xf0c8b8 },
        { t: 0.48, color: 0xf0c8b8 },
        { t: 0.74, color: 0xe8b0c8 },
        { t: 1, color: 0xdcc8e8 },
      ],
    },
  },
  audio: STAGE3_AUDIO_CONFIG,
  ...STAGE3_CHARACTER_CONFIG,
  ...STAGE3_OBJECTS_CONFIG,
};
