/** 농장 테마 랜덤 닉네임 (참고: 형용사+명사 조합) */
const ADJ = ['부지런한', '느긋한', '씩씩한', '상냥한', '엉뚱한', '졸린', '반짝이는', '호기심많은', '용감한', '수줍은', '신나는', '포근한'];
const NOUN = ['당근', '토마토', '옥수수', '딸기', '양배추', '새싹', '트랙터', '밀짚모자', '우유', '달걀', '양털', '무지개'];
export function randomName() {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
}
