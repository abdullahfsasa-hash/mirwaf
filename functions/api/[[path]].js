// واجهة المتجر + لوحة الأدمن. مسار واحد يوزّع الطلبات: /api/<...>
import { J, clean, dig, ipHash, sameOrigin, readJson } from '../_lib/util.js';
import { init, effectiveCatalog, findCoupon, getFreeFrom, getSetting, setSetting } from '../_lib/db.js';
import { streamOn, createProduct, findProductByName, createPaymentLink, getInvoice, verifyWebhook } from '../_lib/stream.js';
import { accountRoute, addressLookupRoute, accountsOn, currentAccount, markPhoneUsed } from '../_lib/accounts.js';
import { validateAddress, addrLine, lookupShort, lookupOn } from '../_lib/address.js';
import { adminRoute, publicStoreSettings } from '../_lib/admin_api.js';
import { isAdmin, adminEnabled, makeCookie, clearCookie, loginAttempt, revokeSessions } from '../_lib/auth.js';

const STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
const CATS = ['beans', 'cups', 'gear', 'filters', 'matcha'];
const RATE_IP = 15, RATE_ALL = 1000;
const RIYADH = 3 * 3600000;

const pubOrder = r => ({ ok: true, ref: r.ref, at: r.created_at, sub: r.subtotal, d: r.discount, pct: r.coupon_pct || 0, free: !!r.free_shipping, total: r.total, coupon: r.coupon || '' });
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const parseItems = s => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    if (!env.DB) return J({ ok: false, error: 'server' }, 503);
    await init(env);
    const path = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean);
    const m = request.method;
    const [a, b, c] = path;

    // ---------- عامّ ----------
    if (a === 'catalog' && m === 'GET') return catalog(env);
    if (a === 'store-settings' && m === 'GET') return publicStoreSettings(env);
    if (a === 'coupon' && m === 'POST') return couponCheck(request, env);
    if (a === 'orders' && m === 'POST') return createOrder(context);
    if (a === 'pay' && b === 'verify' && m === 'POST') return payVerify(request, env);
    if (a === 'pay' && b === 'start' && m === 'POST') return payStart(request, env);
    if (a === 'pay' && b === 'webhook' && m === 'POST') return payWebhook(request, env);

    // ---------- حسابات العملاء والعنوان الوطني (functions/_lib/accounts.js, address.js) ----------
    if (a === 'account') return accountRoute(context, path);
    if (a === 'address' && b === 'lookup' && m === 'POST') return addressLookupRoute(request, env);

    // ---------- أدمن ----------
    if (a === 'admin') {
      if (b === 'login' && m === 'POST') return login(request, env);
      if (!adminEnabled(env)) return J({ ok: false, error: 'admin_disabled' }, 503);
      if (!(await isAdmin(request, env))) return J({ ok: false, error: 'unauthorized' }, 401);
      if (m !== 'GET') {
        // هنا (خلافًا لـ sameOrigin العامة) نرفض أي طلب بلا ترويسة Origin صريحة ومطابقة —
        // طلبات لوحة التحكم الحقيقية (fetch من admin.js) ترسل Origin دائمًا، فهذا لا يكسر شيئًا حقيقيًا.
        const origin = request.headers.get('origin');
        let originOk = false;
        if (origin) { try { originOk = new URL(origin).host === new URL(request.url).host; } catch (e) { originOk = false; } }
        if (!originOk || request.headers.get('x-mw') !== '1') return J({ ok: false, error: 'csrf' }, 403);
      }
      { const r = await adminRoute(request, env, path); if (r) return r; } // لوحة التحكم الموسّعة (admin_api.js)
      if (b === 'me' && m === 'GET') return J({ ok: true });
      if (b === 'logout' && m === 'POST') { await revokeSessions(env); return J({ ok: true }, 200, { 'set-cookie': clearCookie() }); }
      if (b === 'summary' && m === 'GET') return summary(env);
      if (b === 'orders' && !c && m === 'GET') return ordersList(request, env);
      if (b === 'orders' && c && m === 'POST') return orderUpdate(request, env, c, path[3]);
      if (b === 'export' && m === 'GET') return exportCsv(env);
      if (b === 'products' && m === 'GET') return productsList(env);
      if (b === 'products' && !c && m === 'POST') return productCreate(request, env);
      if (b === 'products' && c && m === 'POST') return productUpdate(request, env, c);
      if (b === 'products' && c && m === 'DELETE') return productDelete(env, c);
      if (b === 'upload' && m === 'POST') return uploadImage(request, env);
      if (b === 'coupons' && m === 'GET') return couponsList(env);
      if (b === 'coupons' && m === 'POST') return couponSave(request, env);
      if (b === 'coupons' && c && m === 'DELETE') return couponDelete(env, c);
      if (b === 'settings' && m === 'GET') return J({ ok: true, free_from: await getFreeFrom(env), stream: streamOn(env), webhook: !!env.STREAM_WEBHOOK_SECRET });
      if (b === 'stream' && c === 'sync' && m === 'POST') return streamSync(env);
      if (b === 'settings' && m === 'POST') return settingsSave(request, env);
    }
    return J({ ok: false, error: 'not_found' }, 404);
  } catch (e) {
    return J({ ok: false, error: 'server' }, 500);
  }
}

