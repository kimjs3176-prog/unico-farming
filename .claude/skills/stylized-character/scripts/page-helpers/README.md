# 페이지 도우미

- `dev-perf.js` → `await __perf(renderer, renderFrame, 300)`: 모든 패스를 포함한 프레임당 CPU 시간, 그리기 호출, 삼각형, 브라우저가 타이머를 주면 GPU 시간. 먼저 지금 주인공으로 기준을 잡고, 같은 장면에서 새 에셋으로 잰다. (유니코 팜은 `npm run perf` 와 `unico-perf-budget` 스킬이 먼저)

스냅샷은 `../capture_server.py` 로 보낸다: `canvas.toBlob((b) => fetch('http://127.0.0.1:8767/save?name=front', { method: 'POST', body: b }))`. `preserveDrawingBuffer` 가 꺼져 있으면 렌더 직후 `toBlob` 을 부르고 찍는 동안 그리기 루프를 멈춘다. 아니면 빈 프레임이 나온다. (Playwright 로 찍으면 `page.screenshot` 으로 충분하고 이 서버는 필요 없다)

움직임 측정은 `references/verification.md` 의 세 훅으로 자기 장면에 맞게 쓴다. CPU 굽힘 공식은 `../motion_kit.js` (`clothBendCPU`).
