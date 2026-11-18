/**
 * 마을 주민 대사 (렌더링 무관, 테스트: tests/villager_lines.test.js)
 *
 * 말투 규칙 (docs/CHARACTERS.md §말투): 주민은 모두 플레이어에게 반말. 성격은 말끝으로 —
 *  안내 강아지 -야/-어/-자 · 연구원 너구리 -거든/-대/-지 · 장터 여우 반말 + "삽니다~ 팔아요!" ·
 *  곰 할머니 해라체 -단다/-거라/-니 · 낚시꾼 고양이 -렴/-지 · 꼬마 토끼 장난스러운 반말.
 *  해요체는 KOAT 안내데스크·체험 부스 담당 같은 기관 사람만.
 *
 * 줄마다 조건(모두 맞아야 나옴): season(spring|summer|autumn|winter) · weather(rain|snow) · night ·
 *  minHearts · festival · after(받은 퀘스트 id) · species(동물 주민일 때만)
 */
export const LINES = {
  merchant: [
    { t: '신선한 농산물 삽니다~ 씨앗도 팔아요!' },
    { t: '오늘 시세 봤어? 매일 바뀌니까 잘 보고 팔아!' },
    { t: '볍씨도 들여놨어. 논농사 한번 해 볼래?' },
    { t: '봄엔 딸기랑 양배추가 제철이야. 제철 작물은 값을 더 쳐 줘!', season: 'spring' },
    { t: '여름엔 토마토랑 옥수수지! 삽니다~ 많이만 가져와!', season: 'summer' },
    { t: '가을엔 당근이 제철이야. 장터가 제일 바쁜 계절이지!', season: 'autumn' },
    { t: '겨울엔 바깥 밭이 느려. 이럴 땐 스마트팜 작물이 효자라니까!', season: 'winter' },
    { t: '비 오는 날엔 손님이 뜸해… 그래도 가게 문은 열어 둬야지!', weather: 'rain' },
    { t: '눈 오는 날엔 손이 시려서 동전 세기가 힘들어. 후~', weather: 'snow' },
    { t: '축제 날이야! 오늘은 뭐든 평소보다 비싸게 사 줄게. 삽니다~!', festival: true },
    { t: '이 시간까지 일해? 나도 장부 정리 중이야. 하암~', night: true },
    { t: '너랑은 거래할 맛이 나. 이제 단골 손님이니까!', minHearts: 2 },
    { t: '사실 장사보다 사람 구경이 더 좋아. 특히 너 같은 단골!', minHearts: 4 },
    { t: '거래 열 번 넘게 했지? 이제 장터 사람 다 됐네!', after: 'sell10' },
    { t: '밤에 닭장 노리는 건 산여우야. 난 장사만 한다구!', species: true },
    { t: '꼬리 털 손질에만 아침 한 시간이야~ 윤기 나지?', species: true },
  ],
  researcher: [
    { t: '스마트팜은 센서로 온도·습도를 관리하거든.' },
    { t: '벼는 단계마다 알맞은 물 높이가 달라. 익으면 물을 빼 줘야 하지.' },
    { t: '얕은 물에선 잡초가 잘 자라. 물을 깊게 대면 잡초가 줄거든.' },
    { t: '봄엔 씨앗 고르기가 반이야. KOAT는 종자를 정선하고 검사해서 품질을 관리한대.', season: 'spring' },
    { t: '여름 온실은 금방 더워지거든. 센서가 온도를 재서 알려 주는 게 스마트팜이지.', season: 'summer' },
    { t: '가을엔 흙을 살펴보기 좋아. 흙을 알아야 거름을 알맞게 주거든.', season: 'autumn' },
    { t: '겨울엔 바깥 밭이 쉬어도 스마트팜 작물은 그대로 자라. 안에서 키우니까 그렇지.', season: 'winter' },
    { t: '비가 오면 밭에 물 줄 필요가 없지? 빗물도 기록해 두면 다 데이터거든.', weather: 'rain' },
    { t: '눈이 오면 바깥 작물이 조금 천천히 자라. 그럴수록 기록을 꼼꼼히 해야 하지.', weather: 'snow' },
    { t: '밤에도 센서는 쉬지 않아. 나도 데이터 보느라 아직 못 잤지.', night: true },
    { t: 'KOAT는 김제·상주 스마트팜 실증단지도 운영한대. 언젠가 꼭 가 볼 거야.', minHearts: 2 },
    { t: '농업기계도 검정이랑 시험평가를 거친대. 자율주행 농기계 성능시험도 하고 말이지.', minHearts: 3 },
    { t: '스마트팜 점검해 봤지? 숫자가 보이면 농사가 훨씬 쉬워지거든.', after: 'smart1' },
    { t: 'KOAT 체험관 가 봤구나! 저탄소 농축산물 인증 같은 것도 거기서 운영한대.', after: 'koat1' },
    { t: '생각할 땐 앞발을 비비게 돼. 그래야 집중이 잘 되거든.', species: true },
  ],
  guide: [
    { t: '유니코 팜에 온 걸 환영해! 할 일이 궁금하면 퀘스트를 열어 봐.' },
    { t: '연못에서 낚시 해 봤어? 비 오는 날엔 희귀한 물고기가 나와!' },
    { t: '과일 나무는 하루에 한 번 흔들 수 있어. 같이 흔들러 가자!' },
    { t: '봄바람 좋다~ 꽃잎 날리는 길로 산책 가자!', season: 'spring' },
    { t: '여름엔 밭이 금방 말라. 물 주는 거 잊지 마!', season: 'summer' },
    { t: '가을이야! 낙엽 밟는 소리 들려? 바스락바스락~', season: 'autumn' },
    { t: '겨울엔 눈밭에서 뛰는 게 최고야! 꼬리가 멈추질 않아!', season: 'winter' },
    { t: '비 온다! 밭에 물은 저절로 뿌려지니까 오늘은 낚시하러 가자!', weather: 'rain' },
    { t: '눈이다! 발자국 찍으면서 마을 한 바퀴 돌자!', weather: 'snow' },
    { t: '오늘은 수확 축제야! 장터 여우한테 팔면 평소보다 비싸게 쳐 줘!', festival: true },
    { t: '밤엔 가로등 불빛이 예뻐. 그래도 너무 늦게 자진 마!', night: true },
    { t: '너랑 얘기하면 꼬리가 저절로 흔들려. 진짜야!', minHearts: 2 },
    { t: '처음 왔을 때 기억나? 이렇게 멋진 농부가 될 줄 알았어!', minHearts: 4 },
    { t: '첫 수확 축하해! 다음엔 장터에 팔아 보자!', after: 'harvest5' },
    { t: '꼬리가 저절로 흔들려! 반가워서 그런가 봐 🐾', species: true },
  ],
  granny: [
    { t: '쌀 한 톨에도 정성이 담겨야 한단다.' },
    { t: '모내기 철엔 물을 얕게, 이삭이 패면 깊게 대거라.' },
    { t: '탈곡은 힘껏! 빠르게 밟아야 낟알이 잘 떨어진단다.' },
    { t: '봄에는 모를 기르느라 바쁘단다. 모가 튼튼해야 한 해 농사가 든든하지.', season: 'spring' },
    { t: '여름 논에선 밤새 개구리가 운단다. 벼가 잘 자라고 있다는 소리지.', season: 'summer' },
    { t: '가을엔 감을 깎아 말려 곶감을 만든단다. 하나 맛보겠니?', season: 'autumn' },
    { t: '겨울엔 땅도 쉬어야 한단다. 너도 따뜻하게 입거라.', season: 'winter' },
    { t: '비가 오니 논에 물 걱정은 덜었구나. 우산은 챙겼니?', weather: 'rain' },
    { t: '겨울에 눈이 많으면 보리 풍년이 든다는 옛말이 있단다.', weather: 'snow' },
    { t: '이 늦은 밤에 웬일이니? 어서 들어가 자거라.', night: true },
    { t: '네가 오면 이 할미 허리가 다 낫는 것 같구나.', minHearts: 2 },
    { t: '젊을 적엔 이 논을 혼자 다 맸단다. 이제는 네가 있어 든든하구나.', minHearts: 4 },
    { t: '첫 벼농사를 해냈다니 장하구나. 쌀 한 톨의 무게를 알겠니?', after: 'rice1' },
    { t: '황금 들녘을 봤구나. 그 빛깔은 평생 잊히지 않는단다.', after: 'riceharv' },
    { t: '아이고, 우리 강아지 왔구나. 밥은 먹었니?', species: true },
  ],
  fisher: [
    { t: '큰 녀석은 서두르면 안 돼. 줄이 빨개지면 놓아 주고, 지치면 감는 거지.' },
    { t: '밤엔 뱀장어가 나오지. 비 오는 날엔 산천어가 잘 무니 잘 보렴.' },
    { t: '호수 한가운데 반짝이는 곳 봤니? 헤엄쳐 가서 잠수하면 조개가 있지.' },
    { t: '전설의 철갑상어… 황금 낚싯대라면 혹시 모르지.' },
    { t: '봄 물은 아직 차지. 물고기도 느긋하니 너도 천천히 기다리렴.', season: 'spring' },
    { t: '여름엔 해 질 녘에 오렴. 물이 식으면 고기가 올라오지.', season: 'summer' },
    { t: '가을 호수는 고기가 살이 올라 손맛이 좋지.', season: 'autumn' },
    { t: '겨울엔 손이 시리지. 찬물엔 빙어가 잘 나오니 장갑 끼고 오렴.', season: 'winter' },
    { t: '비가 오는구나. 산천어 잡기 좋은 날이지, 낚싯대 챙기렴.', weather: 'rain' },
    { t: '눈 오는 호수는 조용하지. 찌가 더 잘 보이니 가만히 지켜보렴.', weather: 'snow' },
    { t: '밤낚시 왔니? 등불 아래선 뱀장어가 잘 물지.', night: true },
    { t: '네 낚시 솜씨, 처음보다 많이 늘었지. 기록판에 이름 올려 보렴.', minHearts: 2 },
    { t: '이 부두는 내 단골 자리지만, 너라면 옆자리 내어 주지.', minHearts: 4 },
    { t: '낚시터 첫 손맛은 잊을 수 없지. 다음엔 더 큰 걸 노려 보렴.', after: 'lake1' },
    { t: '물고기 냄새만 맡아도 어디 있는지 알지. 고양이 코는 못 속이지.', species: true },
  ],
  kid: [
    { t: '나비 잡으러 가자! 밤엔 반딧불이도 있어!' },
    { t: '황금 잉어 본 적 있어? 엄청 희귀하대!' },
    { t: '나무를 흔들면 가끔 장수풍뎅이가 떨어져!' },
    { t: '봄이다! 무당벌레 찾기 시합하자, 내가 먼저 찾을 거야!', season: 'spring' },
    { t: '여름 밤엔 반딧불이가 반짝반짝! 연못가로 가 보자!', season: 'summer' },
    { t: '가을엔 고추잠자리가 엄청 많아! 빙글빙글~', season: 'autumn' },
    { t: '눈사람 만들자! 귀는 내 귀처럼 길~게!', season: 'winter' },
    { t: '비 온다! 웅덩이에서 첨벙첨벙 하면 재밌어!', weather: 'rain' },
    { t: '눈이다 눈! 깡충깡충 내 발자국 따라와 봐!', weather: 'snow' },
    { t: '축제다! 오늘은 하루 종일 놀 거야!', festival: true },
    { t: '쉿, 몰래 반딧불이 보러 나왔어. 비밀이야!', night: true },
    { t: '너랑 노는 게 제일 재밌어! 내일도 놀자!', minHearts: 2 },
    { t: '내 보물 상자 보여 줄까? 너한테만 보여 주는 거야!', minHearts: 4 },
    { t: '곤충 잡아 봤지? 도감 꽉 채우기 시합하자!', after: 'bug1' },
    { t: '깡충깡충! 나 잡아 봐라~', species: true },
  ],
};

