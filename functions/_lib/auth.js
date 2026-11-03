// دخول الأدمن: كلمة سر واحدة من أسرار Cloudflare، وجلسة موقّعة (HMAC) في كوكي HttpOnly.
import { ipHash, safeEqual, sha } from './util.js';

const COOKIE = 'mw_admin';
const TTL = 12 * 3600 * 1000;
const enc = new TextEncoder();

const keyOf = env => 'k|' + (env.SESSION_SECRET || '') + '|' + (env.ADMIN_PASSWORD || '');
const hmac = async (env, msg) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(await sha(keyOf(env))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
};

export const adminEnabled = env => !!env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length >= 12;

export async function makeCookie(env) {
  const exp = Date.now() + TTL, nonce = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const body = exp + '.' + nonce;
  return `${COOKIE}=${body}.${await hmac(env, body)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL / 1000}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function isAdmin(request, env) {
  if (!adminEnabled(env)) return false;
  const m = new RegExp('(?:^|; )' + COOKIE + '=([^;]+)').exec(request.headers.get('cookie') || '');
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 3) return false;
  const exp = Number(parts[0]);
  if (!(exp > Date.now())) return false;
  return safeEqual(parts[2], await hmac(env, parts[0] + '.' + parts[1]));
}

// حد محاولات الدخول الفاشلة: 8 محاولات خلال 15 دقيقة لكل زائر.
export async function loginAttempt(request, env, password) {
  const ih = await ipHash(request, env), now = Date.now();
  const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_fail WHERE ip_hash = ? AND ts > ?').bind(ih, now - 900000).first();
  if (f && f.n >= 8) return 'locked';
  if (typeof password === 'string' && password.length <= 200 && (await safeEqual(password, env.ADMIN_PASSWORD))) return 'ok';
  await env.DB.prepare('INSERT INTO admin_fail (ip_hash, ts) VALUES (?, ?)').bind(ih, now).run();
  await env.DB.prepare('DELETE FROM admin_fail WHERE ts < ?').bind(now - 86400000).run();
  return 'bad';
}
