// واجهة برمجية للوحة التحكم (الطلبات، المنتجات، العملاء، الكوبونات، الإعدادات، النسخ الاحتياطي).
// يُستدعى من الموجّه بعد التحقق من الجلسة وترويسة CSRF. يرجع null للمسارات التي لا يعالجها.
import { J, clean, dig, readJson } from './util.js';
import { effectiveCatalog, getSetting, setSetting, getFreeFrom, takeVariant, giveVariant } from './db.js';
import { aramexCreate, carriersOn } from './carriers.js';
import { lookupOn } from './address.js';

const STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
const CATS = ['beans', 'cups', 'gear', 'filters', 'matcha'];
const RIYADH = 3 * 3600000;
const DAY = 86400000;

const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const parseItems = s => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const parseObj = s => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const imgOk = s => /^[a-z0-9_-]{1,60}$/i.test(s) || /^https:\/\/[^\s"'<>\\]{4,280}$/i.test(s);
const normPhone = p => { let d = dig(String(p || '')).replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('966')) d = d.slice(3); if (d.startsWith('0')) d = d.slice(1); return d; };
export const CARRIERS = {
  aramex: { name: 'Aramex', url: 'https://www.aramex.com/track/results?ShipmentNumber=' },
  smsa: { name: 'SMSA', url: 'https://www.smsaexpress.com/track/?tracknumbers=' },
  jt: { name: 'J&T Express', url: 'https://www.jtexpress.sa/trackingExpress?billcode=' },
  naqel: { name: 'Naqel', url: 'https://www.naqelexpress.com/en/tracking?waybill=' },
  spl: { name: 'البريد السعودي (SPL)', url: 'https://splonline.com.sa/en/track-and-trace/?trackingNumber=' },
  zajil: { name: 'زاجل', url: '' },
  other: { name: 'أخرى / مندوب', url: '' }
};
const trackUrl = (c, n) => (CARRIERS[c] && CARRIERS[c].url && n) ? CARRIERS[c].url + encodeURIComponent(n) : '';
const trackOk = n => /^[A-Za-z0-9][A-Za-z0-9-]{4,39}$/.test(n);
const dayStartOf = t => Math.floor((t + RIYADH) / DAY) * DAY - RIYADH;

/* ============ المخطط (يُنفَّذ كسولًا وبشكل آمن لإعادة التشغيل) ============ */
let schemaReady = null;
async function addCol(env, table, col, type) {
  const { results } = await env.DB.prepare('SELECT name FROM pragma_table_info(?)').bind(table).all();
  if (results.some(r => r.name === col)) return;
  try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
}
export function ensureAdminSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.batch([
        'CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, text TEXT)',
        'CREATE INDEX IF NOT EXISTS order_events_ref ON order_events (ref, ts)',
        'CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at)',
        'CREATE INDEX IF NOT EXISTS orders_phone ON orders (phone)',
        'CREATE INDEX IF NOT EXISTS orders_method_paid ON orders (method, pay_verified)'
      ].map(s => env.DB.prepare(s)));
      for (const c of ['tracking_no', 'carrier', 'addr_short', 'addr_building', 'addr_street', 'addr_district', 'addr_post', 'addr_extra']) await addCol(env, 'orders', c, 'TEXT');
      await addCol(env, 'orders', 'shipped_at', 'INTEGER');
      await addCol(env, 'orders', 'admin_notes', 'TEXT');
      await addCol(env, 'products', 'meta', 'TEXT');
      await addCol(env, 'coupons', 'max_uses', 'INTEGER');
    })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

const event = (env, ref, type, text) => env.DB.prepare('INSERT INTO order_events (ref, ts, type, text) VALUES (?,?,?,?)').bind(ref, Date.now(), type, String(text || '').slice(0, 500)).run();

/* ============ الإعدادات ============ */
const SETTINGS = {
  store_name: v => clean(v, 60),
  whatsapp_display: v => { const raw = String(v || '').trim(), d = dig(raw).replace(/\D/g, ''); return raw === '' ? '' : (/^\d{8,15}$/.test(d) ? d : null); },
  store_email: v => { const s = clean(v, 100); return s === '' || /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) ? s : null; },
  store_address: v => clean(v, 200),
  announcement: v => clean(v, 160),
  free_from: v => { const n = int(v, 0, 100000); return n == null ? null : String(n); },
  ship_fee: v => { const n = int(v === '' ? 0 : v, 0, 1000); return n == null ? null : String(n); },
  default_carrier: v => (CARRIERS[v] ? v : (v === '' ? '' : null)),
  carriers_enabled: v => { const a = String(v || '').split(',').filter(x => CARRIERS[x]); return a.join(','); },
  pay_card_on: v => (v === '0' || v === 0 || v === false) ? '0' : '1',
  pay_wa_on: v => (v === '0' || v === 0 || v === false) ? '0' : '1'
};
const PUBLIC_KEYS = ['store_name', 'whatsapp_display', 'announcement'];

async function allSettings(env) {
  const { results } = await env.DB.prepare('SELECT k, v FROM settings WHERE k IN (' + Object.keys(SETTINGS).map(() => '?').join(',') + ')').bind(...Object.keys(SETTINGS)).all();
  const m = Object.fromEntries(results.map(r => [r.k, r.v]));
  return {
    store_name: m.store_name || 'لوتشي', whatsapp_display: m.whatsapp_display || '', store_email: m.store_email || '', store_address: m.store_address || '',
    announcement: m.announcement || '', free_from: String(await getFreeFrom(env)), ship_fee: m.ship_fee || '0', default_carrier: m.default_carrier || '', carriers_enabled: m.carriers_enabled == null ? Object.keys(CARRIERS).join(',') : m.carriers_enabled, pay_card_on: m.pay_card_on === '0' ? '0' : '1', pay_wa_on: m.pay_wa_on === '0' ? '0' : '1'
  };
}

