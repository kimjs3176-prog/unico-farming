// frame cost of the current scene: CPU time of one render call (all passes), draw calls,
// triangles, and the rAF interval (capped by vsync, so only a sanity check). GPU time via a timer query when the
// browser exposes EXT_disjoint_timer_query_webgl2 (often off; then compare CPU time and calls against the baseline).
// Usage: await import('/dev-perf.js'); await __perf(renderer, () => renderAllPasses(), 300)
//   renderFrame draws every pass you use (main, outlines, shadows). Run once with the current hero as the baseline.
window.__perf = async (r, renderFrame, frames = 300) => {
  const gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const cpu = [], gpu = [], raf = []; let calls = 0, tris = 0, last = performance.now();
  for (let i = 0; i < frames; i++) {
    await new Promise((res) => requestAnimationFrame(res));
    const now = performance.now(); raf.push(now - last); last = now;
    let q = null; if (ext) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    r.info.autoReset = false; r.info.reset(); const t0 = performance.now(); renderFrame(); cpu.push(performance.now() - t0);
    calls = r.info.render.calls; tris = r.info.render.triangles; r.info.autoReset = true;
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); setTimeout(() => { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }, 100); }
  }
  await new Promise((res) => setTimeout(res, 200));
  const st = (a) => { if (!a.length) return 'n/a'; const s = [...a].sort((x, y) => x - y); return `avg ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)} ms, p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} ms`; };
  return `renderFrame CPU: ${st(cpu)} | GPU: ${st(gpu)} | rAF interval: ${st(raf)} | draw calls ${calls}, triangles ${tris}`;
};
