// العنوان الوطني السعودي: التحقق من الحقول، وبحث اختياري عبر واجهة سبل (SPL) عند توفّر SPL_API_KEY.
import { clean, dig } from './util.js';

const OTO = 'https://api.tryoto.com/rest/v2';
const SPL = 'https://apina.address.gov.sa/NationalAddress/NationalAddressByShortAddress/NationalAddressByShortAddress';

export const normShort = s => dig(String(s || '')).toUpperCase().replace(/[\s-]/g, '');
export const validShort = s => /^[A-Z]{4}\d{4}$/.test(s);

// يتحقق من حقول العنوان القادمة من المتجر ويُرجع { ok, a } أو { ok:false, field }.
// المبنى 4 أرقام، الرمز البريدي 5 أرقام، الرقم الإضافي 4 أرقام، والمختصر (اختياري) 4 حروف + 4 أرقام.
export function validateAddress(c) {
  const city = clean(c.city, 60), district = clean(c.district, 60), street = clean(c.street, 80);
  const bno = dig(clean(c.bno, 8)).replace(/\s/g, ''), post = dig(clean(c.post, 8)).replace(/\s/g, ''), extra = dig(clean(c.extra, 8)).replace(/\s/g, '');
  const short = normShort(clean(c.short, 20));
  if (city.length < 2) return { ok: false, field: 'city' };
  if (district.length < 2) return { ok: false, field: 'district' };
  if (street.length < 2) return { ok: false, field: 'street' };
  if (!/^\d{4}$/.test(bno)) return { ok: false, field: 'bno' };
  if (!/^\d{5}$/.test(post)) return { ok: false, field: 'post' };
  if (!/^\d{4}$/.test(extra)) return { ok: false, field: 'extra' };
  if (short && !validShort(short)) return { ok: false, field: 'short' };
  return { ok: true, a: { city, district, street, bno, post, extra, short } };
}

// سطر العنوان المقروء (يُخزَّن في عمود address القديم ليبقى الأدمن والتصدير يعملان كما هما).
export const addrLine = a =>
  `${a.street}، حي ${a.district}، مبنى ${a.bno}، ${a.city} ${a.post}-${a.extra}` + (a.short ? ` (العنوان المختصر ${a.short})` : '');

const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim(); return ''; };

// بحث بالعنوان المختصر. يُرجع:
//  { ok:true, enabled:false }                 المفتاح غير مضبوط
//  { ok:true, enabled:true, found:false }     لا نتيجة
//  { ok:true, enabled:true, found:true, a }   العنوان
//  { ok:false, error:'upstream' }             تعذّر الاتصال بالخدمة
export const lookupOn = env => !!(env.OTO_REFRESH_TOKEN || env.SPL_API_KEY);

// OTO: refresh_token (سرّي في Cloudflare) يُستبدل بـ access_token صالح ساعة، يُحفظ في ذاكرة الـ isolate.
let otoTok = null, otoExp = 0;
async function otoAccess(env) {
  if (otoTok && Date.now() < otoExp) return otoTok;
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(OTO + '/refreshToken', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ refresh_token: env.OTO_REFRESH_TOKEN }) });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j && (j.access_token || (j.data && j.data.access_token));
    if (!t) return null;
    otoTok = t; otoExp = Date.now() + 50 * 60 * 1000;
    return t;
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

async function lookupOto(env, short) {
  const tok = await otoAccess(env);
  if (!tok) return { ok: false, error: 'upstream' };
  let j;
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(OTO + '/getNationalAddressFromShortCode', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ shortAddressCode: short }) });
    clearTimeout(tm);
    if (r.status === 401) { otoTok = null; return { ok: false, error: 'upstream' }; }
    if (r.status === 404 || r.status === 400) return { ok: true, enabled: true, found: false };
    if (!r.ok) return { ok: false, error: 'upstream' };
    j = await r.json();
  } catch (e) { return { ok: false, error: 'upstream' }; }
  const x = j && j.data;
  if (!x || j.success === false) return { ok: true, enabled: true, found: false };
  const ar = o => (o && (o.nameAr || o.name_ar || o.arName)) || '';
  const a = {
    city: clean(pick(x, 'cityName') || ar(x.city), 60), district: clean(pick(x, 'districtName') || ar(x.district), 60), street: clean(pick(x, 'streetName'), 80),
    bno: dig(pick(x, 'buildingName', 'buildingNumber')), post: dig(pick(x, 'zipCode')), extra: dig(pick(x, 'secondary', 'additionalNumber')), short
  };
  if (!/^\d{4}$/.test(a.bno) || !/^\d{5}$/.test(a.post)) return { ok: true, enabled: true, found: false };
  if (!/^\d{4}$/.test(a.extra)) a.extra = '';
  return { ok: true, enabled: true, found: true, a };
}

export async function lookupShort(env, shortRaw) {
  if (!env.OTO_REFRESH_TOKEN && !env.SPL_API_KEY) return { ok: true, enabled: false };
  const short = normShort(shortRaw);
  if (!validShort(short)) return { ok: false, error: 'invalid' };
  if (env.OTO_REFRESH_TOKEN) return lookupOto(env, short);
  const url = SPL + '?format=json&language=ar&encode=utf8&shortaddress=' + encodeURIComponent(short) + '&api_key=' + encodeURIComponent(env.SPL_API_KEY);
  let j;
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    clearTimeout(tm);
    if (!r.ok) return { ok: false, error: 'upstream' };
    j = await r.json();
  } catch (e) { return { ok: false, error: 'upstream' }; }
  const list = j && (j.Addresses || j.addresses);
  const x = Array.isArray(list) ? list[0] : null;
  if (!x) return { ok: true, enabled: true, found: false };
  const a = {
    city: clean(pick(x, 'City', 'CityAr', 'city'), 60), district: clean(pick(x, 'District', 'DistrictAr', 'district'), 60), street: clean(pick(x, 'Street', 'StreetAr', 'street'), 80),
    bno: dig(pick(x, 'BuildingNumber', 'buildingNumber')), post: dig(pick(x, 'PostCode', 'ZipCode', 'postCode')), extra: dig(pick(x, 'AdditionalNumber', 'additionalNumber')), short
  };
  if (!/^\d{4}$/.test(a.bno) || !/^\d{5}$/.test(a.post)) return { ok: true, enabled: true, found: false };
  return { ok: true, enabled: true, found: true, a };
}
