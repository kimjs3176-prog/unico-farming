---
name: unico-farm-assets
description: 유니코 팜 저장소의 3D 에셋(Blender bpy 스크립트 → GLB)과 마스코트 릴리프 캐릭터를 수정·재생성할 때 사용. "캐릭터 포즈 추가", "에셋 다시 빌드", "새 건물/동물 추가", "GLB 용량 줄이기" 요청에 트리거.
---

# 유니코 팜 에셋 파이프라인

## 환경
- `pip install bpy pymupdf` (Blender 5.x 파이썬 모듈, GPU 없이 동작. 렌더링은 불가하지만 glTF 내보내기는 가능)
- 미리보기는 Blender 렌더 대신 Three.js + Playwright 로 캡처한다 (`docs/screenshots` 참고). GPU 없는 컨테이너에서는 `chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})`.

## 환경 에셋 추가 (blender/build_environment.py)
1. `C.reset_scene()` 로 시작하는 함수를 만들고 `empty("루트이름")` 아래에 파트를 둔다.
2. 파트는 `sphere/box/cylinder/cone/segment/torus/prism` 으로 만들고 `join("MeshName", parts, parent=root)` 로 결합한다. 애니메이션이 필요한 파트(바퀴·날개·문)는 결합하지 말고 이름 있는 `empty` 피벗 아래에 둔다 (예: `WheelFL`, `Rotor1`, `Blades`).
3. `ASSETS` 딕셔너리에 등록 → `python3 blender/build_all.py <이름>` → `public/models/<이름>.glb`, `blender/blend/<이름>.blend`.
4. 색은 `common.PALETTE` 키 또는 `#rrggbb`. 전방은 Blender -Y (glTF +Z).
5. 게임에서는 `src/game/assets.js` 의 `ENV_MODELS` 에 이름을 추가하고 `world.place(name, x, z, rotY)` 로 배치한다.

## 캐릭터 포즈 추가 (blender/build_character_relief.py)
- 원본 AI 파일의 각 페이지에서 `vector_extract.extract_all()` 이 x 좌표로 클러스터링한 캐릭터를 `POSES` 에 `"포즈명": "p<페이지>_<클러스터>"` 로 매핑한다.
- 소품이 함께 그려진 포즈는 `CROP_X` 로 캐릭터 영역만 잘라낸다.
- 조각 수가 많으면 `DEPTH/GAP` 을 줄이거나 `BEZIER_STEPS` 를 낮춘다. 포즈당 200KB 이하 유지.
- 게임 쪽: `assets.js` 의 `UNICO_POSES` 와 `Unico` 생성 시 `extraPoses` 에 추가. 감정표현 메뉴는 `src/ui/ui.js` 의 `EMOTES`.

## 검증
- `npm test` (게임 규칙·서버 로직), `npx vite build`
- 스크린샷 투어: Playwright 로 서버(`node server/index.js`)를 띄우고 `window.game` API(`game.tractor.mount()`, `game.ui.openMarket()` 등)로 장면을 만든 뒤 캡처한다.
