'use strict';
// نواة لوحة التحكم: أدوات مشتركة، الدخول، الهيكل، لوحة المعلومات. باقي الأقسام تُسجَّل في A.views من ملفات أخرى.
(() => {
  const app = document.getElementById('app');
  const A = window.A = { views: {}, state: {} };
  A.ST = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };
  A.STK = Object.keys(A.ST);
  A.CATS = { beans: 'بن', cups: 'أكواب', gear: 'أدوات', filters: 'فلاتر', matcha: 'ماتشا' };
  A.nf = n => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
  A.money = n => A.nf(n) + ' ر.س';
  const TZ = 'Asia/Riyadh';
  A.dt = t => t ? new Date(t).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '—';
  A.d = t => t ? new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: TZ, dateStyle: 'medium' }) : '—';
  A.img = n => !n ? '' : /^https:\/\//.test(n) ? n : `/img/${n}-s.webp`;
  A.CARRIER_NAMES = { aramex: 'Aramex', smsa: 'SMSA', jt: 'J&T Express', naqel: 'Naqel', spl: 'البريد السعودي (SPL)', zajil: 'زاجل', other: 'أخرى / مندوب' };
  A.TRACK = { aramex: 'https://www.aramex.com/track/results?ShipmentNumber=', smsa: 'https://www.smsaexpress.com/track/?tracknumbers=', jt: 'https://www.jtexpress.sa/trackingExpress?billcode=', naqel: 'https://www.naqelexpress.com/en/tracking?waybill=', spl: 'https://splonline.com.sa/en/track-and-trace/?trackingNumber=' };
  A.trackUrl = (c, n) => (A.TRACK[c] && n) ? A.TRACK[c] + encodeURIComponent(n) : '';

  // أنشئ عنصرًا: كل النصوص تمرّ عبر createTextNode (لا innerHTML إطلاقًا للبيانات).
  const h = A.h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat(2)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  A.$ = (s, r) => (r || document).querySelector(s);

  /* ---------- أيقونات (SVG ثابتة من الكود فقط) ---------- */
  const P = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    box: '<path d="M3 8 12 4l9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c2 .6 3.4 2.3 3.4 5.2"/>',
    tag: '<path d="M12 3h6a2 2 0 0 1 2 2v6L10 21l-8-8L12 3Z"/><circle cx="14.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.8-1.6L13.3 2h-2.6l-.4 2.8a7 7 0 0 0-2.8 1.6l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 3.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.8 1.6l.4 2.8h2.6l.4-2.8a7 7 0 0 0 2.8-1.6l2.3.9 2-3.4-2-1.5c.13-.5.2-1.05.2-1.6Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    trash: '<path d="M5 6h14"/><path d="M9 6V4h6v2"/><path d="M6 6l1 14h10l1-14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    inbox: '<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5 12 6.5 5h11L19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Z"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    wa: '<path d="M4 20l1.2-4A8 8 0 1 1 8.2 19L4 20Z"/><path d="M9 9c.5 2.5 2.5 4.5 5 5l1.3-1.3-2-1-.9.7c-.8-.4-1.5-1.1-1.9-1.9l.7-.9-1-2L9 9Z"/>',
    down: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h4l4 4v3h-8"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'
  };
  A.ic = (name, cls) => { const s = h('span', { class: 'icon' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }); s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`; return s; };

  /* ---------- واجهات مساعدة ---------- */
  const toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  document.body.append(toasts);
  A.toast = (msg, bad) => { const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); toasts.append(t); setTimeout(() => t.remove(), bad ? 4200 : 2400); };

  A.modal = (title, body, actions, opt = {}) => new Promise(res => {
    const close = v => { bg.remove(); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') close(null); };
    const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: opt.wide ? 'max-width:720px' : null }, h('h3', {}, title), body,
        h('div', { class: 'row' }, actions.map(a => h('button', { class: 'btn ' + (a.cls || ''), onclick: async () => { if (a.fn) { const r = await a.fn(); if (r === false) return; close(r === undefined ? a.val : r); } else close(a.val); } }, a.t)))));
    document.addEventListener('keydown', key); document.body.append(bg);
    const f = bg.querySelector('input,select,textarea,.btn.pri'); if (f) f.focus();
  });
  A.confirm = (title, msg, ok = 'تأكيد', danger) => A.modal(title, h('p', { class: 'mut', style: 'margin:0' }, msg), [{ t: 'إلغاء', val: false }, { t: ok, cls: danger ? 'bad' : 'pri', val: true }]);

  A.api = async (path, opt = {}) => {
    const o = { method: opt.method || 'GET', headers: { 'x-mw': '1' }, credentials: 'same-origin' };
    if (opt.body) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
    let r; try { r = await fetch('/api/admin/' + path, o); } catch (e) { return { ok: false, error: 'network', _status: 0 }; }
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (r.status === 401 && path !== 'login') { login(); throw new Error('auth'); }
    j._status = r.status; return j;
  };
  A.ERR = { invalid: 'قيمة غير صالحة', not_found: 'غير موجود', cancelled: 'الطلب ملغي ولا يمكن تعديله', paid_locked: 'الطلب مدفوع ولا يمكن تعديل بنوده', stock: 'المخزون لا يكفي', conflict: 'تغيّر الطلب للتو، أعد المحاولة', network: 'تعذّر الاتصال', csrf: 'انتهت الجلسة، أعد تحميل الصفحة', not_custom: 'لا يمكن حذف منتج أساسي، أخفِه بدلًا من ذلك', server: 'خطأ في الخادم' };
  A.FIELDS = { name: 'الاسم', phone: 'الجوال', city: 'المدينة', address: 'العنوان', addr_short: 'العنوان المختصر', addr_building: 'رقم المبنى', addr_post: 'الرمز البريدي', addr_extra: 'الرقم الإضافي', tracking_no: 'رقم التتبع', carrier: 'شركة الشحن', price: 'السعر', old: 'السعر قبل الخصم', stock: 'المخزون', cost: 'التكلفة', sku: 'رمز SKU', cat: 'التصنيف', img: 'الصورة', pct: 'النسبة', code: 'الكود', free_from: 'حد الشحن المجاني', ship_fee: 'رسوم الشحن', whatsapp_display: 'رقم واتساب', store_email: 'البريد' };
  A.errMsg = r => (A.ERR[r.error] || 'تعذّر الحفظ') + (r.field ? ` (${A.FIELDS[r.field] || r.field})` : '');
  A.save = async (p, opt, okMsg) => { const r = await A.api(p, opt); if (r.ok) { if (okMsg) A.toast(okMsg); } else A.toast(A.errMsg(r), true); return r; };

  A.badge = s => h('span', { class: 'badge b-' + s }, A.ST[s] || s);
  A.empty = (icon, t, sub) => h('div', { class: 'empty' }, A.ic(icon), h('div', {}, t), sub ? h('div', { class: 'sm' }, sub) : null);
  A.skel = (n = 4) => h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skel' })));
  A.field = (label, input, hint) => h('div', { class: 'f' }, h('label', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
  A.download = async (path) => { const r = await fetch('/api/admin/' + path, { credentials: 'same-origin', headers: { 'x-mw': '1' } }); if (!r.ok) return A.toast('تعذّر التنزيل', true); const b = await r.blob(), cd = r.headers.get('content-disposition') || '', m = /filename="([^"]+)"/.exec(cd); const a = h('a', { href: URL.createObjectURL(b), download: m ? m[1] : 'file' }); document.body.append(a); a.click(); a.remove(); };
  A.debounce = (f, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  A.waPhone = p => { let d = String(p || '').replace(/[^\d]/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('966')) return d; if (d.startsWith('0')) d = d.slice(1); return '966' + d; };
  A.waLink = (phone, text) => 'https://wa.me/' + A.waPhone(phone) + '?text=' + encodeURIComponent(text);

  /* ---------- دخول ---------- */
  function login(msg) {
    const err = h('div', { class: 'err' }, msg || '');
    const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'كلمة السر' });
    const go = async e => {
      e.preventDefault(); err.textContent = '';
      const r = await A.api('login', { method: 'POST', body: { password: pw.value } }).catch(() => ({}));
      if (r.ok) return boot();
      err.textContent = r.error === 'locked' ? 'محاولات كثيرة، انتظر ١٥ دقيقة.' : r.error === 'admin_disabled' ? 'لم تُفعَّل كلمة سر الأدمن بعد في Cloudflare.' : 'كلمة السر غير صحيحة.';
      pw.value = '';
    };
    app.replaceChildren(h('div', { class: 'login-wrap' }, h('form', { class: 'login card', onsubmit: go },
      h('h2', {}, 'لوتشي'), h('span', { class: 'mut' }, 'لوحة التحكم'),
      h('div', { class: 'f', style: 'margin-top:14px' }, h('label', {}, 'كلمة السر'), pw), err,
      h('button', { class: 'btn pri', style: 'width:100%;justify-content:center' }, 'دخول'))));
    pw.focus();
  }

  /* ---------- الهيكل والتوجيه ---------- */
  const TABS = [['dash', 'الرئيسية', 'home'], ['orders', 'الطلبات', 'receipt'], ['products', 'المنتجات', 'box'], ['customers', 'العملاء', 'users'], ['coupons', 'الكوبونات', 'tag'], ['settings', 'الإعدادات', 'gear']];
  const TITLES = Object.fromEntries(TABS.map(t => [t[0], t[1]]));
  let main, titleEl, storeName = 'لوتشي';
  A.go = (hash) => { location.hash = hash; };
  const route = () => {
    if (!main) return;
    const [k, ...rest] = (location.hash.slice(1) || 'dash').split('/');
    const view = A.views[k] || A.views.dash, key = A.views[k] ? k : 'dash';
    document.querySelectorAll('[data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === key)));
    titleEl.textContent = TITLES[key] || '';
    document.title = (TITLES[key] || '') + ' · ' + storeName;
    main.replaceChildren(A.skel(6));
    window.scrollTo(0, 0);
    Promise.resolve(view(main, rest.map(decodeURIComponent))).catch(e => { if (e.message !== 'auth') main.replaceChildren(A.empty('inbox', 'حدث خطأ أثناء التحميل', String(e.message || ''))); });
  };
  A.reload = route;
  A.setBadge = n => document.querySelectorAll('[data-badge]').forEach(b => { b.textContent = n || ''; b.style.display = n ? '' : 'none'; });

  async function boot() {
    const s = await A.api('settings').catch(() => ({}));
    if (s.settings && s.settings.store_name) storeName = s.settings.store_name;
    const nav = (cls) => TABS.map(([k, t, i]) => h('button', { class: cls, 'data-nav': k, onclick: () => A.go(k) }, A.ic(i), h('span', {}, t), k === 'orders' && cls === 'nav-btn' ? h('span', { class: 'badge b-new', 'data-badge': '', style: 'display:none' }) : null));
    main = h('div', { class: 'wrap', id: 'view' });
    titleEl = h('h1', {}, '');
    const q = h('input', { type: 'search', placeholder: 'ابحث برقم الطلب أو الاسم أو الجوال…', 'aria-label': 'بحث', onkeydown: e => { if (e.key === 'Enter' && q.value.trim()) { A.state.q = q.value.trim(); A.go('orders'); if (location.hash === '#orders') route(); } } });
    app.replaceChildren(h('div', { class: 'shell' },
      h('nav', { class: 'side', 'aria-label': 'التنقل' }, h('div', { class: 'brand' }, h('span', { class: 'dot' }), storeName + ' · الإدارة'), nav('nav-btn'), h('div', { class: 'grow' }),
        h('a', { class: 'nav-btn', href: '/', target: '_blank', rel: 'noopener' }, A.ic('store'), h('span', {}, 'عرض المتجر')),
        h('button', { class: 'nav-btn', onclick: async () => { if (await A.confirm('تسجيل الخروج', 'سيتم إنهاء جلسة الأدمن على كل الأجهزة.', 'خروج')) { await A.api('logout', { method: 'POST' }); login(); } } }, A.ic('logout'), h('span', {}, 'تسجيل الخروج'))),
      h('div', { class: 'main' }, h('header', { class: 'top' }, titleEl, h('div', { class: 'search' }, q, A.ic('search')),
        h('a', { class: 'btn sm', href: '/', target: '_blank', rel: 'noopener' }, A.ic('store'), h('span', { class: 'hide-m' }, 'عرض المتجر'))), main),
      h('nav', { class: 'mnav', 'aria-label': 'التنقل' }, nav(''))));
    window.removeEventListener('hashchange', route); window.addEventListener('hashchange', route);
    route();
    A.api('orders?status=new&limit=1').then(r => A.setBadge(r.counts && r.counts.new)).catch(() => { });
  }

  /* ---------- لوحة المعلومات ---------- */
  const spark = (days, key) => {
    const W = 600, Ht = 170, pad = 22, max = Math.max(1, ...days.map(d => d[key])), bw = (W - pad * 2) / days.length;
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${Ht + 20}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'مبيعات الأيام الأخيرة'); svg.setAttribute('preserveAspectRatio', 'none');
    days.forEach((d, i) => {
      const hh = Math.max(d[key] ? 3 : 0, (d[key] / max) * (Ht - 16)), x = pad + i * bw + bw * 0.15;
      const r = document.createElementNS(NS, 'rect'); r.setAttribute('class', 'bar'); r.setAttribute('x', x); r.setAttribute('y', Ht - hh); r.setAttribute('width', bw * 0.7); r.setAttribute('height', hh); r.setAttribute('rx', 3);
      const t = document.createElementNS(NS, 'title'); t.textContent = A.d(d.t) + ' — ' + A.nf(d.total) + ' ر.س (' + d.n + ' طلب)'; r.append(t); svg.append(r);
      if (i % Math.ceil(days.length / 7) === 0) { const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', x + bw * 0.35); tx.setAttribute('y', Ht + 14); tx.setAttribute('text-anchor', 'middle'); tx.textContent = new Date(d.t).getUTCDate(); svg.append(tx); }
    });
    return svg;
  };
  const delta = (cur, prev) => { if (!prev) return null; const p = Math.round((cur - prev) / prev * 100); return h('span', { class: 'd ' + (p >= 0 ? 'up' : 'down') }, (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '٪ عن السابق'); };
  const kpi = (l, v, d) => h('div', { class: 'card kpi' }, h('span', { class: 'l' }, l), h('span', { class: 'v num' }, v), d || h('span', { class: 'd mut' }, ' '));

  A.views.dash = async (el) => {
    const range = A.state.range || 14;
    const s = await A.api('summary?range=' + range);
    if (!s.ok) return el.replaceChildren(A.empty('inbox', 'تعذّر تحميل البيانات'));
    A.setBadge(s.pending);
    const rg = h('div', { class: 'seg' }, [14, 30].map(n => h('button', { 'aria-pressed': String(n === range), onclick: () => { A.state.range = n; route(); } }, n + ' يوم')));
    const msg = h('div', { class: 'callout info' }, `${A.nf(s.split.card.n)} طلب بالدفع الإلكتروني (${A.nf(s.split.cardPaid.n)} مدفوع) و${A.nf(s.split.wa.n)} عبر واتساب هذا الشهر`);
    el.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('h2', { style: 'margin:0;font-size:20px' }, 'نظرة عامة'), h('div', { class: 'sp' }),
        h('a', { class: 'btn pri', href: '#orders' }, A.ic('receipt'), 'الطلبات'), h('button', { class: 'btn', onclick: () => A.go('products/new') }, A.ic('plus'), 'منتج جديد')),
      s.pending ? h('div', { class: 'callout warn', style: 'margin-bottom:14px;cursor:pointer', onclick: () => { A.state.status = 'new'; A.go('orders'); } }, `لديك ${A.nf(s.pending)} طلب جديد بانتظار المراجعة — اضغط للعرض`) : null,
      h('div', { class: 'grid g4' },
        kpi('مبيعات اليوم', A.money(s.today.total), delta(s.today.total, s.yesterday.total) || h('span', { class: 'd mut' }, s.today.n + ' طلب')),
        kpi('آخر 7 أيام', A.money(s.week.total), h('span', { class: 'd mut' }, s.week.n + ' طلب')),
        kpi('هذا الشهر', A.money(s.month.total), delta(s.month.total, s.prevMonth.total) || h('span', { class: 'd mut' }, s.month.n + ' طلب')),
        kpi('متوسط قيمة الطلب', A.money(s.aov), h('span', { class: 'd mut' }, 'مدفوع إلكترونيًا: ' + A.money(s.paid)))),
      h('div', { class: 'grid g-main', style: 'margin-top:14px' },
        h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('span', { class: 'grow' }, 'المبيعات اليومية'), rg), spark(s.days, 'total'), msg),
        h('div', { class: 'card' }, h('h3', {}, 'الأكثر مبيعًا هذا الشهر'),
          s.topProducts.length ? h('ul', { class: 'list bars' }, s.topProducts.map(p => h('li', {}, h('div', { style: 'flex:1;min-width:0' }, h('div', {}, p.name), h('div', { class: 'b' }, h('i', { style: `width:${Math.max(6, p.revenue / s.topProducts[0].revenue * 100)}%` }))), h('div', { class: 'sm mut num' }, p.qty + ' × ')))) : A.empty('box', 'لا مبيعات بعد')))
      , h('div', { class: 'grid g2', style: 'margin-top:14px' },
        h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('span', { class: 'grow' }, 'أحدث الطلبات'), h('a', { href: '#orders', class: 'sm' }, 'الكل')),
          s.recent.length ? h('ul', { class: 'list' }, s.recent.map(o => h('li', { style: 'cursor:pointer', onclick: () => A.go('orders/' + o.ref) }, h('div', { style: 'flex:1;min-width:0' }, h('b', { class: 'num' }, '#' + o.ref), ' ', h('span', { class: 'mut' }, o.name)), A.badge(o.status), h('span', { class: 'num' }, A.nf(o.total))))) : A.empty('inbox', 'لا توجد طلبات بعد')),
        h('div', { class: 'card' }, h('h3', {}, 'مخزون منخفض'),
          s.low.length ? h('ul', { class: 'list' }, s.low.map(p => h('li', { style: 'cursor:pointer', onclick: () => A.go('products/' + encodeURIComponent(p.id)) }, h('img', { class: 'thumb', src: A.img(p.img), alt: '', loading: 'lazy' }), h('span', { style: 'flex:1' }, p.name), h('span', { class: 'badge ' + (p.stock === 0 ? 'b-bad' : 'b-warn') }, p.stock === 0 ? 'نفد' : p.stock + ' متبقي')))) : A.empty('check', 'كل المخزون بحالة جيدة'))));
  };

  A.views.dash = A.views.dash; // مرجع
  A.boot = boot;
  A.api('me').then(r => r.ok ? boot() : login()).catch(() => { });
})();
