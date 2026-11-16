const metin = x => typeof x === 'string' && x.trim().length > 0;
export const HARFLER = 'ABCDE';
export const GÖVDE_SINIRI = 5 * 1024 * 1024;

export function gorselGecerli(deger) {
  if (typeof deger !== 'string') return false;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml)(;base64)?,[^\s]+$/i.test(deger)) return true;
  try { return ['http:', 'https:'].includes(new URL(deger).protocol); }
  catch { return false; }
}

export function dogrula(girdi) {
  const hatalar = [];
  let set = girdi;
  if (typeof set === 'string') {
    try { set = JSON.parse(set); }
    catch (e) { return { hatalar: [`JSON okunamadı: ${e.message}`] }; }
  }
  if (!set || typeof set !== 'object' || Array.isArray(set)) return { hatalar: ['set: nesne olmalı'] };
  const hata = (alan, ileti) => hatalar.push(`${alan}: ${ileti}`);
  if (set.surum !== 1) hata('surum', '1 olmalı');
  for (const alan of ['set_id', 'baslik']) if (!metin(set[alan])) hata(alan, 'boş olmayan metin olmalı');
  if (set.ders !== undefined && typeof set.ders !== 'string') hata('ders', 'metin olmalı');
  if (set.aciklamalari_goster !== undefined && typeof set.aciklamalari_goster !== 'boolean') hata('aciklamalari_goster', 'boolean olmalı');
  if (!Array.isArray(set.sorular) || !set.sorular.length) hata('sorular', 'en az 1 soru olmalı');
  const idler = new Set();
  for (const [i, s] of (Array.isArray(set.sorular) ? set.sorular : []).entries()) {
    const yol = `sorular[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { hata(yol, 'nesne olmalı'); continue; }
    for (const alan of ['id', 'metin']) if (!metin(s[alan])) hata(`${yol}.${alan}`, 'boş olmayan metin olmalı');
    if (idler.has(s.id)) hata(`${yol}.id`, 'benzersiz olmalı');
    idler.add(s.id);
    if (!Array.isArray(s.siklar) || s.siklar.length < 2 || s.siklar.length > 5) hata(`${yol}.siklar`, `2 ile 5 arası şık olmalı (${s.siklar?.length ?? 0} var)`);
    else s.siklar.forEach((x, j) => { if (!metin(x)) hata(`${yol}.siklar[${j}]`, 'boş olmayan metin olmalı'); });
    if (s.dogru !== undefined && !(typeof s.dogru === 'string' && s.dogru.length === 1 && HARFLER.slice(0, s.siklar?.length ?? 0).includes(s.dogru))) hata(`${yol}.dogru`, 'şık sayısına uygun A–E harfi olmalı');
    for (const alan of ['etiket', 'aciklama']) if (s[alan] !== undefined && typeof s[alan] !== 'string') hata(`${yol}.${alan}`, 'metin olmalı');
    if (s.gorsel !== undefined && !gorselGecerli(s.gorsel)) hata(`${yol}.gorsel`, 'http/https URL veya desteklenen data:image veri URI’si olmalı');
    if (s.sure !== undefined && (!Number.isInteger(s.sure) || s.sure < 5 || s.sure > 600)) hata(`${yol}.sure`, '5–600 arası tam sayı olmalı');
  }
  return hatalar.length ? { hatalar } : { hatalar, set: structuredClone(set), soruSayisi: set.sorular.length };
}

export function adDogrula(ad) {
  if (typeof ad !== 'string' || ad.trim().length < 1 || ad.trim().length > 20) throw new Error('ad: 1–20 karakter olmalı');
  return ad.trim();
}
