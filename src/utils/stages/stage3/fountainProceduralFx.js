/**
 * island15 OBJ_Fountain — 중앙 한 점에서 둥근 포물선으로 떨어지는 직선 물커튼
 */
import * as THREE from "three";

/** @type {RegExp} */
export const FOUNTAIN_MESH_NAME_RE = /^OBJ_?Fountain$/i;

const CURTAIN_SEGMENTS = 20;
const CURVE_ROWS = 28;
const FLOW_SPEED = 0.8;
/** 풀 가장자리 반경 = radiusXZ × 이 값 (클수록 포물선이 크고 둥글게) */
const OUTER_RADIUS_SCALE = 0.5;
/** 물줄기 시작 Y — 분수 메시 bbox.max.y에서 위로 올리는 비율(분수 높이 기준) */
const TOP_START_LIFT = 0.07;
/**
 * 낙하 곡선 키프레임 (t, 반경비율) — smoothstep으로 연결해 각짐 없이 부드럽게
 * 상·중간은 살짝 볼록한 언덕 형태 (원통 플래토 없음)
 */
const RADIUS_PROFILE_KEYFRAMES = [
  { t: 0, r: 0 },
  { t: 0.1, r: 0.24 },
  { t: 0.22, r: 0.26 },
  { t: 0.3, r: 0.35 },
  { t: 0.38, r: 0.5 },
  { t: 0.4, r: 0.7 },
  { t: 0.42, r: 0.8 },
  { t: 0.55, r: 1.1 },
  { t: 0.66, r: 1.3 },
  { t: 0.82, r: 1.4 },
  { t: 1, r: 1.5 },
];
/** 풀 수면 반경 = outerR × 이 값 */
const POOL_RADIUS_SCALE = 2;
/** 풀 수면 Y — bbox.min에서 올리는 비율 (보이는 받침대 높이) */
const POOL_SURFACE_FROM_MIN = 0.28;
/** 수면을 받침 메시 위로 살짝 띄움 (z-fighting 방지) */
const POOL_SURFACE_Y_EPS = 0.06;

const POOL_VERTEX = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 pos = position;
  vec2 p = uv - 0.5;
  float r = length(p) * 2.0;
  float wave =
    sin(r * 14.0 - uTime * 3.2) * 0.045 +
    sin((p.x * 1.4 + p.y) * 11.0 + uTime * 2.4) * 0.028 +
    sin(r * 22.0 + uTime * 4.0) * 0.012;
  wave *= smoothstep(1.0, 0.15, r);
  pos.y += wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const POOL_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;

  float ripple1 = sin(r * 18.0 - uTime * 3.5) * 0.5 + 0.5;
  float ripple2 = sin((p.x * 1.2 + p.y) * 14.0 + uTime * 2.6) * 0.5 + 0.5;
  float ripple3 = sin(r * 9.0 - uTime * 1.8 + p.x * 6.0) * 0.5 + 0.5;
  float ripple = ripple1 * 0.45 + ripple2 * 0.35 + ripple3 * 0.2;

  float edge = smoothstep(1.0, 0.55, r);
  vec3 deep = vec3(0.28, 0.62, 0.88);
  vec3 shallow = vec3(0.62, 0.88, 1.0);
  vec3 color = mix(deep, shallow, ripple);

  float alpha = edge * (0.38 + ripple * 0.32);
  gl_FragColor = vec4(color, alpha);
}
`;

const CURTAIN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CURTAIN_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uFlowSpeed;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  uv.y += uTime * uFlowSpeed;

  vec4 tex = texture2D(uMap, uv);

  float topSource = smoothstep(0.25, 1.0, vUv.y);
  float topFade = smoothstep(1.0, 0.88, vUv.y);
  float bottomFade = smoothstep(0.0, 0.28, vUv.y);
  float sideFade =
    smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);

  float alpha = tex.a * topSource * topFade * bottomFade * sideFade;
  vec3 color = mix(
    vec3(0.45, 0.76, 0.95),
    vec3(0.92, 0.98, 1.0),
    tex.r * topSource
  );
  gl_FragColor = vec4(color, alpha * 0.8);
}
`;

