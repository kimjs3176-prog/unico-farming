// 구글 글꼴 CSS 를 첫 화면을 막지 않고 붙임 (index.html 의 #gf-css 는 media="print" 로 받아 둠 → 다 받으면 'all')
// 구글이 막히거나 느린 망에서도 제목 화면이 바로 그려지고, 글꼴이 오면 Jua 로 바뀜
// window.__gfReady: CSS 가 붙었거나 실패하면 풀림 (늦어도 10초). window.__gfDone: 풀렸는지
// label.js 는 이것이 풀리기 전에 그린 캔버스 글자를 풀린 뒤 다시 그림. CSP(script-src 'self') 때문에 인라인 대신 따로 된 파일
(function () {
  var l = document.getElementById('gf-css');
  window.__gfDone = false;
  window.__gfReady = new Promise(function (done) {
    var fin = false;
    function end() { if (fin) return; fin = true; window.__gfDone = true; done(); }
    if (!l) return end();
    // 늦게 와도(10초 뒤) CSS 는 켬. 기다림만 끝냄
    function on() { l.media = 'all'; end(); }
    l.addEventListener('load', on);
    l.addEventListener('error', end);
    if (l.sheet) return on(); // 이 스크립트보다 CSS 가 먼저 온 경우
    // 이 스크립트보다 먼저 실패한 경우: 받기 기록은 있는데 sheet 가 없음 (error 이벤트는 다시 오지 않음)
    try { if (performance.getEntriesByName(l.href).length) return end(); } catch (e) { /* 모름 */ }
    setTimeout(end, 10000);
  });
  // 제목 글꼴(Jua)까지 받았으면 html 에 표시 (늦어도 1.5초 뒤에는 붙임)
  window.__gfReady.then(function () {
    var mark = function () { document.documentElement.classList.add('fonts-ready'); };
    var t = setTimeout(mark, 1500);
    if (document.fonts && document.fonts.load) document.fonts.load('40px Jua', '유니코 팜 입장하기').then(function () { clearTimeout(t); mark(); }, function () {});
  });
})();
