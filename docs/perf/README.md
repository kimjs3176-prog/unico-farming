# 성능 예산 기록

예산: [`budget.json`](budget.json) (숫자 + 근거) · 점검: `npm run perf` (`scripts/perf-budget.mjs`) · 절차: `.claude/skills/unico-perf-budget/SKILL.md`
날짜별 보고서는 이 폴더에 `YYYY-MM-DD.md`.

## 2026-11-07 예산 처음 정함
- 그날 측정값에 약 15% 여유를 두어 정함 (근거는 `budget.json` 의 `why`). 11개 항목 통과, **실제 폰 프레임 시간은 판단 불가**(기기에서 재야 함)
- 드로우콜은 '10프레임 중 가장 무거운 한 프레임'(저사양은 그림자를 그리는 프레임)으로 잼 → 일일 점검의 '한 번 그리기' 수치(약 1,000·500)보다 큼. 둘을 섞어 비교하지 말 것
- 같이 고친 것: 매 프레임 새로 만들던 하늘·안개 색 11개(`world.js`, `scenery.js`)와 이동 방향 벡터(`player.js`)를 재사용으로 바꿈
