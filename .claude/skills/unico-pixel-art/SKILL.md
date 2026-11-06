---
name: unico-pixel-art
description: 유니코 팜 도트(2.5D) 버전(pixel.html, src/pixel/)의 도트 그림·맵·HD-2D 효과를 고치거나 새 스프라이트(캐릭터·건물·작물·아이콘)를 추가할 때 사용. "도트 추가", "픽셀 캐릭터", "도트 버전 맵 수정", "스프라이트 다듬기" 요청에 트리거.
---

# 유니코 팜 도트 버전

## 구조
- `pixel.html` → `src/pixel/main.js` (입력·루프). 게임 규칙은 3D 판과 같은 `src/game/sim/*` 를 그대로 씀
- `pxl.js`: 코드로 도트를 찍는 작은 엔진 (램프·타원 돔 명암·다각형·문자 격자·거울·자동 셀아웃 외곽선·팔레트 교체)
- `palette.js`: 재질별 명암 램프(어두움→밝음). 빛나는 재질은 `{ glow: true }` → 밤 조명·블룸
- `art_chars.js`(유니코 4방향×걷기 4프레임, 시바견, 소·양·닭), `art_world.js`(나무·건물·소품·작물·아이콘·말풍선)
- `sprites.js`: 시작할 때 전부 캔버스로 구움. `map.js`: 56×40 타일(32px) 지도와 충돌. `render.js`: 지형 픽셀 굽기 + y 정렬 + 조명 + 후처리. `game.js`: 자유 이동(주인공)·칸 이동(주민·가축)·논농사·트랙터·상호작용·저장. `ui.js`/`style.css`: 갈무리 글꼴 UI

## 도트 규칙 (crsolver/claude-pxl 스킬의 습관을 따름)
1. 색은 팔레트 램프만. 재질당 2~5단. 새 색이 필요하면 `palette.js` 에 램프를 추가
2. 대칭은 반만 그리고 `mirrorX()`, 외곽선은 손으로 그리지 말고 마지막에 `outline()` (이웃 재질의 가장 어두운 색)
3. 부위가 겹치는 경계는 `contour()`(이미 칠한 곳 위에만 1px 어두운 선)로 구분
4. 의미 없는 점 노이즈 금지. 표면 무늬는 판자 줄·기와 줄·잎 덩어리·이랑처럼 이유가 있는 것만. 디더는 명암 경계에서만 약하게(`dither` 0.05~0.15)
5. 광원은 왼쪽 위. 그늘 쪽은 차갑게, 빛 쪽은 따뜻하게

## 미리보기·확인
- `npx vite` 후 `http://localhost:5173/pixel-sheet.html?s=4&only=player` (그룹 이름으로 거르기, `src/pixel/sheet.js` 에 새 스프라이트를 추가해 둘 것)
- 게임: `http://localhost:5173/pixel.html`, 콘솔에서 `__pixel.game`(상태), `__pixel.R.fx`(효과 켜고 끄기)
- Playwright 로 캡처해서 직접 눈으로 본다. 테스트: `npm test` (tests/pixel_map.test.js 가 지도 연결·충돌을 검사)

## 새 건물·소품 추가
1. `art_world.js` 에 `export function 이름(night=false)` (밤에 빛나는 창은 `win` 램프)
2. `sprites.js` 에서 굽기 (`{ day: cv(..), night: glow(..) }`)
3. `map.js` 의 `buildMap()` 에 `objs.push({ type, x, y, w })` + `block(...)` 으로 충돌
4. `render.js` 의 `buildStatics()` 에 그리기 위치(바닥 기준)와 조명(`this.lights`)
5. 상호작용은 `game.js` 의 `targetInfo()`