/** 선물 반응 (좋아하는 것 / 그 밖) · 하트가 오를 때 한마디 · 부탁을 들어줬을 때 */
export const REACT = {
  merchant: { liked: '와! 이거 장터에서도 귀한 건데, 정말 줘도 돼? 💕', neutral: '고마워! 잘 쓸게~', heartUp: '우리 더 친해졌네! 단골 대접 확실히 해 줄게!', thanks: '정말 고마워! 덕분에 장사 살았어 🙏' },
  researcher: { liked: '이거 연구에 딱 필요했거든! 정말 고마워 💕', neutral: '고마워. 잘 기록해 둘게.', heartUp: '너랑 있으면 연구가 더 재밌어지거든!', thanks: '고마워! 덕분에 실험을 이어 갈 수 있겠어 🙏' },
  guide: { liked: '와아! 내가 제일 좋아하는 거야! 💕', neutral: '고마워! 잘 쓸게!', heartUp: '우리 진짜 친해졌다! 꼬리 봐, 막 흔들려!', thanks: '정말 고마워! 덕분에 살았어 🙏' },
  granny: { liked: '아이고, 이 귀한 걸 할미한테 주는 거니? 고맙구나 💕', neutral: '마음 써 줘서 고맙구나.', heartUp: '네 정성이 이 할미 마음에 닿았단다.', thanks: '고맙구나, 아가. 덕분에 한시름 놓았단다 🙏' },
  fisher: { liked: '오, 이건 내가 아끼는 거지. 고맙게 받으마 💕', neutral: '고마워, 잘 쓰지.', heartUp: '너하고는 말이 잘 통하지. 앞으로도 자주 오렴.', thanks: '고맙다. 덕분에 오늘 낚시 준비 끝이지 🙏' },
  kid: { liked: '우와아! 이거 나 진짜 갖고 싶었어! 💕', neutral: '헤헤, 고마워!', heartUp: '우리 이제 단짝이다! 약속!', thanks: '고마워! 너 최고야 🙏' },
};

