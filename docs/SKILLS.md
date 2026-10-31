# 게임 제작에 활용한 GitHub 에이전트 스킬

Anthropic 이 공개한 **Agent Skills(SKILL.md) 포맷**의 커뮤니티 스킬 중, 이 프로젝트(Three.js 브라우저 게임 + Blender 에셋)에 맞는 것을 조사해 `.claude/skills/vendor/` 에 복사했습니다. Claude Code 는 `.claude/skills/` 아래 스킬을 작업 맥락에 맞춰 자동으로 불러옵니다.

> 별점은 2026-10-31 기준 웹 검색·서드파티 통계 사이트 수치이며 GitHub 페이지에서 직접 확인한 값이 아닙니다(대략치).

## 복사해 둔 스킬 (`.claude/skills/vendor/`)

| 출처 | 스킬 | 이 프로젝트에 적용한 내용 |
|---|---|---|
| [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (Apache-2.0, 77개 스킬, 엔진별 라우터 포함) | `threejs-scene-setup` | `THREE.Clock` 대신 `THREE.Timer` + `renderer.setAnimationLoop()` 사용, 탭 복귀 시 dt 클램프, 리사이즈 시 `updateProjectionMatrix` (`src/main.js`) |
| | `threejs-gltf-loading` | GLB 는 원본 씬을 캐시하고 `clone()` 으로 인스턴스화, 그림자 플래그 일괄 설정 (`src/game/assets.js`) |
| | `threejs-materials-lighting` | Hemisphere + Directional(그림자) + 약한 Ambient 조합, 머티리얼 roughness 통일 (`src/game/world.js`) |
| | `game-feel` | 트라우마(trauma²) 기반 화면 흔들림(바위 충돌·밭 갈기), 수확/수집 시 스쿼시&스트레치 팝 (`src/game/juice.js`) |
| | `save-systems` | 저장 데이터 버전 필드 + 마이그레이션 훅 (`src/game/save.js`) |
| | `camera-systems` | 3인칭 추적 카메라의 지수 감쇠 스무딩, 피치/거리 클램프 (`src/game/camera.js`) |
| | `game-ui-ux` | HUD 는 DOM 으로 분리, 상호작용 프롬프트에 키 힌트, 토스트 중첩 제한 (`src/ui/ui.js`) |
| | `rpg` | 퀘스트 카운터/보상/레벨 테이블 구조 (`src/game/sim/quests.js`) |
| | `procedural-gen` | 시드 기반 결정적 배치(mulberry32)로 나무·수풀·바위 산포 (`src/game/world.js`) |
| [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) (MIT, 9개 스킬, 디렉터 라우팅) | `threejs-gameplay-systems` | "플레이 가능한 핵심 루프 먼저" 원칙: 경작→판매→해금 루프를 먼저 완성한 뒤 미니게임 추가. 게임 규칙을 렌더링과 분리(`src/game/sim/`) |
| | `threejs-game-ui-designer` | 모바일 터치 컨트롤(가상 조이스틱 + 상호작용 버튼), 세이프 에어리어 고려한 하단 액션바 |
| | `threejs-qa-release` | 프로덕션 빌드 + 헤드리스 브라우저 콘솔 체크 + 데스크톱/모바일 뷰포트 스크린샷 투어로 검증 (`docs/screenshots`) |
| | `threejs-debug-profiler` | 검은 화면/리사이즈/모바일 버그 진단 플레이북 (초기 `obstacle` 미정의 크래시를 콘솔 체크로 발견·수정) |
| | `threejs-aaa-graphics-builder` | "형태 → 재질 → 조명 → 효과" 순서와 10개 항목 시각 스코어카드로 필드 2차 개선: 한 장으로 칠한 지면(곡선 흙길·구운 AO), 근·중·원경 레이어(소품→과수원·논→원경 산맥), 키·필·림 조명, 블룸은 발광체에만, 렌더러 수치 보고 |
| | `threejs-game-director` | 핵심 루프를 먼저 완성하고 증거(스크린샷·브라우저 검증)로 확장하는 작업 순서 |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (MIT, 약 2.5만~3만★, 이번 조사에서 가장 인기 있는 게임 제작 스킬 모음) | `balance-check` | 자원 유입·유출 지도, 지배 전략·차익 루프 점검 절차를 `scripts/balance.mjs` 로 구현 → 쌀 ★5 가 최고 작물의 5배라는 지배 전략을 찾아 단가 조정, 쓸모없던 달걀·양배추·옥수수 상향 (`docs/BALANCE.md`) |
| | `design-system`, `quick-design`, `playtest-report`, `ux-review`, `art-bible` | 새 시스템(논·낚시·주민) 설계 체크리스트, 브라우저 자동 플레이 테스트, UX 점검(마우스·터치 동등 조작, 클릭 가능한 안내) 참고용. 원본은 저장소 훅에 의존해 절차 문서로만 보관 |
| [majidmanzarpour/blender-game-skills](https://github.com/majidmanzarpour/blender-game-skills) (MIT) | `blender-image-to-3d` | 레퍼런스 이미지 → 게임용 3D 의 단계별 게이트(브리프→형태→토폴로지→내보내기→라운드트립 검증) 를 참고해, 캐릭터는 원본 벡터 릴리프 방식으로 전환하고 결과를 매 단계 스크린샷으로 원본과 비교 |

## 조사했지만 복사하지 않은 것

| 저장소 | 내용 | 비고 |
|---|---|---|
| [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp) (MCP for Blender, MIT, 약 2.1만~2.9만★) | Claude 등 AI 가 Blender 를 소켓으로 직접 조작하는 MCP 서버 + 애드온. `execute_blender_code`, `get_scene_info`, Poly Haven/Sketchfab 에셋 가져오기, Tripo/Hunyuan3D 생성 | 이 환경은 GUI Blender 가 없어 `bpy` 모듈을 직접 호출했습니다. 로컬 Blender 에서 대화형으로 에셋을 다듬을 때 권장 |
| [OpenAEC-Foundation/Three.js-Claude-Skill-Package](https://github.com/OpenAEC-Foundation/Three.js-Claude-Skill-Package) | Three.js r160+/R3F/WebGPU 24개 스킬 | R3F 중심이라 바닐라 three.js 프로젝트엔 과함 |
| [full-stack-skills/threejs-skills](https://github.com/full-stack-skills/threejs-skills), [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | Three.js 기초/셰이더/로더/애니메이션 스킬 | 위 awesome-gamedev 스킬과 내용 중복 |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | 49 에이전트 + 72 스킬의 "게임 스튜디오" 오케스트레이션 | 대규모 팀 시뮬레이션용. 1인 프로젝트엔 과함 |
| [HermeticOrmus/claude-code-game-development](https://github.com/HermeticOrmus/claude-code-game-development), [cream67/gamedev-claude-skills](https://github.com/cream67/gamedev-claude-skills) | Godot/Unity/Roblox/Blender 플러그인 모음 | 엔진이 다름 |
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic 공식 스킬 저장소(문서·PPTX·PDF 등) | 게임 전용 스킬은 없음. 이 세션에서는 내장 `artifact`/`docx` 류 스킬만 참고 |

## 이 저장소 전용 스킬
- `.claude/skills/unico-farm-assets/SKILL.md` — Blender 에셋 재생성·포즈 추가·검증 절차

## 설치 방법 (다른 프로젝트에서)
```bash
npx skills add gamedev-skills/awesome-gamedev-agent-skills      # 라우터가 엔진/작업별 스킬 선택
npx skills add majidmanzarpour/threejs-game-skills --skill '*' -a claude-code -g -y
npx skills add majidmanzarpour/blender-game-skills --skill blender-image-to-3d -a claude-code
```
