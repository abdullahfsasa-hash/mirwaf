// قاعدة البيانات: إنشاء الجداول تلقائيا عند أول طلب، ودمج الكتالوج الأساسي مع تعديلات الأدمن.
import { ensureAccounts } from './accounts.js';
import { CATALOG, FREE_FROM, SEED_COUPON, SEED_COUPON_2 } from './catalog.js';

const DDL = [
  `CREATE TABLE IF NOT EXISTS orders (
    ref TEXT PRIMARY KEY, cid TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER,
    status TEXT NOT NULL DEFAULT 'new', name TEXT, phone TEXT, city TEXT, address TEXT, notes TEXT, items TEXT,
    subtotal INTEGER, discount INTEGER, free_shipping INTEGER, total INTEGER, coupon TEXT, coupon_pct INTEGER DEFAULT 0,
    lang TEXT, method TEXT DEFAULT 'wa', pay_id TEXT, pay_status TEXT, pay_verified INTEGER DEFAULT 0, pay_info TEXT, ip_hash TEXT)`,
  `CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_ip ON orders (ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, price INTEGER, old_price INTEGER, stock INTEGER, hidden INTEGER DEFAULT 0, extra TEXT)`,
  `CREATE TABLE IF NOT EXISTS variant_stock (pid TEXT NOT NULL, v TEXT NOT NULL, stock INTEGER, status TEXT NOT NULL DEFAULT '', PRIMARY KEY (pid, v))`,
  `CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, pct INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, expires INTEGER, used INTEGER NOT NULL DEFAULT 0, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS admin_fail (ip_hash TEXT, ts INTEGER)`
];