/* ================= عامّ ================= */
async function catalog(env) {
  const cat = await effectiveCatalog(env);
  const items = {}, extra = [];
  for (const [id, p] of Object.entries(cat)) {
    items[id] = { price: p.price, old: p.old, stock: p.stock, hidden: p.hidden };
    if (p.custom && !p.hidden) { const e = p.extra || {}; extra.push({ id, cat: p.cat, name: p.name, en: p.en || '', brand: p.brand || '', sub: e.sub || '', price: p.price, old: p.old, img: p.img, short: e.short || '', desc: e.desc || '' }); }
  }
  return J({ ok: true, pay: streamOn(env) && (await getSetting(env, 'pay_card_on', '1')) !== '0', freeFrom: await getFreeFrom(env), items, extra, gid: accountsOn(env) ? env.GOOGLE_CLIENT_ID : '', addr_lookup: lookupOn(env) }, 200, { 'cache-control': 'public, max-age=30' });
}

async function couponCheck(request, env) {
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  const b = await readJson(request, 500);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const c = await findCoupon(env, b.code);
  return c ? J({ ok: true, code: c.code, pct: c.pct }) : J({ ok: false, error: 'no_coupon' }, 404);
}

async function createOrder({ request, env, waitUntil }) {
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  const b = await readJson(request, 12000);
  if (!b || !b.c || typeof b.c !== 'object' || !Array.isArray(b.items)) return J({ ok: false, error: 'invalid' }, 400);

  const name = clean(b.c.name, 80), phone = dig(clean(b.c.phone, 20)), notes = clean(b.c.notes, 500, true);
  let av = validateAddress(b.c); // العنوان الوطني: مبنى 4 + بريدي 5 + إضافي 4 + حي + شارع + مدينة
  // توافق مؤقت: صفحات المتجر القديمة المخزّنة عند الزبائن ترسل عنوانًا نصيًا فقط، فنقبله (بدون حقول وطنية) بدل رفض الطلب.
  const legacyAddr = clean(b.c.addr, 200), legacyCity = clean(b.c.city, 60);
  const noStructured = !['district', 'street', 'bno', 'post', 'extra', 'short'].some(k => String(b.c[k] || '').trim());
  if (!av.ok && noStructured && legacyAddr.length >= 4 && legacyCity.length >= 2) av = { ok: true, a: { city: legacyCity, district: '', street: '', bno: '', post: '', extra: '', short: '' }, legacy: legacyAddr };
  if (name.length < 3 || !av.ok || !/^\+?\d{9,15}$/.test(phone.replace(/[\s-]/g, ''))) return J({ ok: false, error: 'invalid', field: av.ok ? '' : av.field }, 400);
  const na = av.a, city = na.city, address = av.legacy || addrLine(na);
  const cid = String(b.cid || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(cid)) return J({ ok: false, error: 'invalid' }, 400);
  const method = b.method === 'card' ? 'card' : 'wa', lang = b.lang === 'en' ? 'en' : 'ar';
  if (b.items.length < 1 || b.items.length > 30) return J({ ok: false, error: 'invalid' }, 400);

  const acc = await currentAccount(request, env); // الحساب من الكوكي فقط
  let addrVerified = 0;
  if (na.short && lookupOn(env)) { const lk = await lookupShort(env, na.short); if (lk.ok && lk.found && lk.a.bno === na.bno && lk.a.post === na.post) addrVerified = 1; }
  const cat = await effectiveCatalog(env);
  const items = [], want = {};
  for (const it of b.items) {
    const p = it && typeof it.id === 'string' && Object.prototype.hasOwnProperty.call(cat, it.id) ? cat[it.id] : null;
    const qty = int(it && it.qty, 1, 20);
    if (!p || p.hidden || !qty) return J({ ok: false, error: 'invalid' }, 400);
    let v = '';
    if (p.variants) { v = String(it.v || ''); if (!p.variants.includes(v)) return J({ ok: false, error: 'invalid' }, 400); }
    items.push({ id: it.id, name: p.name, v, qty, price: p.price });
    want[it.id] = (want[it.id] || 0) + qty;
  }
  for (const [id, q] of Object.entries(want)) if (cat[id].stock != null && cat[id].stock < q) return J({ ok: false, error: 'stock', id }, 409);

  const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
  const cp = b.coupon ? await findCoupon(env, b.coupon) : null;
  const d = cp ? Math.round(sub * cp.pct / 100) : 0, net = sub - d, free = net >= (await getFreeFrom(env)) && sub > 0 ? 1 : 0, total = net;

  if (b.website) return J({ ok: true, ref: 'MW-000000-0000', at: Date.now(), sub, d, pct: cp ? cp.pct : 0, free: !!free, total, coupon: cp ? cp.code : '' }); // فخ للروبوتات

  const now = Date.now(), ih = await ipHash(request, env);
  const prev = await env.DB.prepare('SELECT * FROM orders WHERE cid = ?').bind(cid).first();
  if (prev) return J(pubOrder(prev));
  const rl = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM orders WHERE ip_hash = ? AND created_at > ?) AS a, (SELECT COUNT(*) FROM orders WHERE created_at > ?) AS b').bind(ih, now - 600000, now - 3600000).first();
  if (rl && rl.a >= RATE_IP) return J({ ok: false, error: 'rate' }, 429, { 'retry-after': '600' });
  if (rl && rl.b >= RATE_ALL) return J({ ok: false, error: 'busy' }, 503, { 'retry-after': '600' });

  // حجز المخزون
  const taken = [];
  for (const [id, q] of Object.entries(want)) {
    if (cat[id].stock == null) continue;
    const r = await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').bind(q, id, q).run();
    if (!r.meta || r.meta.changes !== 1) {
      for (const [tid, tq] of taken) await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(tq, tid).run();
      return J({ ok: false, error: 'stock', id }, 409);
    }
    taken.push([id, q]);
  }

  const day = new Date(now + RIYADH).toISOString().slice(2, 10).replace(/-/g, '');
  let ref = '', saved = false;
  for (let t = 0; t < 6 && !saved; t++) {
    ref = 'MW-' + day + '-' + [...crypto.getRandomValues(new Uint8Array(3))].map(x => x.toString(36).toUpperCase()).join('').replace(/[^A-Z0-9]/g, '0').padEnd(4, '0').slice(0, 4);
    try {
      await env.DB.prepare('INSERT INTO orders (ref,cid,created_at,updated_at,name,phone,city,address,notes,items,subtotal,discount,free_shipping,total,coupon,coupon_pct,lang,method,ip_hash,account_id,addr_short,addr_building,addr_street,addr_district,addr_post,addr_extra,addr_verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(ref, cid, now, now, name, phone, city, address, notes, JSON.stringify(items), sub, d, free, total, cp ? cp.code : '', cp ? cp.pct : 0, lang, method, ih, acc ? acc.id : null, na.short, na.bno, na.street, na.district, na.post, na.extra, addrVerified).run();
      saved = true;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message || e))) { for (const [tid, tq] of taken) await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(tq, tid).run(); throw e; }
      if (/cid/i.test(String(e.message))) { const again = await env.DB.prepare('SELECT * FROM orders WHERE cid = ?').bind(cid).first(); if (again) return J(pubOrder(again)); }
    }
  }
  if (!saved) { for (const [tid, tq] of taken) await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(tq, tid).run(); return J({ ok: false, error: 'server' }, 500); }
  if (cp) await env.DB.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').bind(cp.code).run();
  if (acc) { try { await markPhoneUsed(env, acc, phone); } catch (e) { } }
  return J({ ok: true, ref, at: now, sub, d, pct: cp ? cp.pct : 0, free: !!free, total, coupon: cp ? cp.code : '' });
}

