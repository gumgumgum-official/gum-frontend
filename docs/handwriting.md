# Handwriting 3D 렌더링 통합 가이드

태블릿에서 전송된 필기 데이터(SVG)를 실시간으로 수신하여 3D로 렌더링하는 방법을 설명합니다.

---

## 📋 목차

1. [개요](#개요)
2. [환경 설정](#환경-설정)
3. [아키텍처 이해](#아키텍처-이해)
4. [구현 가이드](#구현-가이드)
5. [유지보수 가이드](#유지보수-가이드)
6. [트러블슈팅](#트러블슈팅)

---

## 개요

### 데이터 흐름

```
태블릿 앱 → Edge Function → Storage (SVG 저장) → Realtime Broadcast → 3D 렌더링 앱
```

1. **태블릿**: 사용자가 캔버스에 필기
2. **Edge Function**: strokes → SVG 변환 후 Storage 저장
3. **Realtime**: 브로드캐스트로 새 SVG 파일 알림
4. **3D 앱**: Realtime 구독 → SVG 다운로드 → 3D 렌더링

### 핵심 개념

- **Session ID**: 전시회/공간별 구분 (예: `exhibition-2026`, `room-1`)
- **Realtime Channel**: `{prefix}:{sessionId}` 형식 (예: `exhibition:exhibition-2026`)
- **Storage Path**: `{sessionId}/{idempotencyKey}.svg`
- **SVG Format**: 채워진(filled) path로 구성된 SVG (Three.js SVGLoader 호환)

---

## 환경 설정

### 1. 환경변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# Supabase 설정
VITE_SUPABASE_URL=https://cffuybxttyrfjetyqrww.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Realtime Channel 설정
VITE_REALTIME_CHANNEL_PREFIX=exhibition

# 세션 ID (기본값, URL 파라미터로 오버라이드 가능)
VITE_DEFAULT_SESSION_ID=exhibition-2026
```

**⚠️ 중요:**

- `VITE_SUPABASE_ANON_KEY`는 **public key**이므로 Git에 커밋해도 안전합니다
- `SUPABASE_SERVICE_ROLE_KEY`는 **절대 프론트엔드에 사용하지 마세요**
- 세션 ID는 URL 파라미터로 동적 변경 가능: `?session=room-1`

### 2. Supabase 클라이언트 초기화

```typescript
// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Realtime 이벤트 제한
    },
  },
});
```

### 3. 타입 정의

```typescript
// src/types/handwriting.ts

/** Realtime 브로드캐스트 페이로드 */
export interface HandwritingBroadcast {
  id: string;                    // idempotencyKey
  storagePathSvg: string;         // Storage public URL
  createdAt: string;              // ISO 8601 timestamp
  clientId: string;               // 태블릿 클라이언트 ID
}

/** SVG 메타데이터 */
export interface HandwritingMetadata {
  id: string;
  url: string;
  createdAt: Date;
  clientId: string;
}
```

---

## 아키텍처 이해

### Realtime Channel 구조

```
Channel Name: {REALTIME_CHANNEL_PREFIX}:{SESSION_ID}
예시: "exhibition:exhibition-2026"

Event Type: "broadcast"
Event Name: "new_handwriting"
Payload: HandwritingBroadcast
```

### Storage 구조

```
Bucket: handwriting
Path: {sessionId}/{idempotencyKey}.svg
예시: "exhibition-2026/abc123_def456_xyz789.svg"
```

### Idempotency Key 형식

```
{clientId}_{createdAt}_{strokesHash}
예시: "uuid-1234_2026-01-20T10:30:00.000Z_a1b2c3d4"
```

**중복 전송 방지**: 동일한 idempotencyKey는 같은 SVG 파일을 반환합니다.

---

## 구현 가이드

### 1. 세션 ID 관리

```typescript
// src/lib/session.ts

/**
 * 세션 ID 가져오기
 * 우선순위: URL 파라미터 > 환경변수 > 기본값
 */
export function getSessionId(): string {
  // URL 파라미터 확인
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('session') || params.get('sessionId');
    if (urlSessionId) {
      return urlSessionId;
    }
  }

  // 환경변수 또는 기본값
  return import.meta.env.VITE_DEFAULT_SESSION_ID || 'default-session';
}

/**
 * 세션 ID 설정 (URL 파라미터로 변경)
 */
export function setSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('session', sessionId);
  window.history.replaceState({}, '', url.toString());
}
```

**사용 예시:**

```typescript
// 기본 세션 사용
const sessionId = getSessionId(); // "exhibition-2026"

