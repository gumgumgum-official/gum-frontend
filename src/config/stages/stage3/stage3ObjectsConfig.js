/** Stage3 오브제/배경: 씬 지오메트리는 island2.glb 단일 모델만 사용 */

export const STAGE3_OBJECTS_CONFIG = {
  model: {
    path: "/models/stage3/island2.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
    /**
     * island 바운딩 min~max 보간으로 1차 후보 Y를 구한 뒤, `max - groundYInsetFromIslandTop`과
     * 둘 중 더 높은 값을 씀(절벽/물 아래 min 때문에 보간값만 쓰면 발이 지면보다 낮아짐).
     */
    groundYLerpFromIslandMinMax: 0.97,
    /** island 바운딩 max.y에서 빼는 값(m). 나무 꼭대기가 max면 조금 키워서 미세 조정 */
    groundYInsetFromIslandTop: 0.35,
  },

  /**
   * 아이스크림 클릭 스폰(캐논) 설정.
   * GLB 내 `INT_icecream` 루트(및 하위 메시)를 클릭하면 동작; 스폰 템플릿은 추후 연결.
   */
  icecreamCart: {
    spawnScale: 0.4,
    maxSpawns: 10,
    physicsSubsteps: 2,
  },

  /** 게시판 모달 사운드 (`INT_notice`와 함께 사용) */
  notice: {
    paperSoundPaths: [
      "/static/sounds/paper/PaperMovement_fNAyV_01-2.mp3",
      "/static/sounds/paper/PaperMovement_fNAyV_01-3.mp3",
    ],
  },

  /**
   * 포탈 논리 평면(스테이지 전환).
   * `position`은 월드 XZ 기준 포탈 중심 — island 배치에 맞게 조정.
   */
  portal_bright: {
    position: { x: -3, y: -0.3, z: 12 },
    normal: { x: 0, z: 1 },
    halfWidth: 2,
    targetStage: 6,
  },
};
