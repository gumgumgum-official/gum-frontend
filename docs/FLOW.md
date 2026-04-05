# [FLOW] 시스템 아키텍처 및 데이터 흐름

## 1. 하드웨어 간 데이터 흐름

1. **iPad (별도 프로젝트)**: 유저 입력 -> `POST /api/worry` -> Server
2. **Server**: 이벤트/REST -> Beam Projector & PC  
   - Beam(Stage2)은 handwriting realtime을 수신  
   - Monitor(Stage3)은 체험 시작 시 `POST /api/monitors/:id/start` 후 `GET .../current` 폴링으로 `worryId`/`svgUrl`을 받아 해당 글자를 1순위로 렌더링 (시작 화면 복귀 시 `POST .../complete`) — 흐름: [MONITOR_USER_FLOW.md](./MONITOR_USER_FLOW.md)
3. **Beam Projector**: 실시간 3D 텍스트 객체 렌더링 및 물리 시뮬레이션
4. **Arcade Button**: 물리 신호 -> PC 인터랙션 트리거

## 2. 인터랙션 상세 플로우

### [3D 텍스트 파괴 로직]

1. **수신**: 서버로부터 고민 키워드 수신.
2. **생성**: `TextGeometry`를 생성하고 `Cannon-es` Rigid Body 부여.
3. **충돌**: 섬 바닥에 낙하 후 물리적 더미 형성.
4. **파괴**: 아케이드 버튼 입력 시 해당 Mesh를 파편(Fragments)으로 교체 후 사방으로 비산.
5. **전환**: 파편 제거 후 동일 좌표에 `Sprite` 또는 3D 꽃 모델 인스턴스 배치.

## 3. Phase ↔ Stage 매핑

PRD의 Phase와 코드의 Stage는 1:1로 대응합니다. **본 프로젝트(gum-frontend)는 Stage 2~6만 포함**합니다.

| Phase | Stage | 내용 | 프로젝트 |
| :---- | :---- | :--- | :------- |
| Phase 1 | Stage 1 | 입국 신고서 (태블릿 폼 UI) | 별도 프로젝트 |
| Phase 2 | Stage 2 | 고민 시각화 (Beam Projector, 3D 텍스트 투하) | gum-frontend |
| Phase 3 | Stage 3 | 부셔버리자 (Cannon-es 파편, 꽃) | gum-frontend |
| Phase 4 | Stage 4 | 털어버리자 (Confetti, 댄스) | gum-frontend |
| Phase 5 | Stage 5 | 난 너의 편 (Raycasting 포옹, 폴라로이드) | gum-frontend |
| Phase 6 | Stage 6 | 헤어짐 (배웅, 말풍선) | gum-frontend |

## 4. 유저 시나리오 (User Journey)

- **입장**: 입국 신고서 작성 (아이패드, 별도 프로젝트)
- **관찰**: 내 고민이 섬으로 떨어지는 것을 빔 프로젝터로 확인
- **체험**: 체험 존 이동 후 버튼을 눌러 고민을 부수고 꽃을 피움
- **교감**: 껌딱지들과 춤추고 포옹하며 위로를 얻음
- **퇴장**: 공항 배경에서 껌딱지들의 배웅을 받으며 종료