// URL로 변경: ?session=room-1
setSessionId('room-1');
```

### 2. Realtime 구독 설정

```typescript
// src/hooks/useHandwritingRealtime.ts

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { HandwritingBroadcast, HandwritingMetadata } from '@/types/handwriting';
import { getSessionId } from '@/lib/session';

interface UseHandwritingRealtimeOptions {
  /** 세션 ID (기본값: getSessionId()) */
  sessionId?: string;
  /** 새 필기 수신 시 콜백 */
  onNewHandwriting?: (metadata: HandwritingMetadata) => void;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error) => void;
}

export function useHandwritingRealtime(options: UseHandwritingRealtimeOptions = {}) {
  const { sessionId = getSessionId(), onNewHandwriting, onError } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const channelPrefix = import.meta.env.VITE_REALTIME_CHANNEL_PREFIX || 'exhibition';
    const channelName = `${channelPrefix}:${sessionId}`;

    console.log(`[HandwritingRealtime] Subscribing to channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'new_handwriting' },
        (payload: { payload: HandwritingBroadcast }) => {
          const data = payload.payload;
          console.log('[HandwritingRealtime] New handwriting received:', data);

          const metadata: HandwritingMetadata = {
            id: data.id,
            url: data.storagePathSvg,
            createdAt: new Date(data.createdAt),
            clientId: data.clientId,
          };

          onNewHandwriting?.(metadata);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
          console.log(`[HandwritingRealtime] Connected to ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          const err = new Error(`Failed to subscribe to channel: ${channelName}`);
          setError(err);
          setIsConnected(false);
          onError?.(err);
        }
      });

    return () => {
      console.log(`[HandwritingRealtime] Unsubscribing from ${channelName}`);
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [sessionId, onNewHandwriting, onError]);

  return { isConnected, error };
}
```

**사용 예시:**

```typescript
function HandwritingDisplay() {
  const [handwritings, setHandwritings] = useState<HandwritingMetadata[]>([]);

  const handleNewHandwriting = useCallback((metadata: HandwritingMetadata) => {
    setHandwritings(prev => [...prev, metadata]);
    // SVG 다운로드 및 3D 렌더링 시작
    loadAndRenderSVG(metadata);
  }, []);

  const { isConnected, error } = useHandwritingRealtime({
    onNewHandwriting: handleNewHandwriting,
    onError: (err) => console.error('[HandwritingDisplay] Error:', err),
  });

  return (
    <div>
      {isConnected ? (
        <div>실시간 수신 중... ({handwritings.length}개)</div>
      ) : (
        <div>연결 중...</div>
      )}
      {error && <div>에러: {error.message}</div>}
    </div>
  );
}
```

### 3. SVG 다운로드 및 파싱

```typescript
// src/lib/svg-loader.ts

import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import * as THREE from 'three';

/**
 * SVG URL에서 SVG 문자열 다운로드
 */
