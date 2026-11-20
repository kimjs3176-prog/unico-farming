// 아이콘 확인 판: src/ui/icons.svg 의 모든 아이콘을 16·24·40px 로, 크림 바탕(#fffaf0)과 행동 막대 나무 위에 늘어놓고 사진
// 사용: node scripts/icon-sheet.cjs [출력.png]   (기본: icon-sheet.png). 브라우저(Chromium)만 쓰고 게임은 띄우지 않음
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const out = path.resolve(process.argv[2] || 'icon-sheet.png');
const sprite = fs.readFileSync(path.join(__dirname, '../src/ui/icons.svg'), 'utf8');
const names = [...sprite.matchAll(/<symbol id="i-([\w-]+)"/g)].map((m) => m[1]);
const SIZES = [16, 24, 40];
const cell = (n, s) => `<svg width="${s}" height="${s}" style="color:#fff8ea"><use href="#i-${n}"/></svg>`;
const row = (n) => `<tr><th>${n}</th>${SIZES.map((s) => `<td class="cream">${cell(n, s)}</td>`).join('')}${SIZES.map((s) => `<td class="wood"><span>${cell(n, s)}</span></td>`).join('')}</tr>`;
const half = Math.ceil(names.length / 2);
const table = (list) => `<table><tr><th></th>${SIZES.map((s) => `<th>${s} 크림</th>`).join('')}${SIZES.map((s) => `<th>${s} 나무</th>`).join('')}</tr>${list.map(row).join('')}</table>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; padding: 12px; background: #f3ead6; font: 12px sans-serif; color: #4a2c18; display: flex; gap: 16px; align-items: flex-start; }
table { border-collapse: collapse; } th { padding: 2px 6px; text-align: right; font-weight: 600; }
td { padding: 4px 8px; text-align: center; vertical-align: middle; }
td.cream { background: #fffaf0; }
td.wood { background: linear-gradient(180deg, #9a6438 0%, #8a5832 45%, #6a4024 100%); }
td.wood span { display: inline-grid; place-items: center; padding: 3px; border-radius: 8px; background: rgba(255,240,215,0.16); box-shadow: inset 0 1px 2px rgba(0,0,0,0.25); }
svg { display: block; }
</style>${sprite}${table(names.slice(0, half))}${table(names.slice(half))}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
  console.log(`아이콘 ${names.length}개 → ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
