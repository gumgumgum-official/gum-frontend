/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * - 최신 handwriting 1개가 2배 크기로 낙하
 * - 엔터키로 타격 시 큰 조각이 깔끔하게 부서짐, 4번 치면 사라짐. 조각은 3초 후 페이드아웃
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { createKeyboardInput } from "../utils/common/keyboardInput.js";
import { loadStage3Background } from "../utils/stages/stage3/backgroundLoader.js";
import { createCharacterController } from "../utils/stages/stage3/characterController.js";
import { createGumFollowersController } from "../utils/stages/stage3/gumFollowerController.js";
import { loadSVGShapes, expandShapesStroke } from "../lib/svg-loader.js";
import * as CANNON from "cannon-es";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";
import {
  openMinigame,
  closeMinigame,
  dispatchMinigameClose,
  onMinigameClose,
} from "../utils/stages/stage3/minigameLauncher.js";
import {
  openMirrorModal,
  dispatchMirrorModalClose,
} from "../utils/stages/stage3/mirrorModalLauncher.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files";

/** Stage2 대비 4배 크기 (글자 일부도 크게 보이도록) */
const STAGE3_LETTER_SCALE = 0.006 * 0.75 * 4;
const STAGE3_SPAWN_HEIGHT = 5;
// 운석처럼 빠르게 떨어지는 느낌을 위해 중력/초기 속도 강화
const STAGE3_GRAVITY = -35;
const STAGE3_INITIAL_VY = -12;
const LETTER_BOUNCE_RESTITUTION = 0.4;
const HITS_TO_DESTROY = 4;
/** 한 번 타격 시 잘려 나가는 비율 (1/4 → 큰 조각이 깔끔하게 떨어짐) */
const FRACTION_PER_HIT = 1 / 4;
const HIT_RANGE = 6; // ilbuni로부터 이 거리 이내만 타격 가능
const FRAGMENT_GRAVITY_MUL = 2.8; // 조각은 중력 더 강하게
const FRAGMENT_BOUNCE_RESTITUTION = 0.35;
const FRAGMENT_GROUND_FRICTION = 0.82;
const FRAGMENT_FADE_START = 3; // 땅에 떨어진 뒤 3초 뒤부터
const FRAGMENT_FADE_END = 5;

export function Stage3() {
  /** @type {import("../types.js").Stage3Config} */
  const config = STAGE3_CONFIG;
  const glbLoader = getGLBLoader();
  const objects = [];
  let debugControls = null;
  let sceneRef = null;
  let cameraRef = null;
  let canvasRef = null;
  /** 배경 로드 시 저장. 0키로 재낙하 시 사용 */
  let stage3GroundY = 0;
  let backgroundModel = null;
  /** 스테이지 전환 시 비동기 로드 완료 후 scene.add 방지용 */
  let isStage3Active = true;

  // 낙하 글자 1개 (최신 것만)
  let letterState = null;
  let letterLoadInProgress = false;
  const fragments = [];
  /** Fragment 풀: { group, velocity, angularVelocity } 재사용 (GC 감소) */
  const fragmentPool = [];
  const FRAGMENT_POOL_MAX = 32;

  // island2.glb 내 INT_icecream 루트 (클릭 → 스폰, cannon-es)
  let iceCreamCartRef = null;
  /** island2.glb 내 INT_gameMachine 루트 */
  let gameMachineRef = null;
  let unlistenMinigameClose = null;
  let noticeModalEl = null;
  let noticePaperAudio = null;
  const iceCreamTemplates = []; // [{ scene }, { scene }]
  const spawnedIceCreams = []; // { group, body }
  let iceCreamPhysicsWorld = null;
  let iceCreamGroundBody = null;
  const _icePointer = new THREE.Vector2();
  const _iceRaycaster = new THREE.Raycaster();
  const INT_PREFIX = "INT_";
  const INT_SUFFIX_TO_TARGET = {
    notice: "notice",
    gameMachine: "gameMachine",
    mirror: "mirror",
    icecream: "icecream",
    portal: "portal",
  };
  /** island2.glb 안 INT_* 서브트리의 Mesh만 (레이캐스트) */
  const intRaycastMeshes = [];

  const keyboard = createKeyboardInput([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);
  let character = null;
  let gumFollowers = null;
  /** 껌딱지 init(GLB await) 도중 cleanup 시 scene.add 방지용 */
  let gumCancelled = false;
  /**
   * 카메라 인트로 상태
   * - stage 시작 시 섬 전체를 위에서 시계방향으로 천천히(부분 호) 보여준 뒤
   * - 캐릭터 기준 카메라 포즈로 줌인 전환 후 추적 모드로 넘어간다.
   */
  const cameraIntro = {
    active: false,
    transitioning: false,
    completed: false,
    elapsed: 0,
    transitionElapsed: 0,
    /** 인트로 회전 구간 길이 — 클수록 같은 sweep 각에서 더 천천히 회전 */
    durationSec: 9,
    transitionSec: 2.0,
    /** 시계방향으로 도는 각(rad). */
    sweepAngleRad: Math.PI * 0.78,
    center: new THREE.Vector3(),
    radius: 20,
    height: 18,
    startAngle: 0,
    lookAtY: 0,
    fromPos: new THREE.Vector3(),
    fromLookAt: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toLookAt: new THREE.Vector3(),
  };
  const _introTargetPos = new THREE.Vector3();
  const _introTargetLookAt = new THREE.Vector3();
  const _introLerpLookAt = new THREE.Vector3();

  /** 포탈 평면 통과 감지: { px, pz, nx, nz, halfWidth, targetStage } */
  let portalPlaneConfig = null;
  let prevPortalSignedDist = null;

  function getCharacterFollowPose(outPos, outLookAt) {
    if (!character) return false;
    const pos = character.getPosition?.();
    if (!pos) return false;
    const camOffset = config.character?.cameraOffset ?? { x: 0, y: 3, z: 8 };
    const lookAtHeight = config.character?.lookAtHeightOffset ?? 1;
    outPos.set(pos.x + camOffset.x, pos.y + camOffset.y, pos.z + camOffset.z);
    outLookAt.copy(pos);
    outLookAt.y += lookAtHeight;
    return true;
  }

  function startCameraIntro(center, bounds) {
    if (!cameraRef) return;
    cameraIntro.active = true;
    cameraIntro.transitioning = false;
    cameraIntro.completed = false;
    cameraIntro.elapsed = 0;
    cameraIntro.transitionElapsed = 0;
    cameraIntro.center.copy(center);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const horizontalSize = Math.max(size.x, size.z);
    // 수평 반경을 살짝 줄여 더 “정수리에 가깝게”
    cameraIntro.radius = Math.max(13, horizontalSize * 0.76);
    // 더 높은 위치 + 시선은 바운딩 중심보다 약간 아래(섬 윗면 쪽)로 두어 내려다보기 강화
    cameraIntro.height = center.y + Math.max(60, size.y * 1.2 + 16);
    const minY = bounds.min.y;
    const maxY = bounds.max.y;
    const targetLookY = center.y - Math.min(size.y * 0.14, 4);
    cameraIntro.lookAtY = THREE.MathUtils.clamp(
      targetLookY,
      minY + size.y * 0.05,
      maxY - 0.3,
    );
    // 궤도 각: x = center.x + sin(θ)*r, z = center.z + cos(θ)*r, 시간에 따라 θ 감소 = 시계방향 스윕
    // 시작점을 시계 반대 방향으로 약 60° 옮김 → θ에 π/3 더하기
    const baseAngle = Math.atan2(
      cameraRef.position.x - center.x,
      cameraRef.position.z - center.z,
    );
    cameraIntro.startAngle = baseAngle + Math.PI / 2;

    const orbit = debugControls?.getOrbitControls?.();
    if (orbit) orbit.enabled = false;
  }

  function updateCameraIntro(delta) {
    if (!cameraRef || !cameraIntro.active || cameraIntro.completed) return;

    if (!cameraIntro.transitioning) {
      cameraIntro.elapsed += delta;
      const t = Math.min(1, cameraIntro.elapsed / cameraIntro.durationSec);
      const angle = cameraIntro.startAngle - cameraIntro.sweepAngleRad * t; // 시계방향
      cameraRef.position.set(
        cameraIntro.center.x + Math.sin(angle) * cameraIntro.radius,
        cameraIntro.height,
        cameraIntro.center.z + Math.cos(angle) * cameraIntro.radius,
      );
      cameraRef.lookAt(
        cameraIntro.center.x,
        cameraIntro.lookAtY,
        cameraIntro.center.z,
      );

      if (
        t >= 1 &&
        getCharacterFollowPose(_introTargetPos, _introTargetLookAt)
      ) {
        cameraIntro.transitioning = true;
        cameraIntro.transitionElapsed = 0;
        cameraIntro.fromPos.copy(cameraRef.position);
        cameraIntro.fromLookAt.set(
          cameraIntro.center.x,
          cameraIntro.lookAtY,
          cameraIntro.center.z,
        );
      }
      return;
    }

    if (!getCharacterFollowPose(cameraIntro.toPos, cameraIntro.toLookAt))
      return;
    cameraIntro.transitionElapsed += delta;
    const t = Math.min(
      1,
      cameraIntro.transitionElapsed / cameraIntro.transitionSec,
    );
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    cameraRef.position.copy(cameraIntro.fromPos).lerp(cameraIntro.toPos, eased);
    _introLerpLookAt
      .copy(cameraIntro.fromLookAt)
      .lerp(cameraIntro.toLookAt, eased);
    cameraRef.lookAt(_introLerpLookAt);

    if (t >= 1) {
      cameraIntro.active = false;
      cameraIntro.transitioning = false;
      cameraIntro.completed = true;
    }
  }

  const handleStageKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onEnterHit();
    }
    if (event.key === "0" || event.code === "Digit0") {
      event.preventDefault();
      resetLetterFall();
    }
  };

  /** 포탈 평면 통과 시 stage:switch 이벤트 dispatch */
  function checkPortalPlaneCrossing() {
    const plane = portalPlaneConfig;
    if (!plane || !character) return;
    const pos = character.getPosition?.();
    if (!pos) return;

    const dx = pos.x - plane.px;
    const dz = pos.z - plane.pz;
    const signedDist = dx * plane.nx + dz * plane.nz;
    const lateral = Math.abs(-dx * plane.nz + dz * plane.nx);
    if (lateral > plane.halfWidth) return;

    if (prevPortalSignedDist !== null) {
      const crossed =
        (prevPortalSignedDist > 0 && signedDist < 0) ||
        (prevPortalSignedDist < 0 && signedDist > 0);
      if (crossed) {
        window.dispatchEvent(
          new CustomEvent("stage:switch", {
            detail: { targetStage: plane.targetStage },
          }),
        );
        prevPortalSignedDist = null;
        return;
      }
    }
    prevPortalSignedDist = signedDist;
  }

  function resolveIntPointerTarget(hitObject) {
    let p = hitObject;
    while (p) {
      if (typeof p.name === "string" && p.name.startsWith(INT_PREFIX)) {
        const suffix = p.name.slice(INT_PREFIX.length);
        return INT_SUFFIX_TO_TARGET[suffix] ?? null;
      }
      p = p.parent;
    }
    return null;
  }

  /** island2 로드 후: INT_* 노드에서 레이캐스트 메시·refs 등록 */
  function registerIslandInteractions(islandModel) {
    intRaycastMeshes.length = 0;
    iceCreamCartRef = null;
    gameMachineRef = null;
    if (unlistenMinigameClose) {
      unlistenMinigameClose();
      unlistenMinigameClose = null;
    }

    const meshSet = new Set();
    const rootNames = [];
    islandModel.traverse((obj) => {
      if (typeof obj.name !== "string" || !obj.name.startsWith(INT_PREFIX)) {
        return;
      }
      rootNames.push(obj.name);
      const suffix = obj.name.slice(INT_PREFIX.length);
      if (suffix === "gameMachine") gameMachineRef = obj;
      if (suffix === "icecream") iceCreamCartRef = obj;
      obj.traverse((child) => {
        if (child.isMesh) meshSet.add(child);
      });
    });
    intRaycastMeshes.push(...meshSet);

    if (gameMachineRef) {
      unlistenMinigameClose = onMinigameClose(() => {
        closeMinigame({
          camera: cameraRef,
          orbitControls: debugControls?.getOrbitControls?.() ?? null,
        });
      });
    }

    if (rootNames.length > 0 && import.meta.env.DEV) {
      const uniq = [...new Set(rootNames)];
      console.log("[Stage3] island INT_ 노드:", uniq.join(", "));
      const knownSuffixes = new Set(Object.keys(INT_SUFFIX_TO_TARGET));
      for (const full of uniq) {
        const suf = full.startsWith(INT_PREFIX)
          ? full.slice(INT_PREFIX.length)
          : full;
        if (!knownSuffixes.has(suf)) {
          console.log(
            `[Stage3] INT_ '${full}' → 아직 클릭 핸들러 없음 (매핑 추가 또는 GLB 이름 변경)`,
          );
        }
      }
    }
  }

  /** 레이캐스트: "icecream" | "notice" | "gameMachine" | "mirror" | "portal" | null */
  function getPointerHitTarget(clientX, clientY) {
    if (!cameraRef || !canvasRef || !sceneRef) return null;
    if (intRaycastMeshes.length === 0) return null;
    const rect = canvasRef.getBoundingClientRect();
    _icePointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _icePointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _iceRaycaster.setFromCamera(_icePointer, cameraRef);
    const hits = _iceRaycaster.intersectObjects(intRaycastMeshes, false);
    if (hits.length === 0) return null;
    return resolveIntPointerTarget(hits[0].object);
  }

  let _pointerMoveRafId = 0;
  let _lastPointerEvent = null;
  function handlePointerMove(event) {
    if (!canvasRef) return;
    _lastPointerEvent = event;
    if (_pointerMoveRafId !== 0) return;
    _pointerMoveRafId = requestAnimationFrame(() => {
      _pointerMoveRafId = 0;
      const e = _lastPointerEvent;
      if (!e || !canvasRef) return;
      const target = getPointerHitTarget(e.clientX, e.clientY);
      canvasRef.style.cursor = target ? "pointer" : "default";
    });
  }

  function handlePointerLeave() {
    if (canvasRef) canvasRef.style.cursor = "default";
  }

  /** 게시판 모달 생성 및 표시 */
  function showNoticeModal() {
    const paperPaths = config.notice?.paperSoundPaths ?? [];
    if (paperPaths.length > 0) {
      const path = paperPaths[Math.floor(Math.random() * paperPaths.length)];
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const src = base + path;
      if (!noticePaperAudio) {
        noticePaperAudio = new window.Audio();
        noticePaperAudio.volume = 0.5;
      }
      noticePaperAudio.pause();
      noticePaperAudio.currentTime = 0;
      noticePaperAudio.src = src;
      noticePaperAudio.play().catch(() => {});
    }
    if (noticeModalEl) {
      noticeModalEl.style.display = "flex";
      return;
    }
    noticeModalEl = document.createElement("div");
    noticeModalEl.className = "stage3-notice-modal-backdrop";
    noticeModalEl.innerHTML = `
      <div class="stage3-notice-modal">
        <button type="button" class="stage3-notice-modal-close" aria-label="닫기">×</button>
        <div class="stage3-notice-modal-content">게시판</div>
      </div>
    `;
    Object.assign(noticeModalEl.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.35)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      zIndex: "9999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    });
    const modalBox = noticeModalEl.querySelector(".stage3-notice-modal");
    if (modalBox && "style" in modalBox)
      Object.assign(modalBox.style, {
        background: "#fff",
        borderRadius: "12px",
        padding: "24px 28px",
        maxWidth: "400px",
        width: "100%",
        position: "relative",
        boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
      });
    const closeBtn = noticeModalEl.querySelector(".stage3-notice-modal-close");
    if (closeBtn && "style" in closeBtn)
      Object.assign(closeBtn.style, {
        position: "absolute",
        top: "12px",
        right: "12px",
        width: "32px",
        height: "32px",
        border: "none",
        background: "transparent",
        fontSize: "24px",
        lineHeight: "1",
        cursor: "pointer",
        color: "#666",
      });
    closeBtn.addEventListener("click", closeNoticeModal);
    noticeModalEl.addEventListener("click", (e) => {
      if (e.target === noticeModalEl) closeNoticeModal();
    });
    document.body.appendChild(noticeModalEl);
  }

  function closeNoticeModal() {
    if (noticeModalEl) noticeModalEl.style.display = "none";
  }

  /** island INT_* 클릭 핸들러 */
  function handlePointerDown(event) {
    if (!cameraRef || !canvasRef || !sceneRef) return;
    const target = getPointerHitTarget(event.clientX, event.clientY);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();

    if (target === "icecream") {
      if (iceCreamTemplates.length === 0) return;
      spawnIceCreamFromCart();
      return;
    }
    if (target === "notice") {
      showNoticeModal();
    }
    if (target === "gameMachine") {
      openMinigame({
        camera: cameraRef,
        gameMachineRef,
        orbitControls: debugControls?.getOrbitControls?.() ?? null,
      });
    }
    if (target === "mirror") {
      openMirrorModal();
      return;
    }
    if (target === "portal") {
      const targetStage = config.portal_bright?.targetStage ?? 6;
      window.dispatchEvent(
        new CustomEvent("stage:switch", {
          detail: { targetStage },
        }),
      );
    }
  }

  let _iceCreamGroundMat = null;
  let _iceCreamMat = null;

  /** 아이스크림용 물리 월드 초기화 (지면, 중력) */
  function initIceCreamPhysics() {
    if (iceCreamPhysicsWorld) return;
    _iceCreamGroundMat = new CANNON.Material("icecreamGround");
    _iceCreamMat = new CANNON.Material("icecream");
    iceCreamPhysicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });
    iceCreamGroundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: _iceCreamGroundMat,
    });
    iceCreamGroundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    iceCreamGroundBody.position.set(0, stage3GroundY, 0);
    iceCreamPhysicsWorld.addBody(iceCreamGroundBody);
    iceCreamPhysicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(_iceCreamGroundMat, _iceCreamMat, {
        friction: 0.4,
        restitution: 0.25,
      }),
    );
  }

  function spawnIceCreamFromCart() {
    if (!iceCreamCartRef) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3] 카트가 아직 로드되지 않았습니다.");
      }
      return;
    }
    if (!sceneRef) return;
    const maxSpawns = config.icecreamCart?.maxSpawns ?? 10;
    if (spawnedIceCreams.length >= maxSpawns) return;
    if (iceCreamTemplates.length === 0) {
      if (import.meta.env.DEV) {
        console.warn(
          "[Stage3] 스폰 모델 로드 실패. 콘솔에서 '아이스크림 스폰 모델 로드 실패' 확인.",
        );
      }
      return;
    }
    initIceCreamPhysics();

    const template =
      iceCreamTemplates[Math.floor(Math.random() * iceCreamTemplates.length)];
    const clone = SkeletonUtils.clone(template.scene);
    const cartPos = iceCreamCartRef.position;
    const spawnScale = config.icecreamCart?.spawnScale ?? 0.5;
    const sx = cartPos.x + (Math.random() - 0.5) * 1.5;
    const sy = cartPos.y + 0.5 + Math.random() * 0.5;
    const sz = cartPos.z + (Math.random() - 0.5) * 1.5;

    clone.position.set(sx, sy, sz);
    clone.scale.setScalar(spawnScale);
    clone.updateMatrixWorld(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // 물리 바디: 모델 바운딩 박스 기반
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const halfExtents = new CANNON.Vec3(
      size.x * 0.5,
      size.y * 0.5,
      size.z * 0.5,
    );
    const boxShape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: 0.3,
      shape: boxShape,
      position: new CANNON.Vec3(sx, sy, sz),
      material: _iceCreamMat,
      linearDamping: 0.1,
      angularDamping: 0.3,
    });

    const angle = Math.random() * Math.PI * 2;
    const horizontalSpeed = 2.5 + Math.random() * 2;
    body.velocity.set(
      Math.cos(angle) * horizontalSpeed,
      3 + Math.random() * 2,
      Math.sin(angle) * horizontalSpeed,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );

    iceCreamPhysicsWorld.addBody(body);
    sceneRef.add(clone);
    spawnedIceCreams.push({ group: clone, body });
  }

  function updateSpawnedIceCreams(delta) {
    if (!iceCreamPhysicsWorld) return;
    const substeps = config.icecreamCart?.physicsSubsteps ?? 2;
    iceCreamPhysicsWorld.step(1 / 60, delta, substeps);
    for (let i = 0; i < spawnedIceCreams.length; i++) {
      const s = spawnedIceCreams[i];
      s.group.position.copy(s.body.position);
      s.group.quaternion.copy(s.body.quaternion);
    }
  }

  /** 최신 handwriting 메타데이터 1개 반환 (없으면 null) */
  async function getLatestHandwritingMetadata() {
    if (!supabase) return null;
    const sessionId = getSessionId();
    let list = [];
    for (const folder of [sessionId, sessionId + "/"]) {
      let files;
      let error;
      try {
        const res = await supabase.storage
          .from(HANDWRITING_BUCKET)
          .list(folder.replace(/\/$/, ""), { limit: 500 });
        files = res.data;
        error = res.error;
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] handwriting Storage 목록 실패(네트워크 전환 등) — DB 폴백 시도:",
            e?.message ?? e,
          );
        }
        break;
      }
      if (!error && Array.isArray(files)) {
        const svgFiles = files.filter(
          (f) => f.name && String(f.name).toLowerCase().endsWith(".svg"),
        );
        const prefix = folder.replace(/\/$/, "")
          ? folder.replace(/\/$/, "") + "/"
          : "";
        list = svgFiles.map((f) => ({
          path: prefix + f.name,
          id: f.name.replace(/\.svg$/i, ""),
          createdAt: f.created_at ?? null,
        }));
        if (list.length > 0) break;
      }
    }
    if (list.length === 0) {
      try {
        const { data: rows } = await supabase
          .from(HANDWRITING_TABLE)
          .select("storage_path, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(500);
        if (Array.isArray(rows) && rows.length > 0) {
          list = rows.map((r) => ({
            path: String(r.storage_path ?? ""),
            id: String(r.storage_path ?? "").replace(/\.svg$/i, ""),
            createdAt: r.created_at ?? null,
          }));
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] handwriting DB 조회 실패:", e?.message ?? e);
        }
      }
    }
    if (list.length === 0) return null;
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    const latest = list[list.length - 1];
    const { data: urlData } = supabase.storage
      .from(HANDWRITING_BUCKET)
      .getPublicUrl(latest.path);
    return { id: latest.id, url: urlData?.publicUrl ?? "" };
  }

  function centerGroupGeometries(meshes) {
    const box = new THREE.Box3();
    const tempBox = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      tempBox.copy(mesh.geometry.boundingBox);
      box.union(tempBox);
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    for (const mesh of meshes) {
      mesh.geometry.translate(-center.x, -center.y, -center.z);
    }
  }

  function setReadableRotationTowardCamera(group, camera, _groundY) {
    const dir = new THREE.Vector3(
      camera.position.x - group.position.x,
      0,
      camera.position.z - group.position.z,
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    group.rotation.set(0, yaw, 0);
  }

  // Stage3에서는 낙하 중 회전을 사용하지 않으므로, 회전 속도 계산 유틸은 제거.

  /** 씬에서 Stage3 글자 그룹만 모두 제거 (떠 있는 것 포함) */
  function removeAllLetterGroupsFromScene(scene) {
    const toRemove = [];
    scene.traverse((obj) => {
      if (obj.userData?.isStage3Letter) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    letterState = null;
  }

  async function loadLatestLetter(scene, camera, groundY) {
    if (letterLoadInProgress) return;
    letterLoadInProgress = true;

    removeAllLetterGroupsFromScene(scene);

    try {
      const metadata = await getLatestHandwritingMetadata();
      if (!metadata?.url) {
        if (import.meta.env.DEV) {
          console.log("[Stage3] 표시할 handwriting 없음");
        }
        return;
      }
      let shapes = await loadSVGShapes(metadata.url);
      if (shapes.length === 0) return;
      shapes = expandShapesStroke(shapes, 1.3);

      const group = new THREE.Group();
      group.userData.isStage3Letter = true; // 로드/cleanup 시 식별용
      // 채팅 시작 전 스타일(작은 베벨) + 두께 더 굵게, 수직 유지
      const extrudeSettings = {
        depth: 0.18,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.02,
        bevelSegments: 8,
      };
      const meshes = [];
      shapes.forEach((shape) => {
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshStandardMaterial({
          color: 0x2e2e2e,
          metalness: 0.1,
          roughness: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.scale.set(STAGE3_LETTER_SCALE, STAGE3_LETTER_SCALE, 1.45);
        group.add(mesh);
        meshes.push(mesh);
      });
      centerGroupGeometries(meshes);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const letterBottomOffset = Math.max(0, -box.min.y);
      const landingY = groundY + letterBottomOffset;

      const startY = groundY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      group.position.set(0, startY, 0);
      group.rotation.set(0, 0, 0);
      if (!isStage3Active) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
        });
        return;
      }
      scene.add(group);
      const speedFactor = 0.6 + Math.random() * 0.4; // 0.6~1.0: 전반적으로 더 빠르게
      const gravity = STAGE3_GRAVITY * speedFactor;
      const initialVy = (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;
      letterState = {
        group,
        velocity: {
          y: initialVy,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
        },
        gravity,
        groundY,
        landingY,
        bounces: 0,
        landed: false,
        hitCount: 0,
      };
      if (import.meta.env.DEV) {
        console.log("[Stage3] 최신 글자 1개 낙하 시작 (2배 크기)");
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3] 글자 로드 실패:", e);
      }
    } finally {
      letterLoadInProgress = false;
    }
  }

  /** 0키: 글자 다시 떨어뜨리기 (디버깅용). 이미 없으면 최신 글자 재로드 후 낙하 */
  function resetLetterFall() {
    if (letterState) {
      const s = letterState;
      const speedFactor = 0.25 + Math.random() * 0.75;
      const startY = s.landingY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      const startX = 0;
      const startZ = 0;
      const gravity = STAGE3_GRAVITY * speedFactor;
      const initialVy = (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;

      s.group.position.set(startX, startY, startZ);
      s.group.rotation.set(0, 0, 0);

      s.velocity.y = initialVy;
      s.velocity.rotationX = 0;
      s.velocity.rotationY = 0;
      s.velocity.rotationZ = 0;
      s.gravity = gravity;
      s.bounces = 0;
      s.landed = false;
      s.hitCount = 0;
      if (import.meta.env.DEV) {
        console.log("[Stage3] 0키: 글자 재낙하");
      }
      return;
    }
    if (sceneRef && cameraRef && stage3GroundY > 0) {
      loadLatestLetter(sceneRef, cameraRef, stage3GroundY);
      if (import.meta.env.DEV) {
        console.log("[Stage3] 0키: 글자 없음 → 최신 글자 로드 후 낙하");
      }
    }
  }

  function updateLetter(delta, camera) {
    if (!letterState || letterState.landed) return;
    const s = letterState;
    const nextY = s.group.position.y + s.velocity.y * delta;
    if (nextY <= s.landingY) {
      // 첫 충돌 시 한 번만 가볍게 바운스해서 무게감을 표현
      if ((s.bounces ?? 0) < 1 && Math.abs(s.velocity.y) > 2) {
        s.group.position.y = s.landingY;
        s.velocity.y = -s.velocity.y * LETTER_BOUNCE_RESTITUTION;
        s.bounces = (s.bounces ?? 0) + 1;
        return;
      }

      s.group.position.y = s.landingY;
      s.velocity.y = 0;
      s.velocity.rotationX = 0;
      s.velocity.rotationY = 0;
      s.velocity.rotationZ = 0;
      setReadableRotationTowardCamera(s.group, camera, s.groundY);
      s.landed = true;
      return;
    }
    s.velocity.y += s.gravity * delta;
    s.group.position.y = nextY;
    s.group.rotation.x += s.velocity.rotationX * delta;
    s.group.rotation.y += s.velocity.rotationY * delta;
    s.group.rotation.z += s.velocity.rotationZ * delta;
  }

  const _v3 = new THREE.Vector3();
  const _v3b = new THREE.Vector3();
  const _v3c = new THREE.Vector3();
  const _normal = new THREE.Vector3();

  /** 그룹 내 모든 메시에서 월드 공간 삼각형 수집 */
  function collectTrianglesFromGroup(group) {
    group.updateMatrixWorld(true);
    const triangles = [];
    let meshIndex = 0;
    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geom = child.geometry;
      const posAttr = geom.getAttribute("position");
      const normAttr = geom.getAttribute("normal");
      if (!posAttr) return;
      const index = geom.getIndex();
      const matrix = child.matrixWorld;
      const addTri = (i0, i1, i2) => {
        _v3.fromBufferAttribute(posAttr, i0);
        _v3b.fromBufferAttribute(posAttr, i1);
        _v3c.fromBufferAttribute(posAttr, i2);
        _v3.applyMatrix4(matrix);
        _v3b.applyMatrix4(matrix);
        _v3c.applyMatrix4(matrix);
        const p0 = _v3.clone();
        const p1 = _v3b.clone();
        const p2 = _v3c.clone();
        if (normAttr) {
          _normal.fromBufferAttribute(normAttr, i0);
          _normal.transformDirection(matrix);
          const n0 = _normal.clone();
          _normal.fromBufferAttribute(normAttr, i1);
          _normal.transformDirection(matrix);
          const n1 = _normal.clone();
          _normal.fromBufferAttribute(normAttr, i2);
          _normal.transformDirection(matrix);
          const n2 = _normal.clone();
          triangles.push({ p0, p1, p2, n0, n1, n2, meshIndex });
        } else {
          triangles.push({
            p0,
            p1,
            p2,
            n0: new THREE.Vector3(0, 1, 0),
            n1: new THREE.Vector3(0, 1, 0),
            n2: new THREE.Vector3(0, 1, 0),
            meshIndex,
          });
        }
      };
      meshIndex += 1;
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          addTri(i, i + 1, i + 2);
        }
      }
    });
    return triangles;
  }

  /** 자음/모음(shape) 단위로 분할 — 한 번에 한 shape씩 떨어져 나감 (ㅇ, ㅡ, ㅏ 등) */
  function partitionTrianglesByShape(triangles) {
    const byShape = new Map();
    const _c = new THREE.Vector3();
    for (const tri of triangles) {
      const idx = tri.meshIndex ?? 0;
      if (!byShape.has(idx)) byShape.set(idx, []);
      byShape.get(idx).push(tri);
    }
    const shapeCenters = [];
    for (const [, list] of byShape) {
      _c.set(0, 0, 0);
      for (const t of list) _c.add(t.p0).add(t.p1).add(t.p2);
      _c.multiplyScalar(1 / (list.length * 3));
      shapeCenters.push({ list, centroidX: _c.x });
    }
    shapeCenters.sort((a, b) => a.centroidX - b.centroidX);
    const fromLeft = Math.random() < 0.5;
    const takeIdx = fromLeft ? 0 : shapeCenters.length - 1;
    const toFly = shapeCenters[takeIdx].list;
    const remaining = shapeCenters
      .filter((_, i) => i !== takeIdx)
      .flatMap((s) => s.list);
    if (toFly.length === 0) return { remaining: triangles, fragments: [] };
    return { remaining, fragments: [toFly] };
  }

  /** 절단면 위 정점: x를 cutX로 고정, 노멀은 평면 법선(단무지 썬 것처럼 깔끔한 단면) */
  const CUT_NORMAL_LEFT = new THREE.Vector3(1, 0, 0);
  const CUT_NORMAL_RIGHT = new THREE.Vector3(-1, 0, 0);

  function clipTriangleByPlane(tri, cutX) {
    const d0 = tri.p0.x - cutX;
    const d1 = tri.p1.x - cutX;
    const d2 = tri.p2.x - cutX;
    const left = [];
    const right = [];
    const pushTri = (arr, q0, q1, q2, m0, m1, m2) => {
      arr.push({
        p0: q0.clone(),
        p1: q1.clone(),
        p2: q2.clone(),
        n0: m0.clone(),
        n1: m1.clone(),
        n2: m2.clone(),
      });
    };
    const onPlane = (pA, pB, t) => {
      const p = new THREE.Vector3().lerpVectors(pA, pB, t);
      p.x = cutX;
      return p;
    };
    if (d0 <= 0 && d1 <= 0 && d2 <= 0) {
      pushTri(left, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
      return { left, right };
    }
    if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
      pushTri(right, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
      return { left, right };
    }
    const t01 = d0 - d1 !== 0 ? -d0 / (d1 - d0) : 0;
    const t12 = d1 - d2 !== 0 ? -d1 / (d2 - d1) : 0;
    const t20 = d2 - d0 !== 0 ? -d2 / (d0 - d2) : 0;
    if (d0 >= 0 && d1 < 0 && d2 < 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_LEFT);
      pushTri(left, tri.p1, B, A, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    } else if (d0 < 0 && d1 >= 0 && d2 < 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p1, tri.p2, t12);
      pushTri(right, tri.p1, A, B, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_LEFT, tri.n2);
      pushTri(left, A, B, tri.p2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT, tri.n2);
    } else if (d0 < 0 && d1 < 0 && d2 >= 0) {
      const A = onPlane(tri.p1, tri.p2, t12);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(right, tri.p2, B, A, tri.n2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_LEFT);
      pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    } else if (d0 < 0 && d1 >= 0 && d2 >= 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p1, B, A, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(right, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_RIGHT);
    } else if (d0 >= 0 && d1 < 0 && d2 >= 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p1, tri.p2, t12);
      pushTri(left, tri.p1, A, B, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_RIGHT, tri.n2);
      pushTri(right, A, B, tri.p2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT, tri.n2);
    } else if (d0 >= 0 && d1 >= 0 && d2 < 0) {
      const A = onPlane(tri.p1, tri.p2, t12);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(left, tri.p2, B, A, tri.n2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_RIGHT);
      pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    }
    return { left, right };
  }

  /**
   * 글자 로컬 x 기준 평면으로 실제 클리핑 → 칼로 썬 것처럼 깔끔한 절단면. 캡 없음.
   */
  function partitionTrianglesOneSlice(triangles, group, fraction) {
    group.updateMatrixWorld(true);
    const invWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const matrixWorld = group.matrixWorld;
    const toWorld = (p) => p.clone().applyMatrix4(matrixWorld);
    const _triLocal = {
      p0: new THREE.Vector3(),
      p1: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      n0: new THREE.Vector3(),
      n1: new THREE.Vector3(),
      n2: new THREE.Vector3(),
    };
    let minX = Infinity;
    let maxX = -Infinity;
    const localTris = [];
    for (const tri of triangles) {
      _triLocal.p0.copy(tri.p0).applyMatrix4(invWorld);
      _triLocal.p1.copy(tri.p1).applyMatrix4(invWorld);
      _triLocal.p2.copy(tri.p2).applyMatrix4(invWorld);
      _triLocal.n0.copy(tri.n0).transformDirection(invWorld);
      _triLocal.n1.copy(tri.n1).transformDirection(invWorld);
      _triLocal.n2.copy(tri.n2).transformDirection(invWorld);
      const x = (_triLocal.p0.x + _triLocal.p1.x + _triLocal.p2.x) / 3;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      localTris.push({
        p0: _triLocal.p0.clone(),
        p1: _triLocal.p1.clone(),
        p2: _triLocal.p2.clone(),
        n0: _triLocal.n0.clone(),
        n1: _triLocal.n1.clone(),
        n2: _triLocal.n2.clone(),
      });
    }
    const range = maxX - minX;
    if (range < 1e-6)
      return {
        remaining: triangles,
        fragments: [],
        cutX: null,
        fromLeft: false,
      };
    const fromLeft = Math.random() < 0.5;
    const cutXLocal = fromLeft
      ? minX + range * fraction
      : maxX - range * fraction;
    const allLeft = [];
    const allRight = [];
    for (const tri of localTris) {
      const { left, right } = clipTriangleByPlane(tri, cutXLocal);
      allLeft.push(...left);
      allRight.push(...right);
    }
    const toWorldTri = (t) => ({
      p0: toWorld(t.p0),
      p1: toWorld(t.p1),
      p2: toWorld(t.p2),
      n0: t.n0.clone().transformDirection(matrixWorld),
      n1: t.n1.clone().transformDirection(matrixWorld),
      n2: t.n2.clone().transformDirection(matrixWorld),
    });
    const toFly = (fromLeft ? allLeft : allRight).map(toWorldTri);
    const remaining = (fromLeft ? allRight : allLeft).map(toWorldTri);
    if (toFly.length === 0)
      return {
        remaining: triangles,
        fragments: [],
        cutX: null,
        fromLeft: false,
      };
    return { remaining, fragments: [toFly], cutX: null, fromLeft };
  }

  /** 삼각형 배열 → 중심 기준 로컬 BufferGeometry */
  function trianglesToGeometry(triangles, centerWorld) {
    if (triangles.length === 0) return null;
    const positions = [];
    const normals = [];
    for (const tri of triangles) {
      positions.push(
        tri.p0.x - centerWorld.x,
        tri.p0.y - centerWorld.y,
        tri.p0.z - centerWorld.z,
        tri.p1.x - centerWorld.x,
        tri.p1.y - centerWorld.y,
        tri.p1.z - centerWorld.z,
        tri.p2.x - centerWorld.x,
        tri.p2.y - centerWorld.y,
        tri.p2.z - centerWorld.z,
      );
      normals.push(
        tri.n0.x,
        tri.n0.y,
        tri.n0.z,
        tri.n1.x,
        tri.n1.y,
        tri.n1.z,
        tri.n2.x,
        tri.n2.y,
        tri.n2.z,
      );
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.computeBoundingSphere();
    return geom;
  }

  function getHitTarget() {
    const origin = (
      character?.getPosition?.() ??
      cameraRef?.position ??
      new THREE.Vector3(0, 0, 0)
    ).clone();
    let best = null;
    let bestDist = HIT_RANGE;
    if (letterState?.landed && letterState.hitCount < HITS_TO_DESTROY) {
      const d = letterState.group.position.distanceTo(origin);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: "letter",
          group: letterState.group,
          groundY: letterState.groundY,
        };
      }
    }
    for (let i = 0; i < fragments.length; i++) {
      const d = fragments[i].group.position.distanceTo(origin);
      if (d < bestDist) {
        bestDist = d;
        best = { type: "fragment", index: i, groundY: fragments[i].groundY };
      }
    }
    return best;
  }

  /** 풀에서 fragment 슬롯 할당 (없으면 새로 생성). geom, mat은 caller가 생성 후 전달 */
  function allocFragment(geom, mat) {
    if (fragmentPool.length > 0) {
      const slot = fragmentPool.pop();
      slot.group.geometry = geom;
      slot.group.material = mat.clone();
      return slot;
    }
    const mesh = new THREE.Mesh(geom, mat.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return {
      group: mesh,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
    };
  }

  /** fragment 슬롯을 풀에 반환 (geometry/material dispose) */
  function releaseFragment(f) {
    sceneRef.remove(f.group);
    if (f.group.geometry) {
      f.group.geometry.dispose();
      f.group.geometry = null;
    }
    if (f.group.material) {
      f.group.material.dispose();
      f.group.material = null;
    }
    if (fragmentPool.length < FRAGMENT_POOL_MAX) {
      fragmentPool.push(f);
    }
  }

  function createFragmentMeshes(fragTriangles, mat, groundY) {
    for (const triList of fragTriangles) {
      if (triList.length === 0) continue;
      const fragCenter = new THREE.Vector3(0, 0, 0);
      for (const tri of triList) {
        fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
      }
      fragCenter.multiplyScalar(1 / (triList.length * 3));
      const geom = trianglesToGeometry(triList, fragCenter);
      if (!geom) continue;
      const slot = allocFragment(geom, mat);
      slot.group.position.copy(fragCenter);
      slot.group.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      slot.velocity.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 2 + 3,
        (Math.random() - 0.5) * 6,
      );
      slot.angularVelocity.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
      );
      sceneRef.add(slot.group);
      fragments.push({
        group: slot.group,
        velocity: slot.velocity,
        angularVelocity: slot.angularVelocity,
        age: 0,
        groundY,
      });
    }
  }

  function onEnterHit() {
    if (!sceneRef) return;
    const target = getHitTarget();
    if (!target) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2e2e2e,
      metalness: 0.1,
      roughness: 0.8,
      transparent: true,
      opacity: 1,
    });

    if (target.type === "fragment") {
      const fragIdx = target.index;
      const frag = fragments[fragIdx];
      const mesh = frag.group;
      const tris = collectTrianglesFromGroup(mesh);
      if (tris.length === 0) return;
      const { remaining, fragments: fragTriangles } =
        partitionTrianglesOneSlice(tris, mesh, FRACTION_PER_HIT);
      releaseFragment(frag);
      fragments.splice(fragIdx, 1);
      createFragmentMeshes(fragTriangles, mat, target.groundY);
      if (remaining.length > 0) {
        const fragCenter = new THREE.Vector3(0, 0, 0);
        for (const tri of remaining) {
          fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
        }
        fragCenter.multiplyScalar(1 / (remaining.length * 3));
        const geom = trianglesToGeometry(remaining, fragCenter);
        if (geom) {
          const slot = allocFragment(geom, mat);
          slot.group.position.copy(fragCenter);
          slot.velocity.set(
            (Math.random() - 0.5) * 5,
            Math.random() * 1.5 + 2.5,
            (Math.random() - 0.5) * 5,
          );
          slot.angularVelocity.set(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
          );
          sceneRef.add(slot.group);
          fragments.push({
            group: slot.group,
            velocity: slot.velocity,
            angularVelocity: slot.angularVelocity,
            age: 0,
            groundY: target.groundY,
          });
        }
      }
      return;
    }

    const group = target.group;
    const triangles = collectTrianglesFromGroup(group);
    if (triangles.length === 0) return;

    const hasMultipleShapes =
      new Set(triangles.map((t) => t.meshIndex ?? 0)).size > 1;
    const { remaining, fragments: fragTriangles } = hasMultipleShapes
      ? partitionTrianglesByShape(triangles)
      : partitionTrianglesOneSlice(triangles, group, FRACTION_PER_HIT);

    createFragmentMeshes(fragTriangles, mat, target.groundY);

    const hitCount = ++letterState.hitCount;

    if (remaining.length === 0 || hitCount >= HITS_TO_DESTROY) {
      sceneRef.remove(group);
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      letterState = null;
      return;
    }

    const letterMaterial = group.children.find(
      (c) => c.isMesh && c.material,
    )?.material;
    const remMat = letterMaterial ? letterMaterial.clone() : mat.clone();
    if (!remMat.transparent) {
      remMat.transparent = true;
      remMat.opacity = 1;
    }

    const remainingCenter = new THREE.Vector3(0, 0, 0);
    for (const tri of remaining) {
      remainingCenter.add(tri.p0).add(tri.p1).add(tri.p2);
    }
    remainingCenter.multiplyScalar(1 / (remaining.length * 3));
    const invWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const remainingCenterLocal = remainingCenter.clone().applyMatrix4(invWorld);
    for (const tri of remaining) {
      tri.p0.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.p1.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.p2.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.n0 = tri.n0.clone().transformDirection(invWorld);
      tri.n1 = tri.n1.clone().transformDirection(invWorld);
      tri.n2 = tri.n2.clone().transformDirection(invWorld);
    }
    const remainingGeom = trianglesToGeometry(
      remaining,
      new THREE.Vector3(0, 0, 0),
    );
    if (!remainingGeom) {
      letterState = null;
      return;
    }
    const remainingMesh = new THREE.Mesh(remainingGeom, remMat);
    remainingMesh.castShadow = true;
    remainingMesh.receiveShadow = true;
    while (group.children.length > 0) {
      const old = group.children[0];
      group.remove(old);
      if (old.geometry) old.geometry.dispose();
      if (old.material) old.material.dispose();
    }
    group.add(remainingMesh);
    group.position.copy(remainingCenter);
  }

  function updateFragments(delta) {
    const g = STAGE3_GRAVITY * FRAGMENT_GRAVITY_MUL;
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      const groundY = f.groundY ?? stage3GroundY;
      f.group.position.x += f.velocity.x * delta;
      f.group.position.y += f.velocity.y * delta;
      f.group.position.z += f.velocity.z * delta;
      f.velocity.y += g * delta;
      if (f.group.position.y < groundY) {
        f.group.position.y = groundY;
        f.velocity.y = -f.velocity.y * FRAGMENT_BOUNCE_RESTITUTION;
        f.velocity.x *= FRAGMENT_GROUND_FRICTION;
        f.velocity.z *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.x *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.y *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.z *= FRAGMENT_GROUND_FRICTION;
      }
      f.group.rotation.x += f.angularVelocity.x * delta;
      f.group.rotation.y += f.angularVelocity.y * delta;
      f.group.rotation.z += f.angularVelocity.z * delta;
      f.age += delta;
      if (f.age >= FRAGMENT_FADE_START) {
        const t =
          (f.age - FRAGMENT_FADE_START) /
          (FRAGMENT_FADE_END - FRAGMENT_FADE_START);
        const opacity = Math.max(0, 1 - t);
        if (f.group.material) f.group.material.opacity = opacity;
      }
      if (f.age >= FRAGMENT_FADE_END) {
        releaseFragment(f);
        fragments.splice(i, 1);
      }
    }
  }

  return {
    camera: null,

    setup(scene, renderer) {
      isStage3Active = true;
      gumCancelled = false;
      const canvas = renderer.domElement;
      sceneRef = scene;
      canvasRef = canvas;
      prevPortalSignedDist = null;

      /** @type {import("../types.js").Stage3PortalConfig | undefined} */
      const portalCfg = config.portal_bright;
      if (portalCfg?.targetStage != null && portalCfg?.normal) {
        const { x: nx, z: nz } = portalCfg.normal;
        const len = Math.hypot(nx, nz) || 1;
        portalPlaneConfig = {
          px: portalCfg.position?.x ?? 0,
          pz: portalCfg.position?.z ?? 0,
          nx: nx / len,
          nz: nz / len,
          halfWidth: portalCfg.halfWidth ?? 2,
          targetStage: portalCfg.targetStage,
        };
      } else {
        portalPlaneConfig = null;
      }

      character = createCharacterController({
        scene,
        glbLoader,
        config,
        getKeys: () => keyboard.keys,
      });

      this.camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far,
      );
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z,
      );
      if (config.camera.lookAt) {
        this.camera.lookAt(
          config.camera.lookAt.x,
          config.camera.lookAt.y,
          config.camera.lookAt.z,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }

      scene.background = new THREE.Color(config.background.color);

      keyboard.mount();
      window.addEventListener("keydown", handleStageKeyDown, { capture: true });
      canvas.addEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerleave", handlePointerLeave);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [],
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
          forceOrbit: true, // OrbitControls 활성화 (마우스 드래그로 회전/줌)
          manageCursor: false, // 아이스크림 카트 호버 시 pointer 커서 직접 처리
        },
      });

      loadStage3Background({
        scene,
        glbLoader,
        config,
        getIsActive: () => isStage3Active,
        onReady: async ({
          model,
          center,
          backgroundMaxY,
          backgroundBounds,
        }) => {
          backgroundModel = model;
          debugControls.setOrbitTarget(center);
          if (import.meta.env.DEV) {
            console.log("✅ Stage3 배경 모델 로드 완료");
          }

          cameraRef = this.camera;
          stage3GroundY = backgroundMaxY;
          loadLatestLetter(scene, this.camera, backgroundMaxY);

          character.setup(backgroundMaxY, backgroundBounds);

          // 유저를 따라다니는 껌딱지(사이드 캐릭터) 2마리
          gumFollowers = createGumFollowersController({
            scene,
            glbLoader,
            config,
            getUserState: () => ({
              position: character?.getPosition?.() ?? null,
              yaw: character?.getYaw?.() ?? null,
              moving: character?.getIsMoving?.() ?? false,
            }),
          });
          // 캐릭터 모델 로딩 타이밍과 무관하게, 껌딱지는 init이 끝나는 즉시 update에서 따라오게 처리
          try {
            await gumFollowers.init({
              backgroundMaxY,
              isCancelled: () => !isStage3Active || gumCancelled,
            });
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn("[Stage3] 껌딱지 모델 로드 실패:", e);
            }
            gumFollowers?.cleanup?.();
            gumFollowers = null;
          }

          if (!isStage3Active) return;
          registerIslandInteractions(model);
          startCameraIntro(center, backgroundBounds);
        },
      });

      if (import.meta.env.DEV) {
        console.log("✅ Stage3 생성 완료");
      }
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      updateLetter(delta, this.camera);
      updateFragments(delta);
      updateSpawnedIceCreams(delta);
      if (character) {
        character.update(delta, this.camera, {
          skipCameraFollow: cameraIntro.active || !cameraIntro.completed,
        });
      }
      updateCameraIntro(delta);
      if (gumFollowers) {
        gumFollowers.update(delta);
      }
      checkPortalPlaneCrossing();
    },

    cleanup(scene) {
      isStage3Active = false;
      gumCancelled = true;
      cameraIntro.active = false;
      cameraIntro.transitioning = false;
      cameraIntro.completed = false;
      keyboard.unmount();
      window.removeEventListener("keydown", handleStageKeyDown, {
        capture: true,
      });

      if (character) {
        character.cleanup();
        character = null;
      }
      if (gumFollowers) {
        gumFollowers.cleanup();
        gumFollowers = null;
      }
      if (canvasRef) {
        if (_pointerMoveRafId !== 0) {
          cancelAnimationFrame(_pointerMoveRafId);
          _pointerMoveRafId = 0;
        }
        canvasRef.removeEventListener("pointerdown", handlePointerDown, {
          capture: true,
        });
        canvasRef.removeEventListener("pointermove", handlePointerMove);
        canvasRef.removeEventListener("pointerleave", handlePointerLeave);
        canvasRef.style.cursor = "default";
        canvasRef = null;
      }
      closeNoticeModal();
      if (noticeModalEl && noticeModalEl.parentNode) {
        noticeModalEl.parentNode.removeChild(noticeModalEl);
        noticeModalEl = null;
      }
      closeMinigame({
        camera: cameraRef ?? this.camera,
        orbitControls: debugControls?.getOrbitControls?.() ?? null,
      });
      cameraRef = null;
      dispatchMinigameClose();
      dispatchMirrorModalClose();
      intRaycastMeshes.length = 0;
      if (unlistenMinigameClose) {
        unlistenMinigameClose();
        unlistenMinigameClose = null;
      }
      gameMachineRef = null;
      if (noticePaperAudio) {
        noticePaperAudio.pause();
        noticePaperAudio.src = "";
        noticePaperAudio = null;
      }

      spawnedIceCreams.forEach((s) => {
        if (iceCreamPhysicsWorld && s.body) {
          iceCreamPhysicsWorld.removeBody(s.body);
        }
        scene.remove(s.group);
        s.group.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              const m = child.material;
              if (Array.isArray(m)) m.forEach((x) => x.dispose());
              else m.dispose();
            }
          }
        });
      });
      spawnedIceCreams.length = 0;
      if (iceCreamPhysicsWorld && iceCreamGroundBody) {
        iceCreamPhysicsWorld.removeBody(iceCreamGroundBody);
        iceCreamGroundBody = null;
      }
      iceCreamPhysicsWorld = null;
      iceCreamCartRef = null;
      iceCreamTemplates.length = 0;

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      removeAllLetterGroupsFromScene(scene);
      fragments.forEach((f) => releaseFragment(f));
      fragments.length = 0;
      fragmentPool.forEach((slot) => {
        if (slot.group.geometry) slot.group.geometry.dispose();
        if (slot.group.material) slot.group.material.dispose();
      });
      fragmentPool.length = 0;

      objects.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      });
      objects.length = 0;

      if (backgroundModel) {
        scene.remove(backgroundModel);
        backgroundModel.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        backgroundModel = null;
      }

      scene.background = null;
      if (import.meta.env.DEV) {
        console.log("🧹 Stage3 정리 완료");
      }
    },
  };
}