/**
 * @typedef {{
 *   group: import("three").Group,
 *   uniforms: { uTime: { value: number }, uFlowSpeed: { value: number }, uMap: { value: import("three").Texture } },
 *   curtainMaterial: import("three").ShaderMaterial,
 *   curtainTexture: import("three").Texture,
 *   poolMaterial: import("three").ShaderMaterial,
 * }} ProceduralFountainFx
 */

/**
 * @param {number} u
 */
function smoothstep01(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

/**
 * 낙하 진행 t(0=꼭대기, 1=풀) → 반경 비율 (키프레임 + smoothstep)
 * @param {number} t
 */
function smoothFallRadiusFraction(t) {
  const T = Math.max(0, Math.min(1, t));
  const keys = RADIUS_PROFILE_KEYFRAMES;
  if (T <= keys[0].t) return keys[0].r;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (T <= b.t) {
      const u = (T - a.t) / (b.t - a.t);
      return a.r + (b.r - a.r) * smoothstep01(u);
    }
  }
  return keys[keys.length - 1].r;
}

/**
 * 중앙 꼭짓점 → 양쪽 가장자리가 둥근 포물선을 따르는 부채꼴
 */
function createParabolicFanSegmentGeometry(
  cx,
  cz,
  outerR,
  angle0,
  angle1,
  topY,
  poolY,
) {
  const cos0 = Math.cos(angle0);
  const sin0 = Math.sin(angle0);
  const cos1 = Math.cos(angle1);
  const sin1 = Math.sin(angle1);
  const fallH = topY - poolY;
  const rows = CURVE_ROWS;

  /** @type {number[]} */
  const positions = [cx, topY, cz];
  /** @type {number[]} */
  const uvs = [0.5, 1];
  /** @type {number[]} */
  const indices = [];
  /** @type {number[]} */
  const edge0 = [];
  /** @type {number[]} */
  const edge1 = [];

  for (let row = 1; row <= rows; row++) {
    const t = row / rows;
    const y = topY - fallH * t;
    const r = outerR * smoothFallRadiusFraction(t);
    const v = 1 - t;

    edge0.push(positions.length / 3);
    positions.push(cx + cos0 * r, y, cz + sin0 * r);
    uvs.push(0, v);

    edge1.push(positions.length / 3);
    positions.push(cx + cos1 * r, y, cz + sin1 * r);
    uvs.push(1, v);
  }

  indices.push(0, edge0[0], edge1[0]);
  for (let row = 1; row < rows; row++) {
    const a0 = edge0[row - 1];
    const b0 = edge0[row];
    const a1 = edge1[row - 1];
    const b1 = edge1[row];
    indices.push(a0, a1, b1, a0, b1, b0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 직선 세로 물줄기 텍스처 (랜덤·굴곡 없음)
 * @returns {import("three").CanvasTexture}
 */
function createFallingWaterTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, 64, 256);

  const rimGrad = ctx.createLinearGradient(0, 0, 0, 36);
  rimGrad.addColorStop(0, "rgba(255,255,255,0.95)");
  rimGrad.addColorStop(1, "rgba(200,235,255,0)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, 64, 36);

  const streakCount = 9;
  const slotW = 64 / streakCount;
  for (let i = 0; i < streakCount; i++) {
    const x = i * slotW + slotW * 0.38;
    const w = 2.2;
    const streakGrad = ctx.createLinearGradient(0, 0, 0, 256);
    streakGrad.addColorStop(0, "rgba(255,255,255,0.65)");
    streakGrad.addColorStop(0.25, "rgba(220,245,255,0.45)");
    streakGrad.addColorStop(0.65, "rgba(170,215,255,0.15)");
    streakGrad.addColorStop(1, "rgba(130,195,245,0)");
    ctx.fillStyle = streakGrad;
    ctx.fillRect(x, 8, w, 248);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** @param {import("three").Object3D} obj */
function disableRaycast(obj) {
  obj.raycast = () => {};
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} poolY
 * @param {number} poolRadius
 * @param {{ uTime: { value: number } }} uniforms
 */
function createPoolMesh(cx, cz, poolY, poolRadius, uniforms) {
  const poolGeom = new THREE.CircleGeometry(poolRadius, 64);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime },
    vertexShader: POOL_VERTEX,
    fragmentShader: POOL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pool = new THREE.Mesh(poolGeom, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(cx, poolY, cz);
  pool.renderOrder = 5;
  pool.name = "Fountain_Pool";
  disableRaycast(pool);
  return { mesh: pool, material: poolMat };
}

/**
 * @param {import("three").Mesh} fountainMesh
 * @param {import("three").Object3D} modelRoot
 * @returns {ProceduralFountainFx | null}
 */
export function createProceduralFountainFx(fountainMesh, modelRoot) {
  const geom = fountainMesh.geometry;
  if (!geom) return null;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const box = geom.boundingBox;
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (size.y < 0.1) return null;

  const cx = center.x;
  const cz = center.z;
  const radiusXZ = Math.min(size.x, size.z) * 0.5;
  const poolY = box.min.y + size.y * 0.04;
  const poolSurfaceY =
    box.min.y + size.y * POOL_SURFACE_FROM_MIN + POOL_SURFACE_Y_EPS;
  const topY = box.max.y + size.y * TOP_START_LIFT;
  const outerR = radiusXZ * OUTER_RADIUS_SCALE;

  const group = new THREE.Group();
  group.name = "Fountain_WaterFX";

  const curtainTexture = createFallingWaterTexture();
  const uniforms = {
    uTime: { value: 0 },
    uFlowSpeed: { value: FLOW_SPEED },
    uMap: { value: curtainTexture },
  };

  const curtainMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CURTAIN_VERTEX,
    fragmentShader: CURTAIN_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const segmentAngle = (Math.PI * 2) / CURTAIN_SEGMENTS;
  const angleOffset = -Math.PI / 2;

  for (let i = 0; i < CURTAIN_SEGMENTS; i++) {
    const a0 = angleOffset + i * segmentAngle;
    const a1 = angleOffset + (i + 1) * segmentAngle;
    const segmentGeom = createParabolicFanSegmentGeometry(
      cx,
      cz,
      outerR,
      a0,
      a1,
      topY,
      poolY,
    );
    const segment = new THREE.Mesh(segmentGeom, curtainMaterial);
    segment.renderOrder = 4;
    segment.name = `Fountain_Curtain_${i}`;
    disableRaycast(segment);
    group.add(segment);
  }

  const poolRadius = outerR * POOL_RADIUS_SCALE;
  const { mesh: poolMesh, material: poolMaterial } = createPoolMesh(
    cx,
    cz,
    poolSurfaceY,
    poolRadius,
    uniforms,
  );
  group.add(poolMesh);

  const fxParent = fountainMesh.parent ?? modelRoot;
  fxParent.add(group);
  group.position.copy(fountainMesh.position);
  group.quaternion.copy(fountainMesh.quaternion);
  group.scale.copy(fountainMesh.scale);

  if (import.meta.env.DEV) {
    console.log("[Stage3] fountain: round arc, straight streaks", { outerR });
  }

  return { group, uniforms, curtainMaterial, curtainTexture, poolMaterial };
}

/**
 * @param {ProceduralFountainFx} fx
 * @param {number} delta
 */
export function updateProceduralFountainFx(fx, delta) {
  fx.uniforms.uTime.value += delta;
}

/**
 * @param {ProceduralFountainFx | null | undefined} fx
 */
export function disposeProceduralFountainFx(fx) {
  if (!fx) return;
  fx.group.parent?.remove(fx.group);
  fx.group.traverse((child) => {
    const mesh = /** @type {import("three").Mesh} */ (child);
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
  });
  fx.curtainMaterial.dispose();
  fx.poolMaterial.dispose();
  fx.curtainTexture.dispose();
}
