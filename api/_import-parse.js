// Listing parsers for the smart import (MyHome.ge, SS.ge, Place.ge).
// Pure functions: HTML in, normalized listing out. Files starting with "_" are not Vercel routes.

const ALLOWED_HOSTS = ['myhome.ge', 'ss.ge', 'place.ge'];

function hostOf(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const site = ALLOWED_HOSTS.find(h => host === h || host.endsWith('.' + h));
  return site ? { site, url: `https://${host}${u.pathname}${u.search}` } : null;
}

const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const decode = (s) => String(s ?? '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function dealType(text) {
  const t = String(text || '');
  if (/დღიურად/.test(t)) return 'daily';
  if (/ქირავდება|გირავდება/.test(t)) return 'long_term';
  return 'sale';
}
function propertyType(text) {
  const t = String(text || '');
  if (/მიწ/.test(t)) return 'land';
  if (/კომერც|ოფის|სასტუმრო|მაღაზია|საწყობ/.test(t)) return 'commercial';
  if (/სახლ|აგარაკ|კოტეჯ|ვილა/.test(t)) return 'house';
  return 'apartment';
}

// Removes contacts and identifiers of whoever posted the ad: phones, links, e-mails,
// cadastral codes, and whole sentences that only exist to send the reader to them.
function debrand(text) {
  const PHONE = /(?:\+?995[\s-]?)?\b5\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b|\b5\d{8}\b|\b0?32[\s-]?2?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g;
  const LINK = /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:ge|com|net|org)\b/gi;
  const MAIL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
  const CAD = /\b\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}(?:\.\d{2}(?:\.\d{3})?)?\b/g;
  const CONTACT = /დაგვიკავშირდ|დამიკავშირდ|დაგვირეკ|დამირეკ|დარეკეთ|მოგვწერ|მომწერ|საკონტაქტო|ნომერზე|ტელ\s*[.:]|whatsapp|viber|ვაიბერ|სააგენტო|აგენტი\b|საკადასტრო/i;
  const parts = clean(decode(text)).split(/(?<=[.!?;])\s+|\n+/);
  const kept = parts.filter(s => {
    PHONE.lastIndex = LINK.lastIndex = MAIL.lastIndex = CAD.lastIndex = 0;
    return s && !PHONE.test(s) && !LINK.test(s) && !MAIL.test(s) && !CAD.test(s) && !CONTACT.test(s);
  });
  return clean(kept.join(' ')).replace(/!{2,}/g, '!').replace(/\s+([.,!?])/g, '$1');
}

function parseMyhome(html) {
  const data = nextData(html);
  const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
  const s = queries.map(x => x?.state?.data?.data?.statement).find(Boolean);
  if (!s) return null;
  const deal = { 1: 'sale', 2: 'long_term', 3: 'long_term', 7: 'daily' }[s.deal_type_id] || dealType(s.dynamic_title);
  const kind = { 1: 'apartment', 2: 'house', 3: 'house', 4: 'land', 5: 'commercial', 6: 'commercial' }[s.real_estate_type_id] || 'apartment';
  const usd = s.price?.['2'], gel = s.price?.['1'];
  const inGel = Number(s.currency_id) === 1;
  const rooms = int((String(s.dynamic_title || '').match(/(\d+)\s*ოთახ/) || [])[1]) || int(s.room_type_id);
  return {
    title: clean(s.dynamic_title),
    transaction_type: deal, property_type: kind,
    city: clean(s.city_name), district: clean(s.urban_name || s.district_name), address: clean(s.address),
    area_sqm: num(s.area), floor: int(s.floor), total_floors: int(s.total_floors),
    rooms, bedrooms: int(s.bedroom_type_id), bathrooms: int(s.bathroom_type_id),
    price: num(inGel ? gel?.price_total : usd?.price_total) || num(s.total_price), currency: inGel ? 'GEL' : 'USD',
    price_usd: num(usd?.price_total), price_gel: num(gel?.price_total),
    lat: Number(s.lat) || null, lng: Number(s.lng) || null,
    description: s.comment, cadastral_code: null,
    images: (Array.isArray(s.images) ? s.images : []).map(i => i?.large || i?.thumb).filter(Boolean),
  };
}

