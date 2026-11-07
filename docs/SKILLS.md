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
| | `game-ui-ux` | HUD 는 DOM 으로 분리, 상호작용 프롬프트에 키 힌트, 토스트 중첩 제한 (`src/ui/ui.js`). UI 테마 2: 모든 버튼에 마우스 올림·누름·키보드 포커스(`:focus-visible`)·비활성 상태, 바뀌는 숫자는 고정폭 숫자 (`src/ui/theme.css`) |
| | `rpg` | 퀘스트 카운터/보상/레벨 테이블 구조 (`src/game/sim/quests.js`) |
| | `procedural-gen` | 시드 기반 결정적 배치(mulberry32)로 나무·수풀·바위 산포 (`src/game/world.js`) |
| [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) (MIT, 9개 스킬, 디렉터 라우팅) | `threejs-gameplay-systems` | "플레이 가능한 핵심 루프 먼저" 원칙: 경작→판매→해금 루프를 먼저 완성한 뒤 미니게임 추가. 게임 규칙을 렌더링과 분리(`src/game/sim/`) |
| | `threejs-game-ui-designer` | 모바일 터치 컨트롤(가상 조이스틱 + 상호작용 버튼), 세이프 에어리어 고려한 하단 액션바. UI 테마 2: 스킬의 '웹 기본값처럼 보이는 크림색 판·알약 버튼 피하기, 세계의 소재로 바꾸기' 지침대로 창은 나무 액자 + 청록 리본 제목, 닫기는 빨간 둥근 단추, 하단 막대는 나무 선반 + 아이콘 칸, 안내·알림·목표는 같은 나무 테 이름표로 통일 (`src/ui/theme.css`) |
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

## 이 저장소 전용 스킬·규칙
- `.claude/skills/unico-farm-assets/SKILL.md` — Blender 에셋 재생성·포즈 추가·검증 절차
- `.claude/skills/unico-a11y-check/SKILL.md` — 접근성 점검 (WCAG 2.1 AA): `npm run a11y` 자동 점검 + 수동 점검표, 기록 `docs/a11y/`
- `.claude/skills/unico-perf-budget/SKILL.md` — 성능 예산: `docs/perf/budget.json` + `npm run perf`, 실제 폰 측정법, three.js 병목 점검표, 기록 `docs/perf/`
- `.claude/rules/` — 파일 경로에 따라 자동으로 적용되는 코드 규칙: `sim-code.md`(`src/game/sim/**` 순수 규칙·rng 주입·dt), `ui-code.md`(`src/ui/**`·`src/game/view/**` 상태는 sim 메서드로만·접근성·DOM 갱신), `test-standards.md`(`tests/**` 한국어 이름·결정적·버그 수정은 먼저 실패 확인)

### Claude-Code-Game-Studios 에서 옮긴 것 (2026-11-07 다시 조사)
엔진(Godot·Unity·Unreal)·프로젝트 설정 파일·자동 실행 스크립트(hooks)에 묶여 있어 통째로 설치하지 않고, **내용(기준·점검표·결과 형식)** 만 이 프로젝트 경로·도구에 맞게 다시 씀 (MIT).

| 원본 | 옮긴 곳 | 바꾼 점 |
|---|---|---|
| `agents/accessibility-specialist.md` | `unico-a11y-check` | 게임패드·리매핑 대신 터치·한국어·DOM UI, 자동 점검 스크립트 추가 |
| `skills/perf-profile`, `agents/performance-analyst.md` | `unico-perf-budget` | `project.yaml` 대신 `docs/perf/budget.json`, `Update/Tick` 대신 `renderer.info`·`loop()` 시간 |
| `rules/gameplay-code.md` | `.claude/rules/sim-code.md` | 외부 설정 파일 대신 데이터 모듈·이름 붙은 상수, 엔진 이벤트 대신 sim 메서드, rng 주입 |
| `rules/ui-code.md` | `.claude/rules/ui-code.md` | 번역 시스템·게임패드 빼고 한국어 조사(`josa`)·터치·글자 크기 설정 |
| `rules/test-standards.md` | `.claude/rules/test-standards.md` | gdUnit4/NUnit 대신 `node --test`, 한국어 테스트 이름 |

조사 결과 다음 후보(아직 안 옮김): `agents/economy-designer.md`(화폐 유입·유출 모델), `skills/tech-debt`(긴 파일·TODO 목록), `skills/patch-notes`(플레이어용 업데이트 소식).

## 설치 방법 (다른 프로젝트에서)
```bash
npx skills add gamedev-skills/awesome-gamedev-agent-skills      # 라우터가 엔진/작업별 스킬 선택
npx skills add majidmanzarpour/threejs-game-skills --skill '*' -a claude-code -g -y
npx skills add majidmanzarpour/blender-game-skills --skill blender-image-to-3d -a claude-code
```

## 시각 스코어카드 자체 평가 (`threejs-aaa-graphics-builder/references/visual-scorecard.md`)

0 자리표시 · 1 기본 스타일 · 2 프리미엄 스타일 · 3 쇼케이스. 직접 찍은 플레이 화면(`docs/screenshots`)을 근거로 한 자체 평가이며 외부 평가가 아닙니다.

| 항목 | 1차 | 2차 | 근거 |
|---|---|---|---|
| 아트 디렉션 | 2 | 2.5 | 농촌 마을 테마가 지면·재질·소품·논·UI·색 보정까지 일관 |
| 주인공 | 2 | 2.5 | 이음새 없는 두 발 유니코, 팔·다리 스키닝, 표정·감정표현·옷차림, 발밑 링·이름표 상태 표시 |
| 역할 구분 | 2 | 2.5 | 주민은 네 발 + 역할 색, 바위·잡초·입질 등 위험·신호가 형태로 구분 |
| 상호작용 대상 | 2 | 2 | 밭·논·나무·곤충·주민마다 안내·아이콘·패널·반짝임 피드백 |
| 월드 | 2 | 2.5 | 근경 소품·중경 마을·원경 산맥, 곡선 흙길, 들꽃 군락, 구름 그림자 |
| 재질 | 1.5 | 2 | 재질별 절차적 디테일(나뭇결·기와·칠 바램·돌·잎·짚·금속·털), 접지 어둠. 손으로 그린 텍스처 수준은 아님 |
| 조명/렌더 | 2 | 2.5 | ACES + 색 보정, 키·필·림, 캐릭터 프레넬 림, 구운 AO, 날씨·낮밤 연동 |
| 효과/모션 | 2 | 2.5 | 반짝임·흙먼지·물보라·비·눈·번개·화면 흔들림, 스키닝 걷기 |
| UI/HUD | 2 | 2 | 날씨 칩·미니맵·액션바·논 상태·도감·운전 버튼, 터치 대응 |
| 성능 근거 | 2 | 2 | 드로우콜 835(고)/393(저), 정적 병합, 저사양 프리셋, 캐릭터 1회 그리기 |

평균 약 2.3, 모든 항목 2 이상으로 스킬이 정한 '프리미엄' 기준(모든 항목 ≥2, 평균 ≥2.3)에 턱걸이로 닿았습니다. 쇼케이스(3)로 가려면 손으로 그린 텍스처·이미지/3D 생성 모델을 이용한 대표 에셋 교체, 실제 모바일 기기 프로파일링이 필요합니다.