export const TXT_KEYS = ['name', 'en', 'brand', 'cat', 'sub', 'short', 'desc'];
const CAT_KEYS = ['beans', 'cups', 'gear', 'filters', 'matcha'];
// نسخة مخطط القاعدة: إذا كانت مسجّلة نتخطى كل أوامر الإنشاء (كانت تكلّف ~15 رحلة للقاعدة عند كل تشغيل بارد = بطء الموقع).
// ارفع الرقم عند إضافة جدول أو عمود جديد.
const SCHEMA_V = '4';
let ready = null;
export const init = env => {
  if (!ready) {
    ready = (async () => {
      try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('schema_v').first(); if (r && r.v === SCHEMA_V) return; } catch (_) { }
      await env.DB.batch(DDL.map(s => env.DB.prepare(s)));
      try { const { results: pc } = await env.DB.prepare('SELECT name FROM pragma_table_info(?)').bind('products').all(); if (!pc.some(r => r.name === 'meta')) await env.DB.prepare('ALTER TABLE products ADD COLUMN meta TEXT').run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
      await ensureAccounts(env); // جدول accounts وأعمدة العنوان الوطني (functions/_lib/accounts.js)
      await env.DB.prepare('INSERT OR IGNORE INTO coupons (code, pct, active, note) VALUES (?, ?, 1, ?)').bind(SEED_COUPON.code, SEED_COUPON.pct, 'كود الإطلاق').run();
      await env.DB.prepare('INSERT OR IGNORE INTO coupons (code, pct, active, note) VALUES (?, ?, 1, ?)').bind(SEED_COUPON_2.code, SEED_COUPON_2.pct, 'كود الإطلاق (لوتشي)').run();
      // مرة وحدة: أسعار قبل العرض اللي طلبها صاحب المتجر (تظهر مشطوبة مع نسبة التوفير). ما تلمس منتج له سعر قبل خصم أصلًا.
      if ((await getSetting(env, 'mig_old_prices_v1', '')) !== '1') {
        const OLD = {"bk-silver": 82, "oro-blanco": 90, "bk-excelso": 78, "bk-adham": 68, "sout-mananasi": 70, "cup-speckled": 45, "mug-arabic": 39};
        for (const [id, o] of Object.entries(OLD)) await env.DB.prepare('UPDATE products SET old_price = ? WHERE id = ? AND (old_price IS NULL OR old_price = 0) AND price < ?').bind(o, id, o).run();
        await setSetting(env, 'mig_old_prices_v1', '1');
      }
      await setSetting(env, 'schema_v', SCHEMA_V);
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
};

export const getSetting = async (env, k, dflt) => {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first();
  return r ? r.v : dflt;
};
export const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
export const getFreeFrom = async env => { const n = Number(await getSetting(env, 'free_from', FREE_FROM)); return n >= 0 && n < 100000 ? Math.round(n) : FREE_FROM; };

// الكتالوج الفعلي: الأساسي + تعديلات الأدمن + المنتجات المضافة.
// يُرجع كائنًا id → { name, cat, price, old, img, brand, variants, stock, hidden, custom, extra }
export async function effectiveCatalog(env) {
  const [{ results }, { results: vrows }] = await env.DB.batch([env.DB.prepare('SELECT id, price, old_price, stock, hidden, extra, meta FROM products'), env.DB.prepare('SELECT pid, v, stock, status FROM variant_stock')]);
  const out = {};
  for (const [id, b] of Object.entries(CATALOG)) out[id] = { id, name: b.name, en: b.en, cat: b.cat, sub: b.sub || '', short: b.short || '', desc: b.desc || '', prod: b.prod || '', exp: b.exp || '', price: b.price, old: b.old || 0, img: b.img, brand: b.brand, variants: b.variants, stock: b.soon ? 0 : null, hidden: 0, custom: 0 };
  for (const r of results) {
    let x = out[r.id];
    if (r.extra) {
      let e = {}; try { e = JSON.parse(r.extra); } catch (_) { }
      x = out[r.id] = { id: r.id, name: e.name || r.id, en: e.en || '', cat: e.cat || 'gear', img: e.img || '', brand: e.brand || '', variants: null, extra: e, custom: 1, price: 0, old: 0, stock: null, hidden: 0 };
    }
    if (!x) continue;
    if (r.price != null) x.price = r.price;
    if (r.old_price != null) x.old = r.old_price;
    x.stock = r.stock == null ? null : r.stock;
    x.hidden = r.hidden ? 1 : 0;
    // خيارات العرض من الأدمن: لون خلفية الصورة، الحالة (قريبًا / نفد)، وصور بديلة للمنتجات الأساسية.
    let m = {}; try { m = r.meta ? JSON.parse(r.meta) : {}; } catch (_) { }
    x.bg = /^#[0-9a-f]{6}$/i.test(m.bg || '') ? m.bg : '';
    x.status = m.status === 'soon' || m.status === 'soldout' ? m.status : '';
    if (typeof m.prod === 'string') x.prod = m.prod; if (typeof m.exp === 'string') x.exp = m.exp; // تاريخ الإنتاج والانتهاء
    if (!x.custom && Array.isArray(m.imgs) && m.imgs.length) { x.ovImgs = m.imgs.filter(u => typeof u === 'string'); }
    // نصوص معدّلة من الأدمن للمنتج الأساسي (الاسم، الوصف…)
    if (!x.custom && m.txt && typeof m.txt === 'object') {
      const t = {};
      for (const k of TXT_KEYS) if (typeof m.txt[k] === 'string' && (k !== 'cat' || CAT_KEYS.includes(m.txt[k]))) t[k] = m.txt[k];
      if (Object.keys(t).length) { Object.assign(x, t); x.txt = t; }
    }
  }
  // مخزون كل خيار (لون / مقاس): x.vs[اسم الخيار] = { stock: رقم أو null (غير محدود), status: '' | 'soon' | 'soldout' }
  for (const r of vrows) {
    const x = out[r.pid];
    if (!x || !x.variants || !x.variants.includes(r.v)) continue;
    (x.vs = x.vs || {})[r.v] = { stock: r.stock == null ? null : r.stock, status: r.status === 'soon' || r.status === 'soldout' ? r.status : '' };
  }
  return out;
}

// هل الخيار قابل للشراء الآن؟ (يُستخدم بالسيرفر فقط عند إنشاء الطلب)
export const variantBlocked = (p, v, qty) => {
  const s = p.vs && p.vs[v];
  return !!s && (s.status === 'soon' || s.status === 'soldout' || (s.stock != null && s.stock < qty));
};

// حجز كمية من خيار بشكل ذرّي. يرجع 'taken' (نقصنا المخزون)، 'free' (الخيار غير محدود)، أو 'out' (ما يكفي).
export async function takeVariant(env, pid, v, q) {
  const r = await env.DB.prepare('UPDATE variant_stock SET stock = stock - ? WHERE pid = ? AND v = ? AND stock IS NOT NULL AND stock >= ? AND status = \'\'').bind(q, pid, v, q).run();
  if (r.meta && r.meta.changes === 1) return 'taken';
  const row = await env.DB.prepare('SELECT stock, status FROM variant_stock WHERE pid = ? AND v = ?').bind(pid, v).first();
  if (row && (row.status || (row.stock != null && row.stock < q))) return 'out';
  return 'free';
}
export const giveVariant = (env, pid, v, q) => env.DB.prepare('UPDATE variant_stock SET stock = stock + ? WHERE pid = ? AND v = ? AND stock IS NOT NULL').bind(q, pid, v).run();

// تحقق من كود الخصم: يرجع { code, pct } أو null.
export async function findCoupon(env, code) {
  const c = String(code || '').trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9_-]{2,40}$/.test(c)) return null;
  const r = await env.DB.prepare('SELECT code, pct, active, expires FROM coupons WHERE code = ?').bind(c).first();
  if (!r || !r.active) return null;
  if (r.expires && r.expires < Date.now()) return null;
  if (!(r.pct > 0 && r.pct <= 90)) return null;
  return { code: r.code, pct: r.pct };
}
