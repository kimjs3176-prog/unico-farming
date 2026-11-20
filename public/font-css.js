// 구글 글꼴 CSS 를 첫 화면을 막지 않고 붙임 (index.html 의 #gf-css 는 media="print" 로 받아 둠 → 다 받으면 'all')
// 구글이 막히거나 느린 망에서도 제목 화면이 바로 그려지고, 글꼴이 오면 Jua 로 바뀜
// window.__gfReady: CSS 가 붙었거나 실패하면 풀림 (boot.js 의 글꼴 기다리기가 씀). CSP(script-src 'self') 때문에 인라인 대신 따로 된 파일
(function () {
  var l = document.getElementById('gf-css');
  window.__gfReady = new Promise(function (done) {
    if (!l) return done();
    var fin = false;
    function on() { if (fin) return; fin = true; l.media = 'all'; done(); }
    function off() { if (fin) return; fin = true; done(); }
    l.addEventListener('load', on);
    l.addEventListener('error', off);
    if (l.sheet) on(); // 이 스크립트보다 CSS 가 먼저 온 경우
  });
  // 제목 글꼴(Jua)까지 받았으면 html 에 표시 (늦어도 1.5초 뒤에는 붙임)
  window.__gfReady.then(function () {
    var mark = function () { document.documentElement.classList.add('fonts-ready'); };
    var t = setTimeout(mark, 1500);
    if (document.fonts && document.fonts.load) document.fonts.load('40px Jua', '유니코 팜 입장하기').then(function () { clearTimeout(t); mark(); }, function () {});
  });
})();