// التحقق من دفعة Stream من الخادم: نجلب الفاتورة بالمفتاح السري ونطابق رابط الدفع والمبلغ والعملة.
async function verifyPayment(env, order, invId) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(invId)) return { ok: false, error: 'invalid' };
  const dup = await env.DB.prepare('SELECT ref FROM orders WHERE pay_id = ? AND ref <> ? AND pay_verified = 1').bind(invId, order.ref).first();
  if (dup) return { ok: false, error: 'duplicate' };
  if (!streamOn(env)) {
    await env.DB.prepare('UPDATE orders SET pay_id = ?, pay_status = ?, pay_verified = 0, pay_info = ?, updated_at = ? WHERE ref = ?').bind(invId, 'unverified', 'no stream key configured', Date.now(), order.ref).run();
    return { ok: true, verified: false, status: 'unverified' };
  }
  const r = await getInvoice(env, invId);
  if (!r.ok || !r.data) return { ok: false, error: 'gateway' };
  const inv = r.data;
  const link = await getSetting(env, 'paylink:' + order.ref, '');
  const total = Number(inv.total_amount), paidAmt = Number(inv.paid_amount), rem = Number(inv.remaining_amount);
  const paid = inv.status === 'COMPLETED' || (paidAmt >= total && total > 0 && !(rem > 0));
  const good = !!link && inv.payment_link_id === link && paid && (inv.currency || 'SAR') === 'SAR' && Math.round(total * 100) === order.total * 100;
  const info = `total=${inv.total_amount} paid=${inv.paid_amount} ${inv.currency || ''} status=${inv.status}`;
  await env.DB.prepare('UPDATE orders SET pay_id = ?, pay_status = ?, pay_verified = ?, pay_info = ?, updated_at = ? WHERE ref = ?').bind(invId, String(inv.status || '').slice(0, 20), good ? 1 : 0, info.slice(0, 200), Date.now(), order.ref).run();
  return { ok: true, verified: good, status: good ? 'paid' : String(inv.status || '') };
}

// بدء الدفع: ننشئ منتجًا لهذا الطلب بالمبلغ النهائي (يشمل الخصم والشحن) ورابط دفع، ونعيد الرابط للمتصفح.
async function payStart(request, env) {
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  if (!streamOn(env) || (await getSetting(env, 'pay_card_on', '1')) === '0') return J({ ok: false, error: 'pay_off' }, 503);
  const b = await readJson(request, 500);
  if (!b || typeof b.ref !== 'string') return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref, total, method, pay_verified, status FROM orders WHERE ref = ?').bind(b.ref.slice(0, 32)).first();
  if (!o || o.method !== 'card' || o.status === 'cancelled') return J({ ok: false, error: 'not_found' }, 404);
  if (o.pay_verified) return J({ ok: true, paid: true });
  if (!(o.total > 0)) return J({ ok: false, error: 'invalid' }, 400);
  const cached = await getSetting(env, 'payurl:' + o.ref, '');
  if (cached) return J({ ok: true, url: cached });
  const origin = new URL(request.url).origin;
  const pr = await createProduct(env, 'طلب لوتشي ' + o.ref, o.total, 'LUCE order ' + o.ref);
  if (!pr.ok || !pr.data || !pr.data.id) return J({ ok: false, error: 'gateway' }, 502);
  const pl = await createPaymentLink(env, pr.data.id, o.ref, origin);
  if (!pl.ok || !pl.data || !pl.data.id || !pl.data.url) return J({ ok: false, error: 'gateway' }, 502);
  await setSetting(env, 'paylink:' + o.ref, pl.data.id);
  await setSetting(env, 'payurl:' + o.ref, pl.data.url);
  return J({ ok: true, url: pl.data.url });
}

// ويب هوك Stream: لا نثق بمحتواه، نستخدمه فقط كإشارة ثم نعيد التحقق من الفاتورة عبر API.
async function payWebhook(request, env) {
  const raw = await request.text();
  if (raw.length > 100000) return J({ ok: false }, 413);
  if (!(await verifyWebhook(env.STREAM_WEBHOOK_SECRET, request.headers.get('x-webhook-signature') || request.headers.get('x-signature') || request.headers.get('stream-signature'), raw))) return J({ ok: false, error: 'sig' }, 401);
  let ev; try { ev = JSON.parse(raw); } catch (e) { return J({ ok: false }, 400); }
  const d = (ev && (ev.data || ev.payload)) || ev || {};
  const meta = d.custom_metadata || (d.payment_link && d.payment_link.custom_metadata) || (d.metadata) || {};
  const ref = String(meta.order_ref || '').slice(0, 32);
  const invId = String(d.invoice_id || (d.invoice && d.invoice.id) || d.id || '');
  if (ref && invId) {
    const o = await env.DB.prepare('SELECT ref, total FROM orders WHERE ref = ? AND method = ?').bind(ref, 'card').first();
    if (o) await verifyPayment(env, o, invId);
  }
  return J({ ok: true });
}

// مزامنة منتجات المتجر مع Stream (مرة واحدة لكل منتج، بدون تكرار).
async function streamSync(env) {
  if (!streamOn(env)) return J({ ok: false, error: 'pay_off' }, 503);
  const cat = await effectiveCatalog(env);
  const done = [], failed = [], skipped = [];
  for (const [id, p] of Object.entries(cat)) {
    if (p.hidden || !(p.price > 0)) { skipped.push(id); continue; }
    const key = 'stream_pid:' + id + ':' + p.price;
    if (await getSetting(env, key, '')) { skipped.push(id); continue; }
    // حجز ذرّي قبل الإنشاء: يمنع التكرار لو تزامن أكثر من طلب.
    const claim = await env.DB.prepare("INSERT INTO settings (k, v) VALUES (?, 'pending') ON CONFLICT(k) DO NOTHING").bind(key).run();
    if (!(claim.meta && claim.meta.changes === 1)) { skipped.push(id); continue; }
    // لو المنتج موجود فعلاً في Stream بنفس الاسم، لا ننشئ نسخة جديدة.
    const found = await findProductByName(env, p.name);
    if (found.ok && found.id) { await setSetting(env, key, found.id); skipped.push(id); continue; }
    const r = await createProduct(env, p.name, p.price, p.en || '');
    if (r.ok && r.data && r.data.id) { await setSetting(env, key, r.data.id); done.push(id); }
    else { await env.DB.prepare("DELETE FROM settings WHERE k = ? AND v = 'pending'").bind(key).run(); failed.push({ id, status: r.status }); }
  }
  return J({ ok: failed.length === 0, added: done.length, skipped: skipped.length, failed });
}

async function payVerify(request, env) {
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  const b = await readJson(request, 500);
  if (!b || typeof b.ref !== 'string' || typeof b.id !== 'string') return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref, total, method, pay_verified FROM orders WHERE ref = ?').bind(b.ref.slice(0, 32)).first();
  if (!o || o.method !== 'card') return J({ ok: false, error: 'not_found' }, 404);
  if (o.pay_verified) return J({ ok: true, verified: true, status: 'paid' });
  return J(await verifyPayment(env, o, b.id));
}

/* ================= أدمن ================= */
async function login(request, env) {
  if (!adminEnabled(env)) return J({ ok: false, error: 'admin_disabled' }, 503);
  if (!sameOrigin(request)) return J({ ok: false, error: 'origin' }, 403);
  const b = await readJson(request, 500);
  const r = await loginAttempt(request, env, b && b.password);
  if (r === 'locked') return J({ ok: false, error: 'locked' }, 429, { 'retry-after': '900' });
  if (r !== 'ok') return J({ ok: false, error: 'bad' }, 401);
  return J({ ok: true }, 200, { 'set-cookie': await makeCookie(env) });
}

async function summary(env) {
  const now = Date.now(), dayStart = Math.floor((now + RIYADH) / 86400000) * 86400000 - RIYADH;
  const d = new Date(now + RIYADH), monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - RIYADH;
  const { results } = await env.DB.prepare('SELECT created_at, total, status, pay_verified FROM orders WHERE created_at > ?').bind(now - 40 * 86400000).all();
  const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders GROUP BY status').all();
  const live = results.filter(r => r.status !== 'cancelled');
  const sum = a => a.reduce((s, r) => s + r.total, 0);
  const days = [];
  for (let i = 13; i >= 0; i--) { const s = dayStart - i * 86400000; days.push({ t: s + RIYADH, total: sum(live.filter(r => r.created_at >= s && r.created_at < s + 86400000)), n: live.filter(r => r.created_at >= s && r.created_at < s + 86400000).length }); }
  const low = (await env.DB.prepare('SELECT id, stock FROM products WHERE stock IS NOT NULL AND stock <= 3 AND hidden = 0 ORDER BY stock').all()).results;
  const { results: recentRaw } = await env.DB.prepare('SELECT ref, created_at, status, name, total, method, pay_verified FROM orders ORDER BY created_at DESC LIMIT 6').all();
  const { results: monthItems } = await env.DB.prepare("SELECT items FROM orders WHERE status <> 'cancelled' AND created_at >= ?").bind(monthStart).all();
  const top = {};
  for (const r of monthItems) for (const it of parseItems(r.items)) {
    const k = it.name || it.id; if (!k) continue;
    const t = top[k] || (top[k] = { name: k, qty: 0, revenue: 0 });
    t.qty += Number(it.qty) || 0; t.revenue += (Number(it.qty) || 0) * (Number(it.price) || 0);
  }
  const topProducts = Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  return J({ ok: true, today: { total: sum(live.filter(r => r.created_at >= dayStart)), n: live.filter(r => r.created_at >= dayStart).length }, month: { total: sum(live.filter(r => r.created_at >= monthStart)), n: live.filter(r => r.created_at >= monthStart).length },
    paid: sum(live.filter(r => r.pay_verified && r.created_at >= monthStart)), counts: Object.fromEntries(cnt.map(r => [r.status, r.n])), days, low, recent: recentRaw, topProducts });
}

async function ordersList(request, env) {
  const u = new URL(request.url), st = u.searchParams.get('status'), q = clean(u.searchParams.get('q') || '', 60);
  const where = [], binds = [];
  if (st && STATUSES.includes(st)) { where.push('status = ?'); binds.push(st); }
  if (q) { where.push('(ref LIKE ? OR name LIKE ? OR phone LIKE ?)'); const l = '%' + q.replace(/[%_]/g, '') + '%'; binds.push(l, l, l); }
  const sql = 'SELECT ref, created_at, status, name, phone, city, address, notes, items, subtotal, discount, free_shipping, total, coupon, coupon_pct, method, pay_id, pay_status, pay_verified, pay_info FROM orders' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return J({ ok: true, orders: results.map(r => ({ ...r, items: parseItems(r.items) })) });
}

async function orderUpdate(request, env, ref, action) {
  ref = clean(ref, 32);
  const o = await env.DB.prepare('SELECT ref, status, total, items FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  const b = (await readJson(request, 1000)) || {};
  if (action === 'verify') {
    const id = String(b.id || '').trim();
    if (!id) return J({ ok: false, error: 'invalid' }, 400);
    const full = await env.DB.prepare('SELECT ref, total FROM orders WHERE ref = ?').bind(ref).first();
    await env.DB.prepare("UPDATE orders SET method = 'card' WHERE ref = ?").bind(ref).run();
    return J(await verifyPayment(env, full, id));
  }
  if (!STATUSES.includes(b.status)) return J({ ok: false, error: 'invalid' }, 400);
  if (o.status === 'cancelled' && b.status !== 'cancelled') return J({ ok: false, error: 'cancelled' }, 409);
  if (b.status === 'cancelled' && o.status !== 'cancelled') {
    for (const it of parseItems(o.items)) await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(Number(it.qty) || 0, String(it.id)).run();
  }
  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE ref = ?').bind(b.status, Date.now(), ref).run();
  return J({ ok: true });
}

async function exportCsv(env) {
  const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5000').all();
  const esc = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const head = ['ref', 'date', 'status', 'name', 'phone', 'city', 'address', 'items', 'subtotal', 'discount', 'total', 'coupon', 'method', 'pay_status', 'pay_verified'];
  const rows = results.map(r => [r.ref, new Date(r.created_at + RIYADH).toISOString().replace('T', ' ').slice(0, 16), r.status, r.name, r.phone, r.city, r.address, parseItems(r.items).map(i => `${i.name}${i.v ? ' (' + i.v + ')' : ''} x${i.qty}`).join(' | '), r.subtotal, r.discount, r.total, r.coupon, r.method, r.pay_status, r.pay_verified].map(esc).join(','));
  return new Response('﻿' + head.join(',') + '\n' + rows.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="luce-orders.csv"', 'cache-control': 'no-store' } });
}

async function productsList(env) {
  const cat = await effectiveCatalog(env);
  return J({ ok: true, products: Object.values(cat).map(p => ({ id: p.id, name: p.name, cat: p.cat, brand: p.brand, img: p.img, price: p.price, old: p.old, stock: p.stock, hidden: p.hidden, custom: p.custom, sub: p.extra && p.extra.sub || '', short: p.extra && p.extra.short || '', desc: p.extra && p.extra.desc || '' })) });
}

async function productUpdate(request, env, id) {
  id = clean(id, 40);
  const cat = await effectiveCatalog(env);
  if (!cat[id]) return J({ ok: false, error: 'not_found' }, 404);
  const b = await readJson(request, 3000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const price = int(b.price, 1, 100000), old = b.old === '' || b.old == null ? 0 : int(b.old, 0, 100000);
  const stock = b.stock === '' || b.stock == null ? null : int(b.stock, 0, 100000);
  if (price == null || old == null || (b.stock !== '' && b.stock != null && stock == null)) return J({ ok: false, error: 'invalid' }, 400);
  const hidden = b.hidden ? 1 : 0;
  await env.DB.prepare('INSERT INTO products (id, price, old_price, stock, hidden) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET price = excluded.price, old_price = excluded.old_price, stock = excluded.stock, hidden = excluded.hidden').bind(id, price, old, stock, hidden).run();
  if (cat[id].custom) {
    const e = { ...cat[id].extra };
    for (const k of ['name', 'brand', 'sub']) if (typeof b[k] === 'string') e[k] = clean(b[k], 100);
    for (const k of ['short', 'desc']) if (typeof b[k] === 'string') e[k] = clean(b[k], k === 'desc' ? 2000 : 500, true);
    if (typeof b.img === 'string' && imgOk(b.img)) e.img = b.img;
    if (b.cat && CATS.includes(b.cat)) e.cat = b.cat;
    await env.DB.prepare('UPDATE products SET extra = ? WHERE id = ?').bind(JSON.stringify(e), id).run();
  }
  return J({ ok: true });
}
const imgOk = s => /^[a-z0-9_-]{1,60}$/i.test(s) || /^https:\/\/[^\s"'<>\\]{4,280}$/i.test(s);

async function productCreate(request, env) {
  const b = await readJson(request, 6000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const name = clean(b.name, 100), price = int(b.price, 1, 100000), old = b.old === '' || b.old == null ? 0 : int(b.old, 0, 100000);
  const stock = b.stock === '' || b.stock == null ? null : int(b.stock, 0, 100000);
  if (name.length < 2 || price == null || old == null || !CATS.includes(b.cat) || !imgOk(String(b.img || ''))) return J({ ok: false, error: 'invalid' }, 400);
  const e = { name, cat: b.cat, brand: clean(b.brand || 'لوتشي', 60), sub: clean(b.sub || '', 120), short: clean(b.short || '', 500, true), desc: clean(b.desc || '', 2000, true), img: String(b.img) };
  const id = 'x-' + [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO products (id, price, old_price, stock, hidden, extra) VALUES (?,?,?,?,0,?)').bind(id, price, old, stock, JSON.stringify(e)).run();
  return J({ ok: true, id });
}

async function productDelete(env, id) {
  id = clean(id, 40);
  const r = await env.DB.prepare('DELETE FROM products WHERE id = ? AND extra IS NOT NULL').bind(id).run();
  return r.meta && r.meta.changes ? J({ ok: true }) : J({ ok: false, error: 'not_custom' }, 400);
}

// رفع صورة منتج إلى R2 وإرجاع رابط دائم لها (يُخدَّم عبر /img/:key).
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
async function uploadImage(request, env) {
  if (!env.IMAGES) return J({ ok: false, error: 'no_bucket' }, 503);
  let form;
  try { form = await request.formData(); } catch (e) { return J({ ok: false, error: 'invalid' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return J({ ok: false, error: 'invalid' }, 400);
  const ext = IMG_TYPES[file.type];
  if (!ext) return J({ ok: false, error: 'type' }, 400);
  if (file.size > 5 * 1024 * 1024) return J({ ok: false, error: 'size' }, 400);
  if (file.size < 10) return J({ ok: false, error: 'empty' }, 400);
  const key = Date.now().toString(36) + '-' + [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('') + '.' + ext;
  await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return J({ ok: true, url: new URL(request.url).origin + '/uploads/' + key });
}

async function couponsList(env) {
  const { results } = await env.DB.prepare('SELECT code, pct, active, expires, used, note FROM coupons ORDER BY code').all();
  return J({ ok: true, coupons: results });
}
async function couponSave(request, env) {
  const b = await readJson(request, 1000);
  const code = String(b && b.code || '').trim().toUpperCase();
  const pct = int(b && b.pct, 1, 90);
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || pct == null) return J({ ok: false, error: 'invalid' }, 400);
  let exp = null;
  if (b.expires) { const t = Date.parse(b.expires + 'T23:59:59+03:00'); if (!Number.isFinite(t)) return J({ ok: false, error: 'invalid' }, 400); exp = t; }
  await env.DB.prepare('INSERT INTO coupons (code, pct, active, expires, note) VALUES (?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET pct = excluded.pct, active = excluded.active, expires = excluded.expires, note = excluded.note').bind(code, pct, b.active === false ? 0 : 1, exp, clean(b.note || '', 80)).run();
  return J({ ok: true });
}
async function couponDelete(env, code) {
  await env.DB.prepare('DELETE FROM coupons WHERE code = ?').bind(clean(code, 40).toUpperCase()).run();
  return J({ ok: true });
}
async function settingsSave(request, env) {
  const b = await readJson(request, 500);
  const n = int(b && b.free_from, 0, 100000);
  if (n == null) return J({ ok: false, error: 'invalid' }, 400);
  await setSetting(env, 'free_from', n);
  return J({ ok: true });
}
