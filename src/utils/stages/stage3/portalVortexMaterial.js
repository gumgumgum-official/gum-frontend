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

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

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
  const float glowStrength = 1.3;

  // 레퍼런스1: 거의 블랙에 가까운 딥 네이비 + 띠만 중간 톤 네이비~시안
  const vec3 colBg0 = vec3(0.03, 0.09, 0.2);
  const vec3 colBg1 = vec3(0.05, 0.14, 0.3);
  const vec3 colDeep = vec3(0.07, 0.2, 0.44);
  const vec3 colDust = vec3(0.16, 0.36, 0.64);
  const vec3 colCyan = vec3(0.3, 0.67, 0.95);
  const vec3 colHighlight = vec3(0.97, 0.995, 1.0);
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
  // 가장자리 비네팅(모서리/상단이 더 어둡게) + 약한 구름 덩어리
  float vignette = 1.0 - smoothstep(0.22, 0.98, dist);
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
  float bgT = clamp(0.06 + 0.38 * vignette + 0.14 * bgN, 0.0, 1.0);
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

  // 별/반짝이: 다층(미세점 다량 + 중간점 + 큰 스파이크 극소량) + 색/크기 변주
  float starArmBoost = 0.28 + 0.72 * density;

  // 1) 미세 별 (가장 많음)
  vec2 sA = uv * 95.0 + vec2(19.0, 7.0);
  float a1 = snoise(vec3(sA, t * 0.18));
  float aTw = snoise(vec3(sA * 1.9 + vec2(41.0, 17.0), t * 1.8));
  float micro = smoothstep(0.58, 0.93, a1 + aTw * 0.18);
  float microFlicker = 0.72 + 0.28 * (0.5 + 0.5 * sin(t * 3.1 + a1 * 9.0));
  micro *= microFlicker;

  // 2) 중간 별 (일부, 조금 더 크고 덜 균일)
  vec2 sB = uv * 52.0 + vec2(73.0, 145.0);
  float b1 = snoise(vec3(sB, t * 0.14));
  float bTw = snoise(vec3(sB * 2.2 + vec2(9.0, 63.0), t * 2.2));
  float mid = smoothstep(0.72, 0.985, b1 + bTw * 0.12);
  float midPulse = 0.78 + 0.22 * (0.5 + 0.5 * sin(t * 2.4 + b1 * 6.0));
  mid *= midPulse;

  // 3) 큰 별/스파이크 (아주 소량) — 셀 기반 "진짜 별"(짧고 날카로운 다중 광선 + 트윙클)
  // NOTE: 레퍼런스처럼 화면 전체에 고르게 분포해야 하므로 임의 오프셋으로 위치가 아래에 몰리지 않게 한다.
  vec2 bigGrid = vec2(9.0, 9.0);
  vec2 bigUv = uv * bigGrid;
  vec2 bigCell = floor(bigUv);
  vec2 bigF = fract(bigUv) - 0.5;
  vec2 bigJ = hash21(bigCell) - 0.5;
  float bigPick = hash11(dot(bigCell, vec2(17.0, 131.0)));
  float bigEnable = step(0.974, bigPick); // 드물게 (너무 희소하면 눈에 안 띔)
  vec2 bigP = bigF - bigJ * 0.33;
  float bigD = length(bigP);
  float bigCore = exp(-bigD * bigD * 90.0);
  float bigHalo = exp(-bigD * bigD * 14.0);
  float bigTw = 0.65 + 0.35 * (0.5 + 0.5 * sin(t * 1.4 + bigPick * 12.0));

  // 다중 광선(8~12): 각이 날카롭고 짧게 (긴 십자가 느낌 제거)
  float ang = atan(bigP.y, bigP.x);
  float rayCount = mix(8.0, 12.0, hash11(bigPick * 19.7));
  float rot = (hash11(bigPick * 7.3) - 0.5) * 0.6;
  float rays = abs(cos((ang + rot) * rayCount));
  float raySharp = mix(10.0, 16.0, hash11(bigPick * 5.1));
  float rayMask = pow(rays, raySharp);
  // 길이(반경) 감쇠: 스파이크가 너무 길어지지 않게 빠르게 감쇠
  float rayFalloff = exp(-bigD * bigD * 55.0);
  float bigSpike = rayMask * rayFalloff * 2.2;

  float bigStar =
    bigEnable * bigTw * (bigCore * 1.6 + bigHalo * 0.85 + bigSpike * 0.95);

  // 4) 더 큰 별(극소량) — 더 적지만 훨씬 크게
  vec2 giantGrid = vec2(6.0, 6.0);
  vec2 gUv = uv * giantGrid;
  vec2 gCell = floor(gUv);
  vec2 gF = fract(gUv) - 0.5;
  vec2 gJ = hash21(gCell + 31.0) - 0.5;
  float gPick = hash11(dot(gCell, vec2(29.0, 97.0)));
  float gEnable = step(0.988, gPick);
  vec2 gP = gF - gJ * 0.28;
  float gD = length(gP);
  float gCore = exp(-gD * gD * 55.0);
  float gHalo = exp(-gD * gD * 7.5);
  float gTw = 0.62 + 0.38 * (0.5 + 0.5 * sin(t * 0.95 + gPick * 18.0));
  float gang = atan(gP.y, gP.x);
  float grayCount = mix(10.0, 16.0, hash11(gPick * 9.9));
  float grot = (hash11(gPick * 3.7) - 0.5) * 0.7;
  float grays = abs(cos((gang + grot) * grayCount));
  float gsharp = mix(9.0, 14.0, hash11(gPick * 4.4));
  float grayMask = pow(grays, gsharp);
  float grayFalloff = exp(-gD * gD * 28.0);
  float gSpike = grayMask * grayFalloff * 2.6;
  float giantStar =
    gEnable * gTw * (gCore * 1.55 + gHalo * 0.95 + gSpike * 1.2);

  // 색 변주: 차가운 흰/시안 기본 + 일부 보라 + 일부 따뜻한 노랑
  float cVar = snoise(vec3(uv * 4.6 + vec2(12.0, 8.0), 0.0)) * 0.5 + 0.5;
  vec3 cool = vec3(0.86, 0.92, 1.0);
  vec3 cyan = vec3(0.62, 0.82, 1.0);
  vec3 warm = vec3(1.0, 0.92, 0.72);
  vec3 purple = vec3(0.86, 0.76, 1.0);
  vec3 starTint = mix(cool, cyan, smoothstep(0.25, 0.75, cVar));
  starTint = mix(starTint, warm, smoothstep(0.84, 0.98, cVar) * 0.65);
  starTint = mix(starTint, purple, smoothstep(0.02, 0.18, cVar) * 0.55);

  // 반짝이(극미세, 랜덤 깜빡임)
  float sprkN = snoise(vec3(uv * 210.0 + vec2(240.0, 60.0), t * 0.55));
  float sprkPulse = 0.5 + 0.5 * sin(t * 4.6 + sprkN * 12.0);
  float sparkle = smoothstep(0.9, 0.999, sprkN) * (0.5 + 0.5 * sprkPulse);

  float microAmp = (micro * 1.1) * starArmBoost;
  float midAmp = (mid * 1.35) * (0.45 + 0.55 * starArmBoost);
  float bigAmp = bigStar * (0.25 + 0.75 * starArmBoost);
  float giantAmp = giantStar * (0.18 + 0.82 * starArmBoost);

  vec3 starCol = starTint * microAmp * 0.85;
  starCol += mix(starTint, vec3(1.0), 0.25) * midAmp * 1.1;
  // 큰 별은 거의 흰색에 가까운 스파클
  starCol += mix(vec3(0.96, 0.98, 1.0), vec3(1.0), 0.68) * bigAmp * 2.25;
  starCol += vec3(1.0) * giantAmp * 2.85;
  starCol += mix(vec3(0.9, 0.95, 1.0), starTint, 0.35) * sparkle * (0.9 + 1.1 * starArmBoost);

  vec3 rgb = (baseCol + starCol) * glowStrength;

  // 바디(포탈 디스크)를 밝은 청색으로 유지해 중앙 면이 죽지 않게 조정
  const vec3 bodyBlue = vec3(0.26, 0.62, 0.96);
  float bodyMask = 1.0 - smoothstep(0.06, 0.56, dist);
  rgb = mix(rgb, bodyBlue, bodyMask * 0.18);
  float coreWhiteHalo = exp(-dist * 6.8);
  rgb = mix(rgb, colHighlight, coreWhiteHalo * 0.34);
  rgb = mix(rgb, colCyan, nebulaCloud * bodyMask * 0.18);

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
