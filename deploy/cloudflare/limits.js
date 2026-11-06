/**
 * 릴레이 정원 (worker.js 와 테스트가 함께 씀)
 * worker.js 는 Workers 진입 파일이라 핸들러·Durable Object 클래스만 내보낼 수 있음 → 숫자 상수는 여기서 내보냄
 * (진입 파일에서 상수를 내보내면 로컬 workerd 가 'Incorrect type for map entry' 로 시작을 거부)
 */
export const MAX_PLAYERS = 30; // 방 하나 인원 (무료 플랜에 맞춰 4개 방 × 30명 = 최대 120명)
export const MAX_ROOMS = 4;
