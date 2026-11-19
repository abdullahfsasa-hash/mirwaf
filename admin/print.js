'use strict';
// طباعة الفاتورة (A4) وملصق الشحن (10×15 سم). كل البيانات تُدرج كنص عبر createTextNode.
(async () => {
  const q = new URLSearchParams(location.search), ref = q.get('ref') || '', type = q.get('type') === 'label' ? 'label' : 'invoice';
  const out = document.getElementById('out');
  document.getElementById('pb').addEventListener('click', () => window.print());
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) { if (k === 'class') e.className = v; else if (v != null && v !== false) e.setAttribute(k, v); }
    for (const c of kids.flat(2)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const nf = n => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
  const dt = t => new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium' });
  const CAR = { aramex: 'Aramex', smsa: 'SMSA', jt: 'J&T Express', naqel: 'Naqel', spl: 'البريد السعودي (SPL)', zajil: 'زاجل', other: 'أخرى' };
  let r, s = {};
  try {
    r = await fetch('/api/admin/orders/' + encodeURIComponent(ref), { credentials: 'same-origin' }).then(x => x.json());
    s = (await fetch('/api/admin/settings', { credentials: 'same-origin' }).then(x => x.json())).settings || {};
  } catch (e) { r = {}; }
  if (!r.ok) { out.replaceChildren(h('p', { class: 'page a4' }, 'تعذّر تحميل الطلب. تأكد من تسجيل الدخول للوحة التحكم.')); return; }
  const o = r.order, store = s.store_name || 'لوتشي';
  const addr = [
    o.addr_short ? ['العنوان المختصر', h('span', { class: 'ltr' }, o.addr_short)] : null,
    o.addr_building ? ['رقم المبنى', o.addr_building] : null, o.addr_street ? ['الشارع', o.addr_street] : null, o.addr_district ? ['الحي', o.addr_district] : null,
    ['المدينة', o.city], o.addr_post ? ['الرمز البريدي', o.addr_post] : null, o.addr_extra ? ['الرقم الإضافي', o.addr_extra] : null
  ].filter(Boolean);
  const addrBlock = () => h('div', {}, addr.map(([k, v]) => h('div', {}, h('span', { class: 'mut' }, k + ': '), v)), o.address ? h('div', { class: 'mut' }, o.address) : null);
  if (type === 'invoice') {
    document.title = 'فاتورة ' + o.ref;
    out.replaceChildren(h('div', { class: 'page a4' },
      h('div', { class: 'hd' }, h('div', {}, h('h1', {}, store), s.store_address ? h('div', { class: 'mut' }, s.store_address) : null, s.whatsapp_display ? h('div', { class: 'mut' }, 'واتساب: ', h('span', { class: 'ltr' }, '+' + s.whatsapp_display)) : null), h('div', { style: 'text-align:end' }, h('div', { class: 'big' }, 'فاتورة'), h('div', {}, 'رقم الطلب: ', h('b', { class: 'ltr' }, '#' + o.ref)), h('div', { class: 'mut' }, dt(o.created_at)))),
      h('div', { class: 'two' }, h('div', {}, h('h2', {}, 'بيانات العميل'), h('div', {}, o.name), h('div', {}, h('span', { class: 'ltr' }, o.phone))), h('div', {}, h('h2', {}, 'عنوان التوصيل (العنوان الوطني)'), addrBlock())),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'المنتج'), h('th', {}, 'الكمية'), h('th', {}, 'السعر'), h('th', {}, 'الإجمالي'))),
        h('tbody', {}, o.items.map(i => h('tr', {}, h('td', {}, i.name, i.v ? ' — ' + i.v : ''), h('td', {}, i.qty), h('td', {}, nf(i.price)), h('td', {}, nf(i.qty * i.price)))))),
      h('div', { class: 'tot' }, h('div', {}, h('span', {}, 'المجموع الفرعي'), h('span', {}, nf(o.subtotal) + ' ر.س')), o.discount ? h('div', {}, h('span', {}, 'الخصم' + (o.coupon ? ' (' + o.coupon + ')' : '')), h('span', {}, '− ' + nf(o.discount) + ' ر.س')) : null, h('div', {}, h('span', {}, 'الشحن'), h('span', {}, o.free_shipping ? 'مجاني' : '—')), h('div', { class: 'g' }, h('span', {}, 'الإجمالي'), h('span', {}, nf(o.total) + ' ر.س'))),
      h('p', { class: 'mut' }, 'طريقة الدفع: ' + (o.method === 'card' ? (o.pay_verified ? 'دفع إلكتروني (مدفوع)' : 'دفع إلكتروني') : 'واتساب / عند التأكيد')),
      h('div', { class: 'foot' }, 'شكرًا لتسوّقكم من ' + store)));
  } else {
    document.title = 'ملصق ' + o.ref;
    out.replaceChildren(h('div', { class: 'page lab' },
      h('div', { class: 'hd', style: 'margin:0;padding-bottom:4px' }, h('b', {}, store), h('b', { class: 'ltr' }, '#' + o.ref)),
      h('div', { class: 'box' }, h('div', { class: 'mut' }, 'إلى'), h('div', { class: 'big' }, o.name), h('div', { class: 'big ltr', style: 'font-size:18px' }, o.phone)),
      h('div', { class: 'box' }, o.addr_short ? h('div', { class: 'big ltr' }, o.addr_short) : null, addrBlock()),
      h('div', {}, 'المحتويات: ', o.items.map(i => i.name + ' ×' + i.qty).join('، ')),
      o.carrier ? h('div', {}, 'الشحن: ', CAR[o.carrier] || o.carrier, o.tracking_no ? [' · ', h('b', { class: 'ltr' }, o.tracking_no)] : '') : null,
      o.method === 'wa' || !o.pay_verified ? h('div', { class: 'box big', style: 'text-align:center' }, 'المبلغ: ' + nf(o.total) + ' ر.س') : h('div', { class: 'box', style: 'text-align:center' }, 'مدفوع إلكترونيًا'),
      h('div', { class: 'foot' }, 'ملاحظات: ' + (o.notes || '—'))));
  }
})();
