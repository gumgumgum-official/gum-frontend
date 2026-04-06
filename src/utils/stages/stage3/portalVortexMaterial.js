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
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PORTAL_VORTEX_FRAGMENT_SHADER = `
uniform float uTime;
varying vec2 vUv;

${SIMPLEX_NOISE_GLSL}

void main() {
  const float timeScale = 1.5;
  float t = uTime * timeScale;

  const float rotationSpeed = 0.13;
  const float wobbleSpeed = 0.05;
  const float wobbleAmp = 0.07;
  const float swirlTightness = 12.0;
  const float armCount = 3.0;
  const float glowStrength = 0.98;

  // 밝은 하늘색·흰색 (전체 톤 업)
  const vec3 colVoid = vec3(0.22, 0.48, 0.88);
  const vec3 colDeep = vec3(0.32, 0.62, 0.98);
  const vec3 colDust = vec3(0.48, 0.78, 1.0);
  const vec3 colArm = vec3(0.78, 0.94, 1.0);
  const vec3 colCore = vec3(0.9, 0.96, 1.0);
  const vec3 colHighlight = vec3(0.93, 0.97, 1.0);

  vec2 uv = vUv - 0.5;
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

  vec2 polarWide = vec2(dist * 1.65, swirlAngle * 1.42);
  float dustBand = snoise(vec3(polarWide * 2.35 + vec2(0.0, t * 0.025), t * 0.035));
  dustBand = dustBand * 0.5 + 0.5;

  vec2 polar = vec2(dist * 2.15, swirlAngle * 1.95);
  float n1 = snoise(vec3(polar * 3.6, t * 0.045)) * 0.6;
  float n2 = snoise(vec3(polar * 7.2 + vec2(6.1, 3.4), t * 0.045 + 1.4)) * 0.3;
  float n3 = snoise(vec3(polar * 14.0 + vec2(2.0, 11.0), t * 0.045 + 2.6)) * 0.1;
  float fbm = n1 + n2 + n3;

  float armPhase = armCount * swirlAngle + fbm * 1.55 + dist * 3.2;
  float armWave = cos(armPhase);
  float armSoft = armWave * 0.5 + 0.5;
  // 팔 폭을 줄여 사이 간격(어두운 영역)을 넓힘 — armCount 유지
  float armPeak = pow(clamp(armSoft, 0.0, 1.0), 2.7);
  float armMask = smoothstep(0.15, 0.9, armPeak);
  float armBlend = mix(armSoft, armPeak, 0.72);
  float lane = smoothstep(0.22, 0.82, dustBand) * (0.45 + 0.55 * armBlend);

  vec3 baseCol = colVoid;
  float fill = pow(armMask, 1.35) * (0.38 + 0.62 * lane);
  baseCol = mix(baseCol, colDeep, fill * 0.9);
  baseCol = mix(baseCol, colDust, fill * 0.62 * (0.45 + 0.55 * armBlend));
  baseCol = mix(baseCol, colArm, fill * 0.55 * armBlend * (0.35 + 0.65 * smoothstep(-0.15, 0.4, fbm)));

  float nebWisp = smoothstep(-0.28, 0.48, fbm) * armMask * (1.0 - dist * 0.82);
  baseCol += colArm * nebWisp * 0.36;
  float milkyWave = 0.5 + 0.5 * cos(armCount * swirlAngle + dist * 18.0 + fbm * 2.4);
  float milkyPeak = pow(clamp(milkyWave, 0.0, 1.0), 2.85);
  float milkyDust = smoothstep(0.28, 0.8, milkyPeak) * smoothstep(-0.15, 0.45, fbm) * (1.0 - dist * 0.55);
  baseCol += mix(colDust, colHighlight, 0.42) * milkyDust * 0.3;

  float armWhite = pow(clamp(armPeak, 0.0, 1.0), 1.35) * armMask * (1.0 - dist * 0.48);
  baseCol += colHighlight * armWhite * 0.16;

  float coreGlow = exp(-dist * 5.0) * (0.88 + 0.12 * (snoise(vec3(uv * 7.0, t * 0.05)) * 0.5 + 0.5));
  baseCol = mix(baseCol, colCore, coreGlow * 0.58);

  float rim = smoothstep(0.28, 0.52, dist);
  baseCol = mix(baseCol, colDeep * 1.02, rim * 0.16);

  vec2 sA = vUv * 38.0;
  float sn1 = snoise(vec3(sA, t * 0.26));
  float tw1 = snoise(vec3(sA * 1.65 + vec2(41.0, 17.0), t * 2.0));
  float star1 = smoothstep(0.62, 0.93, sn1 + tw1 * 0.14);

  vec2 sB = vUv * 82.0 + vec2(9.0, 63.0);
  float sn2 = snoise(vec3(sB, t * 0.38));
  float tw2 = snoise(vec3(sB * 2.05, t * 2.4));
  float star2 = smoothstep(0.72, 0.985, sn2 + tw2 * 0.1);

  float sprkN = snoise(vec3(vUv * 96.0 + vec2(120.0, 30.0), t * 0.55));
  float sprkPulse = 0.5 + 0.5 * sin(t * 4.2 + sprkN * 12.0);
  float sparkle = smoothstep(0.88, 0.998, sprkN) * (0.55 + 0.45 * sprkPulse);

  float starArmBoost = 0.42 + 0.58 * armMask * (0.4 + 0.6 * lane);
  float stars = star1 * 1.05 + star2 * 0.95;
  stars *= starArmBoost;

  vec3 starCol = vec3(0.96, 0.98, 1.0) * stars * 1.3;
  starCol += vec3(0.94, 0.97, 1.0) * sparkle * 2.35;

  vec3 rgb = (baseCol + starCol) * glowStrength;

  // 레퍼런스처럼 "빛으로 꽉 찬 판"(셀로판 X): 어두운 노이즈 구간에도 스카이 블루 바디를 깔아 완전 투과 방지
  const vec3 bodyBlue = vec3(0.45, 0.75, 1.0);
  float bodyMask = smoothstep(0.56, 0.08, dist);
  rgb = mix(rgb, bodyBlue, bodyMask * 0.48);
  float coreWhiteHalo = exp(-dist * 6.8);
  rgb = mix(rgb, colHighlight, coreWhiteHalo * 0.26);
  rgb += colCore * exp(-dist * 4.8) * 0.08;

  float alpha = 1.0 - smoothstep(0.42, 0.58, dist);

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
    },
    vertexShader: PORTAL_VORTEX_VERTEX_SHADER,
    fragmentShader: PORTAL_VORTEX_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    // 가산 블렌딩은 뒤가 비쳐 셀로판처럼 보임 → 레퍼런스처럼 불투명한 빛의 덩어리는 일반 알파 합성
    depthWrite: true,
    blending: THREE.NormalBlending,
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
  found.material = mat;
  return mat;
}