// عام: مفاتيح آمنة فقط تقرؤها واجهة المتجر.
export async function publicStoreSettings(env) {
  const s = await allSettings(env);
  const o = { ok: true, free_from: Number(s.free_from) };
  for (const k of PUBLIC_KEYS) o[k] = s[k];
  return J(o, 200, { 'cache-control': 'public, max-age=60' });
}

async function settingsSave(request, env) {
  const b = await readJson(request, 4000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const out = {};
  for (const [k, fn] of Object.entries(SETTINGS)) {
    if (!(k in b)) continue;
    const v = fn(b[k]);
    if (v == null) return J({ ok: false, error: 'invalid', field: k }, 400);
    out[k] = v;
  }
  for (const [k, v] of Object.entries(out)) await setSetting(env, k, v);
  return J({ ok: true });
}

/* ============ الطلبات ============ */
const ORDER_COLS = 'ref, created_at, updated_at, status, name, phone, city, address, notes, items, subtotal, discount, free_shipping, total, coupon, coupon_pct, method, pay_id, pay_status, pay_verified, pay_info, lang, tracking_no, carrier, shipped_at, addr_short, addr_building, addr_street, addr_district, addr_post, addr_extra, admin_notes';

const addrMissing = r => !(r.addr_short || (r.addr_building && r.addr_post));

async function ordersList(request, env) {
  const u = new URL(request.url), sp = u.searchParams;
  const where = [], binds = [];
  const st = sp.get('status');
  if (st && STATUSES.includes(st)) { where.push('status = ?'); binds.push(st); }
  const mt = sp.get('method');
  if (mt === 'card' || mt === 'wa') { where.push('method = ?'); binds.push(mt); }
  const paid = sp.get('paid');
  if (paid === '1') where.push('pay_verified = 1'); else if (paid === '0') where.push('pay_verified = 0');
  const from = Date.parse((sp.get('from') || '') + 'T00:00:00+03:00'), to = Date.parse((sp.get('to') || '') + 'T23:59:59+03:00');
  if (Number.isFinite(from)) { where.push('created_at >= ?'); binds.push(from); }
  if (Number.isFinite(to)) { where.push('created_at <= ?'); binds.push(to); }
  const q = clean(sp.get('q') || '', 60);
  if (q) { const l = '%' + q.replace(/[%_\\]/g, '') + '%'; where.push('(ref LIKE ? OR name LIKE ? OR phone LIKE ? OR city LIKE ?)'); binds.push(l, l, l, l); }
  const sortCol = { created: 'created_at', total: 'total', status: 'status', name: 'name' }[sp.get('sort')] || 'created_at';
  const dir = sp.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const limit = int(sp.get('limit'), 1, 200) || 50, offset = int(sp.get('offset'), 0, 1000000) || 0;
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const tot = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status <> \'cancelled\' THEN total END),0) AS s FROM orders' + w).bind(...binds).first();
  const { results } = await env.DB.prepare('SELECT ' + ORDER_COLS + ' FROM orders' + w + ` ORDER BY ${sortCol} ${dir}, created_at DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all();
  const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
  return J({ ok: true, total: tot.n, sum: tot.s, counts: Object.fromEntries(cnt.map(r => [r.status, r.n])), orders: results.map(r => ({ ...r, items: parseItems(r.items), addr_missing: addrMissing(r) })) });
}

async function orderDetail(env, ref) {
  const o = await env.DB.prepare('SELECT ' + ORDER_COLS + ' FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  const { results: ev } = await env.DB.prepare('SELECT ts, type, text FROM order_events WHERE ref = ? ORDER BY ts, id').bind(ref).all();
  const events = [{ ts: o.created_at, type: 'created', text: o.method === 'card' ? 'تم إنشاء الطلب (دفع إلكتروني)' : 'تم إنشاء الطلب (واتساب)' }, ...ev];
  const ph = normPhone(o.phone);
  const { results: same } = await env.DB.prepare('SELECT ref, created_at, status, total, phone FROM orders WHERE ref <> ? AND created_at > ? ORDER BY created_at DESC LIMIT 200').bind(ref, o.created_at - DAY).all();
  const dup = same.filter(r => normPhone(r.phone) === ph && Math.abs(r.created_at - o.created_at) < DAY).map(r => ({ ref: r.ref, created_at: r.created_at, status: r.status, total: r.total }));
  const { results: prior } = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders WHERE phone = ? AND ref <> ? AND status <> \'cancelled\'').bind(o.phone, ref).all();
  return J({ ok: true, order: { ...o, items: parseItems(o.items), addr_missing: addrMissing(o), track_url: trackUrl(o.carrier, o.tracking_no) }, events, duplicates: dup, customer: { orders: prior[0].n, spent: prior[0].s } });
}

// إنشاء شحنة عبر API الناقل (أرامكس) وحفظ رقم التتبع على الطلب. لا يعمل إلا لو مفاتيح الناقل موجودة.
async function orderShipment(request, env, ref) {
  const x = await readJson(request, 400) || {};
  if (x.carrier !== 'aramex') return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref, status, name, phone, city, address, total, items, tracking_no, addr_post, pay_verified FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  if (o.status === 'cancelled') return J({ ok: false, error: 'cancelled' }, 409);
  if (o.tracking_no && !x.force) return J({ ok: false, error: 'has_tracking' }, 409);
  const cod = !!x.cod && !o.pay_verified;
  const r = await aramexCreate(env, o, parseItems(o.items), { cod });
  if (!r.ok) return J(r, r.error === 'carrier_off' ? 503 : 502);
  await env.DB.prepare('UPDATE orders SET carrier = ?, tracking_no = ?, updated_at = ? WHERE ref = ?').bind('aramex', r.tracking, Date.now(), ref).run();
  await event(env, ref, 'ship', 'تم إنشاء شحنة أرامكس رقم ' + r.tracking + (cod ? ' (دفع عند الاستلام)' : ''));
  return J({ ok: true, tracking: r.tracking, label: r.label });
}

// تغيير الحالة: الإلغاء يُعيد المخزون مرة واحدة فقط (حارس ذرّي على الحالة) ويخفض عدّاد الكوبون.
async function applyStatus(env, ref, status) {
  if (!STATUSES.includes(status)) return { ok: false, error: 'invalid' };
  const o = await env.DB.prepare('SELECT ref, status, items, coupon FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return { ok: false, error: 'not_found' };
  if (o.status === status) return { ok: true, same: true };
  if (o.status === 'cancelled') return { ok: false, error: 'cancelled' };
  const now = Date.now();
  const r = await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ?, shipped_at = CASE WHEN ? = \'shipped\' THEN ? ELSE shipped_at END WHERE ref = ? AND status = ?').bind(status, now, status, now, ref, o.status).run();
  if (!r.meta || r.meta.changes !== 1) return { ok: false, error: 'conflict' };
  if (status === 'cancelled') {
    for (const it of parseItems(o.items)) { await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(Number(it.qty) || 0, String(it.id)).run(); if (it.v) await giveVariant(env, String(it.id), String(it.v), Number(it.qty) || 0); }
    if (o.coupon) await env.DB.prepare('UPDATE coupons SET used = MAX(used - 1, 0) WHERE code = ?').bind(o.coupon).run();
  }
  const LBL = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };
  await event(env, ref, 'status', `تغيّرت الحالة من «${LBL[o.status] || o.status}» إلى «${LBL[status]}»` + (status === 'cancelled' ? ' (أُعيد المخزون)' : ''));
  return { ok: true };
}

async function orderPatch(request, env, ref) {
  const b = await readJson(request, 4000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref, status, name, phone, city, address, notes, tracking_no, carrier, addr_short, addr_building, addr_street, addr_district, addr_post, addr_extra, admin_notes FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  const n = {};
  if ('name' in b) { n.name = clean(b.name, 80); if (n.name.length < 2) return J({ ok: false, error: 'invalid', field: 'name' }, 400); }
  if ('phone' in b) { n.phone = dig(clean(b.phone, 20)); if (!/^\+?\d{9,15}$/.test(n.phone.replace(/[\s-]/g, ''))) return J({ ok: false, error: 'invalid', field: 'phone' }, 400); }
  if ('city' in b) { n.city = clean(b.city, 60); if (n.city.length < 2) return J({ ok: false, error: 'invalid', field: 'city' }, 400); }
  if ('address' in b) { n.address = clean(b.address, 200); if (n.address.length < 4) return J({ ok: false, error: 'invalid', field: 'address' }, 400); }
  if ('notes' in b) n.notes = clean(b.notes, 500, true);
  if ('addr_short' in b) { n.addr_short = dig(clean(b.addr_short, 20)).toUpperCase().replace(/[\s-]/g, ''); if (n.addr_short && !/^[A-Z]{4}\d{4}$/.test(n.addr_short)) return J({ ok: false, error: 'invalid', field: 'addr_short' }, 400); }
  for (const f of ['addr_building', 'addr_post', 'addr_extra']) if (f in b) { n[f] = dig(clean(b[f], 8)).replace(/\s/g, ''); if (n[f] && !(f === 'addr_post' ? /^\d{5}$/ : /^\d{4}$/).test(n[f])) return J({ ok: false, error: 'invalid', field: f }, 400); }
  for (const f of ['addr_street', 'addr_district']) if (f in b) n[f] = clean(b[f], 80);
  if ('tracking_no' in b) { n.tracking_no = clean(b.tracking_no, 40).replace(/\s+/g, ''); if (n.tracking_no && !trackOk(n.tracking_no)) return J({ ok: false, error: 'invalid', field: 'tracking_no' }, 400); }
  if ('carrier' in b) { n.carrier = clean(b.carrier, 20); if (n.carrier && !CARRIERS[n.carrier]) return J({ ok: false, error: 'invalid', field: 'carrier' }, 400); }
  if ('admin_notes' in b) n.admin_notes = clean(b.admin_notes, 1000, true);
  const keys = Object.keys(n).filter(k => (o[k] || '') !== n[k]);
  if (!keys.length) return J({ ok: true, same: true });
  await env.DB.prepare('UPDATE orders SET ' + keys.map(k => k + ' = ?').join(', ') + ', updated_at = ? WHERE ref = ?').bind(...keys.map(k => n[k]), Date.now(), ref).run();
  const FL = { name: 'الاسم', phone: 'الجوال', city: 'المدينة', address: 'العنوان', notes: 'ملاحظات العميل', tracking_no: 'رقم التتبع', carrier: 'شركة الشحن', addr_short: 'العنوان المختصر', addr_building: 'رقم المبنى', addr_street: 'الشارع', addr_district: 'الحي', addr_post: 'الرمز البريدي', addr_extra: 'الرقم الإضافي', admin_notes: 'الملاحظات الداخلية' };
  await event(env, ref, keys.includes('tracking_no') || keys.includes('carrier') ? 'tracking' : 'edit', 'تعديل: ' + keys.map(k => FL[k]).join('، ') + (keys.includes('tracking_no') && n.tracking_no ? ` (تتبع: ${n.tracking_no})` : ''));
  return J({ ok: true });
}

// تعديل بنود الطلب: نعيد حساب المجموع من الخادم وفق الكتالوج ونعدّل المخزون بالفرق فقط.
async function orderItems(request, env, ref) {
  const b = await readJson(request, 8000);
  if (!b || !Array.isArray(b.items)) return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref, status, items, coupon_pct, method, pay_verified, total FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  if (o.status === 'cancelled') return J({ ok: false, error: 'cancelled' }, 409);
  if (o.pay_verified) return J({ ok: false, error: 'paid_locked' }, 409);
  if (b.items.length < 1 || b.items.length > 30) return J({ ok: false, error: 'invalid' }, 400);
  const cat = await effectiveCatalog(env), old = parseItems(o.items);
  const items = [], want = {}, had = {}, wantV = {}, hadV = {};
  const vk = (id, v) => id + '\u0001' + v;
  for (const it of old) { had[it.id] = (had[it.id] || 0) + (Number(it.qty) || 0); if (it.v) hadV[vk(it.id, it.v)] = (hadV[vk(it.id, it.v)] || 0) + (Number(it.qty) || 0); }
  for (const it of b.items) {
    const id = String(it && it.id || ''), qty = int(it && it.qty, 1, 50), v = String(it && it.v || '');
    if (!qty || !id) return J({ ok: false, error: 'invalid' }, 400);
    const prev = old.find(x => x.id === id && String(x.v || '') === v);
    const p = Object.prototype.hasOwnProperty.call(cat, id) ? cat[id] : null;
    if (!p && !prev) return J({ ok: false, error: 'invalid' }, 400);
    if (!prev && p.variants && !p.variants.includes(v)) return J({ ok: false, error: 'invalid' }, 400);
    let price = prev ? Number(prev.price) : p.price;
    if (it.price != null && it.price !== '') { const pr = int(it.price, 0, 100000); if (pr == null) return J({ ok: false, error: 'invalid' }, 400); price = pr; }
    items.push({ id, name: prev ? prev.name : p.name, v, qty, price });
    want[id] = (want[id] || 0) + qty;
    if (v) wantV[vk(id, v)] = (wantV[vk(id, v)] || 0) + qty;
  }
  // مخزون: نحجز الزيادة ذرّيًا، ونُرجع النقص.
  const taken = [], takenV = [];
  const undoAll = async () => {
    for (const [tid, tq] of taken) await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(tq, tid).run();
    for (const [pid, pv, tq] of takenV) await (tq > 0 ? giveVariant(env, pid, pv, tq) : takeVariant(env, pid, pv, -tq)); // tq موجب = كنا حجزنا → نرجّع، سالب = كنا رجّعنا → نحجز
  };
  for (const key of new Set([...Object.keys(wantV), ...Object.keys(hadV)])) {
    const [vid, vv] = key.split('\u0001'), delta = (wantV[key] || 0) - (hadV[key] || 0);
    if (!delta) continue;
    if (delta > 0) {
      const r = await takeVariant(env, vid, vv, delta);
      if (r === 'out') { await undoAll(); return J({ ok: false, error: 'stock', id: vid, v: vv }, 409); }
      if (r === 'taken') takenV.push([vid, vv, delta]);
    } else { await giveVariant(env, vid, vv, -delta); takenV.push([vid, vv, delta]); }
  }
  const ids = new Set([...Object.keys(want), ...Object.keys(had)]);
  for (const id of ids) {
    const delta = (want[id] || 0) - (had[id] || 0);
    if (!delta) continue;
    if (delta > 0) {
      const r = await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?').bind(delta, id, delta).run();
      if (r.meta && r.meta.changes === 1) { taken.push([id, delta]); continue; }
      const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ?').bind(id).first();
      if (row && row.stock != null) { await undoAll(); return J({ ok: false, error: 'stock', id }, 409); }
    } else {
      await env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(-delta, id).run();
      taken.push([id, delta]);
    }
  }
  const sub = items.reduce((s, i) => s + i.price * i.qty, 0), pct = o.coupon_pct || 0, d = Math.round(sub * pct / 100), net = sub - d;
  const free = net >= (await getFreeFrom(env)) && sub > 0 ? 1 : 0;
  await env.DB.prepare('UPDATE orders SET items = ?, subtotal = ?, discount = ?, free_shipping = ?, total = ?, updated_at = ? WHERE ref = ? AND status <> \'cancelled\'').bind(JSON.stringify(items), sub, d, free, net, Date.now(), ref).run();
  if (o.method === 'card') { await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind('payurl:' + ref, 'paylink:' + ref).run(); }
  await event(env, ref, 'items', `تعديل البنود: المجموع ${o.total} ← ${net} ر.س` + (o.method === 'card' ? ' (رابط الدفع القديم أُلغي)' : ''));
  return J({ ok: true, total: net });
}

async function orderNote(request, env, ref) {
  const b = await readJson(request, 1200);
  const t = clean(b && b.text, 500, true);
  if (!t) return J({ ok: false, error: 'invalid' }, 400);
  const o = await env.DB.prepare('SELECT ref FROM orders WHERE ref = ?').bind(ref).first();
  if (!o) return J({ ok: false, error: 'not_found' }, 404);
  await event(env, ref, 'note', t);
  return J({ ok: true });
}

async function ordersBulk(request, env) {
  const b = await readJson(request, 6000);
  if (!b || !Array.isArray(b.refs) || !STATUSES.includes(b.status) || b.refs.length < 1 || b.refs.length > 100) return J({ ok: false, error: 'invalid' }, 400);
  let ok = 0, skipped = 0;
  for (const r of b.refs) { const x = await applyStatus(env, clean(r, 32), b.status); if (x.ok && !x.same) ok++; else skipped++; }
  return J({ ok: true, updated: ok, skipped });
}

/* ============ لوحة المعلومات ============ */
async function dashboard(request, env) {
  const range = new URL(request.url).searchParams.get('range') === '30' ? 30 : 14;
  const now = Date.now(), today = dayStartOf(now);
  const d = new Date(now + RIYADH), monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - RIYADH;
  const prevMonthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) - RIYADH;
  const since = Math.min(today - (range - 1) * DAY, prevMonthStart);
  const { results } = await env.DB.prepare('SELECT created_at, total, status, pay_verified, method FROM orders WHERE created_at >= ? ORDER BY created_at LIMIT 20000').bind(since).all();
  const live = results.filter(r => r.status !== 'cancelled');
  const agg = (a) => ({ total: a.reduce((s, r) => s + r.total, 0), n: a.length });
  const inRange = (a, f, t) => a.filter(r => r.created_at >= f && r.created_at < t);
  const monthRows = live.filter(r => r.created_at >= monthStart);
  const days = [];
  for (let i = range - 1; i >= 0; i--) { const s = today - i * DAY; const x = agg(inRange(live, s, s + DAY)); days.push({ t: s + RIYADH, total: x.total, n: x.n }); }
  const catalog = await effectiveCatalog(env);
  const { results: cnt } = await env.DB.prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders GROUP BY status').all();
  const { results: recentRaw } = await env.DB.prepare('SELECT ref, created_at, status, name, total, method, pay_verified FROM orders ORDER BY created_at DESC LIMIT 8').all();
  const { results: monthItems } = await env.DB.prepare('SELECT items FROM orders WHERE status <> \'cancelled\' AND created_at >= ? LIMIT 5000').bind(monthStart).all();
  const top = {};
  for (const r of monthItems) for (const it of parseItems(r.items)) {
    const k = it.id || it.name; if (!k) continue;
    const t = top[k] || (top[k] = { id: it.id, name: it.name || k, qty: 0, revenue: 0 });
    t.qty += Number(it.qty) || 0; t.revenue += (Number(it.qty) || 0) * (Number(it.price) || 0);
  }
  const topProducts = Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const low = Object.values(catalog).filter(p => p.stock != null && p.stock <= 3 && !p.hidden).sort((a, b) => a.stock - b.stock).map(p => ({ id: p.id, name: p.name, stock: p.stock, img: p.img }));
  const cust = await env.DB.prepare('SELECT COUNT(DISTINCT phone) AS n FROM orders').first();
  const week = agg(inRange(live, today - 6 * DAY, today + DAY)), prevMonth = agg(inRange(live, prevMonthStart, monthStart));
  const card = monthRows.filter(r => r.method === 'card');
  return J({
    ok: true, range,
    today: agg(inRange(live, today, today + DAY)), yesterday: agg(inRange(live, today - DAY, today)), week, month: agg(monthRows), prevMonth,
    aov: monthRows.length ? Math.round(monthRows.reduce((s, r) => s + r.total, 0) / monthRows.length) : 0,
    paid: monthRows.filter(r => r.pay_verified).reduce((s, r) => s + r.total, 0),
    split: { card: agg(card), cardPaid: agg(card.filter(r => r.pay_verified)), wa: agg(monthRows.filter(r => r.method !== 'card')) },
    counts: Object.fromEntries(cnt.map(r => [r.status, r.n])), pending: (cnt.find(r => r.status === 'new') || {}).n || 0,
    days, low, recent: recentRaw, topProducts, customers: cust ? cust.n : 0, products: Object.keys(catalog).length
  });
}

/* ============ المنتجات ============ */
async function soldMap(env) {
  const { results } = await env.DB.prepare('SELECT items FROM orders WHERE status <> \'cancelled\' ORDER BY created_at DESC LIMIT 4000').all();
  const m = {};
  for (const r of results) for (const it of parseItems(r.items)) m[it.id] = (m[it.id] || 0) + (Number(it.qty) || 0);
  return m;
}
async function productsFull(env, withSold) {
  const cat = await effectiveCatalog(env);
  const { results } = await env.DB.prepare('SELECT id, meta, rowid FROM products').all();
  const meta = Object.fromEntries(results.map(r => [r.id, parseObj(r.meta)]));
  const sold = withSold ? await soldMap(env) : {};
  return Object.values(cat).map(p => {
    const e = p.extra || {}, m = meta[p.id] || {};
    return {
      id: p.id, name: p.name, en: p.en || '', cat: p.cat, brand: p.brand || '', img: p.ovImgs && p.ovImgs.length ? p.ovImgs[0] : (p.img || ''), imgs: Array.isArray(e.imgs) && e.imgs.length ? e.imgs : (p.ovImgs && p.ovImgs.length ? p.ovImgs : (p.img ? [p.img] : [])), img_override: p.ovImgs && p.ovImgs.length ? 1 : 0, bg: p.bg || '', status: p.status || '',
      price: p.price, old: p.old || 0, stock: p.stock, hidden: p.hidden, custom: p.custom ? 1 : 0, variants: p.variants || null, vstock: p.vs || {},
      sub: e.sub || '', short: e.short || '', desc: e.desc || '', sku: m.sku || '', cost: m.cost == null ? null : m.cost, sold: sold[p.id] || 0
    };
  });
}

function readProduct(b, isCustom) {
  const o = {};
  const price = int(b.price, 1, 100000);
  const old = b.old === '' || b.old == null ? 0 : int(b.old, 0, 100000);
  const stock = b.stock === '' || b.stock == null ? null : int(b.stock, 0, 100000);
  if (price == null) return { error: 'price' };
  if (old == null) return { error: 'old' };
  if (b.stock !== '' && b.stock != null && stock == null) return { error: 'stock' };
  const cost = b.cost === '' || b.cost == null ? null : int(b.cost, 0, 100000);
  if (b.cost !== '' && b.cost != null && cost == null) return { error: 'cost' };
  const sku = clean(b.sku || '', 40);
  if (sku && !/^[A-Za-z0-9_./-]{1,40}$/.test(sku)) return { error: 'sku' };
  const bg = b.bg === '' || b.bg == null ? '' : String(b.bg);
  if (bg && !/^#[0-9a-f]{6}$/i.test(bg)) return { error: 'bg' };
  const status = b.status === 'soon' || b.status === 'soldout' ? b.status : '';
  Object.assign(o, { price, old, stock, cost, sku, bg, status, hidden: b.hidden ? 1 : 0 });
  if (!isCustom && Array.isArray(b.imgs)) o.ovImgs = b.imgs.map(String).filter(imgOk).slice(0, 8); // صور بديلة للمنتج الأساسي (مصفوفة فارغة = رجوع للصور الأصلية)
  if (isCustom) {
    const name = clean(b.name, 100);
    if (name.length < 2) return { error: 'name' };
    if (!CATS.includes(b.cat)) return { error: 'cat' };
    const imgs = Array.isArray(b.imgs) ? b.imgs.map(String).filter(imgOk).slice(0, 8) : [];
    if (!imgs.length) return { error: 'img' };
    o.extra = { name, en: clean(b.en || '', 100), cat: b.cat, brand: clean(b.brand || 'لوتشي', 60), sub: clean(b.sub || '', 120), short: clean(b.short || '', 500, true), desc: clean(b.desc || '', 2000, true), img: imgs[0], imgs };
  }
  return { v: o };
}

async function productCreate(request, env, from) {
  const b = from || await readJson(request, 8000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const r = readProduct(b, true);
  if (r.error) return J({ ok: false, error: 'invalid', field: r.error }, 400);
  const v = r.v, id = 'x-' + [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO products (id, price, old_price, stock, hidden, extra, meta) VALUES (?,?,?,?,?,?,?)').bind(id, v.price, v.old, v.stock, v.hidden, JSON.stringify(v.extra), JSON.stringify({ sku: v.sku, cost: v.cost, bg: v.bg, status: v.status })).run();
  return J({ ok: true, id });
}

async function productUpdate(request, env, id) {
  id = clean(id, 40);
  const cat = await effectiveCatalog(env);
  if (!cat[id]) return J({ ok: false, error: 'not_found' }, 404);
  const b = await readJson(request, 8000);
  if (!b) return J({ ok: false, error: 'invalid' }, 400);
  const custom = !!cat[id].custom;
  const r = readProduct(b, custom);
  if (r.error) return J({ ok: false, error: 'invalid', field: r.error }, 400);
  const v = r.v;
  await env.DB.prepare('INSERT INTO products (id, price, old_price, stock, hidden) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET price = excluded.price, old_price = excluded.old_price, stock = excluded.stock, hidden = excluded.hidden').bind(id, v.price, v.old, v.stock, v.hidden).run();
  const prevRow = await env.DB.prepare('SELECT meta FROM products WHERE id = ?').bind(id).first();
  const meta = { ...parseObj(prevRow && prevRow.meta), sku: v.sku, cost: v.cost, bg: v.bg, status: v.status };
  if (v.ovImgs) { if (v.ovImgs.length) meta.imgs = v.ovImgs; else delete meta.imgs; }
  await env.DB.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), id).run();
  if (custom) await env.DB.prepare('UPDATE products SET extra = ? WHERE id = ?').bind(JSON.stringify(v.extra), id).run();
  // مخزون كل خيار (لون / مقاس): نتحقق من الكل قبل الكتابة
  const pv = cat[id].variants;
  if (pv && b.vstock && typeof b.vstock === 'object') {
    const rows = [];
    for (const [name, x] of Object.entries(b.vstock)) {
      if (!pv.includes(name) || !x || typeof x !== 'object') return J({ ok: false, error: 'invalid', field: 'vstock' }, 400);
      const st = x.stock === '' || x.stock == null ? null : int(x.stock, 0, 100000);
      if (x.stock !== '' && x.stock != null && st == null) return J({ ok: false, error: 'invalid', field: 'vstock' }, 400);
      rows.push([name, st, x.status === 'soon' || x.status === 'soldout' ? x.status : '']);
    }
    for (const [name, st, status] of rows) {
      if (st == null && !status) await env.DB.prepare('DELETE FROM variant_stock WHERE pid = ? AND v = ?').bind(id, name).run();
      else await env.DB.prepare('INSERT INTO variant_stock (pid, v, stock, status) VALUES (?,?,?,?) ON CONFLICT(pid, v) DO UPDATE SET stock = excluded.stock, status = excluded.status').bind(id, name, st, status).run();
    }
  }
  return J({ ok: true });
}

async function productDuplicate(env, id) {
  const all = await productsFull(env, false);
  const p = all.find(x => x.id === id);
  if (!p) return J({ ok: false, error: 'not_found' }, 404);
  return productCreate(null, env, { name: (p.name + ' (نسخة)').slice(0, 100), en: p.en, cat: p.cat, brand: p.brand, sub: p.sub, short: p.short, desc: p.desc, imgs: p.imgs, price: p.price, old: p.old, stock: p.stock, hidden: 1, sku: '', cost: p.cost });
}

async function productDelete(env, id) {
  id = clean(id, 40);
  const r = await env.DB.prepare('DELETE FROM products WHERE id = ? AND extra IS NOT NULL').bind(id).run();
  return r.meta && r.meta.changes ? J({ ok: true }) : J({ ok: false, error: 'not_custom' }, 400);
}

async function productsBulk(request, env) {
  const b = await readJson(request, 6000);
  if (!b || !Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > 200 || !b.patch || typeof b.patch !== 'object') return J({ ok: false, error: 'invalid' }, 400);
  const cat = await effectiveCatalog(env), p = b.patch;
  let n = 0;
  for (const raw of b.ids) {
    const id = clean(raw, 40), c = cat[id];
    if (!c) continue;
    await env.DB.prepare('INSERT OR IGNORE INTO products (id, price, old_price, stock, hidden) VALUES (?,?,?,?,?)').bind(id, c.price, c.old || 0, c.stock, c.hidden ? 1 : 0).run();
    if ('hidden' in p) await env.DB.prepare('UPDATE products SET hidden = ? WHERE id = ?').bind(p.hidden ? 1 : 0, id).run();
    if ('status' in p) { const row = await env.DB.prepare('SELECT meta FROM products WHERE id = ?').bind(id).first(); const m = parseObj(row && row.meta); m.status = p.status === 'soon' || p.status === 'soldout' ? p.status : ''; await env.DB.prepare('UPDATE products SET meta = ? WHERE id = ?').bind(JSON.stringify(m), id).run(); }
    if ('stock' in p) { const s = p.stock === '' || p.stock == null ? null : int(p.stock, 0, 100000); if (p.stock !== '' && p.stock != null && s == null) return J({ ok: false, error: 'invalid' }, 400); await env.DB.prepare('UPDATE products SET stock = ? WHERE id = ?').bind(s, id).run(); }
    if ('price' in p) { const x = int(p.price, 1, 100000); if (x == null) return J({ ok: false, error: 'invalid' }, 400); await env.DB.prepare('UPDATE products SET price = ? WHERE id = ?').bind(x, id).run(); }
    if ('pricePct' in p) { const pc = Number(p.pricePct); if (!Number.isFinite(pc) || pc < -90 || pc > 300) return J({ ok: false, error: 'invalid' }, 400); const x = Math.max(1, Math.min(100000, Math.round(c.price * (1 + pc / 100)))); await env.DB.prepare('UPDATE products SET price = ? WHERE id = ?').bind(x, id).run(); }
    n++;
  }
  return J({ ok: true, updated: n });
}

/* ============ العملاء ============ */
async function customersAgg(env) {
  const { results } = await env.DB.prepare('SELECT phone, name, city, total, status, created_at, pay_verified FROM orders ORDER BY created_at DESC LIMIT 20000').all();
  const m = new Map();
  for (const r of results) {
    const k = normPhone(r.phone) || r.phone;
    let c = m.get(k);
    if (!c) { c = { key: k, phone: r.phone, name: r.name, city: r.city, orders: 0, spent: 0, cancelled: 0, last: r.created_at, first: r.created_at }; m.set(k, c); }
    c.first = Math.min(c.first, r.created_at);
    if (r.status === 'cancelled') c.cancelled++; else { c.orders++; c.spent += r.total; }
  }
  return [...m.values()];
}
async function customersList(request, env) {
  const sp = new URL(request.url).searchParams, q = clean(sp.get('q') || '', 60).toLowerCase();
  let list = await customersAgg(env);
  if (q) list = list.filter(c => (c.name || '').toLowerCase().includes(q) || String(c.phone).includes(q) || (c.city || '').toLowerCase().includes(q));
  const sort = sp.get('sort');
  list.sort(sort === 'spent' ? (a, b) => b.spent - a.spent : sort === 'orders' ? (a, b) => b.orders - a.orders : (a, b) => b.last - a.last);
  if (sp.get('format') === 'csv') {
    const esc = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = list.map(c => [c.name, c.phone, c.city, c.orders, c.spent, new Date(c.last + RIYADH).toISOString().slice(0, 10)].map(esc).join(','));
    return new Response('﻿name,phone,city,orders,spent,last_order\n' + rows.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="luce-customers.csv"', 'cache-control': 'no-store' } });
  }
  return J({ ok: true, total: list.length, customers: list.slice(0, 500) });
}
async function customerDetail(request, env) {
  const key = normPhone(new URL(request.url).searchParams.get('phone') || '');
  if (!key) return J({ ok: false, error: 'invalid' }, 400);
  const { results } = await env.DB.prepare('SELECT ref, created_at, status, name, phone, city, address, total, method, pay_verified FROM orders WHERE phone LIKE ? ORDER BY created_at DESC LIMIT 400').bind('%' + key.slice(-9)).all();
  const mine = results.filter(r => normPhone(r.phone) === key);
  return J({ ok: true, orders: mine });
}
async function accountsList(env) {
  const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").first();
  if (!t) return J({ ok: true, exists: false, accounts: [] });
  const { results } = await env.DB.prepare('SELECT id, email, name, phone, phone_verified, created_at FROM accounts ORDER BY created_at DESC LIMIT 500').all();
  return J({ ok: true, exists: true, accounts: results });
}

/* ============ الكوبونات ============ */
async function couponsList(env) {
  const { results } = await env.DB.prepare('SELECT code, pct, active, expires, used, note, max_uses FROM coupons ORDER BY active DESC, code').all();
  return J({ ok: true, coupons: results });
}
async function couponSave(request, env) {
  const b = await readJson(request, 1500);
  const code = String(b && b.code || '').trim().toUpperCase();
  const pct = int(b && b.pct, 1, 90);
  if (!/^[A-Z0-9_-]{2,40}$/.test(code) || pct == null) return J({ ok: false, error: 'invalid' }, 400);
  let exp = null;
  if (b.expires) { const t = Date.parse(b.expires + 'T23:59:59+03:00'); if (!Number.isFinite(t)) return J({ ok: false, error: 'invalid' }, 400); exp = t; }
  const maxUses = b.max_uses === '' || b.max_uses == null ? null : int(b.max_uses, 1, 1000000);
  if (b.max_uses !== '' && b.max_uses != null && maxUses == null) return J({ ok: false, error: 'invalid' }, 400);
  await env.DB.prepare('INSERT INTO coupons (code, pct, active, expires, note, max_uses) VALUES (?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET pct = excluded.pct, active = excluded.active, expires = excluded.expires, note = excluded.note, max_uses = excluded.max_uses').bind(code, pct, b.active === false || b.active === 0 ? 0 : 1, exp, clean(b.note || '', 120), maxUses).run();
  return J({ ok: true });
}

/* ============ النسخ الاحتياطي وسلامة البيانات ============ */
async function backup(env) {
  const out = { exported_at: new Date().toISOString(), version: 1 };
  const tables = ['orders', 'order_events', 'products', 'coupons'];
  for (const t of tables) out[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  out.settings = (await env.DB.prepare("SELECT k, v FROM settings WHERE k <> 'admin_revoke_before'").all()).results;
  const a = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").first();
  if (a) out.accounts = (await env.DB.prepare('SELECT * FROM accounts').all()).results;
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="luce-backup-' + new Date().toISOString().slice(0, 10) + '.json"', 'cache-control': 'no-store' } });
}

async function health(env) {
  const cnt = async t => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
  const tables = { orders: await cnt('orders'), order_events: await cnt('order_events'), products: await cnt('products'), coupons: await cnt('coupons'), settings: await cnt('settings') };
  const last = await env.DB.prepare('SELECT MAX(created_at) AS t FROM orders').first();
  const cat = await effectiveCatalog(env);
  const issues = [];
  const { results: items } = await env.DB.prepare('SELECT ref, items FROM orders ORDER BY created_at DESC LIMIT 3000').all();
  const unknown = new Set();
  for (const r of items) for (const it of parseItems(r.items)) if (!cat[it.id]) unknown.add(it.id);
  if (unknown.size) issues.push({ level: 'warn', text: `طلبات تحتوي منتجات غير موجودة في الكتالوج: ${[...unknown].slice(0, 5).join('، ')}` });
  const { results: orphan } = await env.DB.prepare('SELECT id FROM products').all();
  const orph = orphan.filter(r => !cat[r.id]).length;
  if (orph) issues.push({ level: 'warn', text: `${orph} سجل منتج بلا مقابل في الكتالوج` });
  const neg = Object.values(cat).filter(p => p.stock != null && p.stock < 0);
  if (neg.length) issues.push({ level: 'bad', text: `مخزون سالب: ${neg.map(p => p.name).join('، ')}` });
  const bad = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE method <> 'card' AND pay_verified = 1").first()).n;
  if (bad) issues.push({ level: 'bad', text: `${bad} طلب واتساب موسوم كمدفوع إلكترونيًا` });
  const mism = (await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE total <> subtotal - discount').first()).n;
  if (mism) issues.push({ level: 'bad', text: `${mism} طلب مجموعه لا يطابق (المجموع الفرعي - الخصم)` });
  const exp = (await env.DB.prepare('SELECT COUNT(*) AS n FROM coupons WHERE active = 1 AND expires IS NOT NULL AND expires < ?').bind(Date.now()).first()).n;
  if (exp) issues.push({ level: 'info', text: `${exp} كوبون منتهٍ ما زال مفعّلًا` });
  const stuck = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE method = 'card' AND pay_verified = 0 AND status = 'new' AND created_at < ?").bind(Date.now() - 2 * DAY).first()).n;
  if (stuck) issues.push({ level: 'info', text: `${stuck} طلب بالبطاقة غير مدفوع منذ أكثر من يومين` });
  return J({ ok: true, tables, last_order: last ? last.t : null, products_total: Object.keys(cat).length, issues });
}

/* ============ الموجّه ============ */
export async function adminRoute(request, env, path) {
  const [, b, c, d] = path, m = request.method;
  if (!['summary', 'orders', 'orders-bulk', 'products', 'products-bulk', 'customers', 'accounts', 'coupons', 'settings', 'backup', 'health'].includes(b)) return null;
  await ensureAdminSchema(env);

  if (b === 'summary' && m === 'GET') return dashboard(request, env);

  if (b === 'orders' && !c && m === 'GET') return ordersList(request, env);
  if (b === 'orders' && c && m === 'GET' && !d) return orderDetail(env, clean(c, 32));
  if (b === 'orders' && c && m === 'POST') {
    const ref = clean(c, 32);
    if (d === 'verify') return null; // يعالجها الموجّه الأصلي (تحقق Stream)
    if (d === 'status') { const x = await readJson(request, 300); const r = await applyStatus(env, ref, x && x.status); return r.ok ? J({ ok: true }) : J(r, r.error === 'not_found' ? 404 : r.error === 'invalid' ? 400 : 409); }
    if (d === 'update') return orderPatch(request, env, ref);
    if (d === 'shipment') return orderShipment(request, env, ref);
    if (d === 'items') return orderItems(request, env, ref);
    if (d === 'note') return orderNote(request, env, ref);
    if (!d) { // توافق مع الواجهة القديمة: {status}
      const x = await readJson(request, 300); const r = await applyStatus(env, ref, x && x.status); return r.ok ? J({ ok: true }) : J(r, r.error === 'not_found' ? 404 : r.error === 'invalid' ? 400 : 409);
    }
  }
  if (b === 'orders-bulk' && m === 'POST') return ordersBulk(request, env);

  if (b === 'products' && !c && m === 'GET') return J({ ok: true, products: await productsFull(env, true) });
  if (b === 'products' && !c && m === 'POST') return productCreate(request, env);
  if (b === 'products' && c && d === 'duplicate' && m === 'POST') return productDuplicate(env, clean(c, 40));
  if (b === 'products' && c && !d && m === 'POST') return productUpdate(request, env, c);
  if (b === 'products' && c && !d && m === 'DELETE') return productDelete(env, c);
  if (b === 'products-bulk' && m === 'POST') return productsBulk(request, env);

  if (b === 'customers' && !c && m === 'GET') return customersList(request, env);
  if (b === 'customers' && c === 'detail' && m === 'GET') return customerDetail(request, env);
  if (b === 'accounts' && m === 'GET') return accountsList(env);

  if (b === 'coupons' && m === 'GET') return couponsList(env);
  if (b === 'coupons' && !c && m === 'POST') return couponSave(request, env);
  if (b === 'coupons' && c && m === 'DELETE') { await env.DB.prepare('DELETE FROM coupons WHERE code = ?').bind(clean(c, 40).toUpperCase()).run(); return J({ ok: true }); }

  if (b === 'settings' && m === 'GET') return J({ ok: true, settings: await allSettings(env), stream: !!(env.STREAM_API_KEY && env.STREAM_API_SECRET), spl: lookupOn(env), carriers_api: carriersOn(env), carriers: Object.fromEntries(Object.entries(CARRIERS).map(([k, v]) => [k, { name: v.name, track: !!v.url }])), webhook: !!env.STREAM_WEBHOOK_SECRET, free_from: Number((await allSettings(env)).free_from) });
  if (b === 'settings' && m === 'POST') return settingsSave(request, env);
  if (b === 'backup' && m === 'GET') return backup(env);
  if (b === 'health' && m === 'GET') return health(env);
  return null;
}
