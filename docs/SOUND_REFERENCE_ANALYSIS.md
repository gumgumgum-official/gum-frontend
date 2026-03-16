# 사운드 레퍼런스 분석 — reference 내부 기준

이 문서는 **reference 폴더 안에서만** 사운드가 **어디서 어떻게 쓰였는지** / **쓰이지 않았는지** 나누고, 각각 **어떻게 활용했는지·써먹을 수 있는지** 구체적으로 정리한 것이다.  
(프로젝트 src 코드는 대상이 아니다.)

---

## 1. 요약


| 구분                  | 내용                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **레퍼런스 내에서 활용된 부분** | **resources/sounds/** 안 GarageBand 프로젝트(.band)가 **Media/Audio Files/** 의 wav를 사용. 그 결과물로 **reveal/career/whisper 프리뷰 mp4** 존재. 문서(readme, sources/index.html)에서 **static/sounds/musics** 언급·다운로드 링크. |
| **레퍼런스 내에서 미활용**    | **reference/static/sounds/** 아래 대부분 mp3(achievements, bell, birdTweets, circuit, hits, vehicle 등 **79개**) — 레퍼런스 내 어떤 band, HTML, 문서에서도 참조되지 않음.                                                     |


---

## 2. 레퍼런스 내에서 활용된 부분

### 2.1 resources/sounds/ — GarageBand 프로젝트에서 쓰는 wav

각 **.band**는 GarageBand 프로젝트 번들이다. 프로젝트 데이터(ProjectData 등) 안에서 **Media/Audio Files/** 경로의 wav 파일명이 참조되어, **그 프로젝트 내에서 실제로 활용**된다.

#### reveal-preview.band (리빌/공개 연출)


| 파일 (Media/Audio Files/)                                        | 레퍼런스 내 활용           | 어떻게 써먹을 수 있는지                  |
| -------------------------------------------------------------- | ------------------- | ------------------------------ |
| Woosh 1.wav                                                    | 프로젝트에서 휙 소리 트랙으로 사용 | 카드 뒤집기, 화면 전환, “공개” 순간의 후처리 소리 |
| Epic Bell Impact Hit.wav                                       | 벨/타격 트랙으로 사용        | 중요한 이벤트(보상 공개, 스테이지 클리어) 강조음   |
| Mountain Audio - Small Chimes - Sound (1).wav                  | 짧은 차임 트랙            | 마법/신비 구간, 작은 성공 피드백            |
| Whoosh Backwards 4.wav, LDj_Audio - Whoosh Reverse 2 (Wav).wav | 역방향 후시 트랙           | 시간 되감기, “되돌리기” 연출              |
| Water Drops.wav                                                | 물방울 레이어             | 비/이슬, 클린한 전환 분위기               |
| Daft_Punk_-_Aerodynamic_Bell_Intro_KLICKAUD.wav                | 벨 인트로               | 강한 오프닝/스타트 신호                  |
| BellTowerClassicT PE191201_1.wav                               | 종탑 벨                | 대형 공개/엔딩 직전                    |
| EFX_SD_Crystal_Glass_Ring_Out_01.wav                           | 크리스탈 링              | 보상/언락 직후 짧은 “반짝” 피드백           |


**결과물**: `resources/sounds/reveal-preview.mp4` — 위 소스들을 믹싱한 **리빌/공개** 시나리오 프리뷰.  
**써먹는 법**: “리빌”, “보상 오픈”, “스테이지 공개” 같은 순간에 위 wav를 조합하거나, mp4를 참고해 타이밍/무드만 가져와 우리 쪽 sfx로 대체할 수 있다.

---

#### career-preview.band (커리어/업그레이드 연출)


| 파일 (Media/Audio Files/)                                        | 레퍼런스 내 활용      | 어떻게 써먹을 수 있는지       |
| -------------------------------------------------------------- | -------------- | ------------------- |
| Source Stone Loop Slide Heavy Grinding Movement 02.wav         | 돌/슬라이드 그라인딩 루프 | 문/암벽 열림, 무거운 기계 움직임 |
| Source Stone Loop Slide Heavy Grinding Movement 02-reverse.wav | 역재생 그라인딩       | 닫힘, 되감기             |
| Tube_Donk_Hollow_Hits_ODY-1733-044.wav                         | 둥근 타격          | 업그레이드 완료, “확정” 타격음  |


**결과물**: `resources/sounds/career-preview.mp4` — 커리어/업그레이드 시나리오 프리뷰.  
**써먹는 법**: 스테이지 전환, “레벨 업”, “업그레이드 완료” UI에 그라인딩 + 타격을 조합해서 쓰거나, mp4를 레퍼런스로 삼아 우리 sfx 톤을 맞출 수 있다.

---

#### whisper-preview.band (비밀/불 연출)


| 파일 (Media/Audio Files/)             | 레퍼런스 내 활용 | 어떻게 써먹을 수 있는지   |
| ----------------------------------- | --------- | --------------- |
| MatchStrikeQuickMa BB010501.wav     | 성냥 쳐불     | 불 붙는 순간, 이벤트 시작 |
| FIREIgn_Fire Flame_SDFIRE0796_1.wav | 불꽃 점화     | 캠프파이어/토치 점화     |
| flame_by_l_r_07.wav                 | 불 타오르는 루프 | 불 주변 앰비언트       |


**결과물**: `resources/sounds/whisper-preview.mp4` — 비밀/불 분위기 프리뷰.  
**써먹는 법**: “비밀 구역 진입”, “불 켜기” 같은 순간에 점화음 → 불 루프로 전환하는 구조를 그대로 가져오거나, static/sounds/fire 계열과 교체 후보로 쓸 수 있다.

---

#### projects-lab-preview.band (프로젝트/랩 연출)


| 파일 (Media/Audio Files/)                                    | 레퍼런스 내 활용 | 어떻게 써먹을 수 있는지     |
| ---------------------------------------------------------- | --------- | ----------------- |
| WOODMvmt_Light Wood Planks Hits And Rustle_PREM12-3344.wav | 나무 판자 움직임 | 서랍/문 열기, 가벼운 오브젝트 |
| Wooden Plank Drag 1.wav, Heavy Wood Drag 19.wav            | 판자 드래그    | 끌기/밀기 인터랙션        |
| Old Wooden Plank Drop 3.wav, 4.wav, 7.wav                  | 판자 떨어뜨림   | 오브젝트 놓기, 퍼즐 블록    |
| CLOTH_Blanket_02_SDLX-3.wav                                | 천 소리      | 커튼, 덮개, 부드러운 UI   |
| Finger_click.wav                                           | 손가락 클릭    | 버튼/스위치, 터치 피드백    |


**결과물**: projects-lab 시나리오용 band만 있고, 동일 이름 mp4는 없음.  
**써먹는 법**: 랩/프로젝트 스테이지에서 “클릭 → 판자/드래그 → 드롭” 흐름에 그대로 매핑하거나, static/sounds/mecanism, hits와 조합해 쓸 수 있다.

---

### 2.2 resources/sounds/ — 결과물 mp4


| 파일                  | 레퍼런스 내 역할                  | 어떻게 써먹을 수 있는지                                                |
| ------------------- | -------------------------- | ------------------------------------------------------------ |
| reveal-preview.mp4  | reveal-preview.band 믹싱 결과  | “리빌” 연출의 **최종 퀄리티 레퍼런스**. 영상+사운드 타이밍을 보고 우리 쪽 reveal sfx 설계. |
| career-preview.mp4  | career-preview.band 믹싱 결과  | “커리어/업그레이드” 연출 레퍼런스. 그라인딩·타격 타이밍 참고.                         |
| whisper-preview.mp4 | whisper-preview.band 믹싱 결과 | “비밀/불” 연출 레퍼런스. 점화→불 루프 구조 참고.                               |


**정리**: 레퍼런스 **내부**에서는 이 mp4들이 “사운드가 활용된 **결과물**”이다. 우리는 이걸 **퀄리티 레퍼런스**로 들어보고, 비슷한 연출을 우리 sfx로 구현하면 된다.

---

### 2.3 문서에서의 활용 — static/sounds/musics


| 위치                                        | 내용                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| reference/readme.md                       | Game loop에 “Audio (View, Objects)” 스텝 존재.                                                               |
| reference/sources/index.html              | “Behind the scene” → “Musics” 문단에서 **static/sounds/musics** 링크로 BGM 다운로드 안내. Audio 라이브러리로 Howler.js 언급. |
| reference/static/sounds/musics/license.md | BGM(Sudo, Boy, Baguira) CC0 라이선스 안내.                                                                    |


**레퍼런스 내 활용**: **문서/UI 텍스트**에서 `static/sounds/musics`를 “사용한 BGM”으로 **언급**하고, 다운로드 링크로 제공.  
**써먹는 법**: BGM 후보로 Sudo, Boy, Baguira를 그대로 쓰거나(라이선스 확인), 같은 톤의 트랙을 구할 때 퀄리티 레퍼런스로 사용.

---

### 2.4 reference/sources — 기타 사운드 관련

- **sources/index.html** 에서 `preload` 로 `/intro/sound.ktx` 로드.  
  - reference/static/intro 에 `sound.ktx`, `sound.png` 가 있음.  
  - 확장자상 **텍스처(이미지)** 로 쓰이는 자산이며, **오디오 파일은 아님**.  
  - 따라서 “레퍼런스 내에서 **사운드**가 활용된 부분”에는 포함하지 않음.

---

## 3. 레퍼런스 내에서 미활용인 부분

**reference/static/sounds/** 아래 다음 카테고리들은, **레퍼런스 안의 어떤 .band, HTML, readme, index에도 참조되지 않는다.**  
즉 “레퍼런스 **내부**에서는 활용되지 않은, 수집만 되어 있는 고퀄리티 sfx 풀”이다.

아래는 **레퍼런스에서는 안 썼지만**, 우리가 설계할 때 **이렇게 써먹을 수 있다**는 식으로만 정리한다.

---

### 3.1 achievements


| 파일                 | 활용(레퍼런스 내) | 써먹을 수 있는 방법                               |
| ------------------ | ---------- | ----------------------------------------- |
| Money Reward 2.mp3 | 미사용        | 스테이지 클리어, 코인/포인트, 업적 달성 시 한 번 재생. 짧은 보상음. |


---

### 3.2 anvil


| 파일                                                           | 활용(레퍼런스 내) | 써먹을 수 있는 방법                                                           |
| ------------------------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| METLImpt_Anvil Single Hammer Strike Hammers_GENHD1-01372.mp3 | 미사용        | 제작/업그레이드 완료, “확정” 버튼, 무거운 한 방 피드백. career-preview의 Tube_Donk와 비슷한 역할. |


---

### 3.3 bell


| 파일                       | 활용(레퍼런스 내)                                 | 써먹을 수 있는 방법                                  |
| ------------------------ | ------------------------------------------ | -------------------------------------------- |
| Death Hit.mp3            | 미사용                                        | 실패/게임 오버/잘못된 선택.                             |
| Epic Bell Impact Hit.mp3 | 미사용 (reveal-preview.band에는 **.wav** 버전 사용) | 중요한 이벤트, 대형 리워드, 스테이지 오프닝. mp3는 band 밖에만 있음. |


---

### 3.4 birdTweets


| 파일                                                                                               | 활용(레퍼런스 내) | 써먹을 수 있는 방법                         |
| ------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------- |
| 20711 finch…, 24074 small bird…-1·2, 30673 Yellowhammer…, 31062 Ortolan…, 31451 Ortolan bunting… | 전부 미사용     | 숲/자연 스테이지 앰비언트. 일정 간격 랜덤 재생, 볼륨 낮게. |


---

### 3.5 circuit


| 파일                                                | 활용(레퍼런스 내) | 써먹을 수 있는 방법           |
| ------------------------------------------------- | ---------- | --------------------- |
| applause/huge win.mp3                             | 미사용        | 스테이지 클리어, 대형 성공 시 환호. |
| checkpoint/Win Score 1.mp3                        | 미사용        | 중간 체크포인트, 소규모 성공.     |
| countdown/Game Start Countdown 31-1.mp3, 31-2.mp3 | 미사용        | 스테이지/미니게임 시작 카운트다운.   |
| finish/Big Win Fanfare 2.mp3                      | 미사용        | 최종 클리어, 엔딩.           |


---

### 3.6 clicks


| 파일                                                       | 활용(레퍼런스 내) | 써먹을 수 있는 방법                                              |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Source Metal Clicks Delicate Light Sharp Clip Mid 07.mp3 | 미사용        | 버튼/탭/토글 공통 클릭음. (projects-lab의 Finger_click.wav와 유사 용도.) |


---

### 3.7 crickets / ding / fire / hits / jingleBells / jukebox / magic / mecanism / paper / rain / rolling / reveal / rooster / stoneSlides / swoosh / thunder / tv / vehicle / waves / wind / owl / wolf / explosions

- **레퍼런스 내**: 모두 **미참조**.  
- **써먹을 수 있는 방법**은 이전에 작성한 “카테고리별 활용 가이드”와 동일한 맥락으로 사용하면 된다.  
  - 예: fire → 불 점화/루프, hits → 타격/충돌/발소리, vehicle → 엔진/경적/바퀴, waves/wind/rain → 스테이지 앰비언트, reveal → 카드 오픈 등.

---

### 3.8 static/sounds/reveal/reveal-1.mp3

- **레퍼런스 내**: 미사용. (reveal-preview.band는 **wav**만 사용, static mp3는 미참조.)  
- **써먹을 수 있는 방법**: 카드 뒤집기, 보상 오픈 등 “공개” 연출 시 reveal-preview.mp4와 함께 참고해 사용.

---

## 4. 정리

- **레퍼런스 내에서 활용된 것**  
  - **resources/sounds/** 의 **.band**가 **Media/Audio Files/** 의 wav를 사용.  
  - 그 **결과물**인 reveal/career/whisper **mp4**와, 문서에서의 **static/sounds/musics** 언급·다운로드 링크.
- **레퍼런스 내에서 미활용**  
  - **static/sounds/** 의 **대부분 mp3**(achievements, bell, birdTweets, circuit, hits, vehicle 등 79개).  
  - 레퍼런스 내 band/HTML/문서 어디에서도 참조되지 않지만, 위 표처럼 **우리 사운드 설계에서 구체적으로 써먹을 수 있는** 고퀄리티 레퍼런스다.

이 문서는 **reference 이 레퍼런스 내에서만** “활용된 부분 / 미활용 부분”으로 나누고, 각각 **어떻게 활용했는지·어떻게 써먹을 수 있는지**만 정리한 것이다.