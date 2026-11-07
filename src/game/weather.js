import { describeWeather, PRESETS } from './sim/weather_codes.js';

const DEFAULT_LOC = { lat: 35.95, lon: 126.96, name: '익산(기본 위치)' }; // 한국농업기술진흥원 인근
const REFRESH_MS = 15 * 60 * 1000;

/** 위치 권한을 이미 허용했는지 (Permissions API 가 없거나 모르면 false → 묻지 않음) */
export async function geoGranted() {
  try { return (await globalThis.navigator?.permissions?.query?.({ name: 'geolocation' }))?.state === 'granted'; } catch { return false; }
}

/**
 * 현재 위치 실시간 날씨 연동
 * 1) 위치: 이미 허용된 경우에만 조용히 읽고, 아니면 기본 위치. 권한 창은 날씨 창의 '📡 실시간 날씨'를 눌렀을 때만 뜸
 * 2) Open-Meteo(무료·키 불필요)에서 현재 날씨 조회, 좌표는 소수 둘째 자리(약 1km)로 반올림해 전송
 * 3) 15분마다 갱신. ?weather=rain|snow|fog|storm|cloudy|clear 로 강제 가능
 */
export class WeatherService {
  constructor(onChange) {
    this.onChange = onChange;
    this.loc = null;
    this.state = describeWeather(PRESETS.clear);
    this.source = 'default';
    this.enabled = true;
    this.override = new URLSearchParams(location.search).get('weather');
    this.timer = null;
  }

  async start() {
    if (this.override && PRESETS[this.override]) return this.setPreset(this.override);
    // 입장하자마자 권한 창을 띄우지 않음 (로딩·인트로를 가림): 이미 허용했을 때만 현재 위치
    this.loc = (await geoGranted()) ? await this.locate() : { ...DEFAULT_LOC };
    await this.refresh();
    this.timer ||= setInterval(() => this.refresh(), REFRESH_MS);
  }

  locate() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ ...DEFAULT_LOC });
      // timeout 옵션은 권한 창을 기다리는 시간을 세지 않음 → 답이 없어도 끝나도록 따로 타이머
      const t = setTimeout(() => resolve({ ...DEFAULT_LOC }), 20000);
      const done = (loc) => { clearTimeout(t); resolve(loc); };
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => done({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '현재 위치' }),
          () => done({ ...DEFAULT_LOC }),
          { timeout: 8000, maximumAge: 30 * 60 * 1000 },
        );
      } catch { done({ ...DEFAULT_LOC }); }
    });
  }

  async refresh() {
    if (!this.enabled || !this.loc) return;
    const lat = this.loc.lat.toFixed(2), lon = this.loc.lon.toFixed(2);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m&timezone=auto`;
      const d = await (await fetch(url)).json();
      const c = d.current;
      this.state = describeWeather({ code: c.weather_code, temperature: c.temperature_2m, wind: c.wind_speed_10m, cloudCover: c.cloud_cover, isDay: c.is_day });
      this.source = 'live';
      if (this.loc.name === '현재 위치') this.loc.name = (await this.placeName(lat, lon)) || '현재 위치';
    } catch {
      this.source = 'offline';
    }
    this.onChange?.(this.state, this);
  }

  /** 좌표 → 지명 (무료 역지오코딩, 실패하면 null) */
  async placeName(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
      const j = await r.json();
      return j.locality || j.city || j.principalSubdivision || null;
    } catch { return null; }
  }

  setPreset(name) {
    this.state = describeWeather(PRESETS[name]);
    this.source = 'manual';
    this.loc = this.loc || { ...DEFAULT_LOC };
    this.onChange?.(this.state, this);
  }

  /** 날씨 창 '📡 실시간 날씨' 버튼 (사용자 동작 안에서 바로 위치를 물음). 현재 위치를 받았으면 true */
  async useLive() {
    this.override = null;
    this.loc = await this.locate();
    await this.refresh();
    this.timer ||= setInterval(() => this.refresh(), REFRESH_MS);
    return !this.usingDefault;
  }

  /** 아직 기본 위치(익산) 날씨인지: 권한을 묻지 않았거나 위치를 못 받음 → 날씨 창에서 '내 위치 날씨'를 권함 */
  get usingDefault() { return !this.loc || this.loc.name === DEFAULT_LOC.name; }

  get label() {
    const s = this.state;
    const t = s.temperature === null || s.temperature === undefined ? '' : ` ${Math.round(s.temperature)}°`;
    return `${s.emoji}${t}`;
  }
}