export async function fetchSVG(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG: ${response.statusText}`);
  }
  return response.text();
}

/**
 * SVG 문자열을 Three.js Shape로 변환
 */
export function parseSVGToShapes(svgString: string): THREE.Shape[] {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  const shapes: THREE.Shape[] = [];

  svgData.paths.forEach((path) => {
    path.subPaths.forEach((subPath) => {
      const shape = new THREE.Shape(subPath.getPoints());
      shapes.push(shape);
    });
  });

  return shapes;
}

/**
 * SVG URL을 다운로드하고 Shape 배열로 변환
 */
export async function loadSVGShapes(url: string): Promise<THREE.Shape[]> {
  const svgString = await fetchSVG(url);
  return parseSVGToShapes(svgString);
}
```

### 4. 3D 렌더링 (Three.js 예시)

```typescript
// src/components/Handwriting3D.tsx

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loadSVGShapes } from '@/lib/svg-loader';
import type { HandwritingMetadata } from '@/types/handwriting';

interface Handwriting3DProps {
  /** 렌더링할 필기 메타데이터 */
  handwriting: HandwritingMetadata;
  /** 3D 씬에 추가될 그룹 */
  group: THREE.Group;
}

export function Handwriting3D({ handwriting, group }: Handwriting3DProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function renderHandwriting() {
      try {
        // SVG 다운로드 및 파싱
        const shapes = await loadSVGShapes(handwriting.url);

        if (!isMounted) return;

        // 각 Shape를 ExtrudeGeometry로 변환
        shapes.forEach((shape) => {
          const extrudeSettings = {
            depth: 0.1,           // 두께
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.01,
            bevelSegments: 3,
          };

          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const material = new THREE.MeshStandardMaterial({
            color: 0x2e2e2e,     // SVG 색상과 일치
            metalness: 0.1,
            roughness: 0.8,
          });

          const mesh = new THREE.Mesh(geometry, material);

          // 위치 조정 (필요시)
          mesh.position.set(0, 0, 0);
          mesh.scale.set(0.01, -0.01, 1); // SVG 좌표계 변환

          group.add(mesh);
        });

        console.log(`[Handwriting3D] Rendered ${shapes.length} shapes from ${handwriting.id}`);
      } catch (error) {
        console.error(`[Handwriting3D] Failed to render ${handwriting.id}:`, error);
      }
    }

    renderHandwriting();

    return () => {
      isMounted = false;
      // Cleanup: group에서 메시 제거
      if (meshRef.current) {
        group.remove(meshRef.current);
      }
    };
  }, [handwriting, group]);

  return null; // 3D는 Three.js로 직접 렌더링
}
```

### 5. 완전한 통합 예시

```typescript
// src/pages/Exhibition3D.tsx

import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { useHandwritingRealtime } from '@/hooks/useHandwritingRealtime';
import { Handwriting3D } from '@/components/Handwriting3D';
import type { HandwritingMetadata } from '@/types/handwriting';

export function Exhibition3D() {
  const [handwritings, setHandwritings] = useState<HandwritingMetadata[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 애니메이션 루프
    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      renderer.dispose();
    };
  }, []);

  // Realtime 구독
  const handleNewHandwriting = (metadata: HandwritingMetadata) => {
    setHandwritings(prev => {
      // 중복 방지
      if (prev.some(h => h.id === metadata.id)) {
        return prev;
      }
      return [...prev, metadata];
    });
  };

  const { isConnected } = useHandwritingRealtime({
    onNewHandwriting: handleNewHandwriting,
  });

  return (
    <div>
      <div className="status-bar">
        <div>연결 상태: {isConnected ? '✅ 연결됨' : '⏳ 연결 중...'}</div>
        <div>수신된 필기: {handwritings.length}개</div>
      </div>

      <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />

      {/* 각 필기를 3D로 렌더링 */}
      {sceneRef.current && handwritings.map((hw) => {
        const group = new THREE.Group();
        sceneRef.current!.add(group);

        return (
          <Handwriting3D key={hw.id} handwriting={hw} group={group} />
        );
      })}
    </div>
  );
}
```

---

## 유지보수 가이드

### 1. 환경변수 관리

**✅ 권장:**

- `.env.example` 파일에 템플릿 제공
- `.env.local`은 Git에 커밋하지 않음
- 배포 환경별로 다른 값 사용 (Vercel, Netlify 등)

**❌ 피해야 할 것:**

- 하드코딩된 URL/키
- Service Role Key를 프론트엔드에 사용

### 2. 에러 처리

```typescript
// src/lib/error-handler.ts

export class HandwritingError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'HandwritingError';
  }
}

export function handleHandwritingError(error: unknown): HandwritingError {
  if (error instanceof HandwritingError) {
    return error;
  }

  if (error instanceof Error) {
    return new HandwritingError(
      error.message,
      'UNKNOWN_ERROR',
      error
    );
  }

  return new HandwritingError(
    '알 수 없는 오류가 발생했습니다',
    'UNKNOWN_ERROR'
  );
}
```

### 3. 로깅 전략

```typescript
// src/lib/logger.ts

const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info';

export const logger = {
  debug: (...args: any[]) => {
    if (LOG_LEVEL === 'debug') console.log('[DEBUG]', ...args);
  },
  info: (...args: any[]) => {
    console.log('[INFO]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};
```

**사용:**

```typescript
logger.info('[HandwritingRealtime] New handwriting received', metadata);
logger.error('[SVGLoader] Failed to fetch SVG', error);
```

### 4. 성능 최적화

**SVG 캐싱:**

```typescript
// src/lib/svg-cache.ts

const svgCache = new Map<string, string>();

export async function getSVG(url: string, useCache = true): Promise<string> {
  if (useCache && svgCache.has(url)) {
    return svgCache.get(url)!;
  }

  const svgString = await fetchSVG(url);
  if (useCache) {
    svgCache.set(url, svgString);
  }

  return svgString;
}
```

**3D 메시 최적화:**

```typescript
// 너무 많은 메시가 쌓이면 오래된 것 제거
const MAX_HANDWRITINGS = 100;

if (handwritings.length > MAX_HANDWRITINGS) {
  const oldest = handwritings.shift();
  // Three.js 씬에서 제거
  removeFromScene(oldest);
}
```

### 5. 테스트 전략

```typescript
// src/hooks/__tests__/useHandwritingRealtime.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { useHandwritingRealtime } from '../useHandwritingRealtime';

// Mock Supabase
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn((callback) => {
        callback('SUBSCRIBED');
        return { unsubscribe: jest.fn() };
      }),
    })),
    removeChannel: jest.fn(),
  },
}));

test('should subscribe to correct channel', async () => {
  const onNewHandwriting = jest.fn();

  renderHook(() => useHandwritingRealtime({
    sessionId: 'test-session',
    onNewHandwriting,
  }));

  await waitFor(() => {
    expect(onNewHandwriting).not.toHaveBeenCalled();
  });
});
```

---

## 트러블슈팅

### 문제 1: Realtime 연결 실패

**증상:** `CHANNEL_ERROR` 또는 연결되지 않음

**해결:**

1. Supabase Dashboard에서 Realtime 활성화 확인
2. Channel 이름 확인: `{prefix}:{sessionId}` 형식
3. 네트워크 탭에서 WebSocket 연결 확인
4. Supabase URL/Key 확인

```typescript
// 디버깅 코드
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Channel:', `${prefix}:${sessionId}`);
```

### 문제 2: SVG 다운로드 실패 (CORS)

**증상:** `CORS policy` 에러

**해결:**

- Storage Bucket이 **Public**으로 설정되어 있는지 확인
- Supabase Dashboard > Storage > Buckets > `handwriting` > Public 체크

### 문제 3: 3D 렌더링이 너무 느림

**증상:** 많은 필기 시 프레임 드롭

**해결:**

- SVG 캐싱 사용
- 오래된 메시 제거 (최대 개수 제한)
- Geometry 병합 (BufferGeometry 사용)
- LOD (Level of Detail) 적용

```typescript
// Geometry 병합 예시
const mergedGeometry = new THREE.BufferGeometry();
shapes.forEach(shape => {
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  mergedGeometry.merge(geometry);
});
```

### 문제 4: 세션 ID가 변경되지 않음

**증상:** URL 파라미터 변경해도 같은 세션 사용

**해결:**

- `getSessionId()`가 URL 파라미터를 우선 확인하는지 확인
- React 컴포넌트가 URL 변경을 감지하도록 설정

```typescript
// URL 변경 감지
useEffect(() => {
  const handleLocationChange = () => {
    const newSessionId = getSessionId();
    // Realtime 재구독
  };

  window.addEventListener('popstate', handleLocationChange);
  return () => window.removeEventListener('popstate', handleLocationChange);
}, []);
```

---

## 체크리스트

배포 전 확인사항:

- [ ] `.env` 파일에 모든 환경변수 설정
- [ ] Supabase Storage Bucket `handwriting` 생성 및 Public 설정
- [ ] Realtime 활성화 확인 (Supabase Dashboard)
- [ ] Edge Function `handwriting-to-svg` 배포 확인
- [ ] Edge Function Secrets 설정 확인:
  - [ ] `STORAGE_BUCKET=handwriting`
  - [ ] `REALTIME_CHANNEL_PREFIX=exhibition`
- [ ] 테스트: 태블릿에서 필기 → 3D 앱에서 수신 확인
- [ ] 에러 로깅 설정
- [ ] 성능 모니터링 설정 (선택)

---

## 추가 리소스

- [Supabase Realtime 문서](https://supabase.com/docs/guides/realtime)
- [Three.js SVGLoader 문서](https://threejs.org/docs/#examples/en/loaders/SVGLoader)
- [Supabase Storage 문서](https://supabase.com/docs/guides/storage)

---

## 문의 및 지원

문제가 발생하면:

1. 브라우저 콘솔 로그 확인
2. Supabase Dashboard > Edge Functions > Logs 확인
3. Network 탭에서 요청/응답 확인