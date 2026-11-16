import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { adDogrula, HARFLER } from './dogrula.js';
import { sonucMetni } from '../public/sonucMetni.js';

export function oyuncuEkle(oda, ad) {
  ad = adDogrula(ad);
  if (oda.evre === 'bitti') throw new Error('Oda bitmiş; katılım kapalı');
  if (oda.oyuncular.length >= 4) throw new Error('Oda dolu');
  if (oda.oyuncular.some(p => p.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) throw new Error('ad: bu ad alınmış');
  const p = { id: randomUUID(), anahtar: randomBytes(24).toString('hex'), ad, kurucu: oda.oyuncular.length === 0, gonderdi: false, konum: 0, cevaplar: {}, baglantilar: new Set() };
  oda.oyuncular.push(p);
  return p;
}

export function odaKur({ set, mod, soruSuresi = 30, toplamSure = 0, ad, asistan = false }, odalar = new Map(), simdi = Date.now()) {
  if (!['kahoot', 'serbest'].includes(mod)) throw new Error('mod: kahoot veya serbest olmalı');
  if (!Number.isInteger(soruSuresi) || soruSuresi < 5 || soruSuresi > 600) throw new Error('soruSuresi: 5–600 arası tam sayı olmalı');
  if (!Number.isInteger(toplamSure) || toplamSure < 0 || toplamSure * 60000 > 2147483647) throw new Error('toplamSure: 0–35791 arası tam sayı olmalı');
  let kod;
  if (odalar.size >= 90000) throw new Error('Oda kodları tükendi');
  do { kod = String(randomInt(10000, 100000)); } while (odalar.has(kod));
  const oda = { kod, set, mod, soruSuresi, toplamSure, tarih: new Date(simdi).toISOString(), evre: 'lobi', sira: null, bitis: null, sureMs: null, baslangic: null, oyuncular: [], zamanlayici: null };
  if (asistan === true) oda.yonetici = randomBytes(24).toString('hex');
  else oyuncuEkle(oda, ad);
  return oda;
}

export function kimlik(oda, id, anahtar) { return oda?.oyuncular.find(p => p.id === id && p.anahtar === anahtar); }
export const tamam = c => !!c?.sik && Number.isInteger(c.guven) && c.guven >= 1 && c.guven <= 3;
export function acildi(oda, i) { return oda.evre === 'bitti' || (oda.mod === 'kahoot' && (i < oda.sira || (i === oda.sira && oda.evre === 'acik'))); }
export function puan(soru, cevap, sureMs, baslangic) {
  return soru.dogru && cevap?.sik === soru.dogru ? Math.round(1000 * (1 - Math.min(1, Math.max(0, (cevap.an - baslangic) / sureMs)) / 2)) : 0;
}
function soruBaslat(oda, simdi) {
  oda.evre = 'soru';
  oda.sureMs = (oda.set.sorular[oda.sira].sure ?? oda.soruSuresi) * 1000;
  oda.baslangic = simdi;
  oda.bitis = simdi + oda.sureMs;
}
function ac(oda) {
  if (oda.mod === 'kahoot') oda.evre = 'acik';
  else {
    oda.evre = 'bitti';
    for (const p of oda.oyuncular) {
      p.gonderdi = true;
      for (const c of Object.values(p.cevaplar)) c.kilitli = true;
    }
  }
  oda.bitis = null;
  oda.sureMs = null;
}
export function sureyiIsle(oda, simdi = Date.now()) {
  if (oda.bitis !== null && simdi >= oda.bitis) { ac(oda); return true; }
  return false;
}

export function islem(oda, p, m, simdi = Date.now()) {
  sureyiIsle(oda, simdi);
  if (!m || typeof m !== 'object') throw new Error('İleti nesne olmalı');
  const gerek = (kosul, ileti) => { if (!kosul) throw new Error(ileti); };
  if (m.tur === 'baslat') {
    gerek(p.kurucu && oda.evre === 'lobi', 'Yalnız kurucu lobide başlatabilir');
    if (oda.mod === 'kahoot') { oda.sira = 0; soruBaslat(oda, simdi); }
    else { oda.evre = 'cozum'; oda.baslangic = simdi; oda.sureMs = oda.toplamSure ? oda.toplamSure * 60000 : null; oda.bitis = oda.sureMs ? simdi + oda.sureMs : null; }
  } else if (m.tur === 'kilitle' || m.tur === 'taslak') {
    const kilit = m.tur === 'kilitle';
    gerek(kilit ? oda.mod === 'kahoot' && oda.evre === 'soru' : oda.mod === 'serbest' && oda.evre === 'cozum' && !p.gonderdi, 'Bu evrede cevap verilemez');
    const s = oda.set.sorular.find(s => s.id === m.soruId);
    gerek(s && (!kilit || s === oda.set.sorular[oda.sira]), 'soruId: geçerli soru değil');
    gerek(!p.cevaplar[s.id]?.kilitli, 'Cevap zaten kilitli');
    gerek((!kilit && m.sik === null) || (typeof m.sik === 'string' && m.sik.length === 1 && HARFLER.slice(0, s.siklar.length).includes(m.sik)), 'sik: geçerli şık seçilmeli');
    gerek((!kilit && m.guven === null) || (Number.isInteger(m.guven) && m.guven >= 1 && m.guven <= 3), 'guven: 1–3 olmalı');
    gerek(m.neden === undefined || typeof m.neden === 'string', 'neden: metin olmalı');
    const c = { sik: m.sik, guven: m.guven, neden: (m.neden ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 120), kilitli: kilit, an: simdi };
    if (kilit) c.puan = puan(s, c, oda.sureMs, oda.baslangic);
    p.cevaplar[s.id] = c;
    if (kilit && oda.oyuncular.every(p => p.cevaplar[s.id]?.kilitli)) ac(oda);
  } else if (m.tur === 'konum') {
    gerek(oda.mod === 'serbest' && oda.evre !== 'lobi' && Number.isInteger(m.sira) && m.sira >= 0 && m.sira < oda.set.sorular.length, 'sira: geçersiz konum');
    p.konum = m.sira;
  } else if (m.tur === 'gonder') {
    gerek(oda.mod === 'serbest' && oda.evre === 'cozum' && !p.gonderdi, 'Şimdi gönderilemez');
    const eksikler = oda.set.sorular.filter(s => !tamam(p.cevaplar[s.id])).map(s => s.id);
    if (eksikler.length) throw Object.assign(new Error('Eksik sorular var'), { eksikler });
    p.gonderdi = true;
    for (const c of Object.values(p.cevaplar)) c.kilitli = true;
    if (oda.oyuncular.every(p => p.gonderdi)) ac(oda);
  } else if (m.tur === 'sonraki') {
    gerek(oda.mod === 'kahoot' && oda.evre === 'acik' && (p.kurucu || !oda.oyuncular.find(p => p.kurucu)?.baglantilar.size), 'Şimdi sıradaki soruya geçilemez');
    if (oda.sira + 1 === oda.set.sorular.length) oda.evre = 'bitti';
    else { oda.sira++; soruBaslat(oda, simdi); }
  } else if (m.tur === 'simdiAc') {
    gerek(p.kurucu && oda.mod === 'serbest' && oda.evre === 'cozum', 'Yalnız kurucu çözümü açabilir');
    ac(oda);
  } else throw new Error('Bilinmeyen ileti türü');
}

export function asistanSonucu(oda) {
  const sonuc = {
    kod: oda.kod, baslik: oda.set.baslik, mod: oda.mod, evre: oda.evre,
    bitti: oda.evre === 'bitti', soruSayisi: oda.set.sorular.length,
    oyuncular: oda.oyuncular.map(p => ({
      ad: p.ad, bagli: p.baglantilar.size > 0,
      isaretli: Object.values(p.cevaplar).filter(tamam).length, gonderdi: p.gonderdi,
      kilitledi: !!p.cevaplar[oda.set.sorular[oda.sira]?.id]?.kilitli
    })),
    sira: oda.sira
  };
  if (sonuc.bitti) {
    const durum = gorunum(oda, oda.oyuncular[0].id);
    sonuc.metin = sonucMetni(durum);
    sonuc.skorlar = durum.oyuncular.map(({ ad, dogruSayisi, puan }) => ({ ad, dogruSayisi, puan }));
    sonuc.sorular = durum.sorular.map(s => ({
      id: s.id, metin: s.metin, dogru: s.dogru,
      cevaplar: s.cevaplar.map(({ oyuncuId, ...cevap }) => ({
        ad: durum.oyuncular.find(p => p.id === oyuncuId).ad, ...cevap
      }))
    }));
  }
  return sonuc;
}

export function gorunum(oda, oyuncuId, simdi = Date.now()) {
  const ben = oda.oyuncular.find(p => p.id === oyuncuId);
  const skor = p => oda.set.sorular.reduce((a, s, i) => {
    if (acildi(oda, i)) { a.dogruSayisi += Number(!!s.dogru && tamam(p.cevaplar[s.id]) && p.cevaplar[s.id].sik === s.dogru); a.puan += oda.mod === 'kahoot' ? (p.cevaplar[s.id]?.puan ?? 0) : 0; }
    return a;
  }, { puan: 0, dogruSayisi: 0 });
  return {
    sunucuSaat: simdi, kod: oda.kod, mod: oda.mod, evre: oda.evre,
    set: { set_id: oda.set.set_id, baslik: oda.set.baslik, ders: oda.set.ders, soruSayisi: oda.set.sorular.length },
    soruSuresi: oda.soruSuresi, toplamSure: oda.toplamSure,
    ben: { id: ben.id, ad: ben.ad, kurucu: ben.kurucu, gonderdi: ben.gonderdi, konum: ben.konum },
    oyuncular: oda.oyuncular.map(p => ({ id: p.id, ad: p.ad, kurucu: p.kurucu, bagli: p.baglantilar.size > 0, isaretli: Object.values(p.cevaplar).filter(tamam).length, gonderdi: p.gonderdi, kilitledi: !!p.cevaplar[oda.set.sorular[oda.sira]?.id]?.kilitli, ...skor(p) })),
    puanli: oda.set.sorular.some(s => !!s.dogru), sira: oda.sira, bitis: oda.bitis, sureMs: oda.sureMs,
    sorular: oda.set.sorular.flatMap((s, i) => {
      if (oda.evre === 'lobi' || (oda.mod === 'kahoot' && i > oda.sira)) return [];
      const c = ben.cevaplar[s.id];
      const soru = { id: s.id, sira: i, etiket: s.etiket, metin: s.metin, siklar: [...s.siklar], gorsel: s.gorsel, benim: c ? { sik: c.sik, guven: c.guven, neden: c.neden, kilitli: c.kilitli } : null, acik: acildi(oda, i) };
      if (soru.acik) {
        soru.dogru = s.dogru ?? null;
        if (oda.set.aciklamalari_goster !== false) soru.aciklama = s.aciklama ?? null;
        soru.cevaplar = oda.oyuncular.map(p => {
          const c = tamam(p.cevaplar[s.id]) ? p.cevaplar[s.id] : null;
          return { oyuncuId: p.id, sik: c?.sik ?? null, guven: c?.guven ?? null, neden: c?.neden ?? '', dogruMu: s.dogru ? c?.sik === s.dogru : null, puan: oda.mod === 'kahoot' ? c?.puan ?? 0 : 0 };
        });
      }
      return [soru];
    })
  };
}
