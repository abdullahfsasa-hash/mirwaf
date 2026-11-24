// حسابات العملاء: دخول بحساب جوجل (مجاني) + رقم جوال. لا رمز تحقق SMS.
// الميزة مطفأة حتى يُضبط GOOGLE_CLIENT_ID (معرّف عام وليس سرًّا). الضيف يطلب كالمعتاد.
import { J, clean, dig, ipHash, sameOrigin, readJson, safeEqual, sha } from './util.js';
import { validateAddress, lookupShort, lookupOn } from './address.js';

const COOKIE = 'mw_user';
const TTL = 30 * 86400 * 1000;
const enc = new TextEncoder();

const DDL = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, google_sub TEXT UNIQUE NOT NULL, email TEXT, name TEXT, phone TEXT,
    phone_verified INTEGER NOT NULL DEFAULT 0, addr TEXT, sess_ver INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_login INTEGER)`,
  `CREATE INDEX IF NOT EXISTS accounts_email ON accounts (email)`,
  `CREATE TABLE IF NOT EXISTS acct_rl (ip_hash TEXT, kind TEXT, ts INTEGER)`,
  `CREATE INDEX IF NOT EXISTS acct_rl_i ON acct_rl (ip_hash, kind, ts)`
];
// أعمدة جديدة في orders؛ تُضاف مرة واحدة ويُتجاهل خطأ "العمود موجود".
const ALTERS = [
  'ALTER TABLE orders ADD COLUMN account_id INTEGER', 'ALTER TABLE orders ADD COLUMN addr_short TEXT', 'ALTER TABLE orders ADD COLUMN addr_building TEXT',
  'ALTER TABLE orders ADD COLUMN addr_street TEXT', 'ALTER TABLE orders ADD COLUMN addr_district TEXT', 'ALTER TABLE orders ADD COLUMN addr_post TEXT',
  'ALTER TABLE orders ADD COLUMN addr_extra TEXT', 'ALTER TABLE orders ADD COLUMN addr_verified INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE orders ADD COLUMN email TEXT'
];
export async function ensureAccounts(env) {
  await env.DB.batch(DDL.map(s => env.DB.prepare(s)));
  for (const s of ALTERS) {
    try { await env.DB.prepare(s).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
  try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS orders_account ON orders (account_id, created_at)').run(); } catch (e) { }
}

export const accountsOn = env => !!env.GOOGLE_CLIENT_ID && !!(env.SESSION_SECRET || env.ADMIN_PASSWORD);

/* ---------- الكوكي: exp.id.ver.hmac ---------- */
const hmac = async (env, msg) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(await sha('u|' + (env.SESSION_SECRET || '') + '|' + (env.ADMIN_PASSWORD || ''))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
};
const makeCookie = async (env, id, ver) => {
  const body = (Date.now() + TTL) + '.' + id + '.' + ver;
  return `${COOKIE}=${body}.${await hmac(env, body)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL / 1000}`;
};
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// الحساب الحالي من الكوكي فقط (لا يُقبل معرّف حساب من جسم الطلب أبدًا). null إن لم يوجد.
export async function currentAccount(request, env) {
  if (!accountsOn(env)) return null;
  const m = new RegExp('(?:^|; )' + COOKIE + '=([^;]+)').exec(request.headers.get('cookie') || '');
  if (!m) return null;
  const p = m[1].split('.');
  if (p.length !== 4) return null;
  if (!(Number(p[0]) > Date.now()) || !/^\d{1,12}$/.test(p[1]) || !/^\d{1,9}$/.test(p[2])) return null;
  if (!(await safeEqual(p[3], await hmac(env, p[0] + '.' + p[1] + '.' + p[2])))) return null;
  const r = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(Number(p[1])).first();
  return r && r.sess_ver === Number(p[2]) ? r : null;
}

/* ---------- التحقق من رمز جوجل (RS256) ---------- */
let jwksCache = { at: 0, keys: null };
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const jsonPart = s => JSON.parse(new TextDecoder().decode(b64u(s)));
async function getJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600000) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error('jwks');
  const j = await r.json();
  if (!j || !Array.isArray(j.keys)) throw new Error('jwks');
  jwksCache = { at: Date.now(), keys: j.keys };
  return j.keys;
}
// يُرجع { sub, email, name } أو null. jwks اختياري للاختبار.
export async function verifyGoogleToken(token, env, jwks) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const h = jsonPart(parts[0]), p = jsonPart(parts[1]);
    if (h.alg !== 'RS256' || !h.kid) return null;
    const keys = jwks || await getJwks();
    const jwk = keys.find(k => k.kid === h.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), enc.encode(parts[0] + '.' + parts[1])))) return null;
    if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return null;
    if (!env.GOOGLE_CLIENT_ID || p.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (!(Number(p.exp) * 1000 > Date.now() - 60000)) return null;
    if (!(p.email_verified === true || p.email_verified === 'true')) return null;
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 64) return null;
    return { sub: p.sub, email: clean(p.email, 120).toLowerCase(), name: clean(p.name, 80) };
  } catch (e) { return null; }
}

/* ---------- الجوال السعودي ---------- */
// يقبل 05XXXXXXXX و5XXXXXXXX و9665XXXXXXXX و+9665XXXXXXXX و009665XXXXXXXX → 9665XXXXXXXX، وإلا ''.
export function normPhone(s) {
  let d = dig(String(s || '')).replace(/[\s\-()+]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '966' + d;
  return /^9665\d{8}$/.test(d) ? d : '';
}
export const phoneOf = row => (row && row.phone) || '';
// مقارنة جوال الطلب برقم الحساب (بعد التطبيع)
export const samePhone = (a, b) => { const x = normPhone(a), y = normPhone(b); return !!x && x === y; };

/* ---------- الواجهة العامة للحساب ---------- */
const pubUser = r => {
  let addr = null; try { addr = r.addr ? JSON.parse(r.addr) : null; } catch (e) { }
  return { name: r.name || '', email: r.email || '', phone: r.phone || '', phoneVerified: !!r.phone_verified, addr };
};
const pubOrderRow = r => ({ ref: r.ref, at: r.created_at, status: r.status, total: r.total, count: (() => { try { return JSON.parse(r.items).reduce((s, i) => s + (i.qty || 0), 0); } catch (e) { return 0; } })(), pay: r.pay_status || '' });

async function limited(env, request, kind, max, windowMs) {
  const ih = await ipHash(request, env), now = Date.now();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM acct_rl WHERE ip_hash = ? AND kind = ? AND ts > ?').bind(ih, kind, now - windowMs).first();
  if (r && r.n >= max) return true;
  await env.DB.prepare('INSERT INTO acct_rl (ip_hash, kind, ts) VALUES (?, ?, ?)').bind(ih, kind, now).run();
  await env.DB.prepare('DELETE FROM acct_rl WHERE ts < ?').bind(now - 86400000).run();
  return false;
}

export async function accountRoute({ request, env }, path) {
  const m = request.method, b = path[1];
  if (!accountsOn(env)) return J({ ok: false, error: 'accounts_off' }, 503);
  if (m !== 'GET' && !sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);

  if (b === 'me' && m === 'GET') {
    const u = await currentAccount(request, env);
    return J({ ok: true, user: u ? pubUser(u) : null });
  }

  if (b === 'google' && m === 'POST') {
    if (await limited(env, request, 'google', 30, 600000)) return J({ ok: false, error: 'rate' }, 429, { 'retry-after': '600' });
    const body = await readJson(request, 6000);
    const g = body && await verifyGoogleToken(body.credential, env);
    if (!g) return J({ ok: false, error: 'token' }, 401);
    const now = Date.now();
    let u = await env.DB.prepare('SELECT * FROM accounts WHERE google_sub = ?').bind(g.sub).first();
    if (!u) {
      await env.DB.prepare('INSERT OR IGNORE INTO accounts (google_sub, email, name, created_at, last_login) VALUES (?,?,?,?,?)').bind(g.sub, g.email, g.name, now, now).run();
      u = await env.DB.prepare('SELECT * FROM accounts WHERE google_sub = ?').bind(g.sub).first();
    } else {
      await env.DB.prepare('UPDATE accounts SET email = ?, last_login = ? WHERE id = ?').bind(g.email || u.email, now, u.id).run();
      u = { ...u, email: g.email || u.email };
    }
    return J({ ok: true, user: pubUser(u) }, 200, { 'set-cookie': await makeCookie(env, u.id, u.sess_ver) });
  }

  if (b === 'logout' && m === 'POST') {
    const u = await currentAccount(request, env);
    if (u) await env.DB.prepare('UPDATE accounts SET sess_ver = sess_ver + 1 WHERE id = ?').bind(u.id).run(); // يُلغي كل الأجهزة
    return J({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }

  const u = await currentAccount(request, env);
  if (!u) return J({ ok: false, error: 'auth' }, 401);

  if (b === 'profile' && m === 'POST') {
    const body = await readJson(request, 4000);
    if (!body) return J({ ok: false, error: 'invalid' }, 400);
    const name = clean(body.name, 80);
    let phone = '';
    if (body.phone != null && String(body.phone).trim() !== '') { phone = normPhone(body.phone); if (!phone) return J({ ok: false, error: 'phone' }, 400); }
    let addr = null;
    if (body.addr) {
      const v = validateAddress(body.addr);
      if (!v.ok) return J({ ok: false, error: 'address', field: v.field }, 400);
      addr = JSON.stringify(v.a);
    }
    const verified = phone && phone === u.phone ? u.phone_verified : 0; // تغيير الرقم يلغي التوثيق
    await env.DB.prepare('UPDATE accounts SET name = ?, phone = ?, phone_verified = ?, addr = ? WHERE id = ?').bind(name || u.name, phone, verified, addr, u.id).run();
    const n = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(u.id).first();
    return J({ ok: true, user: pubUser(n) });
  }

  if (b === 'orders' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT ref, created_at, status, total, items, pay_status FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 30').bind(u.id).all();
    return J({ ok: true, orders: results.map(pubOrderRow) });
  }

  return J({ ok: false, error: 'notfound' }, 404);
}

// بعد نجاح الطلب: لو جوال الطلب = جوال الحساب نوثّقه (توثيق خفيف: رقم استُخدم فعليًا في طلب، وليس رمز SMS).
export async function markPhoneUsed(env, acc, orderPhone) {
  if (!acc || !acc.phone || acc.phone_verified) return;
  if (samePhone(acc.phone, orderPhone)) await env.DB.prepare('UPDATE accounts SET phone_verified = 1 WHERE id = ?').bind(acc.id).run();
}

export async function addressLookupRoute(request, env) {
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  if (!lookupOn(env)) return J({ ok: true, enabled: false });
  const body = await readJson(request, 500);
  if (!body) return J({ ok: false, error: 'invalid' }, 400);
  if (await limited(env, request, 'addr', 20, 600000)) return J({ ok: false, error: 'rate' }, 429, { 'retry-after': '600' });
  const r = await lookupShort(env, body.short);
  return J(r, r.ok ? 200 : r.error === 'invalid' ? 400 : 502);
}
