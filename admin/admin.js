'use strict';
(() => {
  const app = document.getElementById('app');
  const ST = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };
  const CATS = { beans: 'بن', cups: 'أكواب', gear: 'أدوات', filters: 'فلاتر', matcha: 'ماتشا' };
  const nf = n => new Intl.NumberFormat('ar-SA-u-nu-latn').format(n || 0);
  const dt = t => new Date(t).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' });
  const adminImg = n => !n ? '' : /^https:\/\//.test(n) ? n : `/img/${n}-s.webp`;

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

  /* ---------- أيقونات ---------- */
  const PATHS = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    box: '<path d="M3 8 12 4l9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
    tag: '<path d="M12 3h6a2 2 0 0 1 2 2v6L10 21l-8-8L12 3Z"/><circle cx="14.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.8-1.6L13.3 2h-2.6l-.4 2.8a7 7 0 0 0-2.8 1.6l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 3.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.8 1.6l.4 2.8h2.6l.4-2.8a7 7 0 0 0 2.8-1.6l2.3.9 2-3.4-2-1.5c.13-.5.2-1.05.2-1.6Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.3"/>',
    trash: '<path d="M5 6h14"/><path d="M9 6V4h6v2"/><path d="M6 6l1 14h10l1-14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    inbox: '<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5 12 6.5 5h11L19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Z"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v0M18 14v0"/>',
    cart: '<circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="20" r="1.4" fill="currentColor" stroke="none"/><path d="M3 4h2l2.2 11h10.6L20 7H6"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>'
  };
  const ic = (name, cls) => { const s = h('span', { class: 'icon' + (cls ? ' ' + cls : '') }); s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`; return s; };

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
    app.replaceChildren(h('div', { class: 'login-wrap' }, h('form', { class: 'login card', onsubmit: go },
      h('h2', {}, 'لوتشي'), h('span', { class: 'mut' }, 'لوحة التحكم'),
      h('label', {}, 'كلمة السر'), pw, err, h('button', { class: 'btn pri', style: 'width:100%;margin-top:8px;justify-content:center' }, 'دخول'))));
    pw.focus();
  }

  /* ---------- الهيكل ---------- */
  const TABS = [['dash', 'الرئيسية', 'home'], ['orders', 'الطلبات', 'receipt'], ['products', 'المنتجات', 'box'], ['coupons', 'الكوبونات', 'tag'], ['settings', 'الإعدادات', 'gear']];
  let cur = 'dash';
  function shell() {
    const body = h('div', { class: 'wrap' });
    const go = k => () => { cur = k; shell(); };
    app.replaceChildren(
      h('div', { class: 'shell' },
        h('nav', { class: 'side' },
          h('div', { class: 'brand' }, h('span', { class: 'dot' }), 'لوتشي · الإدارة'),
          TABS.map(([k, t, i]) => h('button', { class: 'nav-btn', 'aria-current': String(k === cur), onclick: go(k) }, ic(i), h('span', {}, t))),
          h('div', { class: 'bottom' },
            h('a', { class: 'nav-btn', href: '/', target: '_blank', rel: 'noopener' }, ic('store'), h('span', {}, 'عرض المتجر')),
            h('button', { class: 'nav-btn', onclick: async () => { await api('logout', { method: 'POST' }); login(); } }, ic('logout'), h('span', {}, 'تسجيل الخروج')))),
        h('div', { class: 'main' },
          h('div', { class: 'top' }, h('b', {}, 'لوتشي · الإدارة'), h('span', { class: 'sp' }), h('a', { href: '/', target: '_blank', rel: 'noopener', class: 'mut' }, 'المتجر')),
          body,
          h('div', { class: 'bottomnav' }, TABS.map(([k, t, i]) => h('button', { 'aria-current': String(k === cur), onclick: go(k) }, ic(i), t))))));
    ({ dash, orders, products, coupons, settings })[cur](body).catch(e => { if (e.message !== 'auth') body.append(h('p', { class: 'err' }, 'تعذّر التحميل، حدّث الصفحة.')); });
  }
  const pageHead = (title, sub) => h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, title), sub ? h('div', { class: 'mut' }, sub) : null));
  const empty = (icon, msg) => h('div', { class: 'empty' }, ic(icon), h('div', {}, msg));

  /* ---------- الرئيسية ---------- */
  async function dash(el) {
    el.append(pageHead('نظرة عامة', 'أداء المتجر خلال آخر فترة'));
    const s = await api('summary');
    const max = Math.max(1, ...s.days.map(d => d.total));
    el.append(
      h('div', { class: 'grid' },
        stat('cash', 'مبيعات اليوم', nf(s.today.total) + ' ر.س', s.today.n + ' طلب'),
        stat('bolt', 'مبيعات الشهر', nf(s.month.total) + ' ر.س', s.month.n + ' طلب'),
        stat('cart', 'مدفوع إلكترونيا (الشهر)', nf(s.paid) + ' ر.س', 'تم التحقق من الخادم'),
        stat('receipt', 'طلبات جديدة', nf(s.counts.new || 0), 'بانتظار التأكيد')),
      h('div', { class: 'card' }, h('b', {}, 'آخر ١٤ يوم'),
        h('div', { class: 'bars', style: 'margin-top:14px', role: 'img', 'aria-label': 'مبيعات آخر ١٤ يوم' }, s.days.map(d => h('i', { style: 'height:' + Math.max(2, d.total / max * 100) + '%', title: nf(d.total) + ' ر.س' })))),
      s.low.length ? h('div', { class: 'card' }, h('b', {}, '⚠ مخزون منخفض'), h('p', { class: 'mut' }, s.low.map(l => l.id + ': ' + l.stock).join(' · '))) : null,
      h('div', { class: 'grid', style: 'grid-template-columns:1.3fr 1fr;align-items:start' },
        h('div', { class: 'card' }, h('b', {}, 'آخر الطلبات'),
          (s.recent || []).length
            ? h('div', { style: 'margin-top:8px' }, s.recent.map(o => h('div', { class: 'prow', style: 'padding:8px 0;border-bottom:1px solid var(--line)' },
                h('div', { style: 'flex:1' }, h('b', { style: 'font-size:13.5px' }, o.name || o.ref), h('div', { class: 'mut' }, o.ref + ' · ' + dt(o.created_at))),
                h('span', { class: 'pill ' + o.status }, ST[o.status]), h('b', { style: 'font-family:\'Readex Pro\',sans-serif' }, nf(o.total) + ' ر.س'))))
            : h('p', { class: 'mut' }, 'لا توجد طلبات بعد.')),
        h('div', { class: 'card' }, h('b', {}, 'الأكثر مبيعًا هذا الشهر'),
          (s.topProducts || []).length
            ? h('div', { style: 'margin-top:8px' }, s.topProducts.map((p, i) => h('div', { class: 'row', style: 'margin:8px 0' },
                h('span', { class: 'mut', style: 'flex:0 0 18px' }, i + 1), h('span', { style: 'flex:1' }, p.name), h('b', {}, nf(p.qty) + ' قطعة'))))
            : h('p', { class: 'mut' }, 'لا توجد مبيعات هذا الشهر بعد.'))));
  }
  const stat = (icon, a, b, c) => h('div', { class: 'stat' }, h('div', { class: 'ic' }, ic(icon)), h('small', {}, a), h('b', {}, b), h('small', {}, c));

  /* ---------- الطلبات ---------- */
  async function orders(el) {
    el.append(pageHead('الطلبات'));
    const q = h('input', { placeholder: 'بحث: رقم الطلب / الاسم / الجوال' });
    const st = h('select', {}, h('option', { value: '' }, 'كل الحالات'), Object.entries(ST).map(([k, v]) => h('option', { value: k }, v)));
    const list = h('div');
    const load = async () => {
      list.replaceChildren(h('div', { class: 'skel', style: 'height:90px;margin:10px 0' }), h('div', { class: 'skel', style: 'height:90px' }));
      const r = await api('orders?status=' + encodeURIComponent(st.value) + '&q=' + encodeURIComponent(q.value));
      list.replaceChildren(...(r.orders.length ? r.orders.map(card) : [empty('inbox', 'لا توجد طلبات مطابقة.')]));
    };
    q.addEventListener('input', debounce(load, 350)); st.addEventListener('change', load);
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
        ? h('span', { class: 'pill ' + (o.pay_verified ? 'ok' : 'no') }, o.pay_verified ? 'مدفوع ✓' : 'بطاقة · ' + (o.pay_status === 'unverified' ? 'بانتظار التحقق' : o.pay_status ? 'غير مؤكد' : 'لم يكتمل'))
        : h('span', { class: 'pill' }, 'واتساب');
      const verify = o.method === 'card' && !o.pay_verified ? h('button', { class: 'btn sm', onclick: async () => {
        const id = prompt('رقم عملية Moyasar (من لوحة Moyasar):'); if (!id) return;
        const r = await api('orders/' + encodeURIComponent(o.ref) + '/verify', { method: 'POST', body: { id } });
        toast(r.verified ? 'تم التحقق: مدفوع' : 'لم يتحقق الدفع'); load();
      } }, 'تحقق من الدفع') : null;
      return h('div', { class: 'ord st-' + o.status },
        h('h4', {}, o.ref, h('span', { class: 'pill ' + o.status }, ST[o.status]), pay, h('span', { class: 'mut' }, dt(o.created_at))),
        h('div', {}, o.name, ' · ', h('a', { href: 'tel:' + o.phone }, o.phone), ' · ', o.city),
        h('div', { class: 'mut' }, o.address, o.notes ? ' — ' + o.notes : ''),
        h('ul', {}, o.items.map(i => h('li', {}, `${i.name}${i.v ? ' (' + i.v + ')' : ''} × ${i.qty} — ${nf(i.price * i.qty)}`))),
        h('div', {}, h('b', {}, 'الإجمالي: ' + nf(o.total) + ' ر.س'), o.coupon ? h('span', { class: 'mut' }, ` · كوبون ${o.coupon} (−${nf(o.discount)})`) : null),
        h('div', { class: 'row', style: 'margin-top:10px' }, sel, verify,
          h('a', { class: 'btn sm', target: '_blank', rel: 'noopener', href: 'https://wa.me/' + String(o.phone).replace(/[^\d]/g, '').replace(/^0/, '966') }, 'واتساب العميل'),
          h('button', { class: 'btn sm', onclick: () => printReceipt(o) }, 'طباعة الإيصال')));
    }
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // إيصال قابل للطباعة لطلب واحد — يُبنى عبر DOM (textContent فقط) لتفادي أي حقن من بيانات العميل.
  function printReceipt(o) {
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { toast('يرجى السماح بالنوافذ المنبثقة لهذا الموقع'); return; }
    const d = w.document;
    d.title = 'إيصال ' + o.ref;
    const style = d.createElement('style');
    style.textContent = "body{font:14px/1.7 system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;direction:rtl;padding:22px;color:#241a14;max-width:380px;margin:0 auto}h2{margin:0 0 2px;font-size:19px}.mut{color:#7a6d63;font-size:12.5px}hr{border:none;border-top:1px solid #e7e0d6;margin:12px 0}table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:5px 0;border-bottom:1px solid #f0ece4;font-size:13.5px}.tot{font-weight:700;font-size:16.5px;margin-top:10px}.pbtn{margin-top:20px;padding:9px 18px;border-radius:10px;border:1px solid #3b2418;background:#3b2418;color:#fff;cursor:pointer;font:inherit}@media print{.pbtn{display:none}}";
    d.head.append(style);
    const mk = (tag, txt, cls) => { const e = d.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
    const body = d.body;
    body.append(mk('h2', 'لوتشي · إيصال طلب'), mk('div', o.ref + ' — ' + dt(o.created_at), 'mut'), d.createElement('hr'),
      mk('div', o.name), mk('div', o.phone), mk('div', (o.city || '') + ' — ' + (o.address || '')));
    const table = d.createElement('table');
    (o.items || []).forEach(i => {
      const tr = d.createElement('tr');
      tr.append(mk('td', `${i.name}${i.v ? ' (' + i.v + ')' : ''} × ${i.qty}`));
      const td2 = mk('td', nf(i.price * i.qty)); td2.style.textAlign = 'left'; tr.append(td2);
      table.append(tr);
    });
    body.append(table, mk('div', 'الإجمالي: ' + nf(o.total) + ' ر.س', 'tot'));
    if (o.coupon) body.append(mk('div', `كوبون ${o.coupon} (−${nf(o.discount)})`, 'mut'));
    const btn = mk('button', 'طباعة', 'pbtn'); btn.addEventListener('click', () => w.print());
    body.append(btn);
    w.focus();
  }

  /* ---------- اختيار/رفع صورة ---------- */
  function imagePicker(initial) {
    const thumb = h('div', { class: 'thumb' }, ic('image'));
    const setPreview = src => { thumb.style.backgroundImage = src ? `url('${src}')` : ''; thumb.replaceChildren(src ? '' : ic('image')); };
    const urlInput = h('input', { placeholder: 'أو الصق رابط صورة https://…', style: 'direction:ltr', value: initial || '' });
    setPreview(adminImg(initial) || initial);
    urlInput.addEventListener('change', () => setPreview(urlInput.value));
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' });
    const status = h('span', { class: 'mut' }, '');
    const btn = h('button', { type: 'button', class: 'btn sm' }, ic('camera'), 'رفع صورة');
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      status.textContent = 'جارٍ الرفع…'; btn.setAttribute('disabled', '');
      const fd = new FormData(); fd.append('file', f);
      try {
        const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'x-mw': '1' }, credentials: 'same-origin', body: fd });
        const j = await r.json().catch(() => ({}));
        if (j.ok) { urlInput.value = j.url; setPreview(j.url); status.textContent = 'تم الرفع ✓'; }
        else status.textContent = j.error === 'size' ? 'أكبر من 5MB' : j.error === 'type' ? 'نوع غير مدعوم' : j.error === 'no_bucket' ? 'التخزين غير مفعّل، راسل الدعم' : 'تعذّر الرفع';
      } catch (e) { status.textContent = 'تعذّر الرفع'; }
      btn.removeAttribute('disabled'); file.value = '';
    });
    const wrap = h('div', {}, h('div', { class: 'imgpick' }, thumb, h('div', { style: 'flex:1' }, h('div', { class: 'row', style: 'margin:0' }, btn, status))), h('div', { style: 'margin-top:8px' }, urlInput));
    return { wrap, get value() { return urlInput.value; } };
  }

  /* ---------- المنتجات ---------- */
  async function products(el) {
    el.append(pageHead('المنتجات', 'الأسعار، المخزون، والصور'));
    const r = await api('products');
    const tb = h('tbody', {}, r.products.map(p => {
      const price = h('input', { type: 'number', min: 1, value: p.price }), old = h('input', { type: 'number', min: 0, value: p.old || '' }),
        stock = h('input', { type: 'number', min: 0, value: p.stock == null ? '' : p.stock, placeholder: 'غير محدود' }), hid = h('input', { type: 'checkbox', checked: !!p.hidden, style: 'width:auto' });
      let newImg = null;
      const save = async () => {
        const body = { price: price.value, old: old.value, stock: stock.value, hidden: hid.checked };
        if (newImg != null) body.img = newImg;
        const x = await api('products/' + encodeURIComponent(p.id), { method: 'POST', body });
        toast(x.ok ? 'تم الحفظ' : 'قيمة غير صالحة'); if (x.ok && newImg != null) shell();
      };
      const thumb = h('div', { class: 'pthumb', style: adminImg(p.img) ? `background-image:url('${adminImg(p.img)}')` : '' });
      const editImg = p.custom ? h('button', { class: 'btn sm', title: 'تغيير الصورة', onclick: () => imgDlg() }) : null;
      if (editImg) editImg.append(ic('camera'));
      function imgDlg() {
        const pic = imagePicker(p.img);
        const dlg = h('dialog', {}, h('div', { class: 'dlg-head' }, h('h3', {}, 'صورة ' + p.name), h('button', { class: 'btn sm ghost', onclick: () => dlg.close() }, '✕')),
          h('div', { class: 'dlg-pad' }, pic.wrap),
          h('div', { class: 'dlg-foot' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'إلغاء'),
            h('button', { class: 'btn pri', onclick: () => { newImg = pic.value; thumb.style.backgroundImage = newImg ? `url('${newImg}')` : ''; dlg.close(); toast('اضغط "حفظ" بالسطر لتثبيت الصورة'); } }, 'استخدام هذه الصورة')));
        document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
      }
      return h('tr', {}, h('td', {}, h('div', { class: 'prow' }, thumb, h('div', {}, h('b', {}, p.name), h('div', { class: 'mut' }, p.id, p.custom ? ' · مضاف' : '')))),
        h('td', {}, price), h('td', {}, old), h('td', {}, stock), h('td', {}, hid),
        h('td', {}, h('div', { class: 'row', style: 'margin:0' }, h('button', { class: 'btn sm pri', onclick: save }, 'حفظ'), editImg,
          p.custom ? h('button', { class: 'btn sm bad', onclick: async () => { if (confirm('حذف المنتج؟')) { await api('products/' + encodeURIComponent(p.id), { method: 'DELETE' }); shell(); } } }, ic('trash')) : null)));
    }));
    el.append(h('div', { class: 'card' }, h('button', { class: 'btn pri', onclick: addDlg }, '+ منتج جديد')),
      h('div', { class: 'card tw' }, h('table', { class: 'pt' }, h('thead', {}, h('tr', {}, ['المنتج', 'السعر', 'قبل الخصم', 'المخزون', 'مخفي', ''].map(t => h('th', {}, t)))), tb)));
    function addDlg() {
      const f = {}; const fld = (k, l, a = {}) => (f[k] = h(a.tag || 'input', a), [h('label', {}, l), f[k]]);
      const pic = imagePicker('');
      const dlg = h('dialog', {}, h('div', { class: 'dlg-head' }, h('h3', {}, 'منتج جديد'), h('button', { class: 'btn sm ghost', onclick: () => dlg.close() }, '✕')),
        h('div', { class: 'dlg-pad' },
          fld('name', 'الاسم'), h('label', {}, 'القسم'), (f.cat = h('select', {}, Object.entries(CATS).map(([k, v]) => h('option', { value: k }, v)))),
          fld('brand', 'العلامة', { value: 'لوتشي' }), fld('sub', 'وصف قصير تحت الاسم'),
          h('div', { class: 'row' }, h('div', {}, fld('price', 'السعر (ر.س)', { type: 'number', min: 1 })), h('div', {}, fld('old', 'قبل الخصم', { type: 'number', min: 0 })), h('div', {}, fld('stock', 'المخزون', { type: 'number', min: 0 }))),
          h('label', {}, 'صورة المنتج'), pic.wrap,
          fld('short', 'ملخص', { tag: 'textarea', rows: 2 }), fld('desc', 'الوصف', { tag: 'textarea', rows: 4 })),
        h('div', { class: 'dlg-foot' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'إلغاء'), h('button', { class: 'btn pri', onclick: async () => {
          const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])); body.img = pic.value;
          const x = await api('products', { method: 'POST', body });
          if (x.ok) { dlg.close(); shell(); toast('تمت الإضافة'); } else toast('تحقق من الحقول (الاسم، السعر، والصورة)');
        } }, 'إضافة')));
      document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }
  }

  /* ---------- الكوبونات ---------- */
  async function coupons(el) {
    el.append(pageHead('الكوبونات'));
    const r = await api('coupons');
    const code = h('input', { placeholder: 'الكود مثل RAMADAN', style: 'direction:ltr' }), pct = h('input', { type: 'number', min: 1, max: 90, placeholder: 'النسبة %' }),
      exp = h('input', { type: 'date', 'aria-label': 'ينتهي' }), note = h('input', { placeholder: 'ملاحظة' });
    el.append(h('div', { class: 'card row' }, code, pct, exp, note, h('button', { class: 'btn pri', onclick: async () => {
      const x = await api('coupons', { method: 'POST', body: { code: code.value, pct: pct.value, expires: exp.value, note: note.value } });
      if (x.ok) shell(); else toast('بيانات غير صالحة');
    } }, 'حفظ')),
      r.coupons.length ? h('div', { class: 'card tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['الكود', 'الخصم', 'الاستخدام', 'ينتهي', 'الحالة', ''].map(t => h('th', {}, t)))),
        h('tbody', {}, r.coupons.map(c => h('tr', {}, h('td', {}, c.code, c.note ? h('div', { class: 'mut' }, c.note) : null), h('td', {}, c.pct + '%'), h('td', {}, c.used), h('td', {}, c.expires ? dt(c.expires) : '—'),
          h('td', {}, h('button', { class: 'btn sm', onclick: async () => { await api('coupons', { method: 'POST', body: { code: c.code, pct: c.pct, active: !c.active, expires: c.expires ? new Date(c.expires + 10800000).toISOString().slice(0, 10) : '', note: c.note } }); shell(); } }, c.active ? 'فعّال' : 'موقوف')),
          h('td', {}, h('button', { class: 'btn sm bad', onclick: async () => { if (confirm('حذف الكوبون؟')) { await api('coupons/' + encodeURIComponent(c.code), { method: 'DELETE' }); shell(); } } }, ic('trash'))))))))
        : h('div', { class: 'card' }, empty('tag', 'لا توجد كوبونات بعد.')));
  }

  /* ---------- الإعدادات ---------- */
  async function settings(el) {
    el.append(pageHead('الإعدادات'));
    const s = await api('settings');
    const ff = h('input', { type: 'number', min: 0, value: s.free_from });
    el.append(h('div', { class: 'card' }, h('label', {}, 'الشحن مجاني للطلبات من (ر.س)'), ff,
      h('button', { class: 'btn pri', style: 'margin-top:10px', onclick: async () => { const x = await api('settings', { method: 'POST', body: { free_from: ff.value } }); toast(x.ok ? 'تم الحفظ' : 'قيمة غير صالحة'); } }, 'حفظ')),
      h('div', { class: 'card' }, h('b', {}, 'الدفع الإلكتروني (Moyasar)'),
        h('p', { class: 'mut' }, s.moyasar ? 'مفتاح Moyasar السري مفعّل: تُتحقق الدفعات من الخادم تلقائيا.' : 'مفتاح Moyasar السري غير مضاف بعد: الدفعات بالبطاقة تُحفظ لكن تظهر «غير مؤكد» حتى تضيف المفتاح (MOYASAR_SECRET_KEY) من إعدادات Cloudflare.')),
      h('div', { class: 'card' }, h('b', {}, 'كلمة سر لوحة التحكم'),
        h('p', { class: 'mut' }, 'لتغييرها: افتح Cloudflare → مشروع mirwaf → Settings → Environment variables (تبويب Production) → عدّل ADMIN_PASSWORD → احفظ → أعد النشر (Retry deployment).')));
  }

  api('me').then(r => (r.ok ? shell() : login())).catch(() => { });
})();
