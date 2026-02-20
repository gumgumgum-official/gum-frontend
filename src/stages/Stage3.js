/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * - 최신 handwriting 1개가 2배 크기로 낙하
 * - 엔터키로 타격 시 ~5조각 부서짐(튕김/회전), 8번 치면 사라짐. 조각은 3초 후 페이드아웃
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";
import { inspectModel, inspectGLTF } from "../utils/common/modelInspector.js";
import { loadSVGShapes } from "../lib/svg-loader.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files";

/** Stage2 대비 2배 크기 (Stage2: 0.006*0.75 = 0.0045 → 2x = 0.009) */
const STAGE3_LETTER_SCALE = 0.006 * 0.75 * 2;
const STAGE3_SPAWN_HEIGHT = 5;
const STAGE3_GRAVITY = -22 * 0.15;
const STAGE3_INITIAL_VY = -6 * 0.15;
const TILT_DEGREES = 32;
const HITS_TO_DESTROY = 8;
/** 한 번 타격 시 잘려 나가는 비율 (1/8 → 8번에 걸쳐 부서짐) */
const FRACTION_PER_HIT = 1 / 8;
const FRAGMENT_GRAVITY_MUL = 2.8; // 조각은 중력 더 강하게
const FRAGMENT_BOUNCE_RESTITUTION = 0.35;
const FRAGMENT_GROUND_FRICTION = 0.82;
const FRAGMENT_FADE_START = 3; // 땅에 떨어진 뒤 3초 뒤부터
const FRAGMENT_FADE_END = 5;

