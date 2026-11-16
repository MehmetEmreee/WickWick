// Oda: katılma, WebSocket bağlantısı ve durum nesnesinden türeyen ekranlar.
import { el, depo, api, hataMetni, matDugum, gorselKutusu, kopyaDugmesi, secenekler, HARF } from './ortak.js';
import { sonucMetni } from './sonucMetni.js';

const GUVEN = { 1: 'Tahmin', 2: 'Kısmen', 3: 'Eminim' };

let o = null; // etkin oda oturumu

// ---------------------------------------------------------------- Oturum
export function odaKapat() {
  if (!o) return;
  const eski = o;
  eski.sohbet?.kapat();
  eski.ekran?.kapat?.();
  o = null;
  clearTimeout(eski.zaman);
  if (eski.ws) { eski.ws.onclose = null; eski.ws.close(); }
}

export function odaAc(kok, kod) {
  odaKapat();
  const kimlik = depo.kimlik(kod);
  if (!kimlik) return katilEkrani(kok, kod);
  document.title = `Oda ${kod} · WickWick`;
  o = {
    kok, kod, kimlik, ws: null, deneme: 0, zaman: null, yeniBaglanti: false,
    ekran: null, anahtar: '', durum: null, fark: 0,
    baglanti: el('span', { class: 'baglanti', role: 'status' }),
    govde: el('div', { class: 'oda-govde' }, el('p', { class: 'not orta', text: 'Bağlanıyor…' })),
  };
  seritYaz('bekliyor');
  kok.replaceChildren(
    el('div', { class: 'oda-durum' }, el('a', { href: '#/', class: 'geri', text: '‹ Ana sayfa' }), o.baglanti),
    o.govde);
  scrollTo(0, 0);
  baglan();
}

function seritYaz(hal) {
  o.sohbet?.guncelle();
  const b = o.baglanti;
  b.classList.toggle('kesik', hal === 'kesik');
  b.textContent = hal === 'kesik' ? 'Bağlantı kesildi, yeniden bağlanılıyor…'
    : hal === 'bagli' ? `● Oda ${o.kod}` : `Oda ${o.kod}`;
}

function baglan() {
  if (!o) return;
  const { kod, oyuncuId, anahtar } = o.kimlik;
  const sema = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = new URLSearchParams({ kod, oyuncuId, anahtar });
  const ws = new WebSocket(`${sema}//${location.host}/ws?${q}`);
  o.ws = ws;
  ws.onopen = () => { if (o?.ws !== ws) return; o.deneme = 0; o.yeniBaglanti = true; seritYaz('bagli'); };
  ws.onmessage = (e) => {
    if (o?.ws !== ws) return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    iletiIsle(m);
  };
  ws.onclose = () => {
    if (o?.ws !== ws) return;
    o.ws = null;
    seritYaz('kesik');
    clearTimeout(o.zaman);
    const bekle = Math.min(500 * 2 ** o.deneme, 10000);
    o.deneme++;
    o.zaman = setTimeout(baglan, bekle);
  };
}

function hemenDene() {
  if (!o || (o.ws && o.ws.readyState <= 1)) return;
  clearTimeout(o.zaman);
  baglan();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hemenDene(); });
addEventListener('pageshow', hemenDene);
addEventListener('online', hemenDene);

function gonder(m) {
  if (o?.ws?.readyState !== 1) return false;
  o.ws.send(JSON.stringify(m));
  return true;
}

function iletiIsle(m) {
  if (m.tur === 'durum' && m.durum) {
    o.fark = m.durum.sunucuSaat - Date.now();
    durumIsle(m.durum);
  } else if (m.tur === 'hata') {
    if (m.kod === 'kimlik') {
      const { kok, kod } = o;
      depo.sil(kod);
      odaKapat();
      katilEkrani(kok, kod, 'Bu cihazdaki oda kaydı geçersiz. Adınla yeniden katıl.');
      return;
    }
    if (m.islem === 'sor') { o.sohbet?.hata(m.ileti); return; }
    if (o.ekran?.hata) o.ekran.hata(m);
    else alert(m.ileti || 'Bir hata oluştu.');
  }
}

function ekranAnahtari(d) {
  if (d.evre === 'soru' || d.evre === 'acik') return `${d.evre}:${d.sira}`;
  if (d.evre === 'cozum') return d.ben.gonderdi ? 'cozumBekle' : 'cozum';
  return d.evre;
}

const EKRANLAR = {
  lobi: lobiEkrani, soru: kahootSoru, acik: kahootAcik,
  cozum: serbestCozum, cozumBekle: serbestBekle, bitti: sonucEkrani,
};

function durumIsle(d) {
  const ilk = o.yeniBaglanti;
  o.yeniBaglanti = false;
  o.durum = d;
  o.sohbet?.guncelle(true);
  const anahtar = ekranAnahtari(d);
  if (anahtar === o.anahtar && o.ekran) { o.ekran.guncelle?.(d, ilk); sohbetIsaretle(); return; }
  o.ekran?.kapat?.();
  o.anahtar = anahtar;
  const kur = EKRANLAR[anahtar.split(':')[0]];
  o.ekran = kur ? kur(d) : { dugum: el('p', { class: 'not', text: 'Bilinmeyen evre.' }) };
  o.govde.replaceChildren(o.ekran.dugum);
  o.ekran.takildi?.();
  sohbetIsaretle();
  if (!o.sohbet) scrollTo(0, 0);
}

const kalanMs = (bitis) => bitis - (Date.now() + o.fark);

