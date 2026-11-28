# 리뷰어 요청문

리뷰어는 아트 디렉터처럼 그림과 숫자를 보고 파일은 고치지 않는다. 별도 컨텍스트에서 일한다: 수정 이력 없이 요청에 담긴 것만 받는다.

**부르는 법.**
- 같은 모델의 서브에이전트: 깨끗한 컨텍스트의 에이전트를 띄우고 아래 요청문과 그림 경로를 준다. 매번 새 에이전트이므로 필요한 것을 모두 요청에 넣는다: 콘셉트, 계약서, 렌더. (유니코 팜: 계약서 대신 `docs/CHARACTERS.md` 의 해당 절 경로와 `references/unico-chibi-body.md` 규칙)
- MCP 로 연결한 다른 모델(예: Codex): 스타일 기준을 공유하려고 프로젝트당 스레드 하나를 둘 수 있지만(id 는 `CLAUDE.md` 에 적음), 요청마다 서브에이전트처럼 필요한 것을 모두 넣고 수정 이력을 다시 이야기하지 않는다. 이런 리뷰어는 그림을 생성할 수도 있다: 경로에 파일로 저장하게 하고 직접 확인한다.

요청마다 에셋 이름을 밝히고, 짧게, 영어로, 파일 경로와 함께 쓰고, 숫자가 있는 짧은 답을 요청한다. (요청문은 원문 그대로 영어로 둔다 — 리뷰어 답의 형식이 안정적이다.)

## 1. 콘셉트에서 모델 시트

```
You are the art director for a stylised game asset. Concept: <path>. Produce an orthographic model sheet for a 3D
modeller: front, side, back and 3/4 views at the same scale, neutral pose. If you can generate images, also save the
sheet to <path>. Give proportions of each major mass as fractions of total height, and for each notable form say whether
it is one continuous surface or a separate part, what overlaps what and where edges tuck in. Flag anything in the
concept that is presentation style rather than form.
```

각도가 하나뿐일 때만 필요하다. 뷰가 여러 개면 직접 정규화한다(`references/reference-analysis.md`).

## 2. 계약서 확인 (0단계 관문)

```
Review this asset contract against the concept before modelling (no edits). Asset: <name>. Concept: <path>,
measurement grids: <paths>, model sheet (if any): <path>, contract: <path>. In ≤10 lines: (a) any form misread (e.g. a
fold modelled as a separate object), (b) proportions outside the contract's per-dimension tolerances, (c) disagree with
any concept-discrepancy decision?, (d) top risks (collisions, resonance, construction), (e) anything missing from the
response map or the defining motion.
```

## 3. 형태 리뷰 (2–3단계 관문)

```
Art review, no edits. Preview (0/45/90/180°): <path>; model sheet at the same angles: <path>; engine check sheet
(8 angles, top, face close-ups): <path>. Contract: <path>. List issues as MUST / SHOULD with concrete numbers
(sizes as fractions of height, angles, offsets), max 10 lines. Call out silhouette, proportion, construction,
intersections, see-through, anything visible inside openings (e.g. a face opening).
```

유니코 팜 2~3등신 주민이면 끝에 한 줄을 더한다:

```
This is a 2–2.5 heads-tall chibi animal. Also check: head share of height, shoulder reading as a slope not a bump,
arm root as thick as the shoulder ball, visible head/body seam, ears that read as horns from the side.
```

## 4. 움직임 리뷰 (4–5단계 관문)

```
Motion review, no edits. Targets from the contract: <table>. Metrics before → after: <table: scenario → whole-piece
sway, tip travel, % at hard limit, max per-frame change, settle time, dangle max/mean, foot slide>. Strips (4×2, time
left→right, top→bottom): <paths with what each shows>. In ≤10 lines: (a) does it read physical and pleasant,
(b) anything broken in the strips, (c) top 3 number changes, if any.
```

## 5. 게시 전 확인

```
Final check before showing the user (no edits). Concept: <path>, contract: <path>, numbers before → after: <table>,
strips and renders: <paths>. ≤5 lines: any blocker? one optional tweak?
```

## 답을 쓰는 법

- 리뷰어는 새 눈이 필요한 곳에 쓴다: 콘셉트 읽기, 형태, 움직임. 작은 수정마다 부르지 않는다.
- MUST(막는 문제)는 보여 주기 전에 고친다. SHOULD(취향)는 적어 두고 사용자에게 다음 단계로 제안하며, 끝없이 다듬지 않는다.
- 리뷰어가 새 시스템(시뮬레이션 하나 더)을 제안하는데 목표가 이미 균형이면 더 싼 쪽을 고르고 이유를 설명한다.
- 사용자에게 리뷰어가 뭐라고 했고 그중 무엇을 했는지 짧게 전한다.