export function Stage3() {
  const objects = [];
  const config = STAGE3_CONFIG;
  const glbLoader = getGLBLoader();
  let debugControls = null;
  let backgroundModelMaxY = 0;
  let backgroundBounds = null;
  let ilbuniModel = null;
  let ilbuniYPosition = 0;
  let sceneRef = null;
  let cameraRef = null;
  /** 배경 로드 시 저장. 0키로 재낙하 시 사용 */
  let stage3GroundY = 0;

  // 낙하 글자 1개 (최신 것만)
  let letterState = null; // { group, velocity: { y }, gravity, groundY, landed, hitCount }
  const fragments = []; // { group, velocity, angularVelocity, age } — 조각은 글자 메시 클론

  // 키보드 입력 상태
  const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  };

  const handleKeyDown = (event) => {
    if (event.key in keys) {
      keys[event.key] = true;
      event.preventDefault();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onEnterHit();
    }
    if (event.key === "0" || event.code === "Digit0") {
      event.preventDefault();
      resetLetterFall();
    }
  };

  const handleKeyUp = (event) => {
    if (event.key in keys) {
      keys[event.key] = false;
      event.preventDefault();
    }
  };

  /** 최신 handwriting 메타데이터 1개 반환 (없으면 null) */
  async function getLatestHandwritingMetadata() {
    if (!supabase) return null;
    const sessionId = getSessionId();
    let list = [];
    for (const folder of [sessionId, sessionId + "/"]) {
      const { data: files, error } = await supabase.storage
        .from(HANDWRITING_BUCKET)
        .list(folder.replace(/\/$/, ""), { limit: 500 });
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
    }
    if (list.length === 0) return null;
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

  function setReadableRotationTowardCamera(group, camera, groundY) {
    const dir = new THREE.Vector3(
      camera.position.x - group.position.x,
      camera.position.y - groundY,
      camera.position.z - group.position.z,
    );
    if (dir.length() < 1e-6) return;
    dir.normalize();
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    group.rotateX(-(TILT_DEGREES * Math.PI) / 180);
  }

  async function loadLatestLetter(scene, camera, groundY) {
    const metadata = await getLatestHandwritingMetadata();
    if (!metadata?.url) {
      console.log("[Stage3] 표시할 handwriting 없음");
      return;
    }
    try {
      const shapes = await loadSVGShapes(metadata.url);
      if (shapes.length === 0) return;
      const group = new THREE.Group();
      const extrudeSettings = {
        depth: 0.05,
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
        mesh.scale.set(STAGE3_LETTER_SCALE, STAGE3_LETTER_SCALE, 1);
        group.add(mesh);
        meshes.push(mesh);
      });
      centerGroupGeometries(meshes);
      const startY = groundY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      group.position.set(0, startY, 0);
      group.rotation.set(-Math.PI / 2, 0, 0);
      scene.add(group);
      const speedFactor = 0.25 + Math.random() * 0.75;
      letterState = {
        group,
        velocity: {
          y: (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor,
        },
        gravity: STAGE3_GRAVITY * speedFactor,
        groundY,
        landed: false,
        hitCount: 0,
      };
      console.log("[Stage3] 최신 글자 1개 낙하 시작 (2배 크기)");
    } catch (e) {
      console.warn("[Stage3] 글자 로드 실패:", e);
    }
  }

  /** 0키: 글자 다시 떨어뜨리기 (디버깅용). 이미 없으면 최신 글자 재로드 후 낙하 */
  function resetLetterFall() {
    if (letterState) {
      const s = letterState;
      const speedFactor = 0.25 + Math.random() * 0.75;
      s.group.position.y = s.groundY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      s.group.position.x = 0;
      s.group.position.z = 0;
      s.velocity.y = (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;
      s.gravity = STAGE3_GRAVITY * speedFactor;
      s.landed = false;
      s.hitCount = 0;
      console.log("[Stage3] 0키: 글자 재낙하");
      return;
    }
    if (sceneRef && cameraRef && stage3GroundY > 0) {
      loadLatestLetter(sceneRef, cameraRef, stage3GroundY);
      console.log("[Stage3] 0키: 글자 없음 → 최신 글자 로드 후 낙하");
    }
  }

  function updateLetter(delta, camera) {
    if (!letterState || letterState.landed) return;
    const s = letterState;
    const nextY = s.group.position.y + s.velocity.y * delta;
    if (nextY <= s.groundY) {
      s.group.position.y = s.groundY;
      s.velocity.y = 0;
      setReadableRotationTowardCamera(s.group, camera, s.groundY);
      s.landed = true;
      return;
    }
    s.velocity.y += s.gravity * delta;
    s.group.position.y = nextY;
  }

  const _v3 = new THREE.Vector3();
  const _v3b = new THREE.Vector3();
  const _v3c = new THREE.Vector3();
  const _normal = new THREE.Vector3();

  /** 그룹 내 모든 메시에서 월드 공간 삼각형 수집 */
  function collectTrianglesFromGroup(group) {
    group.updateMatrixWorld(true);
    const triangles = [];
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
          triangles.push({ p0, p1, p2, n0, n1, n2 });
        } else {
          triangles.push({
            p0,
            p1,
            p2,
            n0: new THREE.Vector3(0, 1, 0),
            n1: new THREE.Vector3(0, 1, 0),
            n2: new THREE.Vector3(0, 1, 0),
          });
        }
      };
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

  /** 한 번 타격 시 글자 전체의 fraction(1/8)만 잘려 나가도록 — 평면에 가까운 슬라이스 */
  function partitionTrianglesOneSlice(triangles, centerWorld, fraction) {
    const n = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();
    const d = -n.dot(centerWorld);
    const _centroid = new THREE.Vector3();
    const withDist = [];
    for (const tri of triangles) {
      _centroid
        .set(0, 0, 0)
        .add(tri.p0)
        .add(tri.p1)
        .add(tri.p2)
        .multiplyScalar(1 / 3);
      const dist = _centroid.dot(n) + d;
      withDist.push({ tri, absDist: Math.abs(dist) });
    }
    withDist.sort((a, b) => a.absDist - b.absDist);
    const takeCount = Math.max(
      1,
      Math.min(Math.ceil(triangles.length * fraction), triangles.length),
    );
    const toFly = withDist.slice(0, takeCount).map((x) => x.tri);
    const remaining = withDist.slice(takeCount).map((x) => x.tri);
    if (toFly.length === 0) return { remaining, fragments: [] };
    return { remaining, fragments: [toFly] };
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

  /** 그룹의 월드 중심 (자식 메시 기준) */
  function getGroupWorldCenter(group) {
    const c = new THREE.Vector3(0, 0, 0);
    let n = 0;
    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      child.updateMatrixWorld(true);
      const pos = child.geometry.getAttribute("position");
      if (!pos) return;
      const index = child.geometry.getIndex();
      const matrix = child.matrixWorld;
      _v3.set(0, 0, 0);
      const count = index ? index.count : pos.count;
      for (let i = 0; i < count; i++) {
        const j = index ? index.getX(i) : i;
        _v3b.fromBufferAttribute(pos, j).applyMatrix4(matrix);
        _v3.add(_v3b);
      }
      n += count;
      c.add(_v3);
    });
    if (n > 0) c.multiplyScalar(1 / n);
    return c;
  }

  function onEnterHit() {
    if (
      !letterState ||
      !letterState.landed ||
      letterState.hitCount >= HITS_TO_DESTROY
    )
      return;
    if (!sceneRef) return;

    const group = letterState.group;
    const centerWorld = getGroupWorldCenter(group);
    const triangles = collectTrianglesFromGroup(group);
    if (triangles.length === 0) return;

    const { remaining, fragments: fragTriangles } = partitionTrianglesOneSlice(
      triangles,
      centerWorld,
      FRACTION_PER_HIT,
    );

    const letterMaterial = group.children.find(
      (c) => c.isMesh && c.material,
    )?.material;
    const mat = letterMaterial
      ? letterMaterial.clone()
      : new THREE.MeshStandardMaterial({
          color: 0x2e2e2e,
          metalness: 0.1,
          roughness: 0.8,
        });
    if (!mat.transparent) {
      mat.transparent = true;
      mat.opacity = 1;
    }

    const groundY = letterState.groundY;
    for (let i = 0; i < fragTriangles.length; i++) {
      const triList = fragTriangles[i];
      if (triList.length === 0) continue;
      const fragCenter = new THREE.Vector3(0, 0, 0);
      for (const tri of triList) {
        fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
      }
      fragCenter.multiplyScalar(1 / (triList.length * 3));
      const geom = trianglesToGeometry(triList, fragCenter);
      if (!geom) continue;
      const mesh = new THREE.Mesh(geom, mat.clone());
      mesh.position.copy(fragCenter);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.2 + 0.6,
        (Math.random() - 0.5) * 2,
      );
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
      );
      sceneRef.add(mesh);
      fragments.push({
        group: mesh,
        velocity,
        angularVelocity,
        age: 0,
        groundY,
      });
    }

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
      const n0 = tri.n0.clone().transformDirection(invWorld);
      const n1 = tri.n1.clone().transformDirection(invWorld);
      const n2 = tri.n2.clone().transformDirection(invWorld);
      tri.n0 = n0;
      tri.n1 = n1;
      tri.n2 = n2;
    }
    const remainingGeom = trianglesToGeometry(
      remaining,
      new THREE.Vector3(0, 0, 0),
    );
    if (!remainingGeom) {
      letterState = null;
      return;
    }
    const remainingMesh = new THREE.Mesh(remainingGeom, mat.clone());
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
        sceneRef.remove(f.group);
        if (f.group.geometry) f.group.geometry.dispose();
        if (f.group.material) f.group.material.dispose();
        fragments.splice(i, 1);
      }
    }
  }

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;
      sceneRef = scene;
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

      // 키보드 이벤트 리스너 등록
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [], // Stage3에는 props 없음
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
        },
      });

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;

          // 먼저 위치 설정
          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );

          // 변환 행렬 업데이트
          model.updateMatrixWorld(true);

          // 위치 적용 후 바운딩 박스 재계산
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());

          // island 객체 찾기 (children[1])
          const islandObject =
            model.children.find((child) => child.name === "island") ||
            model.children[1];

          if (islandObject) {
            // island 객체의 바운딩 박스 계산 (캐릭터 이동 범위 제한용)
            islandObject.updateMatrixWorld(true);
            backgroundBounds = new THREE.Box3().setFromObject(islandObject);

            console.log(
              `🏝️ Island 바운딩 박스: min=(${backgroundBounds.min.x.toFixed(2)}, ${backgroundBounds.min.y.toFixed(2)}, ${backgroundBounds.min.z.toFixed(2)}), max=(${backgroundBounds.max.x.toFixed(2)}, ${backgroundBounds.max.y.toFixed(2)}, ${backgroundBounds.max.z.toFixed(2)})`,
            );
          } else {
            // island를 찾을 수 없으면 전체 모델의 바운딩 박스 사용
            console.warn(
              "⚠️ Island 객체를 찾을 수 없습니다. 전체 모델의 바운딩 박스를 사용합니다.",
            );
            backgroundBounds = box.clone();
          }

          // 배경 모델의 최대 y값 계산 (위치 적용 후)
          // 모든 메시를 순회하여 실제 최대 y값 찾기
          let actualMaxY = box.max.y;
          model.traverse((child) => {
            if (child.isMesh && child.geometry) {
              const meshBox = new THREE.Box3().setFromObject(child);
              if (meshBox.max.y > actualMaxY) {
                actualMaxY = meshBox.max.y;
              }
            }
          });

          backgroundModelMaxY = actualMaxY;

          console.log(
            `📐 배경 모델 바운딩 박스: min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}), max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}), actualMaxY=${actualMaxY.toFixed(2)}, center=${center.y.toFixed(2)}`,
          );

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
              child.raycast = () => {}; // 배경은 클릭 제외
            }
          });

          objects.push(model);
          scene.add(model);
          debugControls.setOrbitTarget(center);
          console.log("✅ Stage3 배경 모델 로드 완료");

          cameraRef = this.camera;
          stage3GroundY = actualMaxY;
          loadLatestLetter(scene, this.camera, actualMaxY);

          inspectModel(model, null, "배경 모델");

          // 배경 모델 로드 완료 후 ilbuni 로드
          glbLoader.load("/models/stage3/ilbuni.glb", {
            onLoad: (gltf) => {
              ilbuniModel = gltf.scene;

              // ilbuni 모델의 바운딩 박스 계산
              const ilbuniBox = new THREE.Box3().setFromObject(ilbuniModel);
              const ilbuniMinY = ilbuniBox.min.y;

              // 배경 모델 위에 서도록 y 위치 설정
              // ilbuni의 최하단(발)이 배경 모델의 최상단에 닿도록
              const { groundOffset } = config.ilbuni;
              ilbuniYPosition = backgroundModelMaxY - ilbuniMinY + groundOffset;

              ilbuniModel.position.set(0, ilbuniYPosition, 0);

              ilbuniModel.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });

              objects.push(ilbuniModel);
              scene.add(ilbuniModel);
              console.log(
                `✅ Stage3 ilbuni 모델 로드 완료 (y: ${ilbuniYPosition.toFixed(2)})`,
              );

              // ilbuni 모델 구조 확인
              inspectGLTF(gltf, "ilbuni 모델");
            },
            onProgress: (xhr) => {
              if (xhr.total > 0) {
                console.log(
                  `Stage3 ilbuni: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
                );
              }
            },
            onError: (err) => console.error("❌ Stage3 ilbuni 로드 에러:", err),
          });
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage3 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage3 배경 로드 에러:", err),
      });

      console.log("✅ Stage3 생성 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      updateLetter(delta, this.camera);
      updateFragments(delta);

      // ilbuni 캐릭터 이동 처리: 로드 순서와 관계없이 ilbuni와 배경 바운드가 모두 준비된 경우에만 실행
      if (ilbuniModel && backgroundBounds) {
        const {
          moveSpeed,
          boundsPadding,
          cameraOffset: camOffset,
          cameraLerpFactor,
          lookAtHeightOffset,
        } = config.ilbuni;
        const moveVector = new THREE.Vector3();

        // 방향키 입력에 따른 이동 벡터 계산
        if (keys.ArrowUp) moveVector.z -= 1;
        if (keys.ArrowDown) moveVector.z += 1;
        if (keys.ArrowLeft) moveVector.x -= 1;
        if (keys.ArrowRight) moveVector.x += 1;

        // 정규화하여 대각선 이동 시 속도 일정하게 유지
        if (moveVector.length() > 0) {
          moveVector.normalize();
          moveVector.multiplyScalar(moveSpeed * delta);

          // y 위치는 유지하고 x, z만 이동
          let newX = ilbuniModel.position.x + moveVector.x;
          let newZ = ilbuniModel.position.z + moveVector.z;

          // 배경 모델의 바운딩 박스 범위 내로 제한 (backgroundBounds는 위 조건으로 항상 유효)
          newX = THREE.MathUtils.clamp(
            newX,
            backgroundBounds.min.x + boundsPadding,
            backgroundBounds.max.x - boundsPadding,
          );
          newZ = THREE.MathUtils.clamp(
            newZ,
            backgroundBounds.min.z + boundsPadding,
            backgroundBounds.max.z - boundsPadding,
          );

          ilbuniModel.position.x = newX;
          ilbuniModel.position.z = newZ;
          ilbuniModel.position.y = ilbuniYPosition; // y 위치 고정

          // 이동 방향에 따라 캐릭터 회전
          if (moveVector.length() > 0.01) {
            const angle = Math.atan2(moveVector.x, moveVector.z);
            ilbuniModel.rotation.y = angle;
          }
        }

        // 카메라가 캐릭터를 따라가도록 설정
        const cameraOffset = new THREE.Vector3(
          camOffset.x,
          camOffset.y,
          camOffset.z,
        );
        const targetPosition = ilbuniModel.position.clone().add(cameraOffset);

        this.camera.position.lerp(targetPosition, cameraLerpFactor);

        const lookAtPosition = ilbuniModel.position.clone();
        lookAtPosition.y += lookAtHeightOffset;
        this.camera.lookAt(lookAtPosition);
      }
    },

    cleanup(scene) {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      if (letterState) {
        scene.remove(letterState.group);
        letterState.group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        letterState = null;
      }
      fragments.forEach((f) => {
        scene.remove(f.group);
        if (f.group.geometry) f.group.geometry.dispose();
        if (f.group.material) f.group.material.dispose();
      });
      fragments.length = 0;

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
      scene.background = null;
      ilbuniModel = null;
      console.log("🧹 Stage3 정리 완료");
    },
  };
}
