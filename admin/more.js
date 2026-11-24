'use strict';
// العملاء، الكوبونات، الإعدادات (المتجر، الشحن، الدفع، البيانات).
(() => {
  const A = window.A, { h, ic, api, nf, money, dt } = A;

  /* ---------- العملاء ---------- */
  A.views.customers = async (el) => {
    const [r, ac] = await Promise.all([api('customers?sort=' + (A.state.csort || 'last')), api('accounts')]);
    if (!r.ok) return el.replaceChildren(A.empty('users', 'تعذّر التحميل'));
    const tab = A.state.ctab || 'orders';
    const q = h('input', { type: 'search', placeholder: 'بحث بالاسم أو الجوال أو المدينة…', 'aria-label': 'بحث', value: A.state.cq || '' });
    const body = h('div', {});
    const showOrders = () => {
      const t = q.value.trim().toLowerCase(); A.state.cq = q.value;
      const rows = r.customers.filter(c => !t || (c.name || '').toLowerCase().includes(t) || String(c.phone).includes(t) || (c.city || '').toLowerCase().includes(t));
      if (!rows.length) return body.replaceChildren(A.empty('users', 'لا يوجد عملاء'));
      body.replaceChildren(h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'العميل'), h('th', {}, 'الجوال'), h('th', { class: 'hide-m' }, 'المدينة'), h('th', {}, 'الطلبات'), h('th', {}, 'الإنفاق'), h('th', { class: 'hide-m' }, 'آخر طلب'), h('th', {}, ''))),
        h('tbody', {}, rows.map(c => h('tr', {}, h('td', {}, c.name, c.orders > 1 ? h('span', { class: 'badge b-ok', style: 'margin-inline-start:6px' }, 'متكرر') : null), h('td', { dir: 'ltr', style: 'text-align:end' }, c.phone), h('td', { class: 'hide-m' }, c.city),
          h('td', { class: 'num' }, nf(c.orders) + (c.cancelled ? ` (+${c.cancelled} ملغي)` : '')), h('td', { class: 'num' }, money(c.spent)), h('td', { class: 'hide-m sm' }, A.d(c.last)),
          h('td', {}, h('a', { class: 'btn sm', href: A.waLink(c.phone, 'هلا ' + (c.name || '').split(' ')[0] + '، معك لوتشي ☕'), target: '_blank', rel: 'noopener' }, ic('wa')))))))));
    };
    const showAccounts = () => {
      if (!ac.exists) return body.replaceChildren(A.empty('users', 'حسابات العملاء غير مفعّلة بعد'));
      if (!ac.accounts.length) return body.replaceChildren(A.empty('users', 'لا توجد حسابات مسجّلة بعد'));
      body.replaceChildren(h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الاسم'), h('th', {}, 'البريد'), h('th', {}, 'الجوال'), h('th', {}, 'التحقق'), h('th', { class: 'hide-m' }, 'التسجيل'))),
        h('tbody', {}, ac.accounts.map(a => h('tr', {}, h('td', {}, a.name || '—'), h('td', { dir: 'ltr', style: 'text-align:end' }, a.email || '—'), h('td', { dir: 'ltr', style: 'text-align:end' }, a.phone || '—'), h('td', {}, a.phone_verified ? h('span', { class: 'badge b-ok' }, 'موثّق') : h('span', { class: 'badge' }, 'غير موثّق')), h('td', { class: 'hide-m sm' }, A.d(a.created_at))))))));
    };
    const draw = () => tab === 'accounts' ? showAccounts() : showOrders();
    q.addEventListener('input', A.debounce(() => { if (tab !== 'accounts') showOrders(); }, 150));
    const tabBtn = (k, t, n) => h('button', { class: 'tab', 'aria-pressed': String(tab === k), onclick: () => { A.state.ctab = k; A.reload(); } }, t, h('span', { class: 'n' }, n));
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { class: 'tabs', style: 'margin:0' }, tabBtn('orders', 'من الطلبات', r.total), ac.exists ? tabBtn('accounts', 'الحسابات المسجّلة', ac.accounts.length) : null), h('div', { class: 'sp' }), tab !== 'accounts' ? [h('div', { style: 'min-width:200px;flex:1;max-width:320px' }, q), h('button', { class: 'btn', onclick: () => A.download('customers?format=csv') }, ic('down'), 'تصدير CSV')] : null), body);
    draw();
  };

  /* ---------- الكوبونات ---------- */
  function couponForm(c) {
    const code = h('input', { type: 'text', dir: 'ltr', value: c ? c.code : '', disabled: !!c, maxlength: 40, style: 'text-transform:uppercase' });
    const pct = h('input', { type: 'number', min: 1, max: 90, value: c ? c.pct : 10 });
    const exp = h('input', { type: 'date', value: c && c.expires ? new Date(c.expires + 3 * 3600000).toISOString().slice(0, 10) : '' });
    const mx = h('input', { type: 'number', min: 1, value: c && c.max_uses ? c.max_uses : '', placeholder: 'بلا حد' });
    const note = h('input', { type: 'text', value: c ? c.note || '' : '', maxlength: 120 });
    const act = h('input', { type: 'checkbox', checked: c ? !!c.active : true });
    return { el: h('div', {}, A.field('الكود', code, 'أحرف إنجليزية وأرقام فقط'), h('div', { class: 'fgrid' }, A.field('نسبة الخصم ٪', pct), A.field('ينتهي في', exp, 'اختياري'), A.field('أقصى عدد استخدامات', mx), A.field('ملاحظة', note)), h('label', { class: 'chk' }, act, 'مفعّل')), body: () => ({ code: code.value, pct: pct.value, expires: exp.value, max_uses: mx.value, note: note.value, active: act.checked }) };
  }
  A.views.coupons = async (el) => {
    const r = await api('coupons');
    if (!r.ok) return el.replaceChildren(A.empty('tag', 'تعذّر التحميل'));
    const edit = async (c) => { const f = couponForm(c); const ok = await A.modal(c ? 'تعديل الكوبون' : 'كوبون جديد', f.el, [{ t: 'إلغاء', val: false }, { t: 'حفظ', cls: 'pri', fn: async () => (await A.save('coupons', { method: 'POST', body: f.body() }, 'تم حفظ الكوبون')).ok }]); if (ok) A.reload(); };
    const now = Date.now();
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { class: 'sp' }), h('button', { class: 'btn pri', onclick: () => edit(null) }, ic('plus'), 'كوبون جديد')),
      r.coupons.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الكود'), h('th', {}, 'الخصم'), h('th', {}, 'الاستخدام'), h('th', { class: 'hide-m' }, 'ينتهي'), h('th', {}, 'الحالة'), h('th', {}, ''))),
        h('tbody', {}, r.coupons.map(c => { const expd = c.expires && c.expires < now; return h('tr', {}, h('td', { dir: 'ltr', style: 'text-align:end' }, h('b', {}, c.code), c.note ? h('div', { class: 'sm mut' }, c.note) : null), h('td', { class: 'num' }, c.pct + '٪'), h('td', { class: 'num' }, nf(c.used) + (c.max_uses ? ' / ' + nf(c.max_uses) : '')), h('td', { class: 'hide-m sm' }, c.expires ? A.d(c.expires) : '—'),
          h('td', {}, expd ? h('span', { class: 'badge b-bad' }, 'منتهي') : c.active ? h('span', { class: 'badge b-ok' }, 'مفعّل') : h('span', { class: 'badge' }, 'موقوف')),
          h('td', {}, h('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' }, h('button', { class: 'btn sm', onclick: () => edit(c) }, ic('edit')), h('button', { class: 'btn sm', onclick: async () => { const x = await A.save('coupons', { method: 'POST', body: { code: c.code, pct: c.pct, expires: c.expires ? new Date(c.expires + 3 * 3600000).toISOString().slice(0, 10) : '', max_uses: c.max_uses || '', note: c.note || '', active: !c.active } }, c.active ? 'تم الإيقاف' : 'تم التفعيل'); if (x.ok) A.reload(); } }, c.active ? 'إيقاف' : 'تفعيل'),
            h('button', { class: 'btn sm bad', 'aria-label': 'حذف', onclick: async () => { if (await A.confirm('حذف الكوبون', `حذف الكوبون ${c.code}؟ الطلبات السابقة لا تتأثر.`, 'حذف', true)) { const x = await A.save('coupons/' + encodeURIComponent(c.code), { method: 'DELETE' }, 'تم الحذف'); if (x.ok) A.reload(); } } }, ic('trash'))))); })))) : A.empty('tag', 'لا توجد كوبونات', 'أنشئ كوبونًا لعملائك'));
  };

  /* ---------- الإعدادات ---------- */
  A.views.settings = async (el) => {
    const r = await api('settings');
    if (!r.ok) return el.replaceChildren(A.empty('gear', 'تعذّر التحميل'));
    const s = r.settings, F = {};
    const t = (k, label, props, hint) => { F[k] = h('input', Object.assign({ type: 'text', value: s[k] || '' }, props || {})); return A.field(label, F[k], hint); };
    const enabled = new Set(String(s.carriers_enabled || '').split(',').filter(Boolean));
    const carBoxes = Object.entries(r.carriers).map(([k, v]) => { const c = h('input', { type: 'checkbox', checked: enabled.has(k), onchange: () => { c.checked ? enabled.add(k) : enabled.delete(k); } }); return h('label', { class: 'chk', style: 'margin-bottom:6px' }, c, v.name, v.track ? null : h('span', { class: 'sm mut' }, ' (بدون رابط تتبع)')); });
    const defC = h('select', { 'aria-label': 'شركة الشحن الافتراضية' }, h('option', { value: '' }, '— بدون —'), Object.entries(r.carriers).map(([k, v]) => h('option', { value: k, selected: s.default_carrier === k }, v.name)));
    const cardOn = h('input', { type: 'checkbox', checked: s.pay_card_on !== '0' }), waOn = h('input', { type: 'checkbox', checked: s.pay_wa_on !== '0' });
    const saveSec = (keys, extra) => async () => {
      Object.values(F).forEach(x => x.classList.remove('bad'));
      const body = {}; keys.forEach(k => body[k] = F[k].value); Object.assign(body, extra ? extra() : {});
      const x = await A.save('settings', { method: 'POST', body }, 'تم حفظ الإعدادات'); if (!x.ok && x.field && F[x.field]) F[x.field].classList.add('bad');
    };
    const status = (ok, on, off) => h('span', { class: 'badge ' + (ok ? 'b-ok' : 'b-warn') }, ok ? on : off);
    const health = h('div', {}, h('button', { class: 'btn', onclick: async (e) => {
      const x = await api('health'); if (!x.ok) return A.toast('تعذّر الفحص', true);
      health.replaceChildren(h('dl', { class: 'kv' }, h('dt', {}, 'الطلبات'), h('dd', {}, nf(x.tables.orders)), h('dt', {}, 'المنتجات (الكتالوج)'), h('dd', {}, nf(x.products_total)), h('dt', {}, 'الكوبونات'), h('dd', {}, nf(x.tables.coupons)), h('dt', {}, 'سجل الأحداث'), h('dd', {}, nf(x.tables.order_events)), h('dt', {}, 'آخر طلب'), h('dd', {}, x.last_order ? dt(x.last_order) : '—')),
        x.issues.length ? h('div', { class: 'stack', style: 'margin-top:10px' }, x.issues.map(i => h('div', { class: 'callout ' + (i.level === 'bad' ? 'bad' : i.level === 'warn' ? 'warn' : 'info') }, i.text))) : h('div', { class: 'callout ok', style: 'margin-top:10px' }, 'لا توجد مشاكل في البيانات'));
    } }, 'فحص سلامة البيانات'));
    const sync = h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; const x = await A.save('stream/sync', { method: 'POST', body: {} }); e.target.disabled = false; if (x.ok) A.toast('اكتملت المزامنة' + (x.created != null ? ` (${x.created} جديد)` : '')); } }, 'مزامنة المنتجات مع Stream');
    el.replaceChildren(h('div', { class: 'grid g2' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', {}, ic('store'), 'معلومات المتجر'), t('store_name', 'اسم المتجر', { maxlength: 60 }), t('whatsapp_display', 'رقم واتساب (بصيغة دولية)', { dir: 'ltr', placeholder: '9665XXXXXXXX' }, 'أرقام فقط، يظهر للعملاء'), t('store_email', 'البريد', { type: 'email', dir: 'ltr' }), t('store_address', 'عنوان المتجر'), t('announcement', 'شريط الإعلان', { maxlength: 160 }, 'يظهر أعلى المتجر؛ اتركه فارغًا للإخفاء'), h('button', { class: 'btn pri', onclick: saveSec(['store_name', 'whatsapp_display', 'store_email', 'store_address', 'announcement']) }, 'حفظ')),
        h('div', { class: 'card' }, h('h3', {}, ic('truck'), 'الشحن'), h('div', { class: 'fgrid' }, t('free_from', 'الشحن مجاني من (ر.س)', { type: 'number', min: 0 }, 'يطبَّق في السلة وعلى الطلبات'), t('ship_fee', 'رسوم الشحن الثابتة (ر.س)', { type: 'number', min: 0 }, 'محفوظة للمرجع؛ لا تُضاف حاليًا إلى إجمالي السلة')),
          h('label', {}, 'شركات الشحن المفعّلة'), h('div', { style: 'margin-bottom:10px' }, carBoxes), A.field('الشركة الافتراضية', defC),
          h('div', { class: 'stack', style: 'margin-bottom:12px' }, h('div', { class: 'row' }, 'التحقق من العنوان الوطني (OTO أو سبل): ', status(r.spl, 'متصل', 'غير متصل — أضف OTO_REFRESH_TOKEN أو SPL_API_KEY في Cloudflare')), h('div', { class: 'row' }, 'ربط Aramex / شركات أخرى عبر API: ', h('span', { class: 'badge' }, 'غير متصل بعد'))),
          h('button', { class: 'btn pri', onclick: saveSec(['free_from', 'ship_fee'], () => ({ carriers_enabled: [...enabled].join(','), default_carrier: defC.value })) }, 'حفظ'))),
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', {}, 'الدفع'), h('div', { class: 'stack' }, h('label', { class: 'chk' }, cardOn, 'تفعيل الدفع الإلكتروني (Stream)'), h('label', { class: 'chk' }, waOn, 'تفعيل الطلب عبر واتساب'),
          h('div', { class: 'row' }, 'Stream: ', status(r.stream, 'مفعّل', 'غير مضبوط'), 'ويب هوك: ', status(r.webhook, 'مضبوط', 'غير مضبوط')),
          h('div', { class: 'sm mut' }, 'رابط الويب هوك: ', h('code', { dir: 'ltr' }, location.origin + '/api/pay/webhook')), h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: saveSec([], () => ({ pay_card_on: cardOn.checked ? '1' : '0', pay_wa_on: waOn.checked ? '1' : '0' })) }, 'حفظ'), r.stream ? sync : null))),
        h('div', { class: 'card' }, h('h3', {}, 'الأمان'), h('p', { class: 'mut', style: 'margin:0' }, 'كلمة سر الأدمن تُدار من Cloudflare فقط (متغير ADMIN_PASSWORD بطول 12 حرفًا على الأقل). لتغييرها: عدّل المتغير ثم أعد النشر، وسجّل الخروج لإنهاء الجلسات الحالية.')),
        h('div', { class: 'card' }, h('h3', {}, 'البيانات والنسخ الاحتياطي'), h('div', { class: 'row', style: 'margin-bottom:12px' }, h('button', { class: 'btn', onclick: () => A.download('backup') }, ic('down'), 'نسخة احتياطية JSON'), h('button', { class: 'btn', onclick: () => A.download('export') }, ic('down'), 'الطلبات CSV'), h('button', { class: 'btn', onclick: () => A.download('customers?format=csv') }, ic('down'), 'العملاء CSV')), health))));
  };
})();
