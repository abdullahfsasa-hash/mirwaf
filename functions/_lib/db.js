// قاعدة البيانات: إنشاء الجداول تلقائيا عند أول طلب، ودمج الكتالوج الأساسي مع تعديلات الأدمن.
import { CATALOG, FREE_FROM, SEED_COUPON } from './catalog.js';

const DDL = [
  `CREATE TABLE IF NOT EXISTS orders (
    ref TEXT PRIMARY KEY, cid TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER,
    status TEXT NOT NULL DEFAULT 'new', name TEXT, phone TEXT, city TEXT, address TEXT, notes TEXT, items TEXT,
    subtotal INTEGER, discount INTEGER, free_shipping INTEGER, total INTEGER, coupon TEXT, coupon_pct INTEGER DEFAULT 0,
    lang TEXT, method TEXT DEFAULT 'wa', pay_id TEXT, pay_status TEXT, pay_verified INTEGER DEFAULT 0, pay_info TEXT, ip_hash TEXT)`,
  `CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_ip ON orders (ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, price INTEGER, old_price INTEGER, stock INTEGER, hidden INTEGER DEFAULT 0, extra TEXT)`,
  `CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, pct INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, expires INTEGER, used INTEGER NOT NULL DEFAULT 0, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS admin_fail (ip_hash TEXT, ts INTEGER)`
];

let ready = null;
export const init = env => {
  if (!ready) {
    ready = (async () => {
      await env.DB.batch(DDL.map(s => env.DB.prepare(s)));
      await env.DB.prepare('INSERT OR IGNORE INTO coupons (code, pct, active, note) VALUES (?, ?, 1, ?)').bind(SEED_COUPON.code, SEED_COUPON.pct, 'كود الإطلاق').run();
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
  const { results } = await env.DB.prepare('SELECT id, price, old_price, stock, hidden, extra FROM products').all();
  const out = {};
  for (const [id, b] of Object.entries(CATALOG)) out[id] = { id, name: b.name, en: b.en, cat: b.cat, price: b.price, old: b.old || 0, img: b.img, brand: b.brand, variants: b.variants, stock: null, hidden: 0, custom: 0 };
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
  }
  return out;
}

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