/** 한 대화에서 할 얘기를 다 했을 때 */
export const OUT_OF_LINES = '오늘은 할 얘기 다 했어, 내일 또 와!';
export const OUT_OF_LINES_BY = { granny: '오늘 할 얘기는 다 했단다. 내일 또 오거라.' };
/** 밤에 졸다 깼을 때 (플레이어가 가까이 오면) */
export const WAKE = {
  merchant: '하암… 손님이야? 깜빡 졸았네!', researcher: '어, 깜빡 졸았지 뭐야. 데이터 보던 중이었거든.', guide: '음냐… 앗, 왔어? 반가워!',
  granny: '아이고, 깜빡 졸았구나. 이 밤에 웬일이니?', fisher: '하암… 찌 보다가 졸았지 뭐니.', kid: '으앗! 안 잤어, 진짜 안 잤어!',
};

const COND = ['season', 'weather', 'night', 'minHearts', 'festival', 'after', 'species'];
/** 줄의 조건 수 (무게 = 1 + 2 × 조건 수) */
export const condCount = (ln) => COND.reduce((n, k) => n + (ln[k] !== undefined ? 1 : 0), 0);

/**
 * 이 줄이 지금 상황에 맞나
 * @param ctx { season, weather: 'rain'|'snow'|null, night, hearts, festival, done: {퀘스트 id: true}, species }
 */
