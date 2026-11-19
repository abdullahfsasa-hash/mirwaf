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
          h('td', {}, h('div', { class: 'pname' }, h('img', { class: 'thumb', src: A.img(p.img), alt: '', loading: 'lazy' }), h('div', {}, h('div', {}, p.name), h('div', { class: 'row', style: 'gap:4px' }, p.custom ? h('span', { class: 'badge' }, 'مخصّص') : null, p.hidden ? h('span', { class: 'badge b-bad' }, 'مخفي') : null, p.old > p.price ? h('span', { class: 'badge b-ok' }, 'خصم') : null)))),
          h('td', { class: 'hide-m' }, A.CATS[p.cat] || p.cat),
          h('td', { class: 'num' }, nf(p.price), p.old > p.price ? h('div', { class: 'sm mut', style: 'text-decoration:line-through' }, nf(p.old)) : null),
          h('td', {}, p.stock == null ? h('span', { class: 'mut' }, '∞') : h('span', { class: 'badge ' + (p.stock === 0 ? 'b-bad' : p.stock <= 3 ? 'b-warn' : '') }, p.stock === 0 ? 'نفد' : nf(p.stock))),
          h('td', { class: 'hide-m num' }, nf(p.sold)),
          h('td', {}, h('button', { class: 'btn sm qe', onclick: () => quick(p) }, ic('edit'), 'سريع'))))))));
    };
    const q = h('input', { type: 'search', placeholder: 'بحث بالاسم أو SKU…', value: f.q, 'aria-label': 'بحث', oninput: A.debounce(e => { f.q = e.target.value.trim(); draw(); }, 150) });
    const sl = (key, opts, label) => h('select', { 'aria-label': label, onchange: e => { f[key] = e.target.value; draw(); } }, opts.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:12px' }, h('div', { style: 'flex:1;min-width:200px' }, q), sl('cat', [['', 'كل التصنيفات'], ...Object.entries(A.CATS)], 'التصنيف'), sl('vis', [['', 'الكل'], ['visible', 'ظاهر'], ['hidden', 'مخفي'], ['low', 'مخزون منخفض']], 'الحالة'),
      h('button', { class: 'btn pri', onclick: () => A.go('products/new') }, ic('plus'), 'منتج جديد')), bar, body);
    draw();
  }

  function quick(p) {
    const price = h('input', { type: 'number', min: 1, value: p.price }), stock = h('input', { type: 'number', min: 0, value: p.stock == null ? '' : p.stock, placeholder: 'غير محدود' }), hid = h('input', { type: 'checkbox', checked: !!p.hidden });
    A.modal('تعديل سريع: ' + p.name, h('div', {}, A.field('السعر (ر.س)', price), A.field('المخزون', stock, 'اتركه فارغًا = غير محدود'), h('label', { class: 'chk' }, hid, 'إخفاء من المتجر')),
      [{ t: 'إلغاء', val: false }, { t: 'حفظ', cls: 'pri', fn: async () => { const x = await A.save('products/' + encodeURIComponent(p.id), { method: 'POST', body: { price: price.value, old: p.old, stock: stock.value, cost: p.cost, sku: p.sku, hidden: hid.checked ? 1 : 0, name: p.name, en: p.en, cat: p.cat, brand: p.brand, sub: p.sub, short: p.short, desc: p.desc, imgs: p.imgs } }, 'تم الحفظ'); return x.ok; } }]).then(ok => ok && A.reload());
  }

  async function editor(el, id) {
    const isNew = id === 'new';
    let p;
    if (isNew) p = { id: '', name: '', en: '', cat: 'beans', brand: 'لوتشي', sub: '', short: '', desc: '', price: '', old: '', stock: null, hidden: 0, custom: 1, imgs: [], sku: '', cost: null };
    else { const r = await api('products'); p = (r.products || []).find(x => x.id === id); if (!p) return el.replaceChildren(A.empty('box', 'المنتج غير موجود'), h('div', { style: 'text-align:center' }, h('a', { class: 'btn', href: '#products' }, 'رجوع'))); }
    const custom = !!p.custom;
    const imgs = [...p.imgs];
    const F = {};
    const t = (k, label, props, hint) => { F[k] = h('input', Object.assign({ type: 'text', value: p[k] == null ? '' : p[k] }, props || {})); return A.field(label, F[k], hint); };
    const imgBox = h('div', { class: 'imgs' });
    const drawImgs = () => {
      imgBox.replaceChildren(...imgs.map((u, i) => h('div', { class: 'imgc' + (i === 0 ? ' main' : '') }, h('img', { src: A.img(u), alt: '' }), i === 0 ? h('span', { class: 'tag' }, 'الرئيسية') : null,
        custom ? h('div', { class: 'ops' }, i > 0 ? h('button', { 'aria-label': 'جعلها رئيسية', onclick: () => { imgs.unshift(imgs.splice(i, 1)[0]); drawImgs(); } }, '★') : null, i > 0 ? h('button', { 'aria-label': 'تحريك', onclick: () => { [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]]; drawImgs(); } }, '→') : null, i < imgs.length - 1 ? h('button', { 'aria-label': 'تأخير', onclick: () => { [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]]; drawImgs(); } }, '←') : null, h('button', { 'aria-label': 'إزالة', onclick: () => { imgs.splice(i, 1); drawImgs(); } }, '✕')) : null)),
        custom && imgs.length < 8 ? h('label', { class: 'drop', style: 'margin:0' }, ic('image'), 'رفع صورة', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true, onchange: upload })) : null);
    };
    const upload = async (e) => {
      for (const file of [...e.target.files].slice(0, 8 - imgs.length)) {
        if (file.size > 5 * 1024 * 1024) { A.toast('الصورة أكبر من 5 ميغا: ' + file.name, true); continue; }
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'x-mw': '1' }, credentials: 'same-origin', body: fd }).then(x => x.json()).catch(() => ({}));
        if (r.ok && r.url) imgs.push(r.url); else A.toast(r.error === 'type' ? 'الصيغة غير مدعومة (JPG/PNG/WEBP)' : r.error === 'no_bucket' ? 'مخزن الصور غير مفعّل' : 'فشل رفع الصورة', true);
        drawImgs();
      }
      e.target.value = '';
    };
    drawImgs();
    const cat = h('select', { disabled: !custom }, Object.entries(A.CATS).map(([k, v]) => h('option', { value: k, selected: p.cat === k }, v)));
    const hid = h('input', { type: 'checkbox', checked: !!p.hidden });
    const unl = h('input', { type: 'checkbox', checked: p.stock == null, onchange: () => { F.stock.disabled = unl.checked; if (unl.checked) F.stock.value = ''; } });
    const ta = (k, label, props) => { F[k] = h('textarea', props || {}, p[k] || ''); return A.field(label, F[k]); };
    const disabledTxt = !custom ? { disabled: true } : {};
    const ro = !custom ? h('div', { class: 'callout info', style: 'margin-bottom:14px' }, 'هذا منتج أساسي: نصوصه وصوره ثابتة في المتجر. يمكنك تعديل السعر والمخزون والخصم والإظهار والـSKU.') : null;
    const cl = () => Object.values(F).forEach(x => x.classList && x.classList.remove('bad'));
    const save = async () => {
      cl();
      const body = { price: F.price.value, old: F.old.value, stock: unl.checked ? '' : F.stock.value, cost: F.cost.value, sku: F.sku.value, hidden: hid.checked ? 1 : 0 };
      if (custom) Object.assign(body, { name: F.name.value, en: F.en.value, cat: cat.value, brand: F.brand.value, sub: F.sub.value, short: F.short.value, desc: F.desc.value, imgs });
      if (Number(body.old) && Number(body.old) <= Number(body.price)) { F.old.classList.add('bad'); return A.toast('السعر قبل الخصم يجب أن يكون أعلى من السعر الحالي', true); }
      const x = await A.save(isNew ? 'products' : 'products/' + encodeURIComponent(p.id), { method: 'POST', body }, 'تم حفظ المنتج');
      if (x.ok) A.go('products'); else { const k = { price: 'price', old: 'old', stock: 'stock', cost: 'cost', sku: 'sku', name: 'name', img: null }[x.field]; if (x.field === 'img') A.toast('أضف صورة واحدة على الأقل', true); else if (k && F[k]) F[k].classList.add('bad'); else if (x.field === 'cat') cat.classList.add('bad'); }
    };
    el.replaceChildren(h('div', { class: 'row', style: 'margin-bottom:14px' }, h('a', { class: 'btn sm', href: '#products' }, '→ المنتجات'), h('h2', { style: 'margin:0;font-size:20px' }, isNew ? 'منتج جديد' : p.name), h('div', { class: 'sp' }),
      !isNew ? h('button', { class: 'btn sm', onclick: async () => { const x = await A.save('products/' + encodeURIComponent(p.id) + '/duplicate', { method: 'POST', body: {} }, 'تم النسخ (مخفي)'); if (x.ok) A.go('products/' + encodeURIComponent(x.id)); } }, ic('copy'), 'نسخ المنتج') : null,
      !isNew && custom ? h('button', { class: 'btn sm bad', onclick: async () => { if (!await A.confirm('حذف المنتج', 'سيُحذف المنتج نهائيًا من المتجر (الطلبات القديمة تبقى). يمكنك إخفاءه بدلًا من ذلك.', 'حذف', true)) return; const x = await A.save('products/' + encodeURIComponent(p.id), { method: 'DELETE' }, 'تم الحذف'); if (x.ok) A.go('products'); } }, ic('trash'), 'حذف') : null),
      ro,
      h('div', { class: 'grid g-main' }, h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', {}, 'المعلومات الأساسية'), h('div', { class: 'fgrid' }, t('name', 'اسم المنتج (عربي)', Object.assign({ maxlength: 100 }, disabledTxt)), t('en', 'الاسم بالإنجليزية', Object.assign({ dir: 'ltr', maxlength: 100 }, disabledTxt)),
          A.field('التصنيف', cat), t('brand', 'العلامة', disabledTxt), h('div', { class: 'full' }, t('sub', 'وصف مختصر تحت الاسم', Object.assign({ maxlength: 120 }, disabledTxt))),
          h('div', { class: 'full' }, ta('short', 'وصف قصير', disabledTxt)), h('div', { class: 'full' }, ta('desc', 'الوصف الكامل', Object.assign({ style: 'min-height:140px' }, disabledTxt))))),
        h('div', { class: 'card' }, h('h3', {}, 'الصور'), imgBox, custom ? h('div', { class: 'hint', style: 'margin-top:8px' }, 'الصورة الأولى هي الرئيسية. JPG أو PNG أو WEBP حتى 5 ميغا، وبحد أقصى 8 صور.') : null)),
        h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h3', {}, 'السعر'), t('price', 'السعر (ر.س)', { type: 'number', min: 1, inputmode: 'numeric' }), t('old', 'السعر قبل الخصم', { type: 'number', min: 0 }, 'اتركه فارغًا لو ما فيه خصم'), t('cost', 'التكلفة (داخلي)', { type: 'number', min: 0 }, 'لا تظهر للعميل')),
          h('div', { class: 'card' }, h('h3', {}, 'المخزون والظهور'), t('sku', 'SKU', { dir: 'ltr', maxlength: 40 }), h('label', { class: 'chk', style: 'margin-bottom:10px' }, unl, 'مخزون غير محدود'), t('stock', 'الكمية المتوفرة', { type: 'number', min: 0, disabled: p.stock == null }), h('label', { class: 'chk' }, hid, 'إخفاء من المتجر')))),
      h('div', { class: 'fab-save' }, h('button', { class: 'btn pri', onclick: save }, 'حفظ'), h('a', { class: 'btn', href: '#products' }, 'إلغاء')));
    F.stock.value = p.stock == null ? '' : p.stock;
  }

  A.views.products = (el, rest) => rest[0] ? editor(el, rest[0]) : list(el);
})();
