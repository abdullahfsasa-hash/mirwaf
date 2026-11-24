// إرسال ملخص الطلب إلى بريد العميل عبر Resend. يعمل فقط عند ضبط RESEND_API_KEY و MAIL_FROM في Cloudflare.
// MAIL_FROM مثل: لوتشي <orders@lucebrew.com>   |   MAIL_BCC (اختياري): نسخة لبريد المتجر.
export const validEmail = s => /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[A-Za-z]{2,}$/.test(String(s || '')) && String(s).length <= 120;
export const mailOn = env => !!(env.RESEND_API_KEY && env.MAIL_FROM);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n || 0).toLocaleString('en-US') + ' ر.س';

export function orderEmailHtml(o) {
  const rows = o.items.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.name)}${i.v ? ' · ' + esc(i.v) : ''} × ${i.qty}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:left;white-space:nowrap" dir="ltr">${money(i.price * i.qty)}</td></tr>`).join('');
  const line = (k, v) => `<tr><td style="padding:4px 0;color:#555">${k}</td><td style="padding:4px 0;text-align:left" dir="ltr">${v}</td></tr>`;
  const pay = o.method === 'card' ? 'دفع إلكتروني (بانتظار إتمام الدفع)' : 'تأكيد الدفع عبر واتساب';
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f3ecdd;font-family:Tahoma,Arial,sans-serif;color:#1e3b31">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:14px;padding:24px">
<h1 style="margin:0 0 6px;font-size:22px">شكرًا ${esc(o.name.split(' ')[0])}، استلمنا طلبك</h1>
<p style="margin:0 0 16px;color:#555">رقم الطلب: <b dir="ltr">${esc(o.ref)}</b></p>
<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:10px">
${line('المجموع', money(o.sub))}
${o.d ? line('الخصم' + (o.coupon ? ' (' + esc(o.coupon) + ')' : ''), '-' + money(o.d)) : ''}
${o.free ? line('التوصيل', 'مجاني') : ''}
<tr><td style="padding:8px 0;font-weight:bold">الإجمالي</td><td style="padding:8px 0;text-align:left;font-weight:bold" dir="ltr">${money(o.total)}</td></tr>
</table>
<p style="margin:16px 0 4px;color:#555">عنوان التوصيل</p><p style="margin:0;font-size:15px">${esc(o.address)}</p>
<p style="margin:16px 0 4px;color:#555">طريقة الدفع</p><p style="margin:0;font-size:15px">${pay}</p>
<p style="margin:20px 0 0;color:#555;font-size:13px">للاستفسار تواصل معنا على واتساب: <a href="https://wa.me/966551027895" style="color:#1e3b31">055 102 7895</a></p>
</div>
<p style="text-align:center;color:#777;font-size:12px;margin-top:14px">لوتشي · Luce Coffee &amp; More · lucebrew.com</p>
</div></body></html>`;
}

export async function sendOrderEmail(env, o) {
  if (!mailOn(env) || !validEmail(o.email)) return { ok: false };
  const body = {
    from: env.MAIL_FROM, to: [o.email], subject: 'تأكيد طلبك من لوتشي · ' + o.ref,
    html: orderEmailHtml(o), text: `شكرًا ${o.name}، استلمنا طلبك ${o.ref}. الإجمالي ${money(o.total)}. للاستفسار: واتساب 055 102 7895`
  };
  if (env.MAIL_BCC && validEmail(env.MAIL_BCC)) body.bcc = [env.MAIL_BCC];
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_API_KEY }, body: JSON.stringify(body) });
    return { ok: r.ok };
  } catch (e) { return { ok: false }; } finally { clearTimeout(tm); }
}
