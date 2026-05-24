좋아요. Draco 압축으로 GLB를 export 할게요. three.js에서 쓸 거라 그 환경에 맞는 옵션(애니메이션 포함, +Y up, Hand_R Empty 포함)으로 내보내겠습니다.

먼저 export 전에 상태를 한 번 정리하고(현재 프레임, 선택 등), 내보낼 경로를 잡을게요.상태 좋아요. Hand_R도 손 본에 잘 붙어있고 애니메이션도 살아있어요. 한 가지 — `아이코스피어`가 GLB에 포함돼 있는데, 이건 캐릭터와 무관한 오브젝트라 export에서 빼는 게 좋겠죠? 우선 빼고 내보내겠습니다 (필요하면 알려주세요).

Draco 압축으로 export 할게요.Export 성공했어요. Draco 압축으로 원본 4MB → **1.12MB**로 줄었습니다.

**저장 위치:** `/Users/a1234/Downloads/user_walk_v2_balloon_draco.glb`

포함된 것:

- 캐릭터 메시 전체 (Draco 압축, 머리·옷·신발 등 12개 메시)
- 본·스킨 웨이트
- 걷기 애니메이션 (0~25프레임), 오른팔만 풍선 자세로 고정된 상태
- **Hand_R** Empty (오른손 본에 부착 — 풍선 실 끝 앵커)
- three.js 표준 +Y up
- 아이코스피어는 제외

three.js에서 쓸 때 핵심 두 가지만 짚어둘게요:

**1) Draco 디코더 필수.** 일반 `GLTFLoader`만으로는 안 열려요. `DRACOLoader`를 붙여야 합니다:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const draco = new DRACOLoader();
draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/"); // 또는 로컬 경로
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load("user_walk_v2_balloon_draco.glb", (gltf) => {
  scene.add(gltf.scene);
  // 걷기 애니메이션 재생
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations[0]).play();
  // 렌더 루프에서 mixer.update(delta) 호출
});
```

**2) Hand_R 찾아서 풍선 붙이기.** Empty는 three.js에서 이름 있는 빈 `Object3D`(또는 본 자식)로 들어와요. 이렇게 찾아서 풍선 메시를 자식으로 add 하면 손을 따라다닙니다:

```js
const handR = gltf.scene.getObjectByName("Hand_R");
handR.add(balloonMesh); // 풍선/실 끝을 여기에 붙이면 손에 고정
```

참고로 캐릭터 스케일이 0.01(키 약 14유닛 → 월드 0.14)이라, three.js에서 너무 작게 보이면 `gltf.scene.scale.setScalar(...)`로 키우거나 카메라를 가까이 두세요.

파일 전달할게요.아, 그 파일은 **사용자님 로컬 맥의 Downloads 폴더**(블렌더가 돌고 있는 컴퓨터)에 저장된 거라, 제 작업 환경에서는 접근이 안 돼서 여기로 첨부할 수가 없어요. present_files는 제 쪽 파일만 전달할 수 있거든요.

하지만 걱정 마세요 — **파일은 이미 사용자님 컴퓨터에 정상적으로 생성됐어요.** 블렌더가 직접 디스크에 썼고, 크기(1.12MB)까지 확인됐으니까요.

바로 여기서 찾으시면 됩니다:

```
/Users/a1234/Downloads/user_walk_v2_balloon.glb
```

Finder에서 **다운로드 폴더**를 열면 `user_walk_v2_balloon.glb`가 있을 거예요. 이걸 three.js 프로젝트로 옮겨서 위에 알려드린 코드(DRACOLoader + Hand_R에 풍선 붙이기)로 쓰시면 됩니다.

혹시 다른 위치(예: 프로젝트 폴더)에 바로 저장하고 싶으시면 경로를 알려주세요. 그쪽으로 다시 export 할게요. 아니면 three.js 로딩 코드 전체(풍선 실 + Hand_R 연결까지 포
