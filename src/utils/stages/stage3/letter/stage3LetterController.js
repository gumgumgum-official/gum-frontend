/**
 * Stage3 낙하 글자·타격·파편·꽃 컨트롤러
 */
import * as THREE from "three";
import gsap from "gsap";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../../common/gltfTemplateCache.js";
import {
  createHandwritingSvgPlaneGroup,
  disposeHandwritingSvgPlaneGroup,
} from "../../../handwritingSvgPlane.js";
import { createHandwritingSvgVolumeGroup } from "../stage3HandwritingSvgVolume.js";
import { STAGE3_STANDALONE_FLOWER_GLB_PATHS } from "../../../../config/stages/stage3/stage3ObjectsConfig.js";
import {
  STAGE3_LETTER_TARGET_HEIGHT,
  STAGE3_SPAWN_HEIGHT,
  STAGE3_LETTER_LANDING_LIFT,
  STAGE3_GRAVITY,
  STAGE3_INITIAL_VY,
  LETTER_BOUNCE_RESTITUTION,
  HITS_TO_DESTROY,
  CRACK_HITS_BEFORE_SHATTER,
  FINAL_SHATTER_PIECE_COUNT,
  FRACTION_PER_HIT,
  HIT_RANGE,
  FRAGMENT_GRAVITY_MUL,
  FRAGMENT_BOUNCE_RESTITUTION,
  FRAGMENT_GROUND_FRICTION,
  FRAGMENT_BURST_IMPULSE_MUL,
  FRAGMENT_FADE_START,
  FRAGMENT_FADE_END,
  FLOWER_BLOOM_DURATION,
  FLOWER_SCALE,
  FLOWER_SCALE_MIN_RATIO,
  FLOWER_Y_OFFSET,
  FRAGMENT_POOL_MAX,
  FLOWER_MIN_DISTANCE,
} from "../../../../config/stages/stage3/stage3Letter.js";
import {
  playRandomCrackSound,
  playCrackFinalSound,
  playFlowerMagicSound,
} from "../playCrackSound.js";
import { supabase } from "../../../../lib/supabase/client.js";
import { getSessionId } from "../../../../lib/session.js";
import {
  collectTrianglesFromGroup,
  partitionTrianglesOneSlice,
  trianglesToGeometry,
  xzDistanceToObject,
  splitTrianglesIntoPieces,
} from "./letterGeometry.js";

const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files";

/**
 * @param {{
 *   getScene: () => import("three").Scene | null,
 *   getCamera: () => import("three").Camera | null,
 *   getGroundY: () => number,
 *   getCollidersRef: () => import("../islandStaticColliders.js").IslandColliderAabb[] | null,
 *   getFlowerExclusionBoxes: () => {minX:number,maxX:number,minZ:number,maxZ:number}[] | null,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getIsStageActive: () => boolean,
 *   getCameraIntroState: () => { introTopViewCommitted: boolean, completed: boolean },
 *   getAssignedWorry: () => { svgUrl: string | null, worryId: string | null },
 *   getHitOrigin: () => import("three").Vector3,
 *   onShatter: () => void,
 *   onFirstFlowerSpawned: () => void,
 *   onCameraShake?: (durationSec: number) => void,
 * }} params
 */
