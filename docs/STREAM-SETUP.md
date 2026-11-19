# الدفع الإلكتروني عبر Stream (streampay.sa)

## الحالة
- الكود منشور على lucebrew.com. الدفع يظهر تلقائيًا عند إضافة المفاتيح، وإلا يبقى واتساب فقط.
- المفتاح السري لا يصل للمتصفح أبدًا. يُقرأ فقط من متغيرات بيئة Cloudflare.

## الخطوات (تسويها أنت)
1. https://app.streampay.sa/settings/api-keys ← Create Key Pair ← انسخ Key و Secret.
2. Cloudflare ← Workers & Pages ← mirwaf ← Settings ← Environment variables ← Production:
   - STREAM_API_KEY = الـ Key
   - STREAM_API_SECRET = الـ Secret (Encrypted)
   - STREAM_WEBHOOK_SECRET = اختياري، بعد إنشاء الويب هوك
3. Retry deployment.
4. لوحة الأدمن ← الإعدادات ← "مزامنة المنتجات مع Stream" (يضيف كل المنتجات مرة واحدة، بدون تكرار).
5. اختياري: ويب هوك في Stream على https://lucebrew.com/api/pay/webhook

## كيف يعمل
- الزبون يختار "ادفع الآن" ← الخادم ينشئ منتجًا ورابط دفع بالمبلغ النهائي (مع الخصم والشحن) ← تحويل لصفحة Stream.
- بعد الدفع يرجع الزبون لـ https://lucebrew.com/?invoice_id=...&status=paid، والخادم يتحقق من الفاتورة عبر API (المبلغ، العملة، رابط الدفع، الحالة COMPLETED).
- الويب هوك يعيد نفس التحقق عند وصوله.

## ملفات الكود
- functions/_lib/stream.js: عميل Stream والتحقق من التوقيع.
- functions/api/[[path]].js: pay/start، pay/verify، pay/webhook، stream/sync، وفحص الفاتورة.
- index.html: زر الدفع، payReturn، ونصوص السياسة.
- admin/admin.js: بطاقة Stream في الإعدادات والتحقق اليدوي برقم الفاتورة.

## نقاط تحتاج اختبار
- هل حالة الفاتورة بعد الدفع COMPLETED فعلًا؟ اختبر بطاقة اختبار من حساب Stream.
- STC Pay غير موثّق في Stream، فأُزيل من الواجهة.
- Apple Pay يحتاج تسجيل الدومين عند Stream.
