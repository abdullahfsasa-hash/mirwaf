'use strict';
// قسم المنتجات: قائمة بتعديل سريع وتحديد جماعي، ومحرّر كامل برفع صور.
(() => {
  const A = window.A, { h, ic, api, nf } = A;
  const S = A.state;

  async function list(el) {
    const r = await api('products');
    if (!r.ok) return el.replaceChildren(A.empty('box', 'تعذّر التحميل'));
    const f = S.pf || (S.pf = { q: '', cat: '', vis: '' });
    const sel = new Set();
    const body = h('div', {}), bar = h('div', { class: 'bulk', style: 'display:none' });
    const all = r.products;
    const refreshBar = () => {
      bar.style.display = sel.size ? '' : 'none';
      const act = (t, patch, msg) => h('button', { class: 'btn sm', onclick: async () => { const x = await A.save('products-bulk', { method: 'POST', body: { ids: [...sel], patch } }, msg); if (x.ok) A.reload(); } }, t);
      const pct = h('input', { type: 'number', placeholder: '±٪', style: 'width:76px;min-height:32px', 'aria-label': 'نسبة تعديل السعر' });
      const stk = h('input', { type: 'number', min: 0, placeholder: 'مخزون', style: 'width:84px;min-height:32px', 'aria-label': 'مخزون' });
      bar.replaceChildren(h('b', {}, sel.size + ' محدد'), act('إظهار', { hidden: 0 }, 'تم الإظهار'), act('إخفاء', { hidden: 1 }, 'تم الإخفاء'), act('مخزون غير محدود', { stock: '' }, 'تم'),
        stk, h('button', { class: 'btn sm', onclick: () => { if (stk.value === '') return; A.save('products-bulk', { method: 'POST', body: { ids: [...sel], patch: { stock: stk.value } } }, 'تم تحديث المخزون').then(x => x.ok && A.reload()); } }, 'ضبط المخزون'),
        pct, h('button', { class: 'btn sm', onclick: () => { if (pct.value === '') return; A.save('products-bulk', { method: 'POST', body: { ids: [...sel], patch: { pricePct: pct.value } } }, 'تم تعديل الأسعار').then(x => x.ok && A.reload()); } }, 'تعديل السعر'));
    };
    const draw = () => {
      sel.clear(); refreshBar();
      const q = f.q.toLowerCase();
      const rows = all.filter(p => (!q || (p.name + ' ' + p.en + ' ' + p.sku + ' ' + p.id).toLowerCase().includes(q)) && (!f.cat || p.cat === f.cat) && (!f.vis || (f.vis === 'hidden' ? p.hidden : f.vis === 'low' ? (p.stock != null && p.stock <= 3) : !p.hidden)));
      if (!rows.length) return body.replaceChildren(A.empty('box', 'لا توجد منتجات مطابقة'));
      const allc = h('input', { type: 'checkbox', 'aria-label': 'تحديد الكل', onchange: e => body.querySelectorAll('.rowchk').forEach(c => { c.checked = e.target.checked; e.target.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id); refreshBar(); }) });
      body.replaceChildren(h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { class: 'chkc' }, allc), h('th', {}, 'المنتج'), h('th', { class: 'hide-m' }, 'التصنيف'), h('th', {}, 'السعر'), h('th', {}, 'المخزون'), h('th', { class: 'hide-m' }, 'مبيعات'), h('th', {}, ''))),
        h('tbody', {}, rows.map(p => h('tr', { class: 'click', onclick: e => { if (e.target.closest('.chkc,.qe')) return; A.go('products/' + encodeURIComponent(p.id)); } },
          h('td', { class: 'chkc' }, h('input', { type: 'checkbox', class: 'rowchk', 'data-id': p.id, 'aria-label': 'تحديد', onchange: e => { e.target.checked ? sel.add(p.id) : sel.delete(p.id); refreshBar(); } })),
          h('td', {}, h('div', { class: 'pname' }, h('img', { class: 'thumb', src: A.img(p.img), alt: '', loading: 'lazy' }), h('div', {}, h('div', {}, p.name), h('div', { class: 'row', style: 'gap:4px' }, p.custom ? h('span', { class: 'badge' }, 'مخصّص') : null, p.hidden ? h('span', { class: 'badge b-bad' }, 'مخفي') : null, p.status === 'soon' ? h('span', { class: 'badge b-warn' }, 'قريبًا') : p.status === 'soldout' ? h('span', { class: 'badge b-bad' }, 'نفد (يدويًا)') : null, p.old > p.price ? h('span', { class: 'badge b-ok' }, 'خصم') : null)))),
          h('td', { class: 'hide-m' }, A.CATS[p.cat] || p.cat),
          h('td', { class: 'num' }, nf(p.price), p.old > p.price ? h('div', { class: 'sm mut', style: 'text-decoration:line-through' }, nf(p.old)) : null),
          h('td', {}, p.variants && Object.keys(p.vstock || {}).length ? (() => { const vs = Object.values(p.vstock), allLim = p.variants.every(n => p.vstock[n] && p.vstock[n].stock != null); const sum = vs.reduce((a, x) => a + (x.status || x.stock == null ? 0 : x.stock), 0); const outN = p.variants.filter(n => p.vstock[n] && (p.vstock[n].status === 'soldout' || p.vstock[n].stock === 0)).length; return h('span', { class: 'badge ' + (outN ? 'b-warn' : '') }, (allLim ? nf(sum) : 'حسب الخيار') + (outN ? ' · نفد ' + nf(outN) : '')); })() : p.stock == null ? h('span', { class: 'mut' }, '∞') : h('span', { class: 'badge ' + (p.stock === 0 ? 'b-bad' : p.stock <= 3 ? 'b-warn' : '') }, p.stock === 0 ? 'نفد' : nf(p.stock))),
          h('td', { class: 'hide-m num' }, nf(p.sold)),
          h('td', {}, h('button', { class: 'btn sm qe', onclick: () => quick(p) }, ic('edit'), 'سريع'))))))));
    };
    const q = h('input', { type: 'search', placeholder: 'بحث بالاسم أو SKU…', value: f.q, 'aria-label': 'بحث', oninput: A.debounce(e => { f.q = e.target.value.trim(); draw(); }, 150) });
    const sl = (key, opts, label) => h('select', { 'aria-label': label, onchange: e => { f[key] = e.target.value; draw(); } }, opts.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { style: 'flex:1;min-width:200px' }, q), sl('cat', [['', 'كل التصنيفات'], ...Object.entries(A.CATS)], 'التصنيف'), sl('vis', [['', 'الكل'], ['visible', 'ظاهر'], ['hidden', 'مخفي'], ['low', 'مخزون منخفض']], 'الحالة'),
      h('a', { class: 'btn', href: '#products/log' }, 'سجل التعديلات'), h('button', { class: 'btn pri', onclick: () => A.go('products/new') }, ic('plus'), 'منتج جديد')), bar, body);
    draw();
  }

  const statusSelect = cur => h('select', { 'aria-label': 'الحالة في المتجر' }, [['', 'متوفر (عادي)'], ['soon', 'قريبًا (لا يمكن شراؤه)'], ['soldout', 'نفدت الكمية (لا يمكن شراؤه)']].map(([v, t]) => h('option', { value: v, selected: (cur || '') === v }, t)));

  function quick(p) {
    const price = h('input', { type: 'number', min: 1, value: p.price }), stock = h('input', { type: 'number', min: 0, value: p.stock == null ? '' : p.stock, placeholder: 'غير محدود' }), hid = h('input', { type: 'checkbox', checked: !!p.hidden }), st = statusSelect(p.status);
    A.modal('تعديل سريع: ' + p.name, h('div', {}, A.field('السعر (ر.س)', price), A.field('المخزون', stock, 'اتركه فارغًا = غير محدود'), A.field('الحالة في المتجر', st), h('label', { class: 'chk' }, hid, 'إخفاء من المتجر')),
      [{ t: 'إلغاء', val: false }, { t: 'حفظ', cls: 'pri', fn: async () => { const x = await A.save('products/' + encodeURIComponent(p.id), { method: 'POST', body: { price: price.value, old: p.old, stock: stock.value, cost: p.cost, sku: p.sku, hidden: hid.checked ? 1 : 0, bg: p.bg || '', status: st.value, name: p.name, en: p.en, cat: p.cat, brand: p.brand, sub: p.sub, short: p.short, desc: p.desc, ...(p.custom ? { imgs: p.imgs } : {}) } }, 'تم الحفظ'); return x.ok; } }]).then(ok => ok && A.reload());
  }

  async function editor(el, id) {
    const isNew = id === 'new';
    let p;
    if (isNew) p = { id: '', name: '', en: '', cat: 'beans', brand: 'لوتشي', sub: '', short: '', desc: '', price: '', old: '', stock: null, hidden: 0, custom: 1, imgs: [], sku: '', cost: null };
    else { const r = await api('products'); p = (r.products || []).find(x => x.id === id); if (!p) return el.replaceChildren(A.empty('box', 'المنتج غير موجود'), h('div', { style: 'text-align:center' }, h('a', { class: 'btn', href: '#products' }, 'رجوع'))); }
    const custom = !!p.custom;
    const imgs = [...p.imgs];
    let imgsDirty = false;
    let replaceOrig = !custom && !p.img_override; // أول صورة ترفعها لمنتج أساسي تحل محل صوره الأصلية
    const F = {};
    const t = (k, label, props, hint) => { F[k] = h('input', Object.assign({ type: 'text', value: p[k] == null ? '' : p[k] }, props || {})); return A.field(label, F[k], hint); };
    const ta = (k, label, props) => { F[k] = h('textarea', props || {}, p[k] || ''); return A.field(label, F[k]); };

    // ---------- الصور + الخلفية ----------
    const okBg = c => /^#[0-9a-f]{6}$/i.test(c || '');
    let bgSet = okBg(p.bg);
    const bgIn = h('input', { type: 'color', value: bgSet ? p.bg : '#f1ece2', 'aria-label': 'لون الخلفية', style: 'width:52px;height:40px;padding:2px;cursor:pointer' });
    const bgInfo = h('span', { class: 'mut sm', dir: 'ltr' }, bgSet ? p.bg : 'الافتراضي');
    const preview = h('div', { class: 'pv' });
    const paintBg = () => { preview.style.background = bgSet ? bgIn.value : ''; bgInfo.textContent = bgSet ? bgIn.value : 'الافتراضي'; };
    bgIn.oninput = () => { bgSet = true; paintBg(); };
    const bgClear = h('button', { type: 'button', class: 'btn sm', onclick: () => { bgSet = false; paintBg(); } }, 'بدون لون');
    const imgBox = h('div', { class: 'imgs' });
    const busy = h('div', { class: 'hint', style: 'display:none;margin-top:8px' }, 'جاري رفع الصورة…');
    const drawImgs = () => {
      preview.replaceChildren(imgs[0] ? h('img', { src: A.img(imgs[0]), alt: '' }) : h('span', { class: 'mut sm' }, 'لا توجد صورة'));
      imgBox.replaceChildren(...imgs.map((u, i) => h('div', { class: 'imgc' + (i === 0 ? ' main' : '') }, h('img', { src: A.img(u), alt: '' }), i === 0 ? h('span', { class: 'tag' }, 'الرئيسية') : null,
        h('div', { class: 'ops' }, i > 0 ? h('button', { type: 'button', title: 'اجعلها الرئيسية', 'aria-label': 'جعلها رئيسية', onclick: () => { imgs.unshift(imgs.splice(i, 1)[0]); imgsDirty = true; drawImgs(); } }, '★') : null, h('button', { type: 'button', title: 'حذف الصورة', 'aria-label': 'إزالة', onclick: () => { imgs.splice(i, 1); imgsDirty = true; replaceOrig = false; drawImgs(); } }, '✕')))),
        imgs.length < 8 ? h('label', { class: 'drop', style: 'margin:0' }, ic('image'), 'رفع صورة', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true, onchange: upload })) : null);
      paintBg();
    };
    const upload = async (e) => {
      const files = [...e.target.files]; e.target.value = '';
      busy.style.display = '';
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) { A.toast('الصورة أكبر من 5 ميغا: ' + file.name, true); continue; }
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'x-mw': '1' }, credentials: 'same-origin', body: fd }).then(x => x.json()).catch(() => ({}));
        if (r.ok && r.url) {
          if (replaceOrig) { imgs.length = 0; replaceOrig = false; }
          if (!custom) { imgs.unshift(r.url); imgs.length = Math.min(imgs.length, 8); } // منتج أساسي: الصورة الجديدة تصير الرئيسية مباشرة
          else if (imgs.length < 8) imgs.push(r.url);
          imgsDirty = true;
        } else A.toast(r.error === 'type' ? 'الصيغة غير مدعومة (JPG/PNG/WEBP)' : r.error === 'no_bucket' ? 'مخزن الصور غير مفعّل' : r.error === 'unauthorized' ? 'انتهت الجلسة، سجّل دخولك من جديد' : 'فشل رفع الصورة', true);
        drawImgs();
      }
      busy.style.display = 'none';
      if (imgsDirty) A.toast('تمت إضافة الصورة. اضغط «حفظ» لتطبيقها على المتجر');
    };
    drawImgs();

    // ---------- الحقول ----------
    const cat = h('select', {}, Object.entries(A.CATS).map(([k, v]) => h('option', { value: k, selected: p.cat === k }, v)));
    const hid = h('input', { type: 'checkbox', checked: !!p.hidden });
    const stSel = statusSelect(p.status);
    const vRows = (p.variants || []).map(name => { const cur = (p.vstock || {})[name] || {}; return { name, qty: h('input', { type: 'number', min: 0, inputmode: 'numeric', placeholder: 'غير محدود', value: cur.stock == null ? '' : cur.stock, 'aria-label': 'الكمية: ' + name }), st: statusSelect(cur.status) }; });
    const vCard = vRows.length ? h('div', { class: 'card' }, h('h3', {}, 'المخزون لكل لون / مقاس'), h('div', { class: 'hint', style: 'margin:-4px 0 10px' }, 'فاضي = غير محدود. 0 = نفد هذا الخيار فقط والباقي يبقى ينباع.'),
      h('div', { class: 'vgrid' }, h('div', { class: 'vh' }, 'الخيار'), h('div', { class: 'vh' }, 'الكمية'), h('div', { class: 'vh' }, 'الحالة'), ...vRows.flatMap(r => [h('div', { class: 'vn' }, r.name), r.qty, r.st]))) : null;

    // تاريخ الإنتاج والانتهاء (يُعرض في صفحة المنتج تحت المواصفات)
    const toIso = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
    const prodIn = h('input', { type: 'date', value: toIso(p.prod), 'aria-label': 'تاريخ الإنتاج' }), expIn = h('input', { type: 'date', value: toIso(p.exp), 'aria-label': 'تاريخ الانتهاء' });
    const cl = () => el.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    const mark = x => { if (!x) return; x.classList.add('bad'); x.scrollIntoView({ behavior: 'smooth', block: 'center' }); x.focus && x.focus(); };
    const saveBtn = h('button', { class: 'btn pri', type: 'button' }, 'حفظ');
    const buildBody = () => {
      const body = { price: F.price.value, old: F.old.value, stock: F.stock.value, cost: F.cost.value, sku: F.sku.value, hidden: hid.checked ? 1 : 0, status: stSel.value, bg: bgSet ? bgIn.value : '',
        name: F.name.value, en: F.en.value, cat: cat.value, brand: F.brand.value, sub: F.sub.value, short: F.short.value, desc: F.desc.value, prod: prodIn.value, exp: expIn.value };
      if (vRows.length) body.vstock = Object.fromEntries(vRows.map(r => [r.name, { stock: r.qty.value, status: r.st.value }]));
      if (custom) body.imgs = imgs; else if (imgsDirty) body.imgs = imgs;
      return body;
    };
    // مسودة تلقائية: أي شي تكتبه ينحفظ في الجهاز لين ينجح الحفظ، عشان ما يضيع لو انقطع النت أو صار خطأ
    const DK = 'mw.draft.' + (isNew ? 'new' : p.id);
    let base0 = null; // حالة الصفحة عند الفتح: ما نحفظ مسودة إلا إذا تغيّر شي فعلًا
    const putDraft = A.debounce(() => { if (!document.body.contains(saveBtn)) return; const b = buildBody(); if (JSON.stringify(b) === base0) return; try { localStorage.setItem(DK, JSON.stringify({ at: Date.now(), body: b })); } catch (_) { } }, 400);
    const dropDraft = () => { try { localStorage.removeItem(DK); } catch (_) { } };
    const applyDraft = d => {
      for (const k of ['price', 'old', 'stock', 'cost', 'sku', 'name', 'en', 'brand', 'sub', 'short', 'desc']) if (d[k] != null && F[k]) F[k].value = d[k];
      if (d.cat) cat.value = d.cat; hid.checked = !!d.hidden; stSel.value = d.status || '';
      if (d.bg) { bgSet = true; bgIn.value = d.bg; } else bgSet = false;
      prodIn.value = d.prod || ''; expIn.value = d.exp || '';
      if (d.vstock) vRows.forEach(r => { const x = d.vstock[r.name]; if (x) { r.qty.value = x.stock == null ? '' : x.stock; r.st.value = x.status || ''; } });
      if (Array.isArray(d.imgs)) { imgs.length = 0; imgs.push(...d.imgs); imgsDirty = true; replaceOrig = false; drawImgs(); } else paintBg();
    };
    const save = async () => {
      cl();
      const body = buildBody();
      if (F.name.value.trim().length < 2) { mark(F.name); return A.toast('اكتب اسم المنتج', true); }
      if (!(Number(F.price.value) >= 1)) { mark(F.price); return A.toast('اكتب السعر (رقم صحيح)', true); }
      if (prodIn.value && expIn.value && expIn.value <= prodIn.value) { mark(expIn); return A.toast('تاريخ الانتهاء لازم يكون بعد تاريخ الإنتاج', true); }
      if (Number(body.old) && Number(body.old) <= Number(body.price)) { mark(F.old); return A.toast('السعر قبل الخصم لازم يكون أعلى من السعر الحالي، أو اتركه فاضي', true); }
      if (custom && !imgs.length) return A.toast('أضف صورة واحدة على الأقل', true);
      saveBtn.disabled = true; saveBtn.textContent = 'جاري الحفظ…';
      const x = await A.save(isNew ? 'products' : 'products/' + encodeURIComponent(p.id), { method: 'POST', body }, 'تم حفظ المنتج ✓');
      saveBtn.disabled = false; saveBtn.textContent = 'حفظ';
      if (x.ok) { dropDraft(); return A.go('products'); }
      putDraft();
      const map = { price: F.price, old: F.old, stock: F.stock, cost: F.cost, sku: F.sku, name: F.name, cat, bg: bgIn, prod: prodIn, exp: expIn };
      if (x.field === 'img') A.toast('أضف صورة واحدة على الأقل', true);
      else if (x.field === 'vstock') mark(vRows[0] && vRows[0].qty);
      else mark(map[x.field]);
    };
    saveBtn.onclick = save;

    el.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('a', { class: 'btn sm', href: '#products' }, '→ المنتجات'), h('h2', { style: 'margin:0;font-size:20px' }, isNew ? 'منتج جديد' : p.name), h('div', { class: 'sp' }),
        !isNew ? h('button', { class: 'btn sm', onclick: async () => { const x = await A.save('products/' + encodeURIComponent(p.id) + '/duplicate', { method: 'POST', body: {} }, 'تم النسخ (مخفي)'); if (x.ok) A.go('products/' + encodeURIComponent(x.id)); } }, ic('copy'), 'نسخ المنتج') : null,
        !isNew && custom ? h('button', { class: 'btn sm bad', onclick: async () => { if (!await A.confirm('حذف المنتج', 'سيُحذف المنتج نهائيًا من المتجر (الطلبات القديمة تبقى). يمكنك إخفاءه بدلًا من ذلك.', 'حذف', true)) return; const x = await A.save('products/' + encodeURIComponent(p.id), { method: 'DELETE' }, 'تم الحذف'); if (x.ok) A.go('products'); } }, ic('trash'), 'حذف') : null),
      h('div', { class: 'grid g-main' },
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', {}, 'الصور'),
            h('div', { class: 'pvrow' }, preview, h('div', { style: 'flex:1;min-width:0' },
              imgBox, busy,
              h('div', { class: 'hint', style: 'margin-top:8px' }, '★ = اجعلها الصورة الرئيسية، ✕ = حذف. JPG أو PNG أو WEBP حتى 5 ميغا.'),
              h('div', { class: 'row', style: 'gap:8px;align-items:center;margin-top:12px' }, h('b', { class: 'sm' }, 'خلفية الصورة:'), bgIn, bgInfo, bgClear),
              !custom && p.img_override ? h('button', { type: 'button', class: 'btn sm', style: 'margin-top:10px', onclick: async () => { if (!await A.confirm('إرجاع الصور الأصلية', 'ستُحذف الصور اللي رفعتها ويرجع المنتج لصوره الأصلية.', 'إرجاع')) return; const x = await A.save('products/' + encodeURIComponent(p.id), { method: 'POST', body: { price: p.price, old: p.old, stock: p.stock == null ? '' : p.stock, cost: p.cost, sku: p.sku, hidden: p.hidden ? 1 : 0, status: p.status || '', bg: p.bg || '', imgs: [] } }, 'رجعت الصور الأصلية'); if (x.ok) A.reload(); } }, 'إرجاع الصور الأصلية') : null))),
          h('div', { class: 'card' }, h('h3', {}, 'المعلومات'), h('div', { class: 'fgrid' }, t('name', 'اسم المنتج (عربي)', { maxlength: 100 }), t('en', 'الاسم بالإنجليزية', { dir: 'ltr', maxlength: 100 }),
            A.field('التصنيف', cat), t('brand', 'العلامة', { maxlength: 60 }), h('div', { class: 'full' }, t('sub', 'سطر تحت الاسم', { maxlength: 120 })),
            h('div', { class: 'full' }, ta('short', 'وصف قصير', { maxlength: 500 })), h('div', { class: 'full' }, ta('desc', 'الوصف الكامل', { maxlength: 2000, style: 'min-height:140px' })))),
          vCard),
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', {}, 'السعر'), t('price', 'السعر (ر.س)', { type: 'number', min: 1, inputmode: 'numeric' }), t('old', 'السعر قبل الخصم', { type: 'number', min: 0 }, 'فاضي = بدون خصم'), t('cost', 'التكلفة (داخلي)', { type: 'number', min: 0 }, 'لا تظهر للعميل')),
          h('div', { class: 'card' }, h('h3', {}, 'المخزون والظهور'),
            A.field('الحالة في المتجر', stSel, 'قريبًا أو نفد = يظهر المنتج بس ما ينشرى'),
            t('stock', vRows.length ? 'إجمالي الكمية (اختياري)' : 'الكمية المتوفرة', { type: 'number', min: 0, inputmode: 'numeric', placeholder: 'غير محدود' }, vRows.length ? 'الأفضل تتركه فاضي وتحط كمية كل لون تحت.' : 'فاضي = غير محدود، 0 = نفدت الكمية'),
            t('sku', 'SKU (اختياري)', { dir: 'ltr', maxlength: 40 }),
            h('label', { class: 'chk' }, hid, 'إخفاء من المتجر')),
          h('div', { class: 'card' }, h('h3', {}, 'التواريخ'), A.field('تاريخ الإنتاج', prodIn), A.field('تاريخ الانتهاء', expIn, 'تظهر للعميل في صفحة المنتج. اتركها فاضية لو ما تبيها.')))),
      h('div', { class: 'fab-save' }, saveBtn, h('a', { class: 'btn', href: '#products' }, 'إلغاء')));
    F.stock.value = p.stock == null ? '' : p.stock;
    F.old.value = p.old ? p.old : '';
    let draft = null; try { draft = JSON.parse(localStorage.getItem(DK) || 'null'); } catch (_) { }
    if (draft && draft.body && Date.now() - draft.at < 30 * 864e5) {
      const bar = h('div', { class: 'callout info', style: 'margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, h('b', {}, 'عندك تعديلات على هذا المنتج ما انحفظت (' + new Date(draft.at).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }) + ').'),
        h('button', { class: 'btn sm pri', type: 'button', onclick: () => { applyDraft(draft.body); bar.remove(); A.toast('رجعت التعديلات. راجعها واضغط «حفظ»'); } }, 'استرجاعها'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { dropDraft(); bar.remove(); } }, 'تجاهل'));
      el.firstChild.after(bar);
    }
    base0 = JSON.stringify(buildBody());
    const root = el.lastElementChild && el.lastElementChild.previousElementSibling; // شبكة الحقول
    [root, el.querySelector('.fab-save')].forEach(n => n && (n.addEventListener('input', putDraft), n.addEventListener('change', putDraft)));
  }

  // سجل تعديلات المنتجات (كل محاولة حفظ، ناجحة أو فاشلة)
  const ACT = { update: 'تعديل', create: 'إضافة', delete: 'حذف', bulk: 'تعديل جماعي', duplicate: 'نسخ' };
  const ERR = { price: 'السعر', old: 'السعر قبل الخصم', stock: 'الكمية', cost: 'التكلفة', sku: 'SKU', name: 'الاسم', cat: 'التصنيف', img: 'الصورة', bg: 'لون الخلفية', vstock: 'مخزون الألوان', prod: 'تاريخ الإنتاج', exp: 'تاريخ الانتهاء' };
  async function logView(el) {
    const [r, pr] = await Promise.all([api('log'), api('products')]);
    if (!r.ok) return el.replaceChildren(A.empty('box', 'تعذّر تحميل السجل'));
    const names = Object.fromEntries((pr.products || []).map(x => [x.id, x.name]));
    const why = e => { const [code, f] = String(e || '').split(':'); return f ? 'خطأ في خانة: ' + (ERR[f] || f) : code === 'not_found' ? 'المنتج غير موجود' : code === 'unauthorized' ? 'انتهت الجلسة' : code || 'خطأ'; };
    const rows = r.log.map(x => {
      let body = null; try { body = JSON.parse(x.body || 'null'); } catch (_) { }
      const det = body && typeof body === 'object' ? Object.entries(body).filter(([k]) => k !== 'vstock' && k !== 'imgs').map(([k, v]) => k + ': ' + String(v).slice(0, 60)).join(' · ') : '';
      return h('tr', {}, h('td', { class: 'num sm' }, new Date(x.ts).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' })),
        h('td', {}, names[x.pid] || x.pid || '—'), h('td', {}, ACT[x.act] || x.act),
        h('td', {}, x.ok ? h('span', { class: 'badge b-ok' }, 'انحفظ ✓') : h('span', { class: 'badge b-bad' }, 'ما انحفظ: ' + why(x.err))),
        h('td', { class: 'sm mut', style: 'max-width:420px;white-space:normal' }, det),
        h('td', {}, !x.ok && x.act === 'update' && body ? h('button', { class: 'btn sm', onclick: async () => { const y = await A.save('products/' + encodeURIComponent(x.pid), { method: 'POST', body }, 'انحفظ الحين ✓'); if (y.ok) A.reload(); } }, 'أعد الحفظ') : null));
    });
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:14px' }, h('a', { class: 'btn sm', href: '#products' }, '→ المنتجات'), h('h2', { style: 'margin:0;font-size:20px' }, 'سجل تعديلات المنتجات')),
      rows.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الوقت'), h('th', {}, 'المنتج'), h('th', {}, 'العملية'), h('th', {}, 'النتيجة'), h('th', {}, 'البيانات'), h('th', {}, ''))), h('tbody', {}, rows)))
        : A.empty('box', 'ما فيه تعديلات مسجلة بعد', 'من الحين، كل حفظ (ناجح أو فاشل) يتسجل هنا'));
  }

  A.views.products = (el, rest) => rest[0] === 'log' ? logView(el) : rest[0] ? editor(el, rest[0]) : list(el);
})();
