'use strict';
(() => {
  const app = document.getElementById('app');
  const ST = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };
  const CATS = { beans: 'بن', cups: 'أكواب', gear: 'أدوات', filters: 'فلاتر', matcha: 'ماتشا' };
  const nf = n => new Intl.NumberFormat('ar-SA-u-nu-latn').format(n || 0);
  const dt = t => new Date(t).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' });

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  function toast(msg) {
    const t = h('div', { class: 'toast' }, h('span', {}, msg));
    document.body.append(t); setTimeout(() => t.remove(), 2200);
  }
  async function api(path, opt = {}) {
    const o = { method: opt.method || 'GET', headers: { 'x-mw': '1' }, credentials: 'same-origin' };
    if (opt.body) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
    const r = await fetch('/api/admin/' + path, o);
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (r.status === 401 && path !== 'login') { login(); throw new Error('auth'); }
    j._status = r.status; return j;
  }

  /* ---------- دخول ---------- */
  function login(msg) {
    const err = h('div', { class: 'err' }, msg || '');
    const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'كلمة السر' });
    const go = async e => {
      e.preventDefault(); err.textContent = '';
      const r = await api('login', { method: 'POST', body: { password: pw.value } }).catch(() => ({}));
      if (r.ok) return shell();
      err.textContent = r.error === 'locked' ? 'محاولات كثيرة، انتظر ١٥ دقيقة.' : r.error === 'admin_disabled' ? 'لم تُفعَّل كلمة سر الأدمن بعد في Cloudflare.' : 'كلمة السر غير صحيحة.';
      pw.value = '';
    };
    app.replaceChildren(h('form', { class: 'login card', onsubmit: go }, h('h2', {}, 'مرواف · لوحة التحكم'), h('label', {}, 'كلمة السر'), pw, err, h('button', { class: 'btn pri', style: 'width:100%;margin-top:8px' }, 'دخول')));
    pw.focus();
  }

  /* ---------- الهيكل ---------- */
  const TABS = [['dash', 'الرئيسية'], ['orders', 'الطلبات'], ['products', 'المنتجات'], ['coupons', 'الكوبونات'], ['settings', 'الإعدادات']];
  let cur = 'dash';
  function shell() {
    const body = h('div', { class: 'wrap' });
    const bar = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(k === cur), onclick: () => { cur = k; shell(); } }, t)));
    app.replaceChildren(
      h('div', { class: 'top' }, h('b', {}, 'مرواف · الإدارة'), h('span', { class: 'sp' }), h('a', { href: '/', class: 'mut' }, 'المتجر'),
        h('button', { class: 'btn sm', onclick: async () => { await api('logout', { method: 'POST' }); login(); } }, 'خروج')),
      bar, body);
    ({ dash, orders, products, coupons, settings })[cur](body).catch(e => { if (e.message !== 'auth') body.append(h('p', { class: 'err' }, 'تعذّر التحميل')); });
  }

  /* ---------- الرئيسية ---------- */
  async function dash(el) {
    const s = await api('summary');
    const max = Math.max(1, ...s.days.map(d => d.total));
    el.append(
      h('div', { class: 'grid' },
        stat('مبيعات اليوم', nf(s.today.total) + ' ر.س', s.today.n + ' طلب'),
        stat('مبيعات الشهر', nf(s.month.total) + ' ر.س', s.month.n + ' طلب'),
        stat('مدفوع إلكترونيا (الشهر)', nf(s.paid) + ' ر.س', 'تم التحقق من الخادم'),
        stat('طلبات جديدة', nf(s.counts.new || 0), 'بانتظار التأكيد')),
      h('div', { class: 'card' }, h('b', {}, 'آخر ١٤ يوم'),
        h('div', { class: 'bars', role: 'img', 'aria-label': 'مبيعات آخر ١٤ يوم' }, s.days.map(d => h('i', { style: 'height:' + Math.max(2, d.total / max * 100) + '%', title: nf(d.total) + ' ر.س' })))),
      s.low.length ? h('div', { class: 'card' }, h('b', {}, 'مخزون منخفض'), h('p', { class: 'mut' }, s.low.map(l => l.id + ': ' + l.stock).join(' · '))) : null);
  }
  const stat = (a, b, c) => h('div', { class: 'stat' }, h('small', {}, a), h('b', {}, b), h('small', {}, c));

  /* ---------- الطلبات ---------- */
  async function orders(el) {
    const q = h('input', { placeholder: 'بحث: رقم الطلب / الاسم / الجوال' });
    const st = h('select', {}, h('option', { value: '' }, 'كل الحالات'), Object.entries(ST).map(([k, v]) => h('option', { value: k }, v)));
    const list = h('div');
    const load = async () => {
      const r = await api('orders?status=' + encodeURIComponent(st.value) + '&q=' + encodeURIComponent(q.value));
      list.replaceChildren(...(r.orders.length ? r.orders.map(card) : [h('p', { class: 'mut' }, 'لا توجد طلبات.')]));
    };
    q.addEventListener('change', load); st.addEventListener('change', load);
    el.append(h('div', { class: 'row card' }, q, st, h('a', { class: 'btn', href: '/api/admin/export' }, 'تصدير CSV')), list);
    await load();
    function card(o) {
      const sel = h('select', { 'aria-label': 'الحالة' }, Object.entries(ST).map(([k, v]) => h('option', { value: k, selected: k === o.status }, v)));
      sel.addEventListener('change', async () => {
        if (sel.value === 'cancelled' && !confirm('إلغاء الطلب وإرجاع المخزون؟')) { sel.value = o.status; return; }
        const r = await api('orders/' + encodeURIComponent(o.ref), { method: 'POST', body: { status: sel.value } });
        toast(r.ok ? 'تم التحديث' : 'تعذّر التحديث'); load();
      });
      const pay = o.method === 'card'
        ? h('span', { class: 'pill ' + (o.pay_verified ? 'ok' : 'no') }, o.pay_verified ? 'مدفوع ✓ (تم التحقق)' : 'بطاقة · ' + (o.pay_status === 'unverified' ? 'بانتظار التحقق' : o.pay_status ? 'غير مؤكد: ' + o.pay_status : 'لم يكتمل'))
        : h('span', { class: 'pill' }, 'واتساب');
      const verify = o.method === 'card' && !o.pay_verified ? h('button', { class: 'btn sm', onclick: async () => {
        const id = prompt('رقم عملية Moyasar (من لوحة Moyasar):'); if (!id) return;
        const r = await api('orders/' + encodeURIComponent(o.ref) + '/verify', { method: 'POST', body: { id } });
        toast(r.verified ? 'تم التحقق: مدفوع' : 'لم يتحقق الدفع'); load();
      } }, 'تحقق من الدفع') : null;
      return h('div', { class: 'ord' },
        h('h4', {}, o.ref, h('span', { class: 'pill ' + o.status }, ST[o.status]), pay, h('span', { class: 'mut' }, dt(o.created_at))),
        h('div', {}, o.name, ' · ', h('a', { href: 'tel:' + o.phone }, o.phone), ' · ', o.city),
        h('div', { class: 'mut' }, o.address, o.notes ? ' — ' + o.notes : ''),
        h('ul', {}, o.items.map(i => h('li', {}, `${i.name}${i.v ? ' (' + i.v + ')' : ''} × ${i.qty} — ${nf(i.price * i.qty)}`))),
        h('div', {}, h('b', {}, 'الإجمالي: ' + nf(o.total) + ' ر.س'), o.coupon ? h('span', { class: 'mut' }, ` · كوبون ${o.coupon} (−${nf(o.discount)})`) : null),
        h('div', { class: 'row', style: 'margin-top:8px' }, sel, verify,
          h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: 'https://wa.me/' + String(o.phone).replace(/[^\d]/g, '').replace(/^0/, '966') }, 'واتساب العميل')));
    }
  }

  /* ---------- المنتجات ---------- */
  async function products(el) {
    const r = await api('products');
    const tb = h('tbody', {}, r.products.map(p => {
      const price = h('input', { type: 'number', min: 1, value: p.price }), old = h('input', { type: 'number', min: 0, value: p.old || '' }),
        stock = h('input', { type: 'number', min: 0, value: p.stock == null ? '' : p.stock, placeholder: 'غير محدود' }), hid = h('input', { type: 'checkbox', checked: !!p.hidden, style: 'width:auto' });
      const save = async () => {
        const x = await api('products/' + encodeURIComponent(p.id), { method: 'POST', body: { price: price.value, old: old.value, stock: stock.value, hidden: hid.checked } });
        toast(x.ok ? 'تم الحفظ' : 'قيمة غير صالحة');
      };
      return h('tr', {}, h('td', {}, h('b', {}, p.name), h('div', { class: 'mut' }, p.id, p.custom ? ' · مضاف' : '')), h('td', {}, price), h('td', {}, old), h('td', {}, stock), h('td', {}, hid),
        h('td', {}, h('button', { class: 'btn sm pri', onclick: save }, 'حفظ'), p.custom ? h('button', { class: 'btn sm bad', onclick: async () => { if (confirm('حذف المنتج؟')) { await api('products/' + encodeURIComponent(p.id), { method: 'DELETE' }); shell(); } } }, 'حذف') : null));
    }));
    el.append(h('div', { class: 'card' }, h('button', { class: 'btn pri', onclick: addDlg }, '+ منتج جديد')),
      h('div', { class: 'card tw' }, h('table', { class: 'pt' }, h('thead', {}, h('tr', {}, ['المنتج', 'السعر', 'قبل الخصم', 'المخزون', 'مخفي', ''].map(t => h('th', {}, t)))), tb)));
    function addDlg() {
      const f = {}; const fld = (k, l, a = {}) => (f[k] = h(a.tag || 'input', a), [h('label', {}, l), f[k]]);
      const dlg = h('dialog', {}, h('h3', {}, 'منتج جديد'),
        fld('name', 'الاسم'), h('label', {}, 'القسم'), (f.cat = h('select', {}, Object.entries(CATS).map(([k, v]) => h('option', { value: k }, v)))),
        fld('brand', 'العلامة', { value: 'مرواف' }), fld('sub', 'وصف قصير تحت الاسم'),
        h('div', { class: 'row' }, h('div', {}, fld('price', 'السعر (ر.س)', { type: 'number', min: 1 })), h('div', {}, fld('old', 'قبل الخصم', { type: 'number', min: 0 })), h('div', {}, fld('stock', 'المخزون', { type: 'number', min: 0 }))),
        fld('img', 'رابط الصورة (https://…) أو اسم صورة موجودة', {}), fld('short', 'ملخص', { tag: 'textarea', rows: 2 }), fld('desc', 'الوصف', { tag: 'textarea', rows: 4 }),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn pri', onclick: async () => {
          const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value]));
          const x = await api('products', { method: 'POST', body });
          if (x.ok) { dlg.close(); shell(); toast('تمت الإضافة'); } else toast('تحقق من الحقول (الاسم، السعر، رابط https للصورة)');
        } }, 'إضافة'), h('button', { class: 'btn', onclick: () => dlg.close() }, 'إلغاء')));
      document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }
  }

  /* ---------- الكوبونات ---------- */
  async function coupons(el) {
    const r = await api('coupons');
    const code = h('input', { placeholder: 'الكود مثل RAMADAN', style: 'direction:ltr' }), pct = h('input', { type: 'number', min: 1, max: 90, placeholder: 'النسبة %' }),
      exp = h('input', { type: 'date', 'aria-label': 'ينتهي' }), note = h('input', { placeholder: 'ملاحظة' });
    el.append(h('div', { class: 'card row' }, code, pct, exp, note, h('button', { class: 'btn pri', onclick: async () => {
      const x = await api('coupons', { method: 'POST', body: { code: code.value, pct: pct.value, expires: exp.value, note: note.value } });
      if (x.ok) shell(); else toast('بيانات غير صالحة');
    } }, 'حفظ')),
      h('div', { class: 'card tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['الكود', 'الخصم', 'الاستخدام', 'ينتهي', 'الحالة', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, r.coupons.map(c => h('tr', {}, h('td', {}, c.code, c.note ? h('div', { class: 'mut' }, c.note) : null), h('td', {}, c.pct + '%'), h('td', {}, c.used), h('td', {}, c.expires ? dt(c.expires) : '—'),
          h('td', {}, h('button', { class: 'btn sm', onclick: async () => { await api('coupons', { method: 'POST', body: { code: c.code, pct: c.pct, active: !c.active, expires: c.expires ? new Date(c.expires + 10800000).toISOString().slice(0, 10) : '', note: c.note } }); shell(); } }, c.active ? 'فعّال' : 'موقوف')),
          h('td', {}, h('button', { class: 'btn sm bad', onclick: async () => { if (confirm('حذف الكوبون؟')) { await api('coupons/' + encodeURIComponent(c.code), { method: 'DELETE' }); shell(); } } }, 'حذف'))))))));
  }

  /* ---------- الإعدادات ---------- */
  async function settings(el) {
    const s = await api('settings');
    const ff = h('input', { type: 'number', min: 0, value: s.free_from });
    el.append(h('div', { class: 'card' }, h('label', {}, 'الشحن مجاني للطلبات من (ر.س)'), ff,
      h('button', { class: 'btn pri', style: 'margin-top:10px', onclick: async () => { const x = await api('settings', { method: 'POST', body: { free_from: ff.value } }); toast(x.ok ? 'تم الحفظ' : 'قيمة غير صالحة'); } }, 'حفظ')),
      h('div', { class: 'card' }, h('b', {}, 'الدفع الإلكتروني'), h('p', { class: 'mut' }, s.moyasar ? 'مفتاح Moyasar السري مفعّل: تُتحقق الدفعات من الخادم تلقائيا.' : 'مفتاح Moyasar السري غير مضاف: الدفعات بالبطاقة تظهر «غير مؤكد» حتى تضيفه في Cloudflare.')));
  }

  api('me').then(r => (r.ok ? shell() : login())).catch(() => { });
})();
