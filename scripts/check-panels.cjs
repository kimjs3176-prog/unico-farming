// 상세창(패널) 글자 점검: 글자끼리 겹침 · 칸 밖으로 넘침 · 한국어 낱말 쪼개짐 · 창이 화면 밖 · 닫기 버튼 가려짐
// 사용: VITE_WS_URL= npm run build && node scripts/check-panels.cjs <이름> <너비> <높이> [글자배율] [mobile]   (예: desk 1280 800 / mob 390 844 1 mobile / big 1100 740 1.3)
// 결과: 창마다 스크린샷과 report.json (OUT_DIR 환경변수 또는 임시 폴더). Playwright Chromium(swiftshader) 필요
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium, devices } = require('playwright');
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.resolve(__dirname, '..', 'dist'); // 점검 중 다시 빌드해도 깨지지 않게 복사본을 쓸 수 있음
const [NAME = 'desk', W = '1280', H = '800', SCALE = '1', MOBILE = ''] = process.argv.slice(2);
const OUT = path.resolve(process.env.OUT_DIR || require('os').tmpdir(), `panels_${NAME}`);
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((req, res) => { let f = path.join(DIST, req.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
srv.listen(0, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(MOBILE ? { viewport: { width: +W, height: +H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: +W, height: +H } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/?autostart&weather=clear&quality=low`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!window.game?._shown, null, { timeout: 240000 });
  const skip = async () => { for (let i = 0; i < 40; i++) { await sleep(300); if (!(await p.evaluate(() => game.cinema.locked || game.dialogue.active))) { if (i > 3) break; continue; } await p.evaluate(() => { document.querySelector('.cine-skip')?.click(); document.querySelector('.dlg')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); } };
  await skip();
  if (+SCALE !== 1) { await p.evaluate((v) => game.setGraphics({ ...game.gfx, uiScale: v }), +SCALE); await sleep(400); }
  // 내용이 꽉 찬 상태로 (긴 목록·긴 이름이 다 보이게)
  await p.evaluate(() => {
    const e = game.economy;
    e.money = 98765; game.quests.xp = 3000;
    for (const k of ['carrot', 'cabbage', 'tomato', 'strawberry', 'corn']) { e.addCrop(k, 12); e.inventory.seeds[k] = 7; }
    for (const k of ['egg', 'milk', 'wool', 'honey']) e.addProduct?.(k, 5);
    for (const k of ['fruit_apple', 'fruit_peach', 'fruit_pear', 'fruit_persimmon', 'bug_ladybug', 'compost', 'weed', 'pet_treat', 'rice_seed', 'egg_gold', 'milk_gold', 'wool_gold']) e.addItem(k, 4);
    e.inventory.feed = 12;
    e.event = { item: 'strawberry', mult: 2, name: '딸기 수요 급증! 오늘 2배 가격' };
    e.festival = { name: '🎉 유니코 수확 축제! 오늘은 모든 농산물·생산물 1.3배', mult: 1.3 };
  });
  await skip();

  const audit = () => p.evaluate(() => {
    const panel = game.ui.panel || document.querySelector('.panel');
    if (!panel) return { missing: true };
    // 창이 미끄러져 들어오는 중이면 끝난 자리로 잼 (느린 점검 환경에서 등장 애니메이션 중간을 화면 밖으로 잘못 잡지 않게)
    for (const a of panel.getAnimations({ subtree: true })) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch { /* 무한 반복은 그대로 */ } }
    const vw = innerWidth, vh = innerHeight, pr = panel.getBoundingClientRect();
    const issues = [];
    const label = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) || el.className;
    // 1) 텍스트 줄 상자 모으기 (보이는 것만)
    const boxes = [];
    const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement, cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[hidden]')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push({ el, r, t: n.textContent.trim().slice(0, 20) });
    }
    // 스크롤 상자 안에서 안 보이는 부분은 제외
    const visibleIn = (el, r) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll)/.test(cs.overflowY)) { const ar = a.getBoundingClientRect(); if (r.bottom > ar.bottom - 2 || r.top < ar.top + 2) return false; /* 스크롤 경계에 걸쳐 반만 보이는 줄도 제외 */ } if (a === panel) break; } return true; };
    // 위에 고정된 제목줄(불투명) 아래로 스크롤돼 들어간 글자는 가려져 안 보이므로 제외
    const hd = panel.querySelector(':scope > h2'), hr = hd && getComputedStyle(hd).position === 'sticky' ? hd.getBoundingClientRect() : null;
    const underHeader = (x) => hr && !hd.contains(x.el) && x.r.top < hr.bottom - 2;
    // 등장 애니메이션 중이거나 장식(기울어진 스탬프·꽃가루)인 글자는 제외
    const animating = new Set(document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect?.target).filter(Boolean));
    const deco = (el) => { for (let a = el; a && a !== panel; a = a.parentElement) if (animating.has(a) || a.matches('.koat-stampfx, .mg-confetti, [data-deco]')) return true; return false; };
    const vis = boxes.filter((x) => visibleIn(x.el, x.r) && !underHeader(x) && !deco(x.el));
    // 2) 서로 다른 요소의 글자끼리 겹침
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const A = vis[i], B = vis[j];
      if (A.el === B.el) continue;
      const ox = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), oy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (ox > 3 && oy > Math.min(A.r.height, B.r.height) * 0.35) issues.push(`겹침: "${A.t}" ↔ "${B.t}" (${Math.round(ox)}×${Math.round(oy)})`);
    }
    // 3) 글자가 자기 칸(버튼·칩·행) 밖으로 삐져나오거나 잘림
    const seen = new Set();
    for (const x of vis) {
      for (let a = x.el; a && a !== panel.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const boxy = a.tagName === 'BUTTON' || /chip|row|tab|pr|nm|qty|cell|badge|mk-ev|mg-|koat-/.test(a.className) || cs.overflow !== 'visible';
        if (!boxy) { if (a === panel) break; continue; }
        const ar = a.getBoundingClientRect();
        const outX = Math.max(0, ar.left - x.r.left, x.r.right - ar.right), outY = Math.max(0, ar.top - x.r.top, x.r.bottom - ar.bottom);
        const scroller = /(auto|scroll)/.test(cs.overflowY);
        if ((outX > 2 || (!scroller && outY > 3)) && !seen.has(a)) { seen.add(a); issues.push(`넘침: "${x.t}" ⊄ <${a.tagName.toLowerCase()} .${String(a.className).split(' ')[0]}> (x${Math.round(outX)} y${Math.round(outY)})`); }
        // ellipsis/가로 잘림
        if (cs.textOverflow === 'ellipsis' && a.scrollWidth > a.clientWidth + 1 && !seen.has(a)) { seen.add(a); issues.push(`말줄임: "${label(a)}"`); }
        if (a === panel) break;
      }
    }
    // 3b) 한국어 낱말이 줄 끝에서 쪼개짐 (줄바꿈 앞뒤 글자가 모두 한글이고 사이에 공백 없음)
    const hangul = (ch) => /[\uac00-\ud7a3]/.test(ch);
    let splits = 0; const splitEx = [];
    const tw2 = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = tw2.nextNode(); n; n = tw2.nextNode()) {
      const t = n.textContent; if (t.trim().length < 2) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); if (rg.getClientRects().length < 2) continue;
      let prevTop = null;
      for (let k = 0; k < t.length; k++) {
        if (!t[k].trim()) continue;
        rg.setStart(n, k); rg.setEnd(n, k + 1); const rr = rg.getClientRects()[0]; if (!rr) continue;
        if (prevTop !== null && rr.top > prevTop + 4 && k > 0 && hangul(t[k]) && hangul(t[k - 1])) { splits++; if (splitEx.length < 4) splitEx.push(t.slice(Math.max(0, k - 4), k) + '|' + t.slice(k, k + 3)); }
        prevTop = rr.top;
      }
    }
    if (splits) issues.push(`낱말 쪼개짐 ${splits}곳: ${splitEx.join(', ')}`);
    // 4) 창이 화면 밖으로 나감, 가로 스크롤
    if (pr.left < -1 || pr.top < -1 || pr.right > vw + 1 || pr.bottom > vh + 1) issues.push(`창이 화면 밖: ${[pr.left, pr.top, pr.right, pr.bottom].map(Math.round)} (화면 ${vw}×${vh})`);
    for (const el of [panel, ...panel.querySelectorAll('*')]) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) issues.push(`가로 스크롤: <${el.tagName.toLowerCase()} .${String(el.className).split(' ')[0]}> ${el.scrollWidth}>${el.clientWidth}`); }
    // 5) 제목줄(리본)이 창 위·양옆에 꼭 붙어 있는지 (위로 밀려 잘리거나 옆이 뜨면 어긋남)
    const h2 = panel.querySelector(':scope > h2');
    if (h2) { const hr = h2.getBoundingClientRect(); if (Math.abs(hr.top - pr.top) > 1.5 || Math.abs(hr.left - pr.left) > 1.5 || Math.abs(hr.right - pr.right) > 1.5) issues.push(`제목줄 어긋남: 창 ${[pr.left, pr.top, pr.right].map(Math.round)} / 제목 ${[hr.left, hr.top, hr.right].map(Math.round)}`); }
    // 6) 닫기 버튼이 보이고 눌리는지
    const c = panel.querySelector('.close');
    if (c) { const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (!top || !(top === c || c.contains(top))) issues.push('닫기 버튼 가려짐/화면 밖'); }
    return { n: vis.length, issues: [...new Set(issues)].slice(0, 40) };
  });

  const PANELS = [
    ['market_buy', () => game.ui.openMarket('buy')],
    ['market_sell', () => { game.ui.marketAll = true; game.ui.openMarket('sell'); }],
    ['market_fac', () => game.ui.openMarket('fac')],
    ['market_cos', () => { game.costume.buy('overalls', { money: 99999 }); game.costume.wear('overalls'); game.ui.openMarket('cos'); }],
    ['inventory', () => game.ui.openInventory()],
    ['quests', () => game.ui.openQuests()],
    ['seed', () => game.ui.openSeedPicker(() => {}, { fert: 4 })],
    ['settings', () => game.ui.openSettings()],
    ['help', () => game.ui.openHelp()],
    ['weather', () => game.ui.openWeather()],
    ['book_fish', () => game.ui.openBook('fish')],
    ['book_bug', () => game.ui.openBook('bug')],
    ['villager', () => { const e = game.npcs.list.find((x) => x.id === 'merchant'); game.ui.openVillager(e, '오늘 시세 봤어? 매일 바뀐다구!'); }],
    ['gift', () => { const e = game.npcs.list.find((x) => x.id === 'granny'); game.ui.openGiftPicker(e); }],
    ['map', () => game.minimap.openBig()],
    ['compost', () => game.farmcraft.openCompost()],
    ['jars', () => game.farmcraft.openJars()],
    ['orders', () => game.farmcraft.openOrders()],
    ['lake_shop', () => game.lake.openShop()],
    ['lake_board', () => game.lake.openBoard()],
    ['barn', () => game.ranch.openBarn()],
    ['workshop', () => game.ranch.openWorkshop()],
    ['town_build', () => game.town.openBuild(4)],
    ['koat_desk', () => game.ui.openKoatDesk()],
    ['koat_booth', () => game.ui.openKoatBooth(game.koat.booths[1].d)],
    ['koat_result', () => game.ui.koatResult(game.koat.booths[4].d, 88, ['정확도 92% · 평균 2.1초', '🔥 최대 연속 6']) ],
    ['mg_intro', () => game.tractor.begin()],
    ['mg_result', () => { const t = game.tractor; t.mount(); t.counting = false; t.field.start(); t.field.score = 37; t.maxStreak = 12; t.dismount(true); }],
    ['result', () => game.ui.result('🏅 도감 완성!', ['물고기 도감을 모두 채웠어요!', '보상 +500🪙'])],
    ['rooms', () => game.ui.openRooms()],
    ['wardrobe', () => { game.home.enter(); setTimeout(() => game.home.openWardrobe('cos'), 900); }],
    ['wardrobe_set', () => game.home.openWardrobe('set')],
  ];
  const report = {};
  for (const [id, fn] of PANELS) {
    try {
      await p.evaluate(() => { game.ui.closePanel(); });
      await p.evaluate(`(${fn.toString()})()`);
      await sleep(1400); // 등장 애니메이션·카운트업 끝날 때까지
      await skip();
      const r = await audit();
      report[id] = r;
      await p.screenshot({ path: `${OUT}/${id}.png`, timeout: 120000 });
      // 스크롤이 있는 창은 끝까지 내려서 한 번 더
      const scrolled = await p.evaluate(() => { const pn = game.ui.panel; if (!pn) return false; const sc = [pn, ...pn.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4); sc.forEach((e) => (e.scrollTop = e.scrollHeight)); return sc.length > 0; });
      if (scrolled) { await sleep(300); const r2 = await audit(); report[id + '@end'] = r2; await p.screenshot({ path: `${OUT}/${id}_end.png`, timeout: 120000 }); }
    } catch (e) { report[id] = { error: String(e.message || e).slice(0, 160) }; }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  const bad = Object.entries(report).filter(([, r]) => r.error || r.missing || r.issues?.length);
  console.log(`${NAME}: ${Object.keys(report).length} checks, ${bad.length} with issues`);
  for (const [k, r] of bad) console.log(' -', k, r.error || (r.missing ? 'no panel' : r.issues.join(' | ')));
  console.log('pageerrors', errs.slice(0, 5));
  await b.close(); srv.close();
});