export function lineFits(ln, ctx) {
  if (ln.season && ln.season !== ctx.season) return false;
  if (ln.weather && ln.weather !== ctx.weather) return false;
  if (ln.night && !ctx.night) return false;
  if (ln.minHearts && (ctx.hearts ?? 0) < ln.minHearts) return false;
  if (ln.festival && !ctx.festival) return false;
  if (ln.after && !ctx.done?.[ln.after]) return false;
  if (ln.species && !ctx.species) return false;
  return true;
}

/**
 * 오늘 할 말 고르기: 맞는 줄 중 최근에 한 말(recent)은 빼고, 조건이 많을수록 자주 (무게 1 + 2 × 조건 수).
 * prefer = 그날 첫 대화면 조건 있는 줄(계절·날씨·밤·하트…)을 먼저. 고를 게 없으면 null
 */
export function pickLine(id, ctx, recent = [], rng = Math.random, { prefer = false } = {}) {
  let pool = (LINES[id] || []).filter((ln) => !recent.includes(ln.t) && lineFits(ln, ctx));
  if (!pool.length) return null;
  if (prefer) { const c = pool.filter((ln) => condCount(ln) > 0); if (c.length) pool = c; }
  let sum = 0;
  for (const ln of pool) sum += 1 + 2 * condCount(ln);
  let r = rng() * sum;
  for (const ln of pool) { r -= 1 + 2 * condCount(ln); if (r < 0) return ln; }
  return pool[pool.length - 1];
}

/** 최근에 한 말 기억 (최근 n 개만) */
export function remember(recent, text, n = 4) {
  recent.push(text);
  while (recent.length > n) recent.shift();
  return recent;
}
