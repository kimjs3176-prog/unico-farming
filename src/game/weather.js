import { describeWeather, PRESETS } from './sim/weather_codes.js';

const DEFAULT_LOC = { lat: 35.95, lon: 126.96, name: '익산(기본 위치)' }; // 한국농업기술진흥원 인근
const REFRESH_MS = 15 * 60 * 1000;

/**
 * 현재 위치 실시간 날씨 연동
 * 1) 브라우저 위치 권한(navigator.geolocation) → 실패/거부 시 기본 위치
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
    this.loc = await this.locate();
    await this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  locate() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ ...DEFAULT_LOC });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '현재 위치' }),
        () => resolve({ ...DEFAULT_LOC }),
        { timeout: 8000, maximumAge: 30 * 60 * 1000 },
      );
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

  async useLive() {
    this.override = null;
    this.loc = await this.locate();
    await this.refresh();
  }

  get label() {
    const s = this.state;
    const t = s.temperature === null || s.temperature === undefined ? '' : ` ${Math.round(s.temperature)}°`;
    return `${s.emoji}${t}`;
  }
}