export function createStage3LetterController({
  getScene,
  getCamera,
  getGroundY,
  getCollidersRef,
  getFlowerExclusionBoxes = () => null,
  getConfig,
  getIsStageActive,
  getCameraIntroState,
  getAssignedWorry,
  getHitOrigin,
  onShatter,
  onFirstFlowerSpawned,
  onCameraShake = null,
}) {
  /** @type {Record<string, unknown> | null} */
  let letterState = null;
  let letterLoadInProgress = false;
  let pendingSvgUrlToLoad = null;
  let pendingSvgUrlDebugId = null;
  /** @type {import("../islandStaticColliders.js").IslandColliderAabb | null} */
  let letterColliderBox = null;
  const fragments = [];
  /** @type {{ group: import("three").Object3D, age: number }[]} */
  const standaloneFlowers = [];
  const fragmentPool = [];
  let flowerMagicPlayed = false;
  /** 꽃 겹침 방지용 스폰 위치 기록 */
  const spawnedFlowerXZ = [];

  const _hitOriginScratch = new THREE.Vector3();
  const _flowerBBoxSize = new THREE.Vector3();

  function addLetterColliderIfNeeded() {
    const collidersRef = getCollidersRef();
    if (!letterState?.group || !collidersRef) return;
    if (letterColliderBox) return;
    letterState.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(letterState.group);
    if (box.isEmpty()) return;
    letterColliderBox = {
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
      minY: box.min.y,
      maxY: box.max.y,
    };
    collidersRef.push(letterColliderBox);
  }

  function removeLetterCollider() {
    const collidersRef = getCollidersRef();
    if (!letterColliderBox || !collidersRef) return;
    const idx = collidersRef.indexOf(letterColliderBox);
    if (idx >= 0) collidersRef.splice(idx, 1);
    letterColliderBox = null;
  }

  function setReadableRotationTowardCamera(group, camera) {
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

  function removeAllLetterGroupsFromScene(scene) {
    const toRemove = [];
    scene.traverse((obj) => {
      if (obj.userData?.isStage3Letter) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      scene.remove(obj);
      disposeHandwritingSvgPlaneGroup(obj);
    });
    letterState?.pulseTween?.kill();
    removeLetterCollider();
    letterState = null;
  }

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
            "[Stage3Letter] handwriting Storage 목록 실패 — DB 폴백 시도:",
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
          console.warn(
            "[Stage3Letter] handwriting DB 조회 실패:",
            e?.message ?? e,
          );
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

  /**
   * @param {{ holdFallUntilIntroTopView?: boolean }} [letterOptions]
   */
  async function loadFromSvgUrl(svgUrl, debugId, letterOptions = {}) {
    const scene = getScene();
    const camera = getCamera();
    const groundY = getGroundY();
    if (!scene || !svgUrl) return;
    void debugId;
    const { holdFallUntilIntroTopView = false } = letterOptions;

    if (letterLoadInProgress) {
      pendingSvgUrlToLoad = svgUrl;
      pendingSvgUrlDebugId = debugId;
      return;
    }

    letterLoadInProgress = true;
    removeAllLetterGroupsFromScene(scene);

    let nextSvgUrl = svgUrl;
    let _nextDebugId = debugId;
    const config = getConfig();

    try {
      while (nextSvgUrl) {
        const currentSvgUrl = nextSvgUrl;
        nextSvgUrl = null;
        _nextDebugId = null;

        try {
          const targetH =
            config.letterTargetHeight ?? STAGE3_LETTER_TARGET_HEIGHT;

          const built =
            (await createHandwritingSvgVolumeGroup(currentSvgUrl, {
              targetWorldHeight: targetH,
            })) ??
            (await createHandwritingSvgPlaneGroup(currentSvgUrl, {
              targetWorldHeight: targetH,
            }));
          if (!built) return;

          const { group } = built;
          group.userData.isStage3Letter = true;

          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          const letterBottomOffset = Math.max(0, -box.min.y);
          const landingY =
            groundY + letterBottomOffset + STAGE3_LETTER_LANDING_LIFT;

          const startY = landingY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
          const spawnX = config.letterSpawnXZ?.x ?? 0;
          const spawnZ = config.letterSpawnXZ?.z ?? 0;
          group.position.set(spawnX, startY, spawnZ);
          group.rotation.set(0, 0, 0);
          scene.add(group);

          const speedFactor = 0.6 + Math.random() * 0.4;
          const gravity = STAGE3_GRAVITY * speedFactor;
          const initialVy =
            (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;

          letterState = {
            group,
            holdFallUntilIntroTopView,
            initialVyDeferred: initialVy,
            velocity: {
              y: holdFallUntilIntroTopView ? 0 : initialVy,
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
        } catch (e) {
          console.warn("[Stage3Letter] svg 로드 실패:", e);
        }

        if (pendingSvgUrlToLoad) {
          nextSvgUrl = pendingSvgUrlToLoad;
          _nextDebugId = pendingSvgUrlDebugId;
          pendingSvgUrlToLoad = null;
          pendingSvgUrlDebugId = null;
          removeAllLetterGroupsFromScene(scene);
        } else {
          nextSvgUrl = null;
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3Letter] 글자 로드 실패:", e);
      }
    } finally {
      letterLoadInProgress = false;
    }
    void camera;
  }

  async function loadLatestFromSupabase(letterOptions = {}) {
    const metadata = await getLatestHandwritingMetadata();
    if (!metadata?.url) return;
    await loadFromSvgUrl(metadata.url, metadata.id, letterOptions);
  }

  function resetFall() {
    const scene = getScene();
    const camera = getCamera();
    const groundY = getGroundY();
    const config = getConfig();
    const assigned = getAssignedWorry();

    if (letterState) {
      const s = letterState;
      const speedFactor = 0.25 + Math.random() * 0.75;
      const startY = s.landingY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      const startX = config.letterSpawnXZ?.x ?? 0;
      const startZ = config.letterSpawnXZ?.z ?? 0;
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
      return;
    }
    if (scene && camera && groundY > 0) {
      if (assigned.svgUrl) {
        void loadFromSvgUrl(assigned.svgUrl, assigned.worryId, {
          holdFallUntilIntroTopView: false,
        });
      } else {
        void loadLatestFromSupabase();
      }
    }
  }

  function updateLetter(delta, camera) {
    if (!letterState || letterState.landed) return;
    const s = letterState;
    const intro = getCameraIntroState();
    if (s.holdFallUntilIntroTopView) {
      if (intro.introTopViewCommitted || intro.completed) {
        s.holdFallUntilIntroTopView = false;
        s.velocity.y = s.initialVyDeferred;
      } else {
        return;
      }
    }
    const nextY = s.group.position.y + s.velocity.y * delta;
    if (nextY <= s.landingY) {
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
      setReadableRotationTowardCamera(s.group, camera);
      s.landed = true;
      addLetterColliderIfNeeded();
      return;
    }
    s.velocity.y += s.gravity * delta;
    s.group.position.y = nextY;
    s.group.rotation.x += s.velocity.rotationX * delta;
    s.group.rotation.y += s.velocity.rotationY * delta;
    s.group.rotation.z += s.velocity.rotationZ * delta;
  }

  function cloneFragmentMaterial(source) {
    /** @type {THREE.Material | null} */
    let found = null;
    const sourceMesh = /** @type {any} */ (source);
    if (sourceMesh?.isMesh && sourceMesh.material) {
      found = Array.isArray(sourceMesh.material)
        ? sourceMesh.material[0]
        : sourceMesh.material;
    } else if (source) {
      source.traverse?.((c) => {
        if (found) return;
        const mesh = /** @type {any} */ (c);
        if (mesh.isMesh && mesh.material) {
          found = Array.isArray(mesh.material)
            ? mesh.material[0]
            : mesh.material;
        }
      });
    }
    const cloned = found
      ? found.clone()
      : new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
    if (!cloned.transparent) {
      cloned.transparent = true;
      cloned.opacity = 1;
    }
    return cloned;
  }

  function allocFragment(geom, mat) {
    if (fragmentPool.length > 0) {
      const slot = fragmentPool.pop();
      slot.group.geometry = geom;
      slot.group.material = mat.clone();
      slot.group.rotation.set(0, 0, 0);
      slot.group.scale.set(1, 1, 1);
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

  function releaseFragment(f) {
    const scene = getScene();
    scene?.remove(f.group);
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
    const scene = getScene();
    if (!scene) return;
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
      slot.group.rotation.set(0, 0, 0);
      const mul = FRAGMENT_BURST_IMPULSE_MUL;
      slot.velocity.set(
        (Math.random() - 0.5) * 6 * mul,
        (Math.random() * 2 + 3) * mul,
        (Math.random() - 0.5) * 6 * mul,
      );
      slot.angularVelocity.set(
        (Math.random() - 0.5) * 4 * mul,
        (Math.random() - 0.5) * 4 * mul,
        (Math.random() - 0.5) * 4 * mul,
      );
      scene.add(slot.group);
      fragments.push({
        group: slot.group,
        velocity: slot.velocity,
        angularVelocity: slot.angularVelocity,
        age: 0,
        groundY,
        flowerSpawned: false,
      });
    }
  }

  function pickRandomFlowerAssetUrl() {
    const rel =
      STAGE3_STANDALONE_FLOWER_GLB_PATHS[
        Math.floor(Math.random() * STAGE3_STANDALONE_FLOWER_GLB_PATHS.length)
      ];
    return resolvePublicAssetUrl(rel);
  }

  function pickRandomFlowerScale() {
    const min = FLOWER_SCALE * FLOWER_SCALE_MIN_RATIO;
    return min + Math.random() * (FLOWER_SCALE - min);
  }

  function disposeStandaloneFlowerGroup(g) {
    const scene = getScene();
    if (!g) return;
    scene?.remove(g);
    g.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const m = child.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      }
    });
  }

  function spawnFlowerAt(x, z, groundY) {
    const scene = getScene();
    if (!scene) return;
    // 섬 정적 충돌 오브젝트 안에 스폰 금지
    const collidersRef = getCollidersRef();
    if (collidersRef) {
      for (const box of collidersRef) {
        if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ)
          return;
      }
    }
    // INT_/OBJ_/DECO_ 오브젝트 침범 방지 (광역 exclusion)
    const exclusionBoxes = getFlowerExclusionBoxes();
    if (exclusionBoxes) {
      for (const box of exclusionBoxes) {
        if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ)
          return;
      }
    }
    // 기존 꽃과 최소 거리 유지
    for (const prev of spawnedFlowerXZ) {
      const dx = x - prev.x;
      const dz = z - prev.z;
      if (dx * dx + dz * dz < FLOWER_MIN_DISTANCE * FLOWER_MIN_DISTANCE) return;
    }
    spawnedFlowerXZ.push({ x, z });
    const url = pickRandomFlowerAssetUrl();
    const gy = groundY ?? getGroundY();
    void loadGltfTemplateCached(url)
      .then((gltf) => {
        if (!getIsStageActive() || !getScene()) return;
        const flowerInner = gltf.scene.clone(true);
        flowerInner.traverse((ch) => {
          if (ch instanceof THREE.Mesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        flowerInner.updateMatrixWorld(true);
        const innerBox = new THREE.Box3().setFromObject(flowerInner);
        if (!innerBox.isEmpty()) {
          innerBox.getSize(_flowerBBoxSize);
          const maxDim = Math.max(
            _flowerBBoxSize.x,
            _flowerBBoxSize.y,
            _flowerBBoxSize.z,
          );
          if (maxDim > 1e-6) {
            flowerInner.scale.multiplyScalar(1 / maxDim);
            flowerInner.updateMatrixWorld(true);
            innerBox.setFromObject(flowerInner);
          }
          flowerInner.position.y -= innerBox.min.y;
        }
        const container = new THREE.Group();
        container.add(flowerInner);
        container.position.set(x, gy + FLOWER_Y_OFFSET, z);
        container.rotation.y = Math.random() * Math.PI * 2;
        container.scale.setScalar(0);
        getScene()?.add(container);
        standaloneFlowers.push({
          group: container,
          age: 0,
          targetScale: pickRandomFlowerScale(),
        });
        if (!flowerMagicPlayed) {
          flowerMagicPlayed = true;
          playFlowerMagicSound();
        }
        onFirstFlowerSpawned();
      })
      .catch(() => {});
  }

  function updateStandaloneFlowers(delta) {
    for (let i = standaloneFlowers.length - 1; i >= 0; i--) {
      const s = standaloneFlowers[i];
      const scale = s.targetScale ?? FLOWER_SCALE;
      if (s.age >= FLOWER_BLOOM_DURATION) {
        if (s.group.scale.x < scale * 0.999) {
          s.group.scale.setScalar(scale);
        }
        continue;
      }
      s.age += delta;
      if (s.age < FLOWER_BLOOM_DURATION) {
        const bt = s.age / FLOWER_BLOOM_DURATION;
        const bloomEase = 1 - (1 - bt) ** 3;
        s.group.scale.setScalar(bloomEase * scale);
      } else {
        s.group.scale.setScalar(scale);
      }
    }
  }

  function updateFragments(delta) {
    const g = STAGE3_GRAVITY * FRAGMENT_GRAVITY_MUL;
    const defaultGroundY = getGroundY();
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      const groundY = f.groundY ?? defaultGroundY;
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
        const fadeDur = FRAGMENT_FADE_END - FRAGMENT_FADE_START;
        const t = THREE.MathUtils.clamp(
          (f.age - FRAGMENT_FADE_START) / fadeDur,
          0,
          1,
        );
        const opacity = Math.max(0, 1 - t);
        if (f.group.material) f.group.material.opacity = opacity;
      }
      if (f.age >= FRAGMENT_FADE_END) {
        if (!f.flowerSpawned) {
          f.flowerSpawned = true;
          spawnFlowerAt(f.group.position.x, f.group.position.z, f.groundY);
        }
        releaseFragment(f);
        fragments.splice(i, 1);
      }
    }
  }

  function getLetterFrontCapVertices(state) {
    if (state.cachedFrontVerts) return state.cachedFrontVerts;
    let maxZ = -Infinity;
    const meshes = [];
    state.group.traverse((c) => {
      if (c.isMesh && c.geometry) {
        c.geometry.computeBoundingBox();
        if (c.geometry.boundingBox) {
          meshes.push(c);
          maxZ = Math.max(maxZ, c.geometry.boundingBox.max.z);
        }
      }
    });
    const verts = [];
    const eps = 1e-3;
    for (const m of meshes) {
      const pos = m.geometry.getAttribute("position");
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getZ(i) - maxZ) < eps) {
          verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), maxZ));
        }
      }
    }
    state.cachedFrontVerts = verts;
    return verts;
  }

  function addCrackSegment(state, start, end) {
    const segs = 4;
    const dir = end.clone().sub(start);
    const dirLen = Math.max(dir.length(), 1e-6);
    const perp = new THREE.Vector3(-dir.y, dir.x, 0)
      .normalize()
      .multiplyScalar(dirLen * 0.22);
    const positions = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const base = start.clone().lerp(end, t);
      if (i !== 0 && i !== segs) {
        base.add(perp.clone().multiplyScalar((Math.random() - 0.5) * 2));
      }
      positions.push(base.x, base.y, base.z + 0.03);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 10;
    state.group.add(line);
    gsap.to(mat, {
      opacity: 1,
      duration: 0.12,
      ease: "power2.out",
      onComplete: () => {
        mat.transparent = false;
        mat.needsUpdate = true;
      },
    });
    if (!state.crackMeshes) state.crackMeshes = [];
    state.crackMeshes.push(line);
  }

  function addCrackCluster(state, anchor) {
    const branchCount = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branchCount; b++) {
      const angle = Math.random() * Math.PI * 2;
      const len = (0.22 + Math.random() * 0.5) * 0.7;
      const end = new THREE.Vector3(
        anchor.x + Math.cos(angle) * len,
        anchor.y + Math.sin(angle) * len,
        anchor.z,
      );
      addCrackSegment(state, anchor, end);
    }
  }

  function addCrackHit(state) {
    if (!state?.group) return;
    const verts = getLetterFrontCapVertices(state);
    if (verts.length === 0) return;
    const clusterCount = Math.min(20, 6 + Math.floor(state.hitCount / 2));

    // bbox를 격자로 나눠 각 셀에서 앵커 선택 → 글자 전체에 골고루 퍼짐
    const box = new THREE.Box3();
    for (const v of verts) box.expandByPoint(v);
    const sx = box.max.x - box.min.x || 1;
    const sy = box.max.y - box.min.y || 1;
    const cols = Math.ceil(Math.sqrt(clusterCount));
    const rows = Math.ceil(clusterCount / cols);

    for (let ci = 0; ci < clusterCount; ci++) {
      const col = ci % cols;
      const row = Math.floor(ci / cols);
      const xMin = box.min.x + (col / cols) * sx;
      const xMax = box.min.x + ((col + 1) / cols) * sx;
      const yMin = box.min.y + (row / rows) * sy;
      const yMax = box.min.y + ((row + 1) / rows) * sy;
      const cellVerts = verts.filter(
        (v) => v.x >= xMin && v.x < xMax && v.y >= yMin && v.y < yMax,
      );
      const anchor =
        cellVerts.length > 0
          ? cellVerts[Math.floor(Math.random() * cellVerts.length)]
          : verts[Math.floor(Math.random() * verts.length)];
      addCrackCluster(state, anchor);
    }
  }

  function pulseLetterScale(state) {
    if (!state?.group) return;
    const g = state.group;
    state.pulseTween?.kill();
    g.scale.set(1, 1, 1);
    state.pulseTween = gsap
      .timeline({ onComplete: () => g.scale.set(1, 1, 1) })
      .to(g.scale, {
        x: 0.88,
        y: 0.88,
        z: 0.88,
        duration: 0.05,
        ease: "power3.out",
      })
      .to(g.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.28,
        ease: "elastic.out(1.2, 0.35)",
      });
    onCameraShake?.(0.12);
  }

  function getHitTarget() {
    const origin = getHitOrigin();
    _hitOriginScratch.copy(origin);
    let best = null;
    let bestDist = HIT_RANGE;
    if (letterState?.landed && letterState.hitCount < HITS_TO_DESTROY) {
      const d = xzDistanceToObject(letterState.group, _hitOriginScratch);
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
      if (fragments[i].age >= FRAGMENT_FADE_START) continue;
      const d = xzDistanceToObject(fragments[i].group, _hitOriginScratch);
      if (d < bestDist) {
        bestDist = d;
        best = { type: "fragment", index: i, groundY: fragments[i].groundY };
      }
    }
    return best;
  }

  function applyHitEffect(target) {
    const scene = getScene();
    if (!scene || !target) return;

    const sourceObject =
      target.type === "fragment"
        ? fragments[target.index]?.group
        : target.group;
    const mat = cloneFragmentMaterial(sourceObject);

    if (target.type === "fragment") {
      const fragIdx = target.index;
      if (fragIdx >= fragments.length) return;
      const frag = fragments[fragIdx];
      const mesh = frag.group;
      const tris = collectTrianglesFromGroup(mesh);
      if (tris.length === 0) return;
      const { remaining, fragments: fragTriangles } =
        partitionTrianglesOneSlice(tris, mesh, FRACTION_PER_HIT);
      releaseFragment(frag);
      fragments.splice(fragIdx, 1);
      const splitFragTriangles = fragTriangles.flatMap((tris) =>
        splitTrianglesIntoPieces(tris, 3),
      );
      createFragmentMeshes(splitFragTriangles, mat, target.groundY);
      if (remaining.length > 0) {
        const fragCenter = new THREE.Vector3(0, 0, 0);
        for (const tri of remaining) {
          fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
        }
        fragCenter.multiplyScalar(1 / (remaining.length * 3));
        const geom = trianglesToGeometry(remaining, fragCenter);
        if (geom) {
          const slot = allocFragment(geom, mat);
          const rmul = FRAGMENT_BURST_IMPULSE_MUL;
          slot.group.position.copy(fragCenter);
          slot.velocity.set(
            (Math.random() - 0.5) * 5 * rmul,
            (Math.random() * 1.5 + 2.5) * rmul,
            (Math.random() - 0.5) * 5 * rmul,
          );
          slot.angularVelocity.set(
            (Math.random() - 0.5) * 3 * rmul,
            (Math.random() - 0.5) * 3 * rmul,
            (Math.random() - 0.5) * 3 * rmul,
          );
          scene.add(slot.group);
          fragments.push({
            group: slot.group,
            velocity: slot.velocity,
            angularVelocity: slot.angularVelocity,
            age: 0,
            groundY: target.groundY,
            flowerSpawned: false,
          });
        }
      }
      return;
    }

    if (!letterState || letterState.hitCount >= HITS_TO_DESTROY) return;

    if (letterState.hitCount < CRACK_HITS_BEFORE_SHATTER) {
      addCrackHit(letterState);
      pulseLetterScale(letterState);
      playRandomCrackSound();
      letterState.hitCount += 1;
      return;
    }

    const group = target.group;
    const triangles = collectTrianglesFromGroup(group);
    if (triangles.length === 0) return;
    const shatterPieces = splitTrianglesIntoPieces(
      triangles,
      FINAL_SHATTER_PIECE_COUNT,
    );
    createFragmentMeshes(shatterPieces, mat, target.groundY);
    playCrackFinalSound();
    removeLetterCollider();
    scene.remove(group);
    disposeHandwritingSvgPlaneGroup(group);
    letterState.pulseTween?.kill();
    letterState = null;
    onShatter();
  }

  return {
    loadFromSvgUrl,
    loadLatestFromSupabase,
    resetFall,
    update(delta, camera) {
      updateLetter(delta, camera);
      updateFragments(delta);
      updateStandaloneFlowers(delta);
    },
    getHitTarget,
    applyHitEffect,
    isLetterLanded: () => Boolean(letterState?.landed),
    getLetterGroup: () =>
      /** @type {import("three").Object3D | null} */ (
        letterState?.group ?? null
      ),
    resetPlayState() {
      flowerMagicPlayed = false;
      spawnedFlowerXZ.length = 0;
    },
    cleanup(scene) {
      removeAllLetterGroupsFromScene(scene);
      standaloneFlowers.forEach((s) => disposeStandaloneFlowerGroup(s.group));
      standaloneFlowers.length = 0;
      fragments.forEach((f) => releaseFragment(f));
      fragments.length = 0;
      fragmentPool.forEach((slot) => {
        if (slot.group.geometry) slot.group.geometry.dispose();
        if (slot.group.material) slot.group.material.dispose();
      });
      fragmentPool.length = 0;
      pendingSvgUrlToLoad = null;
      pendingSvgUrlDebugId = null;
      letterLoadInProgress = false;
      flowerMagicPlayed = false;
      spawnedFlowerXZ.length = 0;
    },
  };
}
