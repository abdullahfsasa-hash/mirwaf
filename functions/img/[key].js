// يخدّم صور المنتجات المرفوعة من لوحة الأدمن مباشرة من R2.
export async function onRequestGet({ env, params }) {
  const key = String(params.key || '');
  if (!env.IMAGES || !/^[a-z0-9]+-[a-f0-9]{16}\.(jpg|png|webp|gif)$/i.test(key)) {
    return new Response('not found', { status: 404 });
  }
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers });
}
