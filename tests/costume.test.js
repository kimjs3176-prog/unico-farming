import test from 'node:test';
import assert from 'node:assert/strict';
import { CostumeSim, COSTUME, COSTUMES, encodeLook, decodeLook } from '../src/game/sim/costume.js';

test('사기: 레벨·코인·축제 조건, 같은 옷 두 번은 안 됨', () => {
  const c = new CostumeSim();
  assert.match(c.whyNotBuy('overalls', { money: 100 }), /모자라요/);
  assert.match(c.whyNotBuy('chef', { money: 99999, level: 1 }), /Lv\.3/);
  assert.match(c.whyNotBuy('hanbok', { money: 99999 }), /축제/);
  assert.equal(c.buy('hanbok', { money: 99999, festival: true }), COSTUME.hanbok.price);
  assert.equal(c.buy('overalls', { money: 99999 }), COSTUME.overalls.price);
  assert.equal(c.buy('overalls', { money: 99999 }), 0);
  assert.match(c.whyNotBuy('koat', { money: 99999 }), /스탬프/);
});

test('체험관 조끼는 스탬프 6개를 모으면 한 번만 지급', () => {
  const c = new CostumeSim();
  assert.deepEqual(c.autoUnlock({ stamps: 5 }), []);
  assert.deepEqual(c.autoUnlock({ stamps: 6 }), ['koat']);
  assert.deepEqual(c.autoUnlock({ stamps: 6 }), []);
  assert.ok(c.has('koat'));
});

test('입은 옷만 혜택, 가지지 않은 옷은 못 입음', () => {
  const c = new CostumeSim();
  assert.equal(c.wear('chef'), false);
  assert.equal(c.mult('jar'), 1);
  c.buy('chef', { money: 9999 });
  assert.equal(c.wear('chef'), true);
  assert.equal(c.mult('jar'), 1.2);
  assert.equal(c.mult('honey'), 1);
  c.wear(null);
  assert.equal(c.mult('jar'), 1);
  // 혜택은 옷마다 서로 다른 활동 하나씩
  const keys = COSTUMES.map((x) => Object.keys(x.perk)[0]);
  assert.equal(new Set(keys).size, COSTUMES.length);
});

test('세트 저장·불러오기, 저장·불러오기(로드) 검증', () => {
  const c = new CostumeSim();
  c.buy('raincoat', { money: 9999 }); c.wear('raincoat');
  c.saveSet(0, { hat: 'straw', scarf: 'blue', goggles: true });
  c.wear(null);
  assert.deepEqual(c.loadSet(0), { costume: 'raincoat', hat: 'straw', scarf: 'blue', goggles: true, sprout: true });
  assert.equal(c.wearing, 'raincoat');
  assert.equal(c.loadSet(1), null);
  const d = new CostumeSim();
  d.load({ owned: ['raincoat', 'crown', '<x>'], wearing: 'crown', sets: [{ costume: 'chef', hat: 'tiara', scarf: 'blue' }] });
  assert.deepEqual([...d.owned], ['raincoat']);
  assert.equal(d.wearing, null);
  assert.deepEqual(d.sets[0], { costume: null, hat: null, scarf: 'blue', goggles: false, sprout: true });
  const e = new CostumeSim(); e.load(JSON.parse(JSON.stringify(c.toJSON())));
  assert.equal(e.wearing, 'raincoat'); assert.equal(e.sets[0].hat, 'straw');
});

test('접속자 모습 문자열: 왕복 + 이상한 값은 기본값', () => {
  const o = { costume: 'hanbok', hat: 'helmet', scarf: 'red', goggles: true, sprout: false };
  assert.equal(encodeLook(o), 'hanbok.helmet.red.1.0');
  assert.deepEqual(decodeLook(encodeLook(o)), o);
  assert.deepEqual(decodeLook('crown.<b>.purple.x'), { costume: null, hat: null, scarf: null, goggles: false, sprout: true });
  assert.deepEqual(decodeLook(undefined), { costume: null, hat: null, scarf: null, goggles: false, sprout: true });
});
