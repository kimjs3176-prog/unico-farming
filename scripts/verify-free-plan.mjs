// 배포 전에 결제 읽기 API로 확인. 요금제 변경·구독 생성은 하지 않음.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assertFreeSubscriptions(rows) {
  if (!Array.isArray(rows)) throw new Error('구독 응답을 확인할 수 없어 배포를 중단합니다');
  for (const s of rows) {
    if (['Cancelled', 'Expired', 'Failed'].includes(s?.state)) continue;
    // 알 수 없는 구독·체험·사용량 과금도 허용하지 않는 보수적인 검사.
    const free = s?.state === 'Provisioned' && /(^|[_-])free($|[_-])/i.test(s.rate_plan?.id || '')
      && s.price === 0 && (s.component_values || []).every((c) => c.price === 0);
    if (!free) throw new Error('무료로 확인되지 않은 활성 구독이 있어 배포를 중단합니다. Cloudflare Billing에서 Workers Free 여부를 확인하세요');
  }
}

export async function verifyFreePlan(env = process.env, request = fetch) {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_BILLING_READ_TOKEN || env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/.test(account || '') || !token) throw new Error('무료 플랜 확인용 계정·Billing Read 토큰이 없어 배포를 중단합니다');
  let page = 1;
  while (page <= 100) {
    const res = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/subscriptions?page=${page}&per_page=50`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`결제 플랜 조회 실패(HTTP ${res.status}). Billing Read 권한을 확인하세요. 배포하지 않습니다`);
    const data = await res.json();
    if (data.success !== true) throw new Error('결제 플랜을 확인하지 못해 배포를 중단합니다');
    assertFreeSubscriptions(data.result);
    const info = data.result_info;
    if (!info || !Number.isFinite(info.total_count) || !Number.isFinite(info.count)) throw new Error('구독 목록의 완전성을 확인하지 못해 배포를 중단합니다');
    if (info.total_count <= (page - 1) * 50 + info.count) return;
    if (info.count === 0) throw new Error('구독 목록이 불완전해 배포를 중단합니다');
    page++;
  }
  throw new Error('구독 목록이 너무 많아 무료 플랜을 확인하지 못했습니다');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await verifyFreePlan(); console.log('무료 구독 확인 완료. 유료 플랜으로 변경하지 않습니다.'); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
