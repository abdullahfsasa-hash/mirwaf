// أدوات مشتركة للخادم. لا أسرار هنا.
export const J = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }
  });

// ينظّف النص من محارف التحكم ومحارف اتجاه النص المخفية، ويقصّه للحد المسموح.
export const clean = (s, n, keepNl) =>
  String(s == null ? '' : s)
    .replace(keepNl ? /[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, n);

// يحوّل الأرقام العربية والفارسية إلى لاتينية.
export const dig = s =>
  String(s).replace(/[٠-٩]/g, c => c.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x6f0);

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// بصمة مجهولة لعنوان الزائر: نخزّن البصمة فقط وليس العنوان.
export const ipHash = async (request, env) =>
  (await sha((env.IP_SALT || 'mirwaf') + '|' + (request.headers.get('CF-Connecting-IP') || 'unknown'))).slice(0, 32);

// مقارنة بزمن ثابت لتقليل تسريب المعلومات.
export const safeEqual = async (a, b) => {
  const [x, y] = await Promise.all([sha('a|' + a), sha('a|' + b)]);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
};

// يسمح فقط بالطلبات القادمة من نفس الموقع.
export const sameOrigin = request => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch (e) { return false; }
};

export const readJson = async (request, max = 20000) => {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return null;
  const raw = await request.text();
  if (raw.length > max) return null;
  try { const b = JSON.parse(raw); return b && typeof b === 'object' ? b : null; } catch (e) { return null; }
};
