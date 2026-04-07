/**
 * Stage3 `Portal_Vortex` 메시용 소용돌이 ShaderMaterial (simplex noise 내장).
 */
import * as THREE from "three";

/** GLSL 3D simplex noise (Ashima / MIT-style, fragment용) */
const SIMPLEX_NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const PORTAL_VORTEX_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vLocalPos;
void main() {
  vUv = uv;
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PORTAL_VORTEX_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uPosScale;
uniform float uUseXZPlane;
varying vec2 vUv;
varying vec3 vLocalPos;

${SIMPLEX_NOISE_GLSL}

void main() {
  const float timeScale = 1.5;
  float t = uTime * timeScale;

  const float rotationSpeed = 0.13;
  const float wobbleSpeed = 0.032;
  const float wobbleAmp = 0.028;
  // 레퍼런스1: 감김이 과하면 촘촘해 보임 → 완만하게
  const float swirlTightness = 5.6;
  // 팔은 거의 보이지 않는 "마스크" 역할만 → 개수도 줄여 간격 확보
  const float armCount = 3.0;
  const float glowStrength = 0.98;

  // 레퍼런스1: 거의 블랙에 가까운 딥 네이비 + 띠만 중간 톤 네이비~시안
  const vec3 colBg0 = vec3(0.005, 0.01, 0.03);
  const vec3 colBg1 = vec3(0.01, 0.02, 0.06);
  const vec3 colDeep = vec3(0.02, 0.05, 0.14);
  const vec3 colDust = vec3(0.06, 0.16, 0.34);
  const vec3 colCyan = vec3(0.12, 0.32, 0.62);
  const vec3 colHighlight = vec3(0.86, 0.92, 1.0);
  const vec3 colPurple = vec3(0.46, 0.26, 0.62);

  // UV 없음/전부 동일(0,0)이면 vUv가 면 전체에서 상수 → dist·알파 붕괴 → 완전 투명
  float uvDeriv = abs(dFdx(vUv.x)) + abs(dFdy(vUv.x)) + abs(dFdx(vUv.y)) + abs(dFdy(vUv.y));
  float useUv = step(1e-5, uvDeriv);
  vec2 uvFromPos = mix(vLocalPos.xy, vLocalPos.xz, uUseXZPlane) * uPosScale;
  vec2 uv = mix(uvFromPos, vUv - 0.5, useUv);
  float wobX = snoise(vec3(uv * 2.4, t * wobbleSpeed)) * wobbleAmp;
  float wobY = snoise(vec3(uv * 2.4 + vec2(31.7, 12.3), t * wobbleSpeed)) * wobbleAmp;
  uv += vec2(wobX, wobY);

  float dist = length(uv);
  if (dist < 1e-5) {
    uv = vec2(1e-5, 0.0);
    dist = length(uv);
  }
  float angle = atan(uv.y, uv.x);
  float swirlAngle = angle + dist * swirlTightness - t * rotationSpeed;

  // 소용돌이 래핑을 약하게(띠가 촘촘해 보이지 않게)
  vec2 polarWide = vec2(dist * 1.4, swirlAngle * 1.1);
  float dustBand = snoise(vec3(polarWide * 2.35 + vec2(0.0, t * 0.014), t * 0.02));
  dustBand = dustBand * 0.5 + 0.5;

  vec2 polar = vec2(dist * 1.85, swirlAngle * 1.35);
  float n1 = snoise(vec3(polar * 3.6, t * 0.022)) * 0.6;
  float n2 = snoise(vec3(polar * 7.2 + vec2(6.1, 3.4), t * 0.022 + 1.4)) * 0.3;
  float n3 = snoise(vec3(polar * 14.0 + vec2(2.0, 11.0), t * 0.022 + 2.6)) * 0.1;
  float fbm = n1 + n2 + n3;

  // 성운 디스크(면 전체): 나선과 별개로 부드러운 가스층 — 레퍼런스의 “볼륨/면” 복구
  float nCloudA = snoise(vec3(uv * 2.9, t * 0.015)) * 0.5 + 0.5;
  float nCloudB = snoise(vec3(uv * 6.8 + vec2(22.0, 11.0), t * 0.013)) * 0.5 + 0.5;
  float nCloudC = snoise(vec3(uv * 1.25 + vec2(40.0, 0.0), t * 0.011)) * 0.5 + 0.5;
  float nebulaCloud =
    clamp(nCloudA * 0.5 + nCloudB * 0.34 + nCloudC * 0.28, 0.0, 1.0);
  // 가장자리 비네팅 + 약한 구름 덩어리
  float vignette = 1.0 - smoothstep(0.35, 0.92, dist);
  nebulaCloud = smoothstep(0.15, 0.98, nebulaCloud) * vignette;

  // 은하수형: 나선 골격은 강하게, FBM은 질감만 살짝 (흐물거림·롤리팝 완화)
  float spinePhase = armCount * swirlAngle + dist * 2.6;
  float armPhase = spinePhase + fbm * 0.42;
  float armWave = cos(armPhase);
  float armSoft = armWave * 0.5 + 0.5;
  // 팔은 "보이는 선"이 되지 않게: 좁은 마스크로만 사용
  float armPeak = pow(clamp(armSoft, 0.0, 1.0), 2.9);
  float armMask = smoothstep(0.22, 0.95, armPeak);
  float armBlend = mix(armSoft, armPeak, 0.52);
  float lane = smoothstep(0.22, 0.82, dustBand) * (0.45 + 0.55 * armBlend);

  // 배경: 딥 네이비 그라데이션 (단색 금지)
  float bgN = snoise(vec3(uv * 0.9, t * 0.01)) * 0.5 + 0.5;
  float bgT = clamp(0.12 + 0.22 * vignette + 0.12 * bgN, 0.0, 1.0);
  vec3 baseCol = mix(colBg0, colBg1, bgT);

  // 클러스터: 레퍼런스1의 덩어리들이 띠를 이룸 (팔=마스크, 실제 밀도=클러스터)
  float clA = snoise(vec3(uv * 7.0 + vec2(3.0, 11.0), t * 0.012)) * 0.5 + 0.5;
  float clB = snoise(vec3(uv * 12.0 + vec2(27.0, 5.0), t * 0.011)) * 0.5 + 0.5;
  float cluster = smoothstep(0.55, 0.92, clA * 0.65 + clB * 0.35);

  // 띠 마스크: 팔은 보이지 않게 "가중치"로만 사용
  float band = smoothstep(0.25, 0.88, nebulaCloud) * (0.42 + 0.58 * lane);
  float armWeight = 0.25 + 0.75 * armMask;
  float density = clamp(band * (0.55 + 0.45 * cluster) * armWeight, 0.0, 1.0);

  // 딥 → 더스트 → 시안 하이라이트 (팔 자체는 직접 더하지 않음)
  baseCol = mix(baseCol, colDeep, density * 0.85);
  baseCol = mix(baseCol, colDust, density * 0.6);
  baseCol = mix(baseCol, colCyan, density * (0.15 + 0.25 * cluster));

  // 보라/마젠타 톤: 띠 내부 클러스터에만 국소적으로
  float purpleMask = cluster * density * smoothstep(0.15, 0.55, nebulaCloud);
  baseCol = mix(baseCol, colPurple, purpleMask * 0.08);

  // 먼지 헤일로(팔=암시): 팔 주변에만 약하게 퍼지는 구름
  float dustiness = smoothstep(0.35, 0.95, snoise(vec3(uv * 5.0, t * 0.012)) * 0.5 + 0.5);
  float halo = (0.3 + 0.7 * cluster) * density * dustiness;
  baseCol = mix(baseCol, colCyan, halo * 0.12);
  baseCol = mix(baseCol, colHighlight, halo * 0.06);

  float rim = smoothstep(0.28, 0.52, dist);
  baseCol = mix(baseCol, colDeep, rim * 0.18);

  vec2 sA = uv * 76.0 + 19.0;
  float sn1 = snoise(vec3(sA, t * 0.26));
  float tw1 = snoise(vec3(sA * 1.65 + vec2(41.0, 17.0), t * 2.0));
  float star1 = smoothstep(0.55, 0.91, sn1 + tw1 * 0.14);

  vec2 sB = uv * 164.0 + vec2(28.0, 145.0);
  float sn2 = snoise(vec3(sB, t * 0.38));
  float tw2 = snoise(vec3(sB * 2.05, t * 2.4));
  float star2 = smoothstep(0.68, 0.98, sn2 + tw2 * 0.1);

  vec2 sC = uv * 280.0 + vec2(66.0, 202.0);
  float star3 = smoothstep(0.78, 0.995, snoise(vec3(sC, t * 0.31)));

  float sprkN = snoise(vec3(uv * 192.0 + vec2(240.0, 60.0), t * 0.55));
  float sprkPulse = 0.5 + 0.5 * sin(t * 4.2 + sprkN * 12.0);
  float sparkle = smoothstep(0.88, 0.998, sprkN) * (0.55 + 0.45 * sprkPulse);

  // 별은 띠 주변에 더 밀집 (팔=가중치 마스크로만)
  float starArmBoost = 0.3 + 0.7 * density;
  float stars = star1 * 1.0 + star2 * 0.9 + star3 * 0.55;
  stars *= starArmBoost;

  vec3 starCol = vec3(0.96, 0.98, 1.0) * stars * 1.45;
  starCol += vec3(0.94, 0.97, 1.0) * sparkle * 2.35;

  vec3 rgb = (baseCol + starCol) * glowStrength;

  // 바디(포탈 디스크)도 레퍼런스1처럼 어둡게 — 면이 너무 밝은 판이 되지 않게
  const vec3 bodyBlue = vec3(0.02, 0.08, 0.2);
  float bodyMask = 1.0 - smoothstep(0.06, 0.56, dist);
  rgb = mix(rgb, bodyBlue, bodyMask * 0.26);
  float coreWhiteHalo = exp(-dist * 6.8);
  rgb = mix(rgb, colHighlight, coreWhiteHalo * 0.1);
  rgb = mix(rgb, colCyan, nebulaCloud * bodyMask * 0.1);

  float alpha = 1.0 - smoothstep(0.38, 0.72, dist);
  alpha = max(alpha, 0.04);

  gl_FragColor = vec4(rgb, alpha);
}
`;

/**
 * @returns {THREE.ShaderMaterial}
 */
export function createPortalVortexShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPosScale: { value: 0.5 },
      uUseXZPlane: { value: 0 },
    },
    vertexShader: PORTAL_VORTEX_VERTEX_SHADER,
    fragmentShader: PORTAL_VORTEX_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    // 투명 + depthWrite 동시에 쓰면 정렬/구동기에 따라 면이 통째로 안 그려질 수 있음
    depthWrite: false,
    blending: THREE.NormalBlending,
    extensions: { derivatives: true },
  });
}

const PORTAL_VORTEX_MESH_NAME = "Portal_Vortex";

/**
 * GLB 루트에서 `Portal_Vortex` 메시를 찾아 머티리얼을 교체합니다.
 * @param {THREE.Object3D} model
 * @returns {THREE.ShaderMaterial | null}
 */
export function applyPortalVortexToModel(model) {
  /** @type {THREE.Mesh | null} */
  let found = null;
  model.traverse((child) => {
    if (found) return;
    if (!child.isMesh) return;
    if (child.name !== PORTAL_VORTEX_MESH_NAME) return;
    found = child;
  });

  if (!found) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Stage3] Portal_Vortex 메시를 찾지 못했습니다 (이름: "${PORTAL_VORTEX_MESH_NAME}").`,
      );
    }
    return null;
  }

  const prev = found.material;
  if (Array.isArray(prev)) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Stage3] Portal_Vortex가 멀티 머티리얼이라 포탈 셰이더를 적용하지 않습니다.",
      );
    }
    return null;
  }
  if (prev && typeof prev.dispose === "function") {
    prev.dispose();
  }

  const mat = createPortalVortexShaderMaterial();
  const geom = found.geometry;
  if (geom) {
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (bb) {
      const dx = Math.max(bb.max.x - bb.min.x, 1e-6);
      const dy = Math.max(bb.max.y - bb.min.y, 1e-6);
      const dz = Math.max(bb.max.z - bb.min.z, 1e-6);
      const useXZ = dz >= dx && dz >= dy;
      mat.uniforms.uUseXZPlane.value = useXZ ? 1 : 0;
      const ext = useXZ ? Math.max(dx, dz) : Math.max(dx, dy);
      mat.uniforms.uPosScale.value = 0.48 / ext;
    }
  }
  found.material = mat;
  found.renderOrder = 2;
  return mat;
}