// ---------------------------------------------------------------- Ortak parçalar
// Geri sayım: çubuk CSS transform geçişiyle, yazı yalnız değişince.
function sayacOlustur(bicim, bitince) {
  const cubuk = el('div', { class: 'sayac-cubuk' });
  const iz = el('div', { class: 'sayac-iz', hidden: true }, cubuk);
  const yazi = el('span', { class: 'sayac-yazi' });
  let bitis = null, t = null, son = '';
  function tik() {
    const k = Math.max(0, kalanMs(bitis));
    const s = bicim(k);
    if (s !== son) { yazi.textContent = s; son = s; }
    if (k <= 0) { clearInterval(t); t = null; bitince?.(); }
  }
  function ayarla(yeniBitis, sureMs) {
    if (yeniBitis === bitis) return;
    bitis = yeniBitis;
    clearInterval(t); t = null;
    if (bitis == null) { iz.hidden = true; yazi.textContent = son = ''; return; }
    iz.hidden = false;
    const k = Math.max(0, kalanMs(bitis));
    cubuk.style.transition = 'none';
    cubuk.style.transform = `scaleX(${sureMs ? Math.min(1, k / sureMs) : 0})`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (bitis !== yeniBitis) return;
      cubuk.style.transition = `transform ${Math.max(0, kalanMs(bitis))}ms linear`;
      cubuk.style.transform = 'scaleX(0)';
    }));
    tik();
    if (k > 0) t = setInterval(tik, 250);
  }
  return { iz, yazi, ayarla, kapat: () => clearInterval(t) };
}
const saniye = (k) => String(Math.ceil(k / 1000));
const dakikaSaniye = (k) => {
  const s = Math.ceil(k / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Satır listesi; yalnız içerik değişince yeniden yazılır.
function canliListe(sinif) {
  const ul = el('ul', { class: sinif, 'aria-label': sinif === 'oyuncu-durum' ? 'Oyuncu durumu' : 'Katılanlar' });
  let imza = '';
  return {
    ul,
    ciz(satirlar) {
      const y = JSON.stringify(satirlar);
      if (y === imza) return;
      imza = y;
      ul.replaceChildren(...satirlar.map(([yazi, s]) => el('li', { class: s || '', text: yazi })));
    },
  };
}

function oyuncuEki(d, p) {
  return (p.id === d.ben.id ? ' (sen)' : '') + (p.bagli ? '' : ' · bağlı değil');
}

function soruBasi(s, cevapAcik = false) {
  const etiket = cevapAcik || !s.etiket?.includes('|') ? s.etiket : s.etiket.split('|', 1)[0].trim();
  // Görseli olmayan soruda gorselKutusu null döner; replaceChildren'a null gitmesin.
  return [
    el('div', { class: 'soru-ust' },
      el('span', { class: 'cip', text: s.id }),
      etiket && el('span', { class: 'cip soluk', text: etiket })),
    matDugum('p', 'soru-metin', s.metin),
    gorselKutusu(s.gorsel),
  ].filter(Boolean);
}

// Şık ve güven seçici (kahoot ve serbest ortak). degisti(alan) seçim değişince çağrılır.
function cevapSecici(s, sec, kapali, degisti) {
  const siklar = s.siklar.map((m, j) => el('button', {
    type: 'button', class: `sik renk-${HARF[j]}`,
    onclick() { if (kapali()) return; sec.sik = sec.sik === HARF[j] ? null : HARF[j]; ciz(); degisti('sik'); },
  }, el('span', { class: 'rozet', text: HARF[j] }), matDugum('span', 'sik-metin', m)));
  const guvenler = [1, 2, 3].map((g) => el('button', {
    type: 'button', class: 'guven',
    onclick() { if (kapali()) return; sec.guven = sec.guven === g ? null : g; ciz(); degisti('guven'); },
  }, el('b', { text: String(g) }), el('span', { text: GUVEN[g] })));
  let notAcik = !!sec.neden;
  const notEkle = el('button', {
    type: 'button', class: 'metin-dugme', text: '+ Not ekle',
    onclick() { notAcik = true; ciz(); neden.focus(); },
  });
  const neden = el('input', {
    type: 'text', maxLength: 120, value: sec.neden || '', placeholder: 'Neden? (isteğe bağlı)',
    autocomplete: 'off', enterKeyHint: 'done', 'aria-label': 'Neden',
    oninput() { sec.neden = neden.value; degisti('neden'); },
    onkeydown(e) { if (e.key === 'Enter') { e.preventDefault(); neden.blur(); } },
  });
  const nedenAlan = el('label', { class: 'alan' }, el('span', { class: 'gorunmez', text: 'Neden' }), neden);
  function ciz() {
    const k = kapali();
    notEkle.hidden = k || notAcik || !!sec.neden;
    nedenAlan.hidden = k ? !sec.neden : !notAcik && !sec.neden;
    siklar.forEach((b, j) => {
      const on = sec.sik === HARF[j];
      b.classList.toggle('secili', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = k;
    });
    guvenler.forEach((b, j) => {
      const on = sec.guven === j + 1;
      b.classList.toggle('secili', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = k;
    });
    neden.readOnly = k;
    if (neden.value !== (sec.neden || '')) neden.value = sec.neden || '';
  }
  ciz();
  const dugum = el('div', { class: 'secici' },
    el('div', { class: 'siklar' }, siklar),
    el('p', { class: 'alt-baslik', text: 'Ne kadar eminsin? (isteğe bağlı)' }),
    el('div', { class: 'guvenler' }, guvenler),
    notEkle, nedenAlan);
  return { dugum, ciz, neden, siklar };
}

function skorTablosu(d, payda) {
  const kahoot = d.mod === 'kahoot';
  const deger = (p) => (kahoot ? [p.puan || 0, p.dogruSayisi || 0] : [p.dogruSayisi || 0, 0]);
  const liste = [...d.oyuncular].sort((a, b) => {
    const [a1, a2] = deger(a), [b1, b2] = deger(b);
    return b1 - a1 || b2 - a2;
  });
  return el('ol', { class: 'skorlar' }, liste.map((p) => {
    const [p1, p2] = deger(p);
    const sira = 1 + liste.filter((x) => { const [x1, x2] = deger(x); return x1 > p1 || (x1 === p1 && x2 > p2); }).length;
    const yazi = kahoot
      ? `${(p.puan || 0).toLocaleString('tr-TR')} puan · ${p.dogruSayisi || 0}/${payda} doğru`
      : `${p.dogruSayisi || 0}/${payda} doğru`;
    return el('li', { class: p.id === d.ben.id ? 'ben' : '' },
      el('span', { class: 'skor-sira', text: String(sira) }),
      el('span', { class: 'skor-ad', text: p.ad + (p.id === d.ben.id ? ' (sen)' : '') }),
      el('span', { class: 'skor-deger', text: yazi }));
  }));
}

// Açılmış bir sorunun karşılaştırması (kahoot açılış ve sonuç ekranı).
function cevapBlogu(s, d) {
  const adlar = new Map(d.oyuncular.map((p) => [p.id, p.ad]));
  const cevaplar = s.cevaplar || [];
  const verenler = cevaplar.filter((c) => c.sik);
  const hepsiYanlis = !!s.dogru && verenler.length >= 2 && verenler.every((c) => c.dogruMu === false);
  const puanGoster = d.mod === 'kahoot' && d.puanli;
  const ad = (c) => (adlar.get(c.oyuncuId) ?? '?') + (c.oyuncuId === d.ben.id ? ' (sen)' : '');

  const siklar = el('ol', { class: 'sik-sonuclar' }, s.siklar.map((m, j) => {
    const h = HARF[j];
    const dogru = s.dogru === h;
    const yanlis = !!s.dogru && !dogru && cevaplar.some((c) => c.oyuncuId === d.ben.id && c.sik === h);
    const kimler = cevaplar.filter((c) => c.sik === h).map((c) => el('span', {},
      `${ad(c)}${c.guven ? ` · güven ${c.guven}` : ''}${c.dogruMu === true ? ' ✓' : c.dogruMu === false ? ' ✗' : ''}${puanGoster && c.dogruMu === true ? ` +${c.puan || 0}` : ''}`,
      c.guven === 3 && c.dogruMu === false && el('span', { class: 'etiket-uyari', text: 'emin ama yanlış' })));
    return el('li', { class: `sik-sonuc renk-${h}${dogru ? ' dogru' : yanlis ? ' yanlis' : ''}` },
      el('span', { class: 'rozet', text: h }),
      el('div', { class: 'ss-govde' },
        matDugum('div', 'ss-metin', m),
        kimler.length > 0 && el('div', { class: 'ss-kimler' }, kimler),
        s.sik_aciklamalari?.[j] && matDugum('div', `sik-aciklama${dogru || yanlis ? ' belirgin' : ''}`, s.sik_aciklamalari[j])),
      (dogru || yanlis) && el('span', { class: 'ss-isaret', text: dogru ? '✓ Doğru' : '✗ Yanlış' }));
  }));

  const boslar = cevaplar.filter((c) => !c.sik).map(ad);
  const nedenler = cevaplar.filter((c) => c.neden).map((c) => el('p', { class: 'cevap-neden', text: `${ad(c)}: ${c.neden}` }));

  return el('section', { class: 'kart soru-sonuc' },
    ...soruBasi(s, true),
    hepsiYanlis && el('p', { class: 'vurgu-kutu', text: verenler.length === 2 ? 'İkiniz de yanlış' : 'Hepiniz yanlış' }),
    siklar,
    s.aciklama && el('div', { class: 'aciklama' }, el('h3', { text: 'Açıklama' }), matDugum('div', 'aciklama-metin', s.aciklama)),
    sohbetGirisi(s, d),
    boslar.length > 0 && el('p', { class: 'not', text: `Boş: ${boslar.join(', ')}` }),
    nedenler);
}

function hataKutusu() {
  const p = el('p', { class: 'hata', hidden: true, 'aria-live': 'polite' });
  return {
    p,
    yaz(ileti) { p.textContent = ileti || ''; p.hidden = !ileti; },
  };
}

// ---------------------------------------------------------------- Katılma
async function katilEkrani(kok, kod, uyari) {
  document.title = `Oda ${kod} · WickWick`;
  const bilgi = el('div', { class: 'kart' }, el('p', { class: 'not', text: 'Oda bilgisi alınıyor…' }));
  const ad = el('input', {
    type: 'text', maxLength: 20, value: depo.sonAd(), autocomplete: 'nickname', autocapitalize: 'words',
    enterKeyHint: 'go', placeholder: 'Adın',
  });
  const hata = hataKutusu();
  hata.yaz(uyari);
  const dugme = el('button', { class: 'dugme ana buyuk', text: 'Katıl' });
  const form = el('form', {
    class: 'katil-form', hidden: true,
    async onsubmit(e) {
      e.preventDefault();
      const adi = ad.value.trim();
      if (!adi) { hata.yaz('Adını yaz.'); ad.focus(); return; }
      dugme.disabled = true;
      const r = await api(`/api/odalar/${kod}/katil`, { ad: adi });
      dugme.disabled = false;
      if (!r.ok || !r.veri.oyuncuId) { hata.yaz(hataMetni(r.veri, 'Katılınamadı.')); return; }
      depo.kaydet({ kod, oyuncuId: r.veri.oyuncuId, anahtar: r.veri.anahtar, ad: adi });
      if (location.hash === `#/oda/${kod}`) odaAc(kok, kod);
    },
  }, el('label', { class: 'alan' }, el('span', { text: 'Adın' }), ad), dugme);

  kok.replaceChildren(
    el('a', { href: '#/', class: 'geri', text: '‹ Ana sayfa' }),
    el('h1', { text: 'Odaya katıl' }),
    bilgi, form, hata.p);
  scrollTo(0, 0);

  const r = await api(`/api/odalar/${kod}`);
  if (!bilgi.isConnected) return;
  if (!r.ok) {
    bilgi.replaceChildren(el('p', { class: 'hata', text: r.durum === 404 ? `${kod} kodlu oda bulunamadı.` : hataMetni(r.veri, 'Oda bilgisi alınamadı.') }));
    return;
  }
  const v = r.veri;
  const kisiler = v.oyuncular || [];
  bilgi.replaceChildren(
    el('p', { class: 'not', text: `Oda ${v.kod || kod} · ${v.mod === 'serbest' ? 'Kendi hızında' : 'Süreli'}` }),
    el('h2', { text: v.baslik || '' }),
    el('p', { text: kisiler.length ? `Katılanlar: ${kisiler.join(', ')}` : 'Henüz kimse katılmadı.' }));
  if (v.evre === 'bitti') bilgi.append(el('p', { class: 'hata', text: 'Bu test bitti; katılım kapalı.' }));
  else if (v.dolu) bilgi.append(el('p', { class: 'hata', text: 'Oda dolu (en fazla 4 kişi).' }));
  else form.hidden = false;
}

// ---------------------------------------------------------------- Lobi
let adresSozu = null;
function yerelAdres() {
  adresSozu ||= api('/api/adres').then((r) => {
    const a = r.ok && Array.isArray(r.veri.adresler) ? r.veri.adresler[0] : null;
    if (!a || !/^https?:\/\//.test(a)) { adresSozu = null; return null; }
    return a;
  });
  return adresSozu;
}

function lobiEkrani(d) {
  let link = `${location.origin}/#/oda/${d.kod}`;
  const paylasMetni = () => `${d.set.baslik} testine katıl: ${link}`;
  const whatsapp = el('a', {
    class: 'dugme', target: '_blank', rel: 'noopener', text: 'WhatsApp',
    href: `https://wa.me/?text=${encodeURIComponent(paylasMetni())}`,
  });
  // Mac'te localhost'tan açıldıysa telefonların açabileceği yerel ağ adresini kullan.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    yerelAdres().then((adres) => {
      if (!adres) return;
      link = `${adres.replace(/\/+$/, '')}/#/oda/${d.kod}`;
      whatsapp.href = `https://wa.me/?text=${encodeURIComponent(paylasMetni())}`;
    });
  }
  const kisiler = canliListe('oyuncu-listesi');
  const baslat = el('button', {
    type: 'button', class: 'dugme ana buyuk', text: 'Başlat',
    onclick() { if (gonder({ tur: 'baslat' })) baslat.disabled = true; else hata.yaz('Bağlantı yok; bağlanınca tekrar dene.'); },
  });
  const bekle = el('p', { class: 'not orta', text: 'Kurucu başlatınca test açılacak.' });
  const hata = hataKutusu();
  const sayi = el('h2');
  const sureYazi = d.mod === 'kahoot'
    ? `Süreli · soru başına ${d.soruSuresi} sn`
    : `Kendi hızında · ${d.toplamSure ? `${d.toplamSure} dk` : 'süresiz'}`;

  function guncelle(y) {
    sayi.textContent = `Katılanlar (${y.oyuncular.length}/4)`;
    kisiler.ciz(y.oyuncular.map((p) => [p.ad + (p.kurucu ? ' · kurucu' : '') + oyuncuEki(y, p), p.bagli ? '' : 'soluk']));
    baslat.hidden = !y.ben.kurucu;
    bekle.hidden = y.ben.kurucu;
  }
  guncelle(d);
  return {
    dugum: el('div', { class: 'lobi' },
      el('section', { class: 'kart orta' },
        el('p', { class: 'not', text: 'Oda kodu' }),
        el('div', { class: 'oda-kodu', text: d.kod }),
        el('h1', { class: 'lobi-baslik', text: d.set.baslik }),
        el('p', { class: 'not', text: [d.set.ders, `${d.set.soruSayisi} soru`, sureYazi].filter(Boolean).join(' · ') })),
      el('section', {}, sayi, kisiler.ul),
      baslat, bekle,
      el('section', { class: 'kart' },
        el('div', { class: 'iki-dugme' },
          kopyaDugmesi('Linki kopyala', () => link),
          whatsapp)),
      hata.p),
    guncelle,
    hata(m) { baslat.disabled = false; hata.yaz(m.ileti); },
  };
}

// ---------------------------------------------------------------- Kahoot: soru
function kahootSoru(d) {
  const s = d.sorular.find((x) => x.sira === d.sira) || d.sorular[d.sorular.length - 1];
  const sec = { sik: s.benim?.sik ?? null, guven: s.benim?.guven ?? null, neden: s.benim?.neden ?? '' };
  let kilitli = !!s.benim?.kilitli, bekliyor = false, sureBitti = false, sonIleti = null;
  const kapali = () => kilitli || bekliyor || sureBitti;

  const sayac = sayacOlustur(saniye, () => { sureBitti = true; ciz(); });
  const secici = cevapSecici(s, sec, kapali, ciz);
  const kilitle = el('button', { type: 'button', class: 'dugme ana buyuk', text: 'Kilitle', onclick: () => kilitleBas(false) });
  const bosBirak = el('button', { type: 'button', class: 'dugme', text: 'Boş bırak', onclick: () => kilitleBas(true) });
  const bilgi = el('p', { class: 'not orta' });
  const hata = hataKutusu();
  const durumlar = canliListe('oyuncu-durum');

  function kilitleBas(bos) {
    if (kapali() || (!bos && !sec.sik)) return;
    sonIleti = { tur: 'kilitle', soruId: s.id, sik: bos ? null : sec.sik, guven: bos ? null : sec.guven, neden: (sec.neden || '').trim().slice(0, 120) };
    if (!gonder(sonIleti)) { hata.yaz('Bağlantı yok; bağlanınca tekrar dene.'); return; }
    if (bos) Object.assign(sec, { sik: null, guven: null });
    hata.yaz('');
    bekliyor = true;
    secici.neden.blur();
    ciz();
  }
  function ciz() {
    secici.ciz();
    const k = kapali();
    kilitle.disabled = k || !sec.sik;
    kilitle.textContent = kilitli || bekliyor ? (sec.sik ? 'Kilitlendi ✓' : 'Boş bırakıldı ✓') : 'Kilitle';
    bosBirak.disabled = k;
    bosBirak.hidden = kilitli || bekliyor;
    bilgi.textContent = kilitli || bekliyor ? 'Diğerleri bekleniyor…'
      : sureBitti ? 'Süre doldu, cevaplar açılıyor…' : '';
  }
  function guncelle(y, ilk) {
    const ys = y.sorular.find((x) => x.sira === y.sira);
    if (ys?.benim?.kilitli && !kilitli) {
      kilitli = true; bekliyor = false;
      Object.assign(sec, { sik: ys.benim.sik, guven: ys.benim.guven, neden: ys.benim.neden || '' });
    } else if (ilk && bekliyor && sonIleti) gonder(sonIleti); // kopukken gitmemiş olabilir
    sayac.ayarla(y.bitis, y.sureMs);
    durumlar.ciz(y.oyuncular.map((p) => [`${p.ad} ${p.kilitledi ? '✓' : '…'}${oyuncuEki(y, p)}`, p.kilitledi ? 'tamam' : '']));
    ciz();
  }

  const dugum = el('div', { class: 'soru-ekrani' },
    el('div', { class: 'ust-cubuk' },
      el('div', { class: 'ust-satir' },
        el('span', { class: 'sira-yazi', text: `${d.sira + 1}/${d.set.soruSayisi}` }),
        sayac.yazi),
      sayac.iz),
    ...soruBasi(s),
    secici.dugum,
    bilgi, hata.p, durumlar.ul,
    el('div', { class: 'alt-eylemler iki-dugme' }, kilitle, bosBirak));
  return {
    dugum,
    takildi: () => guncelle(d, false),
    guncelle,
    kapat: sayac.kapat,
    hata(m) { bekliyor = false; hata.yaz(m.ileti); ciz(); },
  };
}

// ---------------------------------------------------------------- Kahoot: açılış
function kahootAcik(d) {
  const s = d.sorular.find((x) => x.sira === d.sira) || d.sorular[d.sorular.length - 1];
  const sonMu = d.sira >= d.set.soruSayisi - 1;
  const hata = hataKutusu();
  const sonraki = el('button', {
    type: 'button', class: 'dugme ana buyuk', text: sonMu ? 'Sonuçları göster' : 'Sıradaki soru',
    onclick() { if (gonder({ tur: 'sonraki' })) sonraki.disabled = true; else hata.yaz('Bağlantı yok; bağlanınca tekrar dene.'); },
  });
  const bekle = el('p', { class: 'not orta', text: 'Kurucu sıradaki soruya geçirecek.' });
  const tablo = el('div');
  let tabloImza = '';

  function guncelle(y) {
    const kurucu = y.oyuncular.find((p) => p.kurucu);
    const izin = y.ben.kurucu || !kurucu?.bagli;
    sonraki.hidden = !izin;
    bekle.hidden = izin;
    if (y.puanli) {
      const acikSayi = y.sorular.filter((x) => x.acik).length;
      const imza = JSON.stringify(y.oyuncular.map((p) => [p.id, p.ad, p.puan, p.dogruSayisi]));
      if (imza !== tabloImza) { tabloImza = imza; tablo.replaceChildren(skorTablosu(y, acikSayi)); }
    }
  }
  guncelle(d);
  return {
    dugum: el('div', { class: 'acik-ekrani' },
      el('div', { class: 'ust-satir sabit-degil' },
        el('span', { class: 'sira-yazi', text: `${d.sira + 1}/${d.set.soruSayisi}` }),
        el('span', { class: 'not', text: 'Cevaplar açıldı' })),
      cevapBlogu(s, d),
      d.puanli && el('section', {}, el('h2', { text: 'Puan tablosu' }), tablo),
      bekle, hata.p,
      el('div', { class: 'alt-eylemler' }, sonraki)),
    guncelle,
    hata(m) { sonraki.disabled = false; hata.yaz(m.ileti); },
  };
}

// ---------------------------------------------------------------- Serbest: çözüm
function serbestCozum(d) {
  const sorular = [...d.sorular].sort((a, b) => a.sira - b.sira);
  const n = sorular.length;
  const yerel = new Map(sorular.map((s) => [s.id, { sik: s.benim?.sik ?? null, guven: s.benim?.guven ?? null, neden: s.benim?.neden ?? '' }]));
  let i = Math.min(Math.max(Number(d.ben.konum) || 0, 0), n - 1);
  let sureBitti = false, gonderiliyor = false, silahli = false, silahZaman = null;
  let nedenZaman = null, nedenId = null, secici = null, kontrolD = null;
  const kapali = () => sureBitti || gonderiliyor;
  const tamamMi = (c) => !!c.sik;
  const kilitliler = new Map(); // soruId -> { dogru, aciklama, sik_aciklamalari } ("Cevabı gör" sonrası)
  const istenen = new Set(); // kontrol gönderildi, kilit henüz gelmedi
  // Sunucudan gelen kilitleri işler; görüntülenen soru yeni kilitlendiyse true.
  function kilitIsle(y) {
    let simdiki = false;
    for (const ys of y.sorular) {
      if (!ys.benim?.kilitli || kilitliler.has(ys.id) || !yerel.has(ys.id)) continue;
      kilitliler.set(ys.id, { dogru: ys.dogru ?? null, aciklama: ys.aciklama ?? null, sik_aciklamalari: ys.sik_aciklamalari });
      istenen.delete(ys.id);
      Object.assign(yerel.get(ys.id), { sik: ys.benim.sik ?? null, guven: ys.benim.guven ?? null, neden: ys.benim.neden || '' });
      if (ys.id === sorular[i]?.id) simdiki = true;
    }
    return simdiki;
  }

  const sayac = sayacOlustur(dakikaSaniye, () => { sureBitti = true; ciz(); });
  const siraYazi = el('button', {
    type: 'button', class: 'sira-yazi metin-dugme', 'aria-expanded': 'false',
    onclick() { soruGezgini.hidden = !soruGezgini.hidden; ciz(); },
  });
  const noktalar = sorular.map((s, j) => el('button', { type: 'button', class: 'nokta', text: String(j + 1), onclick() { soruGezgini.hidden = true; git(j); ciz(); siraYazi.focus(); } }));
  const soruGezgini = el('nav', { class: 'noktalar', 'aria-label': 'Sorular', hidden: true }, noktalar);
  const soruAlani = el('div', { class: 'soru-alani' });
  const onceki = el('button', { type: 'button', class: 'dugme', text: '‹ Önceki', onclick: () => git(i - 1) });
  const sonrakiD = el('button', { type: 'button', class: 'dugme ana buyuk', text: 'Sonraki ›', onclick: () => git(i + 1) });
  const gonderD = el('button', { type: 'button', class: 'dugme', text: 'Gönder', onclick: gonderBas });
  const altEylemler = el('div', { class: 'alt-eylemler iki-dugme' }, onceki, sonrakiD);
  const gonderAlani = el('div', { class: 'gonder-alani' });
  const bilgi = el('p', { class: 'not orta', hidden: true });
  const hata = hataKutusu();
  const durumlar = canliListe('oyuncu-durum');

  function taslakGonder(id) {
    if (kilitliler.has(id)) return;
    const c = yerel.get(id);
    gonder({ tur: 'taslak', soruId: id, sik: c.sik, guven: c.guven, neden: c.neden.trim().slice(0, 120) });
  }
  function nedenBosalt() {
    if (!nedenZaman) return;
    clearTimeout(nedenZaman);
    nedenZaman = null;
    taslakGonder(nedenId);
  }
  function kontrolBas(id) {
    if (kapali() || kilitliler.has(id) || istenen.has(id)) return;
    nedenBosalt();
    if (!gonder({ tur: 'kontrol', soruId: id })) { hata.yaz('Bağlantı yok; bağlanınca tekrar dene.'); return; }
    hata.yaz('');
    istenen.add(id);
    ciz();
  }
  // Kilitli soru: doğru şık ✓, yanlış seçimim ✗; altında sonuç satırı ve varsa açıklama.
  function kontrolSonucu(s, c, k) {
    secici.siklar.forEach((b, j) => {
      const dogru = k.dogru === HARF[j], yanlis = !!k.dogru && !dogru && c.sik === HARF[j];
      if (dogru || yanlis) {
        b.classList.add(dogru ? 'dogru-sik' : 'yanlis-sik');
        b.append(el('span', { class: 'sik-isaret', text: dogru ? '✓' : '✗' }));
      }
      if (k.sik_aciklamalari?.[j]) {
        b.classList.add('aciklamali');
        b.append(matDugum('span', `sik-aciklama${dogru || yanlis ? ' belirgin' : ''}`, k.sik_aciklamalari[j]));
      }
    });
    const yazi = !k.dogru ? (c.sik ? 'Cevabın kilitlendi.' : 'Boş bıraktın; cevabın kilitlendi.')
      : !c.sik ? `Boş bıraktın ✗ · doğru cevap: ${k.dogru}`
        : c.sik === k.dogru ? 'Doğru ✓' : `Yanlış ✗ · doğru cevap: ${k.dogru}`;
    return [
      el('p', { class: `kontrol-yazi${k.dogru ? (c.sik === k.dogru ? ' basari' : ' hata') : ''}`, text: yazi }),
      k.aciklama && el('div', { class: 'aciklama' }, el('h3', { text: 'Açıklama' }), matDugum('div', 'aciklama-metin', k.aciklama)),
      sohbetGirisi(s, d),
    ];
  }
  function soruCiz() {
    const s = sorular[i];
    const c = yerel.get(s.id);
    const k = kilitliler.get(s.id);
    secici = cevapSecici(s, c, () => kapali() || !!k || istenen.has(s.id), (alan) => {
      if (alan === 'neden') {
        nedenId = s.id;
        clearTimeout(nedenZaman);
        nedenZaman = setTimeout(() => { nedenZaman = null; taslakGonder(s.id); }, 500);
      } else {
        taslakGonder(s.id);
        ciz();
      }
    });
    kontrolD = k ? null : el('button', { type: 'button', class: 'dugme', text: 'Cevabı gör', onclick: () => kontrolBas(s.id) });
    soruAlani.replaceChildren(...soruBasi(s, !!k), secici.dugum, ...(k ? kontrolSonucu(s, c, k) : [kontrolD]).filter(Boolean));
    ciz();
  }
  function silahBirak() { clearTimeout(silahZaman); silahZaman = null; silahli = false; }
  function git(j) {
    if (j < 0 || j >= n || j === i) return;
    nedenBosalt();
    silahBirak();
    i = j;
    soruCiz();
    gonder({ tur: 'konum', sira: i });
    scrollTo(0, 0);
  }
  function gonderBas() {
    if (kapali()) return;
    nedenBosalt();
    if (!silahli) {
      silahli = true;
      silahZaman = setTimeout(() => { silahZaman = null; silahli = false; ciz(); }, 5000);
      ciz();
      gonderD.scrollIntoView({ block: 'nearest' });
      return;
    }
    silahBirak();
    if (!gonder({ tur: 'gonder' })) { hata.yaz('Bağlantı yok; bağlanınca tekrar dene.'); return; }
    hata.yaz('');
    gonderiliyor = true;
    ciz();
  }
  function ciz() {
    siraYazi.textContent = `${i + 1}/${n} ${soruGezgini.hidden ? '▾' : '▴'}`;
    siraYazi.setAttribute('aria-expanded', String(!soruGezgini.hidden));
    noktalar.forEach((b, j) => {
      const c = yerel.get(sorular[j].id);
      const k = kilitliler.get(sorular[j].id);
      const sonuc = k?.dogru ? (c.sik === k.dogru ? 'dogru' : 'yanlis') : '';
      b.dataset.sohbetSoru = sorular[j].id;
      b.className = `nokta${j === i ? ' simdiki' : ''}${tamamMi(c) ? ' tamam' : ''}${sonuc ? ` nokta-${sonuc}` : ''}`;
      b.textContent = `${j + 1}${sonuc === 'dogru' ? '✓' : sonuc ? '✗' : ''}`;
      b.setAttribute('aria-label', `${j + 1}. soru${sonuc ? `, ${sonuc === 'dogru' ? 'doğru' : 'yanlış'}` : tamamMi(c) ? ', tamam' : ''}`);
      if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    sohbetIsaretle();
    secici?.ciz();
    if (kontrolD) kontrolD.disabled = kapali() || istenen.has(sorular[i].id);
    onceki.disabled = i === 0;
    const sonMu = i === n - 1;
    sonrakiD.hidden = sonMu;
    gonderD.className = silahli ? 'dugme ana buyuk' : sonMu ? 'dugme ana buyuk' : 'metin-dugme';
    const hedef = sonMu ? altEylemler : gonderAlani;
    if (gonderD.parentElement !== hedef) hedef.append(gonderD);
    gonderD.disabled = kapali();
    const bosSayi = sorular.filter((q) => !tamamMi(yerel.get(q.id))).length;
    gonderD.textContent = gonderiliyor ? 'Gönderiliyor…' : silahli ? `${bosSayi ? `${bosSayi} soru boş · ` : ''}Göndermek için tekrar dokun` : 'Gönder';
    bilgi.hidden = !sureBitti;
    bilgi.textContent = sureBitti ? 'Süre doldu, sonuçlar açılıyor…' : '';
  }
  function guncelle(y, ilk) {
    if (kilitIsle(y)) soruCiz(); else ciz();
    sayac.ayarla(y.bitis, y.sureMs);
    durumlar.ciz(y.oyuncular.filter((p) => p.id !== y.ben.id).map((p) => [
      `${p.ad} ${p.gonderdi ? '✓' : `${p.isaretli ?? 0}/${n}`}${oyuncuEki(y, p)}`, p.gonderdi ? 'tamam' : '']));
    if (ilk) {
      // Yeniden bağlanınca sunucuya ulaşmamış taslakları gönder.
      for (const s of y.sorular) {
        const b = s.benim || {}, c = yerel.get(s.id);
        if (!kilitliler.has(s.id) && c && (c.sik !== (b.sik ?? null) || c.guven !== (b.guven ?? null) || c.neden.trim() !== (b.neden || ''))) taslakGonder(s.id);
      }
      for (const id of istenen) gonder({ tur: 'kontrol', soruId: id });
      if (gonderiliyor) gonder({ tur: 'gonder' });
    }
  }
  kilitIsle(d);
  soruCiz();

  return {
    dugum: el('div', { class: 'cozum-ekrani' },
      el('div', { class: 'ust-cubuk' },
        el('div', { class: 'ust-satir' }, siraYazi, sayac.yazi),
        sayac.iz),
      soruGezgini, soruAlani,
      bilgi, hata.p, durumlar.ul, gonderAlani, altEylemler),
    takildi: () => guncelle(d, false),
    guncelle,
    kapat() { nedenBosalt(); silahBirak(); sayac.kapat(); },
    hata(m) {
      gonderiliyor = false;
      hata.yaz(m.ileti);
      istenen.clear();
      ciz();
    },
  };
}

// ---------------------------------------------------------------- Serbest: gönderdikten sonra
function serbestBekle(d) {
  const n = d.set.soruSayisi;
  const sayac = sayacOlustur(dakikaSaniye);
  const durumlar = el('ul', { class: 'bekle-ilerleme', 'aria-label': 'Diğer oyuncuların ilerlemesi', 'aria-live': 'polite', role: 'status' });
  const ozet = el('p');
  const kontrol = el('p', { class: 'not', hidden: true });
  const bekleme = el('p', { class: 'bekle-mesaj' });
  const uyari = el('p', { class: 'not' });
  const hata = hataKutusu();
  let imza = '', acZaman = null;
  const acBirak = () => { clearTimeout(acZaman); acZaman = null; ac.textContent = 'Şimdi aç'; };
  const ac = el('button', {
    type: 'button', class: 'dugme', text: 'Şimdi aç',
    onclick() {
      if (!acZaman) {
        ac.textContent = 'Herkes için açmak üzere tekrar dokun';
        acZaman = setTimeout(acBirak, 5000);
        return;
      }
      acBirak();
      if (gonder({ tur: 'simdiAc' })) ac.disabled = true; else hata.yaz('Bağlantı yok; bağlanınca tekrar dene.');
    },
  });
  const kurucuAlani = el('div', { class: 'bekle-kurucu' }, ac, uyari);
  function guncelle(y) {
    sayac.ayarla(y.bitis, y.sureMs);
    const isaretli = y.sorular.filter((s) => s.benim?.sik).length;
    const kontroller = y.sorular.filter((s) => s.benim?.kilitli && s.dogru);
    ozet.textContent = `${n} sorudan ${isaretli}'sini işaretledin`;
    kontrol.hidden = !kontroller.length;
    kontrol.textContent = `${kontroller.length} soruyu kontrol ettin, ${kontroller.filter((s) => s.benim.sik === s.dogru).length}'u doğru`;
    const digerleri = y.oyuncular.filter((p) => p.id !== y.ben.id);
    const satirlar = digerleri.map((p) => [p.ad + oyuncuEki(y, p), p.gonderdi, p.isaretli ?? 0]);
    const yeni = JSON.stringify(satirlar);
    if (yeni !== imza) {
      imza = yeni;
      durumlar.replaceChildren(...satirlar.map(([ad, bitti, sayi]) => el('li', { class: bitti ? 'tamam' : '' },
        el('div', { class: 'bekle-satir' }, el('span', { text: ad }), el('span', { class: 'bekle-sayi', text: bitti ? '✓ bitirdi' : `${sayi}/${n}` })),
        el('div', { class: 'bekle-iz', 'aria-hidden': 'true' }, el('div', { class: 'bekle-cubuk', style: `width:${bitti ? 100 : Math.max(0, Math.min(100, n ? sayi / n * 100 : 0))}%` })))));
    }
    const bitirmeyenler = digerleri.filter((p) => !p.gonderdi);
    const kim = bitirmeyenler.length === 1 ? bitirmeyenler[0].ad : `${bitirmeyenler.length} kişi`;
    bekleme.textContent = bitirmeyenler.length ? `${kim} bitirince sonuçlar açılacak${y.bitis != null ? ' ya da süre dolunca' : ''}.` : 'Sonuçlar açılıyor…';
    uyari.textContent = bitirmeyenler.length === 1 ? `${bitirmeyenler[0].ad}'in kalan soruları boş sayılır.` : 'Bitirmeyenlerin kalan soruları boş sayılır.';
    kurucuAlani.hidden = !y.ben.kurucu;
  }
  return {
    dugum: el('div', { class: 'bekle-ekrani' },
      el('div', { class: 'bekle-kart' },
        el('img', { src: '/logo.svg', width: 56, height: 56, alt: '' }),
        el('h1', { text: 'Gönderildi ✓' }), ozet, kontrol,
        el('div', { class: 'bekle-sayac' }, sayac.yazi, sayac.iz),
        durumlar, bekleme, kurucuAlani, hata.p)),
    takildi: () => guncelle(d),
    guncelle,
    kapat() { acBirak(); sayac.kapat(); },
    hata(m) { ac.disabled = false; hata.yaz(m.ileti); },
  };
}

// ---------------------------------------------------------------- Sonuç
function sonucEkrani(d) {
  const sorular = [...d.sorular].sort((a, b) => a.sira - b.sira);
  const yanlislar = sorular.filter((s) => s.dogru && s.cevaplar?.find((c) => c.oyuncuId === d.ben.id)?.sik !== s.dogru);
  const liste = el('div');
  function filtrele(yanlis) {
    liste.replaceChildren(...(yanlis && !yanlislar.length
      ? [el('p', { class: 'basari', text: 'Yanlış veya boş cevabın yok ✓' })]
      : (yanlis ? yanlislar : sorular).map((s) => cevapBlogu(s, d))));
  }
  filtrele(false);
  return {
    dugum: el('div', { class: 'sonuc-ekrani' },
      el('h1', { text: 'Sonuçlar' }),
      el('p', { class: 'not', text: [d.set.baslik, d.set.ders].filter(Boolean).join(' · ') }),
      d.puanli && skorTablosu(d, d.set.soruSayisi),
      kopyaDugmesi('Sonuçları kopyala', () => sonucMetni(o?.durum || d), 'dugme ana buyuk'),
      d.puanli && secenekler('sonuc-filtre', [[false, 'Tümü'], [true, `Yanlışlarım (${yanlislar.length})`]], false, filtrele),
      liste,
      el('a', { href: '#/', class: 'dugme', text: 'Ana sayfaya dön' })),
  };
}

// ---------------------------------------------------------------- Asistana soru
const sohbetGorulen = new Map();
function sohbetAnahtari(id) { return `testOdasi.sohbet.${o.kod}.${o.kimlik.oyuncuId}.${id}`; }
function sohbetSonYanit(s) { return s?.sohbet?.findLast(m => m.kim === 'asistan')?.id ?? ''; }
function sohbetOkunmamis(s) {
  if (!s) return false;
  const anahtar = sohbetAnahtari(s.id);
  if (!sohbetGorulen.has(anahtar)) {
    let id = '';
    try { id = localStorage.getItem(anahtar) || ''; } catch { /* özel pencere */ }
    sohbetGorulen.set(anahtar, id);
  }
  return !!sohbetSonYanit(s) && sohbetGorulen.get(anahtar) !== sohbetSonYanit(s);
}
function sohbetOkundu(s) {
  const anahtar = sohbetAnahtari(s.id), id = sohbetSonYanit(s);
  sohbetGorulen.set(anahtar, id);
  try { localStorage.setItem(anahtar, id); } catch { /* özel pencere */ }
}
function sohbetIsaretle() {
  if (!o?.durum) return;
  for (const b of o.govde.querySelectorAll('[data-sohbet-soru]')) {
    const s = o.durum.sorular.find(s => s.id === b.dataset.sohbetSoru);
    const okunmamis = sohbetOkunmamis(s);
    b.classList.toggle('okunmamis', okunmamis);
    if (b.classList.contains('sohbet-giris')) b.setAttribute('aria-label', `WickWick'e sor${okunmamis ? ', yeni yanıt' : ''}`);
  }
}
function sohbetGirisi(s, d) {
  if (!d.asistanVar) return null;
  const b = el('button', { type: 'button', class: 'dugme sohbet-giris', text: "WickWick'e sor", onclick: () => sohbetAc(s.id, b) });
  b.dataset.sohbetSoru = s.id;
  const okunmamis = sohbetOkunmamis(o?.durum?.sorular.find(x => x.id === s.id) ?? s);
  b.classList.toggle('okunmamis', okunmamis);
  b.setAttribute('aria-label', `WickWick'e sor${okunmamis ? ', yeni yanıt' : ''}`);
  return b;
}
function asistanBaloncugu(metin) {
  const d = matDugum('div', 'sohbet-baloncuk', metin);
  // Çit çevresindeki satır sonları yerine kod bloğunun tek aralığını kullan.
  for (const kod of d.querySelectorAll('.kod-blok')) {
    const once = kod.previousSibling?.lastChild, sonra = kod.nextSibling?.firstChild;
    if (once?.nodeType === 3) once.textContent = once.textContent.trimEnd();
    if (sonra?.nodeType === 3) sonra.textContent = sonra.textContent.trimStart();
  }
  return d;
}
function sohbetAc(id, giris) {
  o.sohbet?.kapat();
  const oturum = o, kaydirma = scrollY, govdeStili = document.body.getAttribute('style');
  let iyimser = [], imza = '', hata = '', altta = true;
  const dugumler = new Map();
  const icerik = el('div', { class: 'sohbet-icerik' });
  const liste = el('div', { class: 'sohbet-mesajlar', role: 'log', 'aria-label': 'Sohbet', onscroll() { altta = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 48; } }, icerik);
  const durum = el('p', { class: 'sohbet-durum not', role: 'status' });
  const alan = el('textarea', { rows: 1, maxLength: 500, placeholder: 'Sorunu yaz…', 'aria-label': 'Sorun',
    oninput: boyutla,
    onkeydown(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); gonderBas(); } },
  });
  const gonderD = el('button', { type: 'submit', class: 'dugme ana', text: 'Gönder' });
  const oneriler = el('div', { class: 'sohbet-oneriler' }, ['Neden bu şık doğru?', 'Benim şıkkım neden yanlış?', 'Daha basit anlat', 'Benzer bir örnek ver'].map(metin =>
    el('button', { type: 'button', class: 'dugme', text: metin, onclick: () => gonderBas(metin) })));
  const bosSohbet = el('div', {}, el('p', { class: 'sohbet-ipucu not', text: 'Bu soruda takıldığın yeri sor.' }), oneriler);
  const kapatD = el('button', { type: 'button', class: 'dugme', text: 'Kapat', onclick: kapat });
  const panel = el('section', { class: 'sohbet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${id} · WickWick'e sor`, tabindex: -1 },
    el('header', { class: 'sohbet-baslik' }, el('h2', { text: `${id} · WickWick'e sor` }), kapatD),
    liste, bosSohbet,
    el('form', { class: 'sohbet-form', onsubmit(e) { e.preventDefault(); gonderBas(); } }, durum, el('div', { class: 'sohbet-yaz' }, alan, gonderD)));
  const katman = el('div', { class: 'sohbet-katman', onclick(e) { if (e.target === katman) kapat(); } }, panel);
  function soru() { return oturum.durum.sorular.find(s => s.id === id); }
  function sona() { liste.scrollTop = liste.scrollHeight; }
  function boyutla() {
    alan.style.height = 'auto';
    alan.style.height = `${Math.min(120, alan.scrollHeight)}px`;
    gonderD.disabled = !alan.value.trim() || oturum.ws?.readyState !== 1;
  }
  function gonderBas(onerilen) {
    const metin = (onerilen ?? alan.value).trim();
    if (!metin || !gonder({ tur: 'sor', soruId: id, metin })) return;
    const sayi = (soru()?.sohbet ?? []).filter(m => m.kim === 'oyuncu').length;
    iyimser.push({ id: `yerel-${Date.now()}-${iyimser.length}`, kim: 'oyuncu', metin, sira: sayi + iyimser.length + 1 });
    alan.value = ''; hata = ''; altta = true; guncelle(); boyutla(); sona();
  }
  function guncelle(sunucudan = false) {
    const s = soru();
    if (!s?.sohbet) { kapat(); return; }
    const mesajlar = s.sohbet;
    if (sunucudan) {
      const sayi = mesajlar.filter(m => m.kim === 'oyuncu').length;
      iyimser = iyimser.filter(m => m.sira > sayi);
    }
    const hepsi = [...mesajlar, ...iyimser], yeniImza = JSON.stringify(hepsi.map(m => m.id));
    if (yeniImza !== imza) {
      imza = yeniImza;
      const kalan = new Set(hepsi.map(m => m.id));
      for (const [id, d] of dugumler) if (!kalan.has(id)) { d.remove(); dugumler.delete(id); }
      for (const m of hepsi) {
        if (dugumler.has(m.id)) continue;
        const d = el('div', { class: `sohbet-satir ${m.kim}` },
          m.kim === 'asistan' && el('img', { src: '/logo.svg', alt: '', class: 'sohbet-avatar' }),
          m.kim === 'asistan' ? asistanBaloncugu(m.metin) : el('div', { class: 'sohbet-baloncuk', text: m.metin }));
        dugumler.set(m.id, d);
      }
      hepsi.forEach((m, i) => { const d = dugumler.get(m.id); if (icerik.children[i] !== d) icerik.insertBefore(d, icerik.children[i] ?? null); });
      if (altta) sona();
    }
    sohbetOkundu(s); sohbetIsaretle();
    bosSohbet.hidden = hepsi.length > 0;
    for (const b of oneriler.children) b.disabled = oturum.ws?.readyState !== 1;
    const bekliyor = hepsi.at(-1)?.kim === 'oyuncu';
    durum.textContent = hata || (s.sohbetDurum === 'yaziyor' ? 'Asistan yazıyor…' : bekliyor && !oturum.durum.asistanBagli ? 'Asistan şu an çevrimdışı; sohbet açılınca cevaplanacak.' : '');
    gonderD.disabled = !alan.value.trim() || oturum.ws?.readyState !== 1;
  }
  function goruntu() {
    const v = window.visualViewport;
    katman.style.top = `${v?.offsetTop ?? 0}px`;
    katman.style.height = `${v?.height ?? innerHeight}px`;
  }
  function tus(e) {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); }
    if (e.key !== 'Tab') return;
    const hedefler = [...panel.querySelectorAll('button, textarea')].filter(d => !d.disabled && d.getClientRects().length);
    const ilk = hedefler[0], son = hedefler.at(-1);
    if (e.shiftKey && (document.activeElement === ilk || document.activeElement === panel)) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
  }
  function kapat() {
    if (!katman.isConnected) return;
    gozlem.disconnect(); katman.remove(); removeEventListener('keydown', tus);
    window.visualViewport?.removeEventListener('resize', goruntu);
    window.visualViewport?.removeEventListener('scroll', goruntu);
    removeEventListener('resize', goruntu);
    oturum.kok.inert = false;
    if (govdeStili === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', govdeStili);
    oturum.sohbet = null;
    scrollTo(0, kaydirma);
    const hedef = giris.isConnected ? giris : [...oturum.govde.querySelectorAll('.sohbet-giris')].find(b => b.dataset.sohbetSoru === id);
    hedef?.focus({ preventScroll: true });
    sohbetIsaretle();
  }
  const gozlem = new ResizeObserver(() => { if (altta) sona(); });
  oturum.sohbet = { guncelle, kapat, hata(metin) { hata = metin; if (!alan.value) alan.value = iyimser.at(-1)?.metin ?? ''; iyimser = []; guncelle(); boyutla(); } };
  document.body.style.position = 'fixed'; document.body.style.top = `${-kaydirma}px`; document.body.style.width = '100%'; document.body.style.overflow = 'hidden';
  oturum.kok.inert = true;
  document.body.append(katman);
  addEventListener('keydown', tus);
  window.visualViewport?.addEventListener('resize', goruntu);
  window.visualViewport?.addEventListener('scroll', goruntu);
  addEventListener('resize', goruntu);
  goruntu(); guncelle(); boyutla(); sona();
  gozlem.observe(icerik);
  panel.focus({ preventScroll: true });
  requestAnimationFrame(() => { katman.classList.add('acildi'); sona(); });
}
