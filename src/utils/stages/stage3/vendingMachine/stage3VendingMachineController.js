/**
 * Stage3 벤딩머신 클릭 → cannon-es 물리 스폰
 */
import * as THREE from "three";
// @ts-ignore
import * as CANNON from "cannon-es";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../../common/gltfTemplateCache.js";
import { applyExtendedAudioVolume } from "../../../common/audioGain.js";
import {
  STAGE3_VENDINGMACHINE_DEBUG_BOX_ONLY,
  VENDING_MACHINE_LAND_SOUND_PATHS,
} from "../../../../config/stages/stage3/stage3VendingMachine.js";

/**
 * @param {{
 *   getScene: () => import("three").Scene | null,
 *   getGroundY: () => number,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getIsStageActive: () => boolean,
 *   getCharacterPosition: () => import("three").Vector3 | null,
 *   getCamera: () => import("three").Camera | null,
 * }} params
 */
export function createStage3VendingMachineController({
  getScene,
  getGroundY,
  getConfig,
  getIsStageActive,
  getCharacterPosition,
  getCamera,
}) {
  /** @type {import("three").Object3D | null} */
  let machineRef = null;
  const vendingMachineTemplates = [];
  /** 셔플 덱: 전체를 한 번씩 소진 후 다시 섞어 색상 편중 방지 */
  let shuffleDeck = [];
  const spawnedDrinks = [];
  let physicsWorld = null;
  let groundBody = null;
  let groundMat = null;
  let vendingMachineMat = null;

  const _machineWorld = new THREE.Vector3();
  const _spawnDir = new THREE.Vector3();
  const _machineQuat = new THREE.Quaternion();
  const _modelCenter = new THREE.Vector3();
  const _modelSize = new THREE.Vector3();

  function isDescendantOf(node, ancestor) {
    let p = node;
    while (p) {
      if (p === ancestor) return true;
      p = p.parent;
    }
    return false;
  }

  function getPhysicsGroundY() {
    const config = getConfig();
    return (
      getGroundY() + Number(config.vendingMachine?.physicsGroundYOffset ?? 0.45)
    );
  }

  function syncGroundPlane() {
    if (!groundBody) return;
    groundBody.position.set(0, getPhysicsGroundY(), 0);
  }

  function initPhysics() {
    if (physicsWorld) return;
    groundMat = new CANNON.Material("vendingMachineGround");
    vendingMachineMat = new CANNON.Material("vendingMachine");
    physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });
    groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: groundMat,
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.set(0, getPhysicsGroundY(), 0);
    physicsWorld.addBody(groundBody);
    physicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(groundMat, vendingMachineMat, {
        friction: 0.4,
        restitution: 0.25,
      }),
    );
  }

  function removeSpawnedAt(index) {
    const item = spawnedDrinks[index];
    if (!item) return;
    const scene = getScene();
    if (item.body && item.landSoundHandler) {
      item.body.removeEventListener("collide", item.landSoundHandler);
      item.landSoundHandler = undefined;
    }
    if (physicsWorld && item.body) {
      physicsWorld.removeBody(item.body);
    }
    if (scene) {
      scene.remove(item.group);
    }
    item.group.traverse((child) => {
      if (!child.isMesh) return;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const m = child.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    spawnedDrinks.splice(index, 1);
  }

  function spawnFromMachine() {
    const scene = getScene();
    const config = getConfig();
    if (!scene) return false;
    if (!machineRef && !STAGE3_VENDINGMACHINE_DEBUG_BOX_ONLY) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3VendingMachine] 머신이 아직 로드되지 않았습니다.");
      }
      return false;
    }
    const maxSpawns = config.vendingMachine?.maxSpawns ?? 10;
    if (spawnedDrinks.length >= maxSpawns) {
      if (import.meta.env.DEV) {
        console.warn(
          `[Stage3VendingMachine] 스폰 상한(${maxSpawns}) 도달 — 가장 오래된 항목 제거 후 재스폰`,
        );
      }
      removeSpawnedAt(0);
    }

    if (STAGE3_VENDINGMACHINE_DEBUG_BOX_ONLY) {
      const debugHalf = 0.45;
      const debugMesh = new THREE.Mesh(
        new THREE.BoxGeometry(debugHalf * 2, debugHalf * 2, debugHalf * 2),
        new THREE.MeshBasicMaterial({
          color: 0xff3355,
          wireframe: false,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      const charPos = getCharacterPosition();
      const camera = getCamera();
      if (charPos) {
        debugMesh.position.set(charPos.x, charPos.y + 1.4, charPos.z);
      } else if (camera) {
        camera.getWorldDirection(_spawnDir);
        debugMesh.position.copy(camera.position).addScaledVector(_spawnDir, 3);
      } else {
        debugMesh.position.set(0, getGroundY() + 1.5, 0);
      }
      debugMesh.name = "DEBUG_VendingMachineBox";
      debugMesh.renderOrder = 999;
      scene.add(debugMesh);
      spawnedDrinks.push({ group: debugMesh, body: null });
      return true;
    }

    initPhysics();
    syncGroundPlane();

    if (machineRef) {
      machineRef.updateMatrixWorld(true);
      const machineBox = new THREE.Box3().setFromObject(machineRef);
      if (!machineBox.isEmpty()) {
        machineBox.getCenter(_machineWorld);
      } else {
        machineRef.getWorldPosition(_machineWorld);
      }
    } else {
      const p = getCharacterPosition();
      if (p) {
        _machineWorld.set(p.x, Math.max(getGroundY() + 0.5, p.y), p.z);
      } else {
        _machineWorld.set(0, getGroundY() + 0.7, 0);
      }
    }

    let clone;
    /** @type {THREE.Group | null} */
    let spawnRoot = null;
    /** @type {CANNON.Vec3 | undefined} */
    let halfExtents;

    if (vendingMachineTemplates.length === 0) {
      if (import.meta.env.DEV) {
        console.warn(
          "[Stage3VendingMachine] 스폰 템플릿이 비어 있습니다. GLB 경로·preload를 확인하세요.",
        );
      }
      return false;
    }

    if (shuffleDeck.length === 0) {
      shuffleDeck = [...vendingMachineTemplates];
      for (let i = shuffleDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleDeck[i], shuffleDeck[j]] = [shuffleDeck[j], shuffleDeck[i]];
      }
    }
    const template = shuffleDeck.pop();
    clone = template.scene.clone(true);
    clone.frustumCulled = false;
    const spawnScale = config.vendingMachine?.spawnScale ?? 0.5;
    const maxVisualSize = config.vendingMachine?.maxVisualSize ?? 0.9;
    const minVisualSize = Number(config.vendingMachine?.minVisualSize ?? 0.35);
    clone.position.set(0, 0, 0);
    clone.scale.setScalar(spawnScale);
    clone.updateMatrixWorld(true);
    clone.traverse((child) => {
      if (!child.isMesh) return;
      child.visible = true;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(clone);
    box.getSize(_modelSize);
    const maxDim = Math.max(_modelSize.x, _modelSize.y, _modelSize.z);
    if (maxDim > 1e-6 && (maxDim > maxVisualSize || maxDim < minVisualSize)) {
      const target =
        maxDim > maxVisualSize
          ? maxVisualSize
          : Math.max(minVisualSize, maxDim);
      const fit = target / maxDim;
      clone.scale.multiplyScalar(fit);
      clone.updateMatrixWorld(true);
      box.setFromObject(clone);
      box.getSize(_modelSize);
    }
    box.getCenter(_modelCenter);
    clone.position.sub(_modelCenter);
    clone.updateMatrixWorld(true);
    spawnRoot = new THREE.Group();
    spawnRoot.name = "SpawnedVendingMachineDrinkRoot";
    spawnRoot.add(clone);

    // 머신의 월드 쿼터니언으로 앞면 방향을 고정 (캐릭터/카메라 위치와 무관)
    _spawnDir.set(0, 0, 1);
    if (machineRef) {
      _spawnDir.applyQuaternion(machineRef.getWorldQuaternion(_machineQuat));
    }
    _spawnDir.y = 0;
    if (_spawnDir.lengthSq() < 1e-6) _spawnDir.set(0, 0, 1);
    _spawnDir.normalize();
    const facingDirX = _spawnDir.x;
    const facingDirZ = _spawnDir.z;

    const r = Number(config.vendingMachine?.spawnRadiusMin ?? 0.4);
    // right = facingDir 시계방향 90도 (머신 기준 오른쪽)
    const rightDirX = facingDirZ;
    const rightDirZ = -facingDirX;
    const lateralOffset = Number(
      config.vendingMachine?.spawnLateralOffset ?? 0,
    );
    const sx = _machineWorld.x + facingDirX * r + rightDirX * lateralOffset;
    const sz = _machineWorld.z + facingDirZ * r + rightDirZ * lateralOffset;

    const floorY = getPhysicsGroundY();
    const baseY = Math.max(
      floorY + 0.35,
      _machineWorld.y +
        (config.vendingMachine?.spawnHeightAboveMachine ?? -0.3),
    );
    const sy = baseY;

    _spawnDir.set(facingDirX, 0, facingDirZ);
    if (_spawnDir.lengthSq() < 1e-6) {
      _spawnDir.set(0, 0, 1);
    }
    _spawnDir.normalize();
    const spreadRad = Number(
      config.vendingMachine?.launchTowardPlayerSpread ?? 0.28,
    );
    if (spreadRad > 0) {
      const jitter = (Math.random() * 2 - 1) * spreadRad;
      const c = Math.cos(jitter);
      const s = Math.sin(jitter);
      const x = _spawnDir.x;
      const z = _spawnDir.z;
      _spawnDir.set(x * c - z * s, 0, x * s + z * c);
      _spawnDir.normalize();
    }

    /** @type {THREE.Object3D} */
    let groupForScene = clone;
    if (spawnRoot) {
      spawnRoot.position.set(sx, sy, sz);
      spawnRoot.updateMatrixWorld(true);
      groupForScene = spawnRoot;
    } else {
      clone.position.set(sx, sy, sz);
      clone.updateMatrixWorld(true);
    }

    if (!halfExtents) {
      const bounds = new THREE.Box3().setFromObject(groupForScene);
      bounds.getSize(_modelSize);
      const minHalf = 0.08;
      halfExtents = new CANNON.Vec3(
        Math.max(_modelSize.x * 0.5, minHalf),
        Math.max(_modelSize.y * 0.5, minHalf),
        Math.max(_modelSize.z * 0.5, minHalf),
      );
    }
    const boxShape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: 0.3,
      shape: boxShape,
      position: new CANNON.Vec3(sx, sy, sz),
      material: vendingMachineMat,
      linearDamping: 0.1,
      angularDamping: 0.3,
    });
    const vHoriz =
      Number(config.vendingMachine?.launchHorizontalMin ?? 3.1) +
      Math.random() *
        Number(config.vendingMachine?.launchHorizontalSpread ?? 1.6);
    const vUp =
      Number(config.vendingMachine?.launchUpMin ?? 5.6) +
      Math.random() * Number(config.vendingMachine?.launchUpSpread ?? 3.2);
    body.velocity.set(_spawnDir.x * vHoriz, vUp, _spawnDir.z * vHoriz);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );

    physicsWorld.addBody(body);
    scene.add(groupForScene);
    const drinkEntry = { group: groupForScene, body };
    const landHandler = (e) => {
      if (drinkEntry.landSoundPlayed) return;
      if (e.body !== groundBody) return;
      drinkEntry.landSoundPlayed = true;
      if (VENDING_MACHINE_LAND_SOUND_PATHS.length === 0) return;
      const path =
        VENDING_MACHINE_LAND_SOUND_PATHS[
          Math.floor(Math.random() * VENDING_MACHINE_LAND_SOUND_PATHS.length)
        ];
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const landAudio = new window.Audio();
      const v = Number(config.vendingMachine?.landSoundVolume ?? 0.22);
      applyExtendedAudioVolume(landAudio, v);
      landAudio.src = base + path;
      landAudio.play().catch(() => {});
    };
    drinkEntry.landSoundHandler = landHandler;
    drinkEntry.landSoundPlayed = false;
    body.addEventListener("collide", landHandler);
    spawnedDrinks.push(drinkEntry);
    return true;
  }

  return {
    setMachineRef(obj) {
      machineRef = obj;
    },
    clearMachineRef() {
      machineRef = null;
    },
    getMachineRef: () => machineRef,
    hasTemplates: () => vendingMachineTemplates.length > 0,
    isMachineHit(hitObject) {
      return Boolean(machineRef && isDescendantOf(hitObject, machineRef));
    },
    warnMachineNotFound(intRootNames) {
      if (machineRef || !import.meta.env.DEV) return;
      const rootsMsg =
        intRootNames.length > 0
          ? [...new Set(intRootNames)].join(", ")
          : "(없음)";
      console.warn(
        `[Stage3VendingMachine] 머신 ref를 찾지 못했습니다. INT_ 노드: ${rootsMsg}`,
      );
    },
    async preloadTemplates() {
      const config = getConfig();
      const paths = config.vendingMachine?.spawnPaths;
      if (!paths || paths.length === 0) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3VendingMachine] vendingMachine.spawnPaths 없음 — 스폰 비활성",
          );
        }
        return;
      }
      const loads = paths.map(async (rel) => {
        const url = rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel);
        try {
          return await loadGltfTemplateCached(url);
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn(
              `[Stage3VendingMachine] 템플릿 로드 실패 (${rel}):`,
              e ?? "",
            );
          }
          return null;
        }
      });
      const results = await Promise.all(loads);
      if (!getIsStageActive()) return;
      for (const g of results) {
        if (g?.scene) vendingMachineTemplates.push({ scene: g.scene });
      }
    },
    spawnFromMachine,
    update(delta) {
      if (!physicsWorld) return;
      const config = getConfig();
      const substeps = config.vendingMachine?.physicsSubsteps ?? 2;
      physicsWorld.step(1 / 60, delta, substeps);
      for (let i = 0; i < spawnedDrinks.length; i++) {
        const s = spawnedDrinks[i];
        if (!s.body) continue;
        s.group.position.copy(s.body.position);
        s.group.quaternion.copy(s.body.quaternion);
      }
    },
    cleanup(scene) {
      for (let i = spawnedDrinks.length - 1; i >= 0; i--) {
        const s = spawnedDrinks[i];
        if (s.body && s.landSoundHandler) {
          s.body.removeEventListener("collide", s.landSoundHandler);
          s.landSoundHandler = undefined;
        }
        if (physicsWorld && s.body) {
          physicsWorld.removeBody(s.body);
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
      }
      spawnedDrinks.length = 0;
      if (physicsWorld && groundBody) {
        physicsWorld.removeBody(groundBody);
        groundBody = null;
      }
      physicsWorld = null;
      groundMat = null;
      vendingMachineMat = null;
      machineRef = null;
      vendingMachineTemplates.length = 0;
      shuffleDeck.length = 0;
    },
  };
}
