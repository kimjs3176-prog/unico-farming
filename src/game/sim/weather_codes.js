/**
 * WMO 날씨 코드(Open-Meteo weather_code) → 게임 날씨 상태
 * kind: clear | cloudy | fog | rain | snow | storm
 * precip: 0..1 강수 세기, cloud: 0..1 구름 양, wind: 0..1 바람 세기
 */
const TABLE = [
  [[0], 'clear', '맑음', '☀️', 0, 0.05],
  [[1], 'clear', '대체로 맑음', '🌤️', 0, 0.25],
  [[2], 'cloudy', '구름 조금', '⛅', 0, 0.5],
  [[3], 'cloudy', '흐림', '☁️', 0, 0.9],
  [[45, 48], 'fog', '안개', '🌫️', 0, 0.8],
  [[51, 53, 55, 56, 57], 'rain', '이슬비', '🌦️', 0.3, 0.85],
  [[61, 66, 80], 'rain', '비', '🌧️', 0.55, 0.9],
  [[63, 81], 'rain', '비', '🌧️', 0.75, 0.95],
  [[65, 67, 82], 'rain', '폭우', '🌧️', 1.0, 1.0],
  [[71, 77, 85], 'snow', '눈', '🌨️', 0.45, 0.9],
  [[73, 75, 86], 'snow', '많은 눈', '❄️', 0.85, 1.0],
  [[95, 96, 99], 'storm', '뇌우', '⛈️', 0.9, 1.0],
];

export function describeWeather({ code = 0, temperature = null, wind = 0, cloudCover = null, isDay = 1 } = {}) {
  const row = TABLE.find(([codes]) => codes.includes(code)) || TABLE[0];
  const [, kind, label, emoji0, precip, cloud0] = row;
  const emoji = !isDay && kind === 'clear' ? '🌙' : emoji0;
  const cloud = cloudCover === null ? cloud0 : Math.max(cloud0 * 0.6, cloudCover / 100);
  return {
    code, kind, label, emoji, precip, cloud: Math.min(1, cloud),
    wind: Math.min(1, Math.max(0, wind) / 40), // km/h → 0..1 (40km/h 이상 최대)
    windKmh: wind,
    temperature,
    isDay: !!isDay,
    // 게임 효과
    autoWater: kind === 'rain' || kind === 'storm',
    fog: kind === 'fog' ? 1 : kind === 'rain' || kind === 'storm' ? 0.4 : kind === 'snow' ? 0.5 : 0,
    thunder: kind === 'storm',
  };
}

/** 테스트/데모용 수동 날씨 */
export const PRESETS = {
  clear: { code: 0, temperature: 22, wind: 6 },
  cloudy: { code: 3, temperature: 18, wind: 12 },
  fog: { code: 45, temperature: 12, wind: 3 },
  rain: { code: 63, temperature: 16, wind: 18 },
  snow: { code: 73, temperature: -2, wind: 10 },
  storm: { code: 95, temperature: 24, wind: 35 },
};
