# API 명세서

껌딱지월드 서버 API 명세서

## 📋 목차

1. [REST API](#rest-api)
2. [에러 응답](#에러-응답)
3. [예제](#예제)

---

## REST API

### Base URL

```
http://localhost:3000
```

프로덕션: 배포 URL로 교체 (예: Render `https://<서비스명>.onrender.com`)

**모니터 할당·Stage3 시작·표시·체험 완료**는 아래 **REST API**만 사용합니다.

- 태블릿이 `POST /api/request-monitor`로 모니터를 받으면 서버는 **예약(`reservedWorry`)**만 두고 **`busy`는 켜지 않습니다.**
- 모니터(Stage3)가 시작될 때 `POST /api/monitors/:monitorId/start`를 호출하면 그때 **`busy`** + `currentWorry`가 됩니다.
- Stage6 종료·시작 화면 복귀 시 `POST .../complete`로 **`idle`** 로 돌리고, 대기자가 있으면 같은 모니터에 **다음 예약**만 합니다(다시 `start` 전까지 `idle`).

**한 세션에서의 권장 호출 순서**(아래 절 번호와 다를 수 있음): `POST .../start` → `GET .../current` (폴링) → `POST .../complete`. 상세는 [요구사항.md](./요구사항.md), [docs/MONITOR_USER_FLOW.md](./docs/MONITOR_USER_FLOW.md).

### 헤더

모든 요청은 JSON 형식:

```
Content-Type: application/json
```

---

### 1. 헬스 체크

서버 상태 확인

**요청**

```http
GET /health
```

**응답**

```json
{
  "status": "ok",
  "timestamp": 1735392000000,
  "monitors": {
    "monitor-1": "idle",
    "monitor-2": "busy"
  },
  "queueLength": 3,
  "uptime": 3600.5
}
```

**필드 설명**

| 필드          | 타입   | 설명                                 |
| ------------- | ------ | ------------------------------------ |
| `status`      | string | 서버 상태 (`"ok"`)                   |
| `timestamp`   | number | 현재 타임스탬프 (밀리초)             |
| `monitors`    | object | 모니터 상태 (`"idle"` 또는 `"busy"`) |
| `queueLength` | number | 대기열 길이                          |
| `uptime`      | number | 서버 가동 시간 (초)                  |

---

### 1-1. 경량 ping (keepalive)

UptimeRobot·GitHub Actions 등에서 **슬립 방지**용으로 호출하기 좋은 최소 응답입니다. `/health`와 달리 큐·모니터 상세를 포함하지 않습니다.

**요청**

```http
GET /ping
```

**응답** `200`

```json
{
  "ok": true
}
```

---

### 2. 상태 조회 (디버깅용)

상세 서버 상태 조회.

**gum-frontend**: 시작 화면에서 “고민 도착” 토스트를 띄우기 위해, 예약만 있는 경우 `GET /current`가 `idle`일 수 있으므로 **`monitors[monitorId].reservedWorry`** 를 참고할 수 있습니다. 프로덕션에서도 이 필드가 안정적으로 채워지는지 **gum_server와 계약**해야 합니다. ([요구사항.md](./요구사항.md) 참고)

**요청**

```http
GET /status
```

**응답**

```json
{
  "monitors": {
    "monitor-1": {
      "status": "idle",
      "currentWorry": null,
      "reservedWorry": {
        "worryId": "12",
        "svgUrl": "https://example.com/a.svg",
        "sessionId": "sess"
      },
      "clientId": "tablet-uuid-001"
    },
    "monitor-2": {
      "status": "busy",
      "currentWorry": {
        "worryId": "67abc123...",
        "assignedAt": 1735392000000,
        "svgUrl": "https://example.com/worry.svg",
        "sessionId": "sess-uuid"
      },
      "reservedWorry": null,
      "clientId": "tablet-uuid-001"
    }
  },
  "queueLength": 2
}
```

**필드 설명**

| 필드                       | 타입         | 설명                                       |
| -------------------------- | ------------ | ------------------------------------------ |
| `monitors`                 | object       | 모니터 상세 상태                           |
| `monitors[].status`        | string       | 모니터 상태                                |
| `monitors[].currentWorry`  | object\|null | Stage3 진행 중인 고민 (`busy`일 때)        |
| `monitors[].reservedWorry` | object\|null | 태블릿/대기열에서 붙었으나 `start` 전 예약 |
| `monitors[].clientId`      | string\|null | 마지막 예약·할당 시 `clientId`             |
| `queueLength`              | number       | 대기열 길이                                |

---

### 3. 모니터 할당 요청 (태블릿)

즉시 **빈 모니터**(idle이고 예약도 없음)가 있으면 그 모니터에 **예약**하고, 없으면 대기열에 넣습니다. 모니터가 `busy`가 되는 시점은 **`/start`** 입니다.

**요청**

```http
POST /api/request-monitor
Content-Type: application/json
```

**Body**

| 필드        | 필수   | 타입         | 설명                                              |
| ----------- | ------ | ------------ | ------------------------------------------------- |
| `worryId`   | 예     | string       | 고민 ID                                           |
| `svgUrl`    | 아니오 | string\|null | SVG URL (모니터 표시용)                           |
| `sessionId` | 아니오 | string\|null | 세션 ID                                           |
| `clientId`  | 아니오 | string       | 대기열 식별자. 없으면 서버가 `anonymous-...` 생성 |

**응답 — 즉시 할당 (`assigned: true`)**

```json
{
  "assigned": true,
  "monitorId": "monitor-1",
  "monitorNumber": 1,
  "message": "👈 왼쪽 껌딱지월드로 가세요"
}
```

**응답 — 대기 (`assigned: false`)**

```json
{
  "assigned": false,
  "queuePosition": 2,
  "clientId": "anonymous-1735392000123-abc12",
  "message": "2번째로 대기 중입니다"
}
```

**에러**

- `400` — `worryId` 누락: `{ "error": "worryId is required" }`

---

### 4. 모니터 현재 표시 내용 조회 (폴링)

프론트(모니터 화면)가 1~2초 간격으로 호출합니다. **예약만 있고 Stage3가 아직이면** `status`는 `idle`이며 `worry`는 없습니다(시작 화면 등).

**요청**

```http
GET /api/monitors/:monitorId/current
```

`monitorId`: `monitor-1` \| `monitor-2`

**응답 — 유휴**

```json
{
  "status": "idle"
}
```

**응답 — 사용 중**

```json
{
  "status": "busy",
  "worry": {
    "worryId": "67abc123...",
    "svgUrl": "https://example.com/worry.svg",
    "sessionId": "sess-uuid"
  }
}
```

**에러**

- `400` — `{ "error": "invalid monitorId" }`

---

### 5. Stage3 시작 (모니터)

예약된 고민을 `currentWorry`로 올리고 **`busy`** 로 만듭니다. gum-frontend에서 Stage3 진입 시 호출합니다.

**요청**

```http
POST /api/monitors/:monitorId/start
Content-Type: application/json
```

Body: 생략 가능 `{}`

**응답 `200`**

```json
{
  "ok": true,
  "status": "busy",
  "worry": {
    "worryId": "67abc123...",
    "svgUrl": "https://example.com/worry.svg",
    "sessionId": "sess-uuid"
  }
}
```

**에러**

- `400` — `{ "error": "invalid monitorId" }`
- `409` — 예약 없음: `{ "error": "no reservation for this monitor" }`
- `409` — 이미 busy: `{ "error": "monitor already busy" }`

---

### 6. 모니터 체험 완료 (Stage6 종료)

모니터에서 체험 종료 시 호출. **진행 중 세션만** 해제(`idle`)하고, 대기 중인 다음 사용자가 있으면 같은 모니터에 **예약만** 붙입니다. 다음 사람의 `busy`는 **`/start`** 때 켜집니다.

**요청**

```http
POST /api/monitors/:monitorId/complete
```

**응답**

```json
{
  "ok": true,
  "assignedNext": true
}
```

`assignedNext`: 대기열에서 다음 사용자를 이 모니터에 **예약**했으면 `true`, 없으면 `false`.

**에러**

- `400` — `{ "error": "invalid monitorId" }`

---

### 7. 대기 순번 조회

`POST /api/request-monitor` 응답의 `clientId`로 대기 위치를 조회합니다.

**요청**

```http
GET /api/queue/position?clientId=<clientId>
```

**응답**

```json
{
  "queuePosition": 2
}
```

`queuePosition`: 대기열에 없으면 `0`.

**에러**

- `400` — `{ "error": "clientId is required" }`

---

## 에러 응답

### HTTP 에러

**404 Not Found**

```json
{
  "error": "Not Found"
}
```

**500 Internal Server Error**

```json
{
  "error": "Internal Server Error"
}
```

---

## 예제

### 태블릿: 모니터 요청

```javascript
const base = "http://localhost:3000";
const clientId = "tablet-uuid-001";

const res = await fetch(`${base}/api/request-monitor`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    worryId: "75",
    svgUrl: "https://example.com/worry.svg",
    sessionId: "exhibition-2026",
    clientId,
  }),
});
const data = await res.json();
// assigned: true → monitorId로 안내 / false → queuePosition, 같은 clientId로 GET /api/queue/position 폴링
```

### 모니터: Stage3 시작 → 폴링 → Stage6 complete

```javascript
const base = "http://localhost:3000";
const monitorId = "monitor-1";

// Stage3 진입 시(시작 화면에서 체험으로 넘어갈 때)
await fetch(`${base}/api/monitors/${monitorId}/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});

const poll = async () => {
  const r = await fetch(`${base}/api/monitors/${monitorId}/current`);
  return r.json();
};

// 주기적으로 poll() → status === 'busy' 이면 worry.svgUrl 표시
// Stage6 종료·시작 화면 복귀 시:
await fetch(`${base}/api/monitors/${monitorId}/complete`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
```

---

## 테스트

### cURL 예제

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
curl -X POST http://localhost:3000/api/request-monitor \
  -H "Content-Type: application/json" \
  -d '{"worryId":"test-1","clientId":"curl-client"}'
curl http://localhost:3000/api/monitors/monitor-1/current
curl -X POST http://localhost:3000/api/monitors/monitor-1/start \
  -H "Content-Type: application/json" \
  -d '{}'
curl http://localhost:3000/api/monitors/monitor-1/current
curl -X POST http://localhost:3000/api/monitors/monitor-1/complete \
  -H "Content-Type: application/json" \
  -d '{}'
```

로컬에서 시나리오 스크립트: `npm run test:client` (서버 실행 후 다른 터미널에서).

---

**모니터(gum-frontend) 구현 참고**: `src/lib/monitorCurrentApi.js`, `src/stages/Stage3.js`, `src/pages/StartPage.jsx`

**마지막 업데이트**: 2026-03-28

### 8. 투표 등록 (Supabase)

투표 1건을 등록합니다. 취소는 `DELETE /api/votes/my`, 후보 변경은 `PUT /api/votes/my`를 사용하세요.

**요청**

```
POST /api/votes
Content-Type: application/json
```

**Body**

| 필드        | 필수   | 타입   | 설명                                                                                         |
| ----------- | ------ | ------ | -------------------------------------------------------------------------------------------- |
| `candidate` | 예     | number | 선택 후보 번호 (`1`, `2`, `3`)                                                               |
| `clientId`  | 예     | string | 디바이스 식별자 (localStorage 등에 영구 저장한 UUID 권장). `DELETE`·`PUT`·`GET /my`에 재사용 |
| `sessionId` | 아니오 | string | 세션 식별자                                                                                  |

**응답 `200`**

```json
{
  "ok": true,
  "selectedCandidate": 2,
  "clientId": "tablet-uuid-001",
  "totalVotes": 128,
  "results": {
    "candidate1": 40,
    "candidate2": 55,
    "candidate3": 33
  },
  "updatedAt": "2026-03-31T09:10:11.123Z"
}
```

**필드 설명**

| 필드                   | 타입    | 설명                               |
| ---------------------- | ------- | ---------------------------------- |
| `ok`                   | boolean | 성공 여부 (`true`)                 |
| `selectedCandidate`    | number  | 방금 등록된 후보 번호              |
| `clientId`             | string  | 요청에 보낸 `clientId` 그대로 반환 |
| `totalVotes`           | number  | 전체 누적 투표수                   |
| `results.candidate1~3` | number  | 후보별 누적 투표수                 |
| `updatedAt`            | string  | 집계 기준 시각 (ISO-8601)          |

**에러**

- `400` — `clientId` 누락: `{ "error": "clientId is required" }`
- `400` — 후보값 누락/범위 오류: `{ "error": "candidate must be one of 1, 2, 3" }`
- `409` — DB 유니크 제약 위반 시: `{ "error": "duplicate vote" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 8-1. 내 투표 취소 (DELETE)

투표를 명시적으로 취소합니다. 투표가 없어도 에러 없이 `deleted: false`로 응답합니다.

**요청**

```
DELETE /api/votes/my
Content-Type: application/json
```

**Body**

| 필드       | 필수 | 타입   | 설명            |
| ---------- | ---- | ------ | --------------- |
| `clientId` | 예   | string | 디바이스 식별자 |

**응답 `200`**

```json
{
  "ok": true,
  "deleted": true,
  "totalVotes": 127,
  "results": {
    "candidate1": 40,
    "candidate2": 54,
    "candidate3": 33
  },
  "updatedAt": "2026-03-31T09:10:12.000Z"
}
```

`deleted: false`이면 기존 투표가 없었음을 의미합니다.

**에러**

- `400` — `{ "error": "clientId is required" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 8-2. 내 투표 후보 변경 (PUT)

이미 투표한 후보를 다른 후보로 변경합니다. 기존 투표가 없으면 404.

**요청**

```
PUT /api/votes/my
Content-Type: application/json
```

**Body**

| 필드        | 필수 | 타입   | 설명                             |
| ----------- | ---- | ------ | -------------------------------- |
| `clientId`  | 예   | string | 디바이스 식별자                  |
| `candidate` | 예   | number | 변경할 후보 번호 (`1`, `2`, `3`) |

**응답 `200`**

```json
{
  "ok": true,
  "selectedCandidate": 3,
  "totalVotes": 128,
  "results": {
    "candidate1": 40,
    "candidate2": 54,
    "candidate3": 34
  },
  "updatedAt": "2026-03-31T09:10:13.000Z"
}
```

**에러**

- `400` — `{ "error": "clientId is required" }`
- `400` — `{ "error": "candidate must be one of 1, 2, 3" }`
- `404` — 기존 투표 없음: `{ "error": "no vote to change" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 8-3. 내 투표 상태 조회

페이지 재진입 시 이미 투표한 후보가 있는지 확인합니다.

**요청**

```
GET /api/votes/my?clientId=<clientId>
```

**응답 `200` — 투표 있음**

```json
{ "candidate": 2 }
```

**응답 `200` — 투표 없음**

```json
{ "candidate": null }
```

**에러**

- `400` — `{ "error": "clientId is required" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 9. 투표 집계 조회 (읽기 전용)

초기 진입, 새로고침, 전광판 동기화 시 현재 누적 투표수를 조회합니다.

**요청**

```
GET /api/votes/results
```

**응답 `200`**

```json
{
  "totalVotes": 128,
  "results": {
    "candidate1": 40,
    "candidate2": 55,
    "candidate3": 33
  },
  "updatedAt": "2026-03-31T09:10:11.123Z"
}
```

**에러**

- `500` — `{ "error": "Internal Server Error" }`

---

### 10. 점수 등록 (Supabase)

유저 점수를 누적 저장합니다. 동일 `userId`가 이미 있으면 기존 점수에 더해지고, 없으면 새로 생성됩니다.

**요청**

```
POST /api/scores
Content-Type: application/json
```

**Body**

| 필드     | 필수 | 타입   | 설명                                       |
| -------- | ---- | ------ | ------------------------------------------ |
| `userId` | 예   | string | 유저 식별자 (빈 문자열 불가, trim 후 사용) |
| `score`  | 예   | number | 0 이상의 정수                              |

**응답 `201`**

```json
{
  "ok": true,
  "userId": "player-001",
  "score": 120
}
```

**에러**

- `400` — `userId` 누락/공백: `{ "error": "userId is required" }`
- `400` — `score` 형식 오류(정수 아님 또는 음수): `{ "error": "score must be a non-negative integer" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 11. 리더보드 조회 (Supabase)

누적 점수 기준 리더보드를 조회합니다.

점수 기준으로 높은거부터 정렬해서 반환함

**요청**

```
GET /api/scores/leaderboard
```

**응답 `200`**

```json
{
  "leaderboard": [
    {
      "id": 1,
      "userId": "player-001",
      "totalScore": 320
    },
    {
      "id": 2,
      "userId": "player-002",
      "totalScore": 280
    }
  ]
}
```

`leaderboard` 항목 구조는 `ScoreService.getLeaderboard()` 구현을 따릅니다.

**에러**

- `500` — `{ "error": "Internal Server Error" }`

---

### 12. 게시글 등록 (Supabase)

게시글 1건을 저장합니다. `id`는 서버가 자동으로 1, 2, 3... 순서로 부여합니다.

**요청**

```
POST /api/posts
Content-Type: application/json
```

**Body**

| 필드       | 필수   | 타입   | 설명                            |
| ---------- | ------ | ------ | ------------------------------- | ----------------------------------- |
| `content`  | 예     | string | 게시글 내용 (공백만인 경우 400) |
| `nickname` | 아니오 | string | null                            | 작성자 닉네임. 없으면 `null`로 저장 |

**응답 `201`**

```json
{
  "ok": true,
  "post": {
    "id": 1,
    "nickname": "홍길동",
    "content": "재밌었어요!",
    "created_at": "2026-04-30T10:00:00.000Z"
  }
}
```

**에러**

- `400` — `content` 누락/공백: `{ "error": "content is required" }`
- `500` — `{ "error": "Internal Server Error" }`

---

### 13. 게시글 목록 조회 (Supabase)

전체 게시글을 등록 순서(`id` 오름차순)로 조회합니다.

**요청**

```
GET /api/posts
```

**응답 `200`**

```json
{
  "posts": [
    {
      "id": 1,
      "nickname": "홍길동",
      "content": "재밌었어요!",
      "created_at": "2026-04-30T10:00:00.000Z"
    },
    {
      "id": 2,
      "nickname": null,
      "content": "익명 게시글입니다.",
      "created_at": "2026-04-30T10:05:00.000Z"
    }
  ]
}
```

**에러**

- `500` — `{ "error": "Internal Server Error" }`
