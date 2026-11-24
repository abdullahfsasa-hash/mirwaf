// شركات الشحن — من جهة الخادم فقط. تعمل فقط عند وجود مفاتيح الحساب في متغيرات بيئة Cloudflare.
// أرامكس: ARAMEX_USER, ARAMEX_PASS, ARAMEX_ACCOUNT, ARAMEX_PIN, ARAMEX_ENTITY, ARAMEX_COUNTRY (SA)
//   بيانات المرسل: SHIP_FROM_NAME, SHIP_FROM_PHONE, SHIP_FROM_CITY, SHIP_FROM_LINE1
// ملاحظة: لم تُجرَّب مع حساب حقيقي بعد. جرّبها أول مرة على شحنة تجريبية.
const ARAMEX = 'https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments';

export const aramexOn = env => !!(env.ARAMEX_USER && env.ARAMEX_PASS && env.ARAMEX_ACCOUNT && env.ARAMEX_PIN && env.ARAMEX_ENTITY && env.SHIP_FROM_PHONE && env.SHIP_FROM_CITY && env.SHIP_FROM_LINE1);
export const carriersOn = env => ({ aramex: aramexOn(env) });

const msDate = t => '/Date(' + t + ')/';

// order: صف من جدول orders. opts: { cod:boolean, pieces, weightKg }
export async function aramexCreate(env, order, items, opts = {}) {
  if (!aramexOn(env)) return { ok: false, error: 'carrier_off' };
  const cc = env.ARAMEX_COUNTRY || 'SA';
  const now = Date.now();
  const desc = items.map(i => `${i.name} x${i.qty}`).join(', ').slice(0, 100) || 'Coffee';
  const body = {
    ClientInfo: { UserName: env.ARAMEX_USER, Password: env.ARAMEX_PASS, Version: 'v1.0', AccountNumber: env.ARAMEX_ACCOUNT, AccountPin: env.ARAMEX_PIN, AccountEntity: env.ARAMEX_ENTITY, AccountCountryCode: cc, Source: 24 },
    LabelInfo: { ReportID: 9201, ReportType: 'URL' },
    Shipments: [{
      Reference1: order.ref,
      Shipper: {
        Reference1: order.ref, AccountNumber: env.ARAMEX_ACCOUNT,
        PartyAddress: { Line1: env.SHIP_FROM_LINE1, City: env.SHIP_FROM_CITY, CountryCode: cc },
        Contact: { PersonName: env.SHIP_FROM_NAME || 'LUCE', CompanyName: env.SHIP_FROM_NAME || 'LUCE', PhoneNumber1: env.SHIP_FROM_PHONE, CellPhone: env.SHIP_FROM_PHONE, EmailAddress: 'info@lucebrew.com', Type: '' }
      },
      Consignee: {
        Reference1: order.ref,
        PartyAddress: { Line1: String(order.address || '').slice(0, 100), Line2: order.addr_post ? 'Post ' + order.addr_post : '', City: order.city || '', PostCode: order.addr_post || '', CountryCode: 'SA' },
        Contact: { PersonName: order.name, CompanyName: order.name, PhoneNumber1: order.phone, CellPhone: order.phone, EmailAddress: '', Type: '' }
      },
      ShippingDateTime: msDate(now), DueDate: msDate(now + 3 * 86400000),
      Details: {
        Dimensions: null,
        ActualWeight: { Unit: 'KG', Value: opts.weightKg || 1 }, ChargeableWeight: { Unit: 'KG', Value: opts.weightKg || 1 },
        DescriptionOfGoods: desc, GoodsOriginCountry: 'SA', NumberOfPieces: opts.pieces || 1,
        ProductGroup: 'DOM', ProductType: 'ONP', PaymentType: 'P', PaymentOptions: opts.cod ? 'COD' : '',
        CustomsValueAmount: { CurrencyCode: 'SAR', Value: order.total },
        CashOnDeliveryAmount: opts.cod ? { CurrencyCode: 'SAR', Value: order.total } : null,
        Items: []
      }
    }]
  };
  let r, j;
  try {
    r = await fetch(ARAMEX, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    j = await r.json();
  } catch (e) { return { ok: false, error: 'carrier_unreachable' }; }
  const sh = j && j.Shipments && j.Shipments[0];
  if (!r.ok || !j || j.HasErrors || !sh || !sh.ID) {
    const notes = ((sh && sh.Notifications) || (j && j.Notifications) || []).map(n => n.Message).filter(Boolean).join(' | ').slice(0, 300);
    return { ok: false, error: 'carrier_error', detail: notes || ('HTTP ' + (r && r.status)) };
  }
  return { ok: true, tracking: String(sh.ID), label: (sh.ShipmentLabel && sh.ShipmentLabel.LabelURL) || '' };
}