function parseSs(html) {
  const data = nextData(html);
  const a = data?.props?.pageProps?.applicationData;
  if (!a) return null;
  const ad = a.address || {};
  const inGel = Number(a.price?.currencyType) === 1;
  const desc = typeof a.description === 'string' ? a.description : (a.description?.ka || a.description?.en || a.description?.ru || '');
  return {
    title: clean(a.title),
    transaction_type: dealType(a.realEstateDealType || a.title), property_type: propertyType(a.realEstateType),
    city: clean(ad.cityTitle || ad.municipalityTitle), district: clean(ad.subdistrictTitle || ad.districtTitle),
    address: clean([ad.streetTitle, ad.streetNumber].filter(Boolean).join(' ')),
    area_sqm: num(a.totalArea || a.areaOfHouse), floor: int(a.floor), total_floors: int(a.floors),
    rooms: int(a.rooms), bedrooms: int(a.bedrooms), bathrooms: int(a.toilet),
    price: num(inGel ? a.price?.priceGeo : a.price?.priceUsd), currency: inGel ? 'GEL' : 'USD',
    price_usd: num(a.price?.priceUsd), price_gel: num(a.price?.priceGeo),
    lat: Number(a.locationLatitude) || null, lng: Number(a.locationLongitude) || null,
    description: desc, cadastral_code: /^\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{3}/.test(a.cadastralCode || '') ? a.cadastralCode : null,
    images: (Array.isArray(a.appImages) ? a.appImages : []).map(i => i?.fileName).filter(Boolean),
  };
}

function parsePlace(html) {
  const meta = (name) => decode((html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`)) || [])[1] || '');
  const title = clean(meta('og:title').replace(/\s*-\s*place\.ge\s*$/i, ''));
  if (!title) return null;
  const text = clean(decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')));
  const pick = (re) => (text.match(re) || [])[1] || null;
  const priceM = text.match(/([$₾])\s?([\d,. ]{3,})\s*\/\s*[$₾]/) || text.match(/ფასი:\s*([$₾])\s?([\d,. ]{3,})/);
  const floor = text.match(/სართული:\s*(\d+)\s*\/\s*(\d+)/);
  const addr = clean(pick(/მისამართი:\s*([^:]+?)\s+(?:სართული|ოთახი|ფართი|რემონტი|სტატუსი|პროექტი|სველი)/) || '');
  const parts = addr.split(',').map(clean).filter(Boolean);
  const descRaw = pick(/დამატებითი ინფორმაცია გამყიდველისაგან:\s*([\s\S]*?)\s*(?:მსგავსი განცხადებები|$)/) || meta('og:description');
  // Photos of "similar listings" further down the page belong to other ads.
  const own = html.split('მსგავსი განცხადებები')[0];
  const images = [...new Set([...own.matchAll(/https:\/\/photos\.place\.ge\/photos\/(\d+)\/\d+x\d+\.(?:webp|jpe?g)/g)].map(m => m[1]))]
    .map(id => `https://photos.place.ge/photos/${id}/800x600.webp`);
  return {
    title,
    transaction_type: dealType(title), property_type: propertyType(title),
    city: parts[0] || '', district: parts.length > 2 ? parts[parts.length - 2] : (parts[1] || ''), address: parts.length > 1 ? parts[parts.length - 1] : '',
    area_sqm: num(pick(/ფართი:\s*([\d.,]+)\s*კვ/)), floor: floor ? int(floor[1]) : null, total_floors: floor ? int(floor[2]) : null,
    rooms: int(pick(/ოთახი:\s*(\d+)/)), bedrooms: int(pick(/საძინებელი:\s*(\d+)/)), bathrooms: int(pick(/სველი წერტილი:\s*(\d+)/)),
    price: priceM ? num(priceM[2]) : null, currency: priceM && priceM[1] === '₾' ? 'GEL' : 'USD',
    price_usd: null, price_gel: null, lat: null, lng: null,
    description: descRaw, cadastral_code: null,
    images,
  };
}

const PARSERS = { 'myhome.ge': parseMyhome, 'ss.ge': parseSs, 'place.ge': parsePlace };

// Returns the normalized listing or null when the page does not look like a listing.
function parseListing(site, html) {
  const raw = PARSERS[site]?.(String(html || ''));
  if (!raw || !(raw.title || raw.price || raw.area_sqm)) return null;
  const price = raw.price;
  const out = {
    ...raw,
    source: site,
    description: debrand(raw.description).slice(0, 2500),
    images: [...new Set(raw.images)].filter(u => /^https:\/\//.test(u)).slice(0, 15),
    price_sqm: raw.transaction_type === 'sale' && price && raw.area_sqm ? Math.round(price / raw.area_sqm) : null,
  };
  // A short internal name: "ვაკე · ჭავჭავაძის გამზ., 3-ოთახიანი"
  out.name = clean([[out.district, out.address].filter(Boolean).join(' · '), out.rooms ? `${out.rooms}-ოთახიანი` : ''].filter(Boolean).join(', ')) || out.title;
  return out;
}

module.exports = { ALLOWED_HOSTS, hostOf, parseListing, debrand };
module.exports.default = module.exports;
