// Stream (streampay.sa) — تكامل من جهة الخادم فقط. المفتاح لا يظهر للمتصفح أبدًا.
const BASE = 'https://stream-app-service.streampay.sa/api/v2';

export const streamOn = env => !!(env.STREAM_API_KEY && env.STREAM_API_SECRET);

async function call(env, method, path, body) {
  const auth = btoa(env.STREAM_API_KEY + ':' + env.STREAM_API_SECRET);
  const r = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': auth, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* no body */ }
  return { ok: r.ok, status: r.status, data };
}

export const createProduct = (env, name, amount, description) =>
  call(env, 'POST', '/products', { name: String(name).slice(0, 160), ...(description ? { description: String(description).slice(0, 500) } : {}), type: 'ONE_OFF', prices: [{ currency: 'SAR', amount }] });

export async function findProductByName(env, name) {
  const r = await call(env, 'GET', '/products?limit=100&active=true&search_term=' + encodeURIComponent(String(name).slice(0, 160)));
  if (!r.ok || !r.data) return { ok: false, id: null };
  const list = Array.isArray(r.data) ? r.data : (r.data.data || r.data.items || r.data.results || []);
  const hit = list.find(x => x && x.name === String(name).slice(0, 160));
  return { ok: true, id: hit ? hit.id : null };
}

export const createPaymentLink = (env, productId, ref, origin) =>
  call(env, 'POST', '/payment_links', {
    name: ('LUCE ' + ref).slice(0, 160),
    items: [{ product_id: productId, quantity: 1 }],
    currency: 'SAR',
    max_number_of_payments: 1,
    success_redirect_url: origin + '/',
    failure_redirect_url: origin + '/?pay=failed',
    custom_metadata: { order_ref: ref },
    valid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });

export const getInvoice = (env, id) => call(env, 'GET', '/invoices/' + encodeURIComponent(id));

// توقيع الويب هوك: t=...,v1=HMAC-SHA256("{t}.{raw_body}")
export async function verifyWebhook(secret, header, raw) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map(s => s.trim().split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600 && Math.abs(Date.now() - Number(parts.t)) > 600000) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(parts.t + '.' + raw));
  const hex = [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return d === 0;
}
