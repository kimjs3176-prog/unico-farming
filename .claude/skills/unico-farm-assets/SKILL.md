---
name: unico-farm-assets
description: 유니코 팜 저장소의 3D 환경 에셋(Blender bpy 스크립트 → GLB)과 코드로 만든 유니코 캐릭터를 수정·재생성할 때 사용. "캐릭터 포즈 추가", "에셋 다시 빌드", "새 건물/동물 추가", "GLB 용량 줄이기" 요청에 트리거.
---

# 유니코 팜 에셋 파이프라인

## 환경
- `pip install bpy pymupdf` (Blender 5.x 파이썬 모듈, GPU 없이 동작. 렌더링은 불가하지만 glTF 내보내기는 가능)
- 미리보기는 Blender 렌더 대신 Three.js + Playwright 로 캡처한다 (`docs/screenshots` 참고). GPU 없는 컨테이너에서는 `chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})`.

## 환경 에셋 추가 (blender/build_environment.py)
1. `C.reset_scene()` 로 시작하는 함수를 만들고 `empty("루트이름")` 아래에 파트를 둔다.
2. 파트는 `sphere/box/cylinder/cone/segment/torus/prism` 으로 만들고 `join("MeshName", parts, parent=root)` 로 결합한다. 애니메이션이 필요한 파트(바퀴·날개·문)는 결합하지 말고 이름 있는 `empty` 피벗 아래에 둔다 (예: `WheelFL`, `Rotor1`, `Blades`).
3. `ASSETS` 딕셔너리에 등록 → `python3 blender/build_all.py <이름>` → `public/models/<이름>.glb`, `blender/blend/<이름>.blend` → `npm run models:compress` (meshopt 압축, crops.glb 제외).
4. 색은 `common.PALETTE` 키 또는 `#rrggbb`. 전방은 Blender -Y (glTF +Z).
5. 게임에서는 `src/game/assets.js` 의 `ENV_MODELS` 에 이름을 추가하고 `world.place(name, x, z, rotY)` 로 배치한다.

## 외부 CC0 에셋 (Quaternius)
- 헛간·사일로·우물·닭장·풍차·나무·바위 등은 `public/models/q_farm.glb`, `q_nature.glb` 묶음. 최상위 노드 이름(`barn`, `tree_3`, `mossrock_2` …)이 곧 모델 이름이다 (`assets.js` 의 `PACK_MODELS`).
- 뼈대 애니메이션 동물은 `q_cow/q_horse/q_donkey/q_alpaca/q_shiba.glb` (`ANIMATED_MODELS`), `assets.cloneAnimated(name)` → `{root, mixer, clips}`, 동작 이름 walk/idle/eat/look/run/jump/idle2. 전환은 `ranch_view.js` 의 `playClip()`.
- 새 CC0 모델 추가: `blender/import_cc0.py` 의 `PACKS` 에 (노드 이름, FBX, 배율) 추가 → `scripts/optimize-cc0.mjs` 의 색 표(재질 이름이 `surface.js kindOf()` 질감을 결정) 확인 → 두 스크립트 실행 → `docs/ASSETS_CC0.md` 표 갱신. 라이선스가 CC0 인 것만 넣는다.
- meshopt 로 양자화돼 있으므로 정적 메시는 로드 시 `dequantize()` 로 Float32 로 풀린다(정적 병합 호환).

## 캐릭터 (Blender 아님)
- 유니코는 `src/game/unico.js` 에서 Three.js 도형으로 조립한다 (사용자 요청: 블렌더 조형 캐릭터 사용 금지).
- 부품 추가는 `buildTemplate()` 의 해당 피벗(body/head/eyes/leg/tail/소품) 배열에 `[geometry, material]` 을 넣는다. 머티리얼은 `C.*` 공유 팩토리 사용.
- 새 감정표현은 `EMOTE_ICON` 과 `update()` 의 `switch (this.action)` 에 추가하고, 메뉴는 `src/ui/ui.js` 의 `EMOTES`.
- 새 옷차림은 템플릿에 bundle 추가 → `acc` 에 등록 → `setOutfit()` 에서 표시 조건.

## 검증
- `npm test` (게임 규칙·서버 로직), `npx vite build`
- 스크린샷 투어: Playwright 로 서버(`node server/index.js`)를 띄우고 `window.game` API(`game.tractor.mount()`, `game.ui.openMarket()` 등)로 장면을 만든 뒤 캡처한다.
