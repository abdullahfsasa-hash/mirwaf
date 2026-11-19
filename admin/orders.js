'use strict';
// قسم الطلبات: القائمة، التفاصيل، التعديل، الشحن، الطباعة، رسائل واتساب.
(() => {
  const A = window.A, { h, ic, api, nf, money, dt } = A;
  const S = A.state;
  const METHOD = { card: 'دفع إلكتروني', wa: 'واتساب' };

  /* ---------- رسائل واتساب ---------- */
  const waText = (o) => {
    const name = (o.name || '').split(' ')[0] || 'عميلنا';
    const link = A.trackUrl(o.carrier, o.tracking_no);
    switch (o.status) {
      case 'confirmed': return `هلا ${name}، تم تأكيد طلبك #${o.ref} من لوتشي بمبلغ ${A.nf(o.total)} ر.س. نجهّزه لك الحين ونبلغك أول ما يُشحن. شكرًا لثقتك ☕`;
      case 'shipped': return `هلا ${name}، طلبك #${o.ref} من لوتشي انشحن 🚚` + (o.carrier ? `\nشركة الشحن: ${A.CARRIER_NAMES[o.carrier] || o.carrier}` : '') + (o.tracking_no ? `\nرقم التتبع: ${o.tracking_no}` : '') + (link ? `\nتتبّع شحنتك: ${link}` : '') + `\nنتمنى لك قهوة هنية!`;
      case 'done': return `هلا ${name}، نأمل أن طلبك #${o.ref} وصلك وعجبك. رأيك يهمنا، وإذا احتجت أي شي نحن بالخدمة ☕`;
      case 'cancelled': return `هلا ${name}، تم إلغاء طلبك #${o.ref}. إذا تحب نساعدك بطلب جديد أو عندك أي استفسار، تواصل معنا.`;
      default: return `هلا ${name}، وصلنا طلبك #${o.ref} من لوتشي بمبلغ ${A.nf(o.total)} ر.س، ونراجعه ونتواصل معك قريبًا. شكرًا لك ☕`;
    }
  };

  const payBlock = (o) => {
    const rows = [['طريقة الدفع', METHOD[o.method] || o.method]];
    if (o.method === 'card') rows.push(['حالة الدفع', o.pay_verified ? h('span', { class: 'badge b-ok' }, 'مدفوع ومؤكَّد') : h('span', { class: 'badge b-warn' }, o.pay_status || 'غير مدفوع')], ['فاتورة Stream', o.pay_id || '—']);
    return h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  };

  /* ---------- القائمة ---------- */
  async function list(el) {
    const f = S.of || (S.of = { status: '', method: '', paid: '', from: '', to: '', q: '', sort: 'created', dir: 'desc', offset: 0 });
    if (S.status != null) { f.status = S.status === 'all' ? '' : S.status; S.status = null; f.offset = 0; }
    if (S.q != null) { f.q = S.q; S.q = null; f.offset = 0; }
    const sel = new Set();
    const body = h('div', {});
    const bar = h('div', { class: 'bulk', style: 'display:none' });
    const load = async () => {
      const qs = new URLSearchParams({ status: f.status, method: f.method, paid: f.paid, from: f.from, to: f.to, q: f.q, sort: f.sort, dir: f.dir, limit: 30, offset: f.offset });
      for (const [k, v] of [...qs]) if (!v) qs.delete(k);
      body.replaceChildren(A.skel(6));
      const r = await api('orders?' + qs);
      if (!r.ok) return body.replaceChildren(A.empty('inbox', 'تعذّر التحميل'));
      A.setBadge(r.counts.new);
      sel.clear(); refreshBar();
      tabs.replaceChildren(...[['', 'الكل', Object.values(r.counts).reduce((a, b) => a + b, 0)], ...A.STK.map(k => [k, A.ST[k], r.counts[k] || 0])].map(([k, t, n]) => h('button', { class: 'tab', 'aria-pressed': String(f.status === k), onclick: () => { f.status = k; f.offset = 0; load(); } }, t, h('span', { class: 'n' }, n))));
      if (!r.orders.length) return body.replaceChildren(A.empty('receipt', 'لا توجد طلبات مطابقة', 'جرّب تغيير الفلاتر أو البحث'));
      const th = (k, t) => h('th', { class: 'sort', onclick: () => { f.dir = f.sort === k && f.dir === 'desc' ? 'asc' : 'desc'; f.sort = k; load(); } }, t, f.sort === k ? (f.dir === 'desc' ? ' ▾' : ' ▴') : '');
      const all = h('input', { type: 'checkbox', 'aria-label': 'تحديد الكل', onchange: e => { body.querySelectorAll('.rowchk').forEach(c => { c.checked = e.target.checked; e.target.checked ? sel.add(c.dataset.ref) : sel.delete(c.dataset.ref); }); refreshBar(); } });
      const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', { class: 'chkc' }, all), th('created', 'الطلب'), th('name', 'العميل'), h('th', { class: 'hide-m' }, 'الدفع'), th('total', 'المبلغ'), th('status', 'الحالة'))),
        h('tbody', {}, r.orders.map(o => h('tr', { class: 'click', onclick: e => { if (e.target.closest('.chkc')) return; A.go('orders/' + o.ref); } },
          h('td', { class: 'chkc' }, h('input', { type: 'checkbox', class: 'rowchk', 'data-ref': o.ref, 'aria-label': 'تحديد ' + o.ref, onchange: e => { e.target.checked ? sel.add(o.ref) : sel.delete(o.ref); refreshBar(); } })),
          h('td', {}, h('b', { class: 'num' }, '#' + o.ref), h('div', { class: 'sm mut' }, dt(o.created_at))),
          h('td', {}, o.name, h('div', { class: 'sm mut' }, o.city), o.addr_missing ? h('span', { class: 'badge b-warn', title: 'العنوان الوطني ناقص' }, ic('pin'), 'عنوان ناقص') : null),
          h('td', { class: 'hide-m' }, o.method === 'card' ? h('span', { class: 'badge ' + (o.pay_verified ? 'b-ok' : 'b-warn') }, o.pay_verified ? 'مدفوع' : 'إلكتروني · غير مدفوع') : h('span', { class: 'badge' }, 'واتساب')),
          h('td', { class: 'num' }, nf(o.total) + ' ر.س'), h('td', {}, A.badge(o.status))))));
      const pages = Math.ceil(r.total / 30), cur = Math.floor(f.offset / 30);
      body.replaceChildren(h('div', { class: 'tw' }, tbl),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('span', { class: 'mut sm' }, `${nf(r.total)} طلب · إجمالي ${money(r.sum)} (دون الملغي)`), h('div', { class: 'sp' }),
          pages > 1 ? [h('button', { class: 'btn sm', disabled: cur === 0, onclick: () => { f.offset -= 30; load(); } }, 'السابق'), h('span', { class: 'sm' }, `${cur + 1} / ${pages}`), h('button', { class: 'btn sm', disabled: cur + 1 >= pages, onclick: () => { f.offset += 30; load(); } }, 'التالي')] : null));
    };
    const refreshBar = () => {
      bar.style.display = sel.size ? '' : 'none';
      bar.replaceChildren(h('b', {}, sel.size + ' محدد'), ...A.STK.map(k => h('button', { class: 'btn sm', onclick: async () => { if (!await A.confirm('تغيير الحالة', `تغيير حالة ${sel.size} طلب إلى «${A.ST[k]}»؟` + (k === 'cancelled' ? ' سيُعاد المخزون.' : ''), 'تأكيد', k === 'cancelled')) return; const r = await A.save('orders-bulk', { method: 'POST', body: { refs: [...sel], status: k } }); if (r.ok) { A.toast(`تم تحديث ${r.updated} طلب` + (r.skipped ? ` (تخطّي ${r.skipped})` : '')); load(); } } }, A.ST[k])));
    };
    const tabs = h('div', { class: 'tabs' });
    const q = h('input', { type: 'search', placeholder: 'بحث…', value: f.q, 'aria-label': 'بحث في الطلبات', oninput: A.debounce(e => { f.q = e.target.value.trim(); f.offset = 0; load(); }) });
    const sl = (key, opts, label) => h('select', { 'aria-label': label, onchange: e => { f[key] = e.target.value; f.offset = 0; load(); } }, opts.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
    const date = (key, label) => h('input', { type: 'date', value: f[key], 'aria-label': label, onchange: e => { f[key] = e.target.value; f.offset = 0; load(); } });
    el.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { style: 'flex:1;min-width:200px' }, q), sl('method', [['', 'كل طرق الدفع'], ['card', 'دفع إلكتروني'], ['wa', 'واتساب']], 'طريقة الدفع'), sl('paid', [['', 'كل حالات الدفع'], ['1', 'مدفوع'], ['0', 'غير مدفوع']], 'حالة الدفع'),
        h('span', { class: 'sm mut' }, 'من'), date('from', 'من تاريخ'), h('span', { class: 'sm mut' }, 'إلى'), date('to', 'إلى تاريخ'), h('button', { class: 'btn', onclick: () => A.download('export') }, ic('down'), 'تصدير CSV')),
      tabs, bar, body);
    await load();
  }

  /* ---------- التفاصيل ---------- */
  async function detail(el, ref) {
    const r = await api('orders/' + encodeURIComponent(ref));
    if (!r.ok) return el.replaceChildren(A.empty('receipt', 'الطلب غير موجود'), h('div', { style: 'text-align:center' }, h('a', { href: '#orders', class: 'btn' }, 'رجوع')));
    const o = r.order, locked = o.status === 'cancelled';
    const refresh = () => A.reload();

    const setStatus = async (st) => {
      if (st === o.status) return;
      if (st === 'cancelled' && !await A.confirm('إلغاء الطلب', 'سيُعاد المخزون وتُخصم استخدامات الكوبون. لا يمكن التراجع عن الإلغاء.', 'إلغاء الطلب', true)) return;
      const x = await A.save('orders/' + o.ref + '/status', { method: 'POST', body: { status: st } }, 'تم تحديث الحالة');
      if (!x.ok) return;
      if (st === 'shipped' || st === 'confirmed' || st === 'done') {
        const o2 = { ...o, status: st };
        if (await A.confirm('إبلاغ العميل', 'تحب ترسل للعميل رسالة واتساب بتحديث الحالة؟', 'فتح واتساب')) window.open(A.waLink(o.phone, waText(o2)), '_blank', 'noopener');
      }
      refresh();
    };

    const stepper = h('div', { class: 'stepper' + (locked ? ' cancelled' : '') }, ['new', 'confirmed', 'shipped', 'done'].map((k, i) => {
      const idx = ['new', 'confirmed', 'shipped', 'done'].indexOf(o.status);
      return h('button', { class: 'step' + (i <= idx ? ' on' : '') + (i === idx ? ' cur' : ''), onclick: () => setStatus(k) }, A.ST[k]);
    }));

    /* عميل */
    const cf = {};
    const inp = (k, label, props, hint) => { cf[k] = h('input', Object.assign({ type: 'text', value: o[k] || '' }, props || {})); return A.field(label, cf[k], hint); };
    const custCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('span', { class: 'grow' }, 'بيانات العميل والعنوان الوطني'), r.customer.orders ? h('span', { class: 'badge' }, `عميل سابق: ${r.customer.orders} طلب`) : h('span', { class: 'badge b-new' }, 'عميل جديد')),
      o.addr_missing ? h('div', { class: 'callout warn', style: 'margin-bottom:12px' }, 'العنوان الوطني غير مكتمل — يلزم العنوان المختصر أو (رقم المبنى + الرمز البريدي) لشحن الطلب.') : null,
      h('div', { class: 'fgrid' },
        inp('name', 'الاسم'), inp('phone', 'الجوال', { type: 'tel', inputmode: 'tel', dir: 'ltr' }), inp('city', 'المدينة'), inp('addr_district', 'الحي'),
        inp('addr_street', 'الشارع'), inp('addr_short', 'العنوان المختصر', { dir: 'ltr', maxlength: 9, placeholder: 'RRRD2929' }, '4 حروف + 4 أرقام'),
        inp('addr_building', 'رقم المبنى', { dir: 'ltr', inputmode: 'numeric', maxlength: 4 }, '4 أرقام'), inp('addr_post', 'الرمز البريدي', { dir: 'ltr', inputmode: 'numeric', maxlength: 5 }, '5 أرقام'),
        inp('addr_extra', 'الرقم الإضافي', { dir: 'ltr', inputmode: 'numeric', maxlength: 4 }, '4 أرقام'),
        h('div', { class: 'f full' }, h('label', {}, 'العنوان (نص)'), (cf.address = h('textarea', {}, o.address || ''))),
        h('div', { class: 'f full' }, h('label', {}, 'ملاحظات العميل'), (cf.notes = h('textarea', {}, o.notes || '')))),
      h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: async (e) => {
        const body = {}; for (const [k, c] of Object.entries(cf)) body[k] = c.value;
        Object.values(cf).forEach(c => c.classList.remove('bad'));
        const x = await A.save('orders/' + o.ref + '/update', { method: 'POST', body }, 'تم حفظ البيانات');
        if (x.ok) refresh(); else if (x.field && cf[x.field]) cf[x.field].classList.add('bad');
      } }, 'حفظ البيانات'), h('a', { class: 'btn', href: A.waLink(o.phone, waText(o)), target: '_blank', rel: 'noopener' }, ic('wa'), 'واتساب العميل')));

    /* شحن */
    const carSel = h('select', { 'aria-label': 'شركة الشحن' }, h('option', { value: '' }, '— اختر —'), Object.entries(A.CARRIER_NAMES).map(([k, t]) => h('option', { value: k, selected: o.carrier === k }, t)));
    const trk = h('input', { type: 'text', dir: 'ltr', value: o.tracking_no || '', placeholder: 'رقم الشحنة', 'aria-label': 'رقم التتبع' });
    const tu = A.trackUrl(o.carrier, o.tracking_no);
    const shipCard = h('div', { class: 'card' }, h('h3', {}, ic('truck'), 'الشحن والتتبع'),
      h('div', { class: 'fgrid' }, A.field('شركة الشحن', carSel), A.field('رقم التتبع', trk)),
      o.shipped_at ? h('div', { class: 'sm mut', style: 'margin-bottom:8px' }, 'تاريخ الشحن: ' + dt(o.shipped_at)) : null,
      tu ? h('div', { class: 'sm', style: 'margin-bottom:8px' }, 'رابط التتبع: ', h('a', { href: tu, target: '_blank', rel: 'noopener noreferrer' }, 'فتح صفحة التتبع')) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => { const x = await A.save('orders/' + o.ref + '/update', { method: 'POST', body: { carrier: carSel.value, tracking_no: trk.value } }, 'تم حفظ بيانات الشحن'); if (x.ok) refresh(); else trk.classList.add('bad'); } }, 'حفظ'),
        h('button', { class: 'btn pri', disabled: locked || o.status === 'shipped' || o.status === 'done', onclick: async () => {
          if (o.addr_missing && !await A.confirm('العنوان ناقص', 'العنوان الوطني غير مكتمل. تبي تعلّم الطلب «تم الشحن» رغم ذلك؟', 'متابعة')) return;
          const x = await A.save('orders/' + o.ref + '/update', { method: 'POST', body: { carrier: carSel.value, tracking_no: trk.value } }); if (!x.ok) return;
          await setStatus('shipped');
        } }, ic('truck'), 'تم الشحن + إشعار العميل')));

    /* بنود */
    const itemsCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('span', { class: 'grow' }, 'المنتجات'), !locked && !o.pay_verified ? h('button', { class: 'btn sm', onclick: () => editItems(o, refresh) }, ic('edit'), 'تعديل البنود') : null),
      h('div', { class: 'tw' }, h('table', {}, h('tbody', {}, o.items.map(it => h('tr', {}, h('td', {}, it.name, it.v ? h('div', { class: 'sm mut' }, it.v) : null), h('td', { class: 'num' }, it.qty + ' ×'), h('td', { class: 'num' }, nf(it.price)), h('td', { class: 'num' }, nf(it.qty * it.price) + ' ر.س')))))),
      h('dl', { class: 'kv', style: 'margin-top:12px' }, h('dt', {}, 'المجموع الفرعي'), h('dd', { class: 'num' }, money(o.subtotal)),
        o.discount ? [h('dt', {}, 'الخصم' + (o.coupon ? ` (${o.coupon} · ${o.coupon_pct}٪)` : '')), h('dd', { class: 'num down' }, '− ' + money(o.discount))] : null,
        h('dt', {}, 'الشحن'), h('dd', {}, o.free_shipping ? 'مجاني' : 'يُحدَّد عند الشحن'), h('dt', {}, h('b', {}, 'الإجمالي')), h('dd', { class: 'num' }, h('b', {}, money(o.total)))),
      o.pay_verified ? h('div', { class: 'hint' }, 'الطلب مدفوع إلكترونيًا؛ تعديل البنود مقفل.') : null);

    /* دفع */
    const verInp = h('input', { type: 'text', dir: 'ltr', placeholder: 'معرّف فاتورة Stream', 'aria-label': 'معرّف الفاتورة' });
    const payCard = h('div', { class: 'card' }, h('h3', {}, 'الدفع'), payBlock(o),
      o.method === 'card' && !o.pay_verified && !locked ? h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { style: 'flex:1;min-width:160px' }, verInp), h('button', { class: 'btn sm', onclick: async () => { if (!verInp.value.trim()) return; const x = await A.save('orders/' + o.ref + '/verify', { method: 'POST', body: { id: verInp.value.trim() } }); if (x.ok === false) return; A.toast(x.verified || x.paid ? 'تم تأكيد الدفع' : 'لم يتأكد الدفع بعد', !(x.verified || x.paid)); refresh(); } }, 'تحقق يدويًا')) : null);

    /* خط زمني وملاحظات */
    const note = h('textarea', { placeholder: 'ملاحظة داخلية (لا يراها العميل)…', 'aria-label': 'ملاحظة داخلية' });
    const tl = h('div', { class: 'card' }, h('h3', {}, 'سجل الطلب'), note, h('div', { class: 'row', style: 'margin:8px 0 14px' }, h('button', { class: 'btn sm', onclick: async () => { if (!note.value.trim()) return; const x = await A.save('orders/' + o.ref + '/note', { method: 'POST', body: { text: note.value } }, 'أُضيفت الملاحظة'); if (x.ok) refresh(); } }, 'إضافة ملاحظة')),
      h('ul', { class: 'tl' }, [...r.events].reverse().map(e => h('li', { class: e.type === 'note' ? 'note' : '' }, h('div', {}, e.type === 'note' ? '📝 ' : '', e.text), h('div', { class: 't' }, dt(e.ts))))));

    const dups = r.duplicates.length ? h('div', { class: 'callout warn' }, 'تنبيه: يوجد طلب آخر من نفس الجوال خلال 24 ساعة: ', r.duplicates.map(d => h('a', { href: '#orders/' + d.ref, style: 'margin-inline-end:8px' }, '#' + d.ref))) : null;

    const cancelBtn = !locked ? h('button', { class: 'btn bad', onclick: () => setStatus('cancelled') }, 'إلغاء الطلب') : null;
    el.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('a', { class: 'btn sm', href: '#orders' }, '→ الطلبات'), h('h2', { style: 'margin:0;font-size:20px' }, 'طلب #' + o.ref), A.badge(o.status), o.addr_missing ? h('span', { class: 'badge b-warn' }, 'عنوان ناقص') : null, h('span', { class: 'mut sm' }, dt(o.created_at)), h('div', { class: 'sp' }),
        h('a', { class: 'btn sm', href: '/admin/print.html?type=invoice&ref=' + encodeURIComponent(o.ref), target: '_blank', rel: 'noopener' }, ic('print'), 'فاتورة A4'),
        h('a', { class: 'btn sm', href: '/admin/print.html?type=label&ref=' + encodeURIComponent(o.ref), target: '_blank', rel: 'noopener' }, ic('print'), 'ملصق شحن'), cancelBtn),
      h('div', { class: 'card', style: 'margin-bottom:14px' }, stepper, locked ? h('div', { class: 'callout bad' }, 'هذا الطلب ملغي.') : null, dups ? h('div', { style: 'margin-top:10px' }, dups) : null),
      h('div', { class: 'grid g-main' }, h('div', { class: 'stack' }, custCard, itemsCard), h('div', { class: 'stack' }, shipCard, payCard, tl)));
  }

  /* ---------- تعديل البنود ---------- */
  async function editItems(o, done) {
    const pr = await api('products');
    const prods = pr.products || [];
    const rows = o.items.map(i => ({ id: i.id, name: i.name, v: i.v || '', qty: i.qty, price: i.price }));
    const wrap = h('div', {});
    const draw = () => {
      wrap.replaceChildren(h('div', { class: 'stack' }, rows.map((r, i) => h('div', { class: 'row' },
        h('div', { style: 'flex:1;min-width:150px' }, r.name, r.v ? h('span', { class: 'sm mut' }, ' · ' + r.v) : null),
        h('input', { type: 'number', min: 1, max: 50, value: r.qty, style: 'width:70px', 'aria-label': 'الكمية', oninput: e => { r.qty = Number(e.target.value); } }),
        h('input', { type: 'number', min: 0, value: r.price, style: 'width:90px', 'aria-label': 'السعر', oninput: e => { r.price = Number(e.target.value); } }),
        h('button', { class: 'btn sm bad', 'aria-label': 'حذف', onclick: () => { rows.splice(i, 1); draw(); } }, ic('trash')))),
        h('div', { class: 'row' }, h('select', { id: 'addsel', 'aria-label': 'إضافة منتج' }, h('option', { value: '' }, '+ إضافة منتج…'), prods.filter(p => !p.variants).map(p => h('option', { value: p.id }, p.name + ' — ' + p.price))),
          h('button', { class: 'btn sm', onclick: () => { const v = wrap.querySelector('#addsel').value; const p = prods.find(x => x.id === v); if (!p) return; rows.push({ id: p.id, name: p.name, v: '', qty: 1, price: p.price }); draw(); } }, 'إضافة')),
        h('div', { class: 'hint' }, 'المجموع يُعاد حسابه في الخادم، والمخزون يُعدَّل بالفرق فقط. السعر يبقى كما كان عند الطلب ما لم تغيّره.')));
    };
    draw();
    const ok = await A.modal('تعديل بنود الطلب #' + o.ref, wrap, [{ t: 'إلغاء', val: false }, { t: 'حفظ', cls: 'pri', fn: async () => {
      if (!rows.length) { A.toast('يجب أن يبقى بند واحد على الأقل', true); return false; }
      const x = await A.save('orders/' + o.ref + '/items', { method: 'POST', body: { items: rows.map(r => ({ id: r.id, v: r.v, qty: r.qty, price: r.price })) } }, 'تم تعديل البنود');
      return x.ok ? true : false;
    } }], { wide: true });
    if (ok) done();
  }

  A.views.orders = (el, rest) => rest[0] ? detail(el, rest[0]) : list(el);
})();
