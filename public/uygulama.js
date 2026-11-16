// Giriş: hash yönlendirme, ana sayfa, yeni test ekranı.
import { el, depo, api, hataMetni, secenekler } from './ortak.js';
import { odaAc, odaKapat } from './oda.js';

const kok = document.getElementById('uygulama');

function goster(...dugumler) {
  kok.replaceChildren(...dugumler.filter(Boolean));
  scrollTo(0, 0);
}

function yonlendir() {
  const parca = location.hash.replace(/^#\/?/, '').split('/');
  odaKapat();
  document.title = 'Test Odası';
  if (parca[0] === 'yeni') return yeniEkrani();
  if (parca[0] === 'oda' && /^\d{5}$/.test(parca[1] || '')) return odaAc(kok, parca[1]);
  anaSayfa();
}
addEventListener('hashchange', yonlendir);

// ---------------------------------------------------------------- Ana sayfa
const MOD_ADI = { kahoot: 'Süreli', serbest: 'Kendi hızında' };
const EVRE_ADI = { lobi: 'Lobide', soru: 'Sürüyor', acik: 'Sürüyor', cozum: 'Sürüyor', bitti: 'Bitti' };

function anaSayfa() {
  const kodKutu = el('input', {
    type: 'text', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 5, autocomplete: 'off',
    placeholder: '5 haneli kod', 'aria-label': 'Oda kodu', enterKeyHint: 'go',
  });
  const hata = el('p', { class: 'hata', hidden: true });
  const form = el('form', {
    class: 'kod-form',
    onsubmit(e) {
      e.preventDefault();
      const kod = kodKutu.value.replace(/\D/g, '');
      if (kod.length !== 5) { hata.textContent = 'Kod 5 haneli olmalı.'; hata.hidden = false; return; }
      location.hash = `#/oda/${kod}`;
    },
  }, kodKutu, el('button', { class: 'dugme ana', text: 'Katıl' }));

  const gecmis = el('div', { class: 'gecmis' });
  const devam = el('div', { class: 'devam-alani', hidden: !depo.odalar().length });
  goster(
    el('header', { class: 'sayfa-baslik' },
      el('h1', { text: 'Test Odası' })),
    devam,
    el('section', { class: 'kart' }, el('h2', { text: 'Koda katıl' }), form, hata),
    el('a', { href: '#/yeni', class: 'dugme', text: 'Yeni test' }),
    el('section', {}, el('h2', { text: 'Geçmiş testler' }), gecmis),
  );
  gecmisDoldur(gecmis, devam);
}

function tarihYaz(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function gecmisDoldur(kutu, devam) {
  const odalar = depo.odalar();
  if (!odalar.length) { kutu.append(el('p', { class: 'not', text: 'Bu cihazda henüz test yok.' })); return; }
  kutu.append(el('p', { class: 'not', text: 'Yükleniyor…' }));
  const r = await api('/api/gecmis', { odalar: odalar.map(({ kod, oyuncuId, anahtar }) => ({ kod, oyuncuId, anahtar })) });
  if (!kutu.isConnected) return;
  if (!r.ok) { devam.hidden = true; kutu.replaceChildren(el('p', { class: 'hata', text: hataMetni(r.veri, 'Geçmiş alınamadı.') })); return; }
  const liste = (r.veri.odalar || []).slice().sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
  const etkin = liste.find((o) => o.evre !== 'bitti');
  devam.hidden = !etkin;
  if (etkin) devam.replaceChildren(el('a', { href: `#/oda/${etkin.kod}`, class: 'kart devam-karti' },
    el('h2', { text: 'Devam et' }),
    el('strong', { text: etkin.baslik || etkin.kod }),
    el('p', { class: 'not', text: MOD_ADI[etkin.mod] })));
  if (!liste.length) { kutu.replaceChildren(el('p', { class: 'not', text: 'Kayıtlı oda bulunamadı.' })); return; }
  kutu.replaceChildren(...liste.map((o) => {
    const bitti = o.evre === 'bitti';
    const ust = [o.ders, tarihYaz(o.tarih), MOD_ADI[o.mod], EVRE_ADI[o.evre]].filter(Boolean).join(' · ');
    const kisiler = (o.oyuncular || []).map((p) => {
      if (!bitti || !o.puanli) return p.ad;
      let s = `${p.ad}: ${p.dogruSayisi ?? 0}/${o.soruSayisi}`;
      if (o.mod === 'kahoot' && p.puan != null) s += ` · ${p.puan} puan`;
      return s;
    });
    return el('a', { href: `#/oda/${o.kod}`, class: 'kart gecmis-oge' },
      el('strong', { class: 'gecmis-baslik', text: o.baslik || o.kod }),
      el('span', { class: 'not', text: ust }),
      el('ul', { class: 'gecmis-kisiler' }, kisiler.map((k) => el('li', { text: k }))));
  }));
}

// ---------------------------------------------------------------- Yeni test
const SORU_SURELERI = [20, 30, 45, 60, 90].map((s) => [s, `${s} sn`]);
const TOPLAM_SURELER = [[0, 'Süresiz'], ...[10, 20, 30, 45].map((s) => [s, `${s} dk`])];

function yeniEkrani() {
  let mod = 'kahoot', soruSuresi = 30, toplamSure = 0;
  let dogrulamaZaman = null, dogrulamaSira = 0;

  const alan = el('textarea', {
    class: 'json-alan', rows: 8, spellcheck: false, autocomplete: 'off', autocapitalize: 'off',
    placeholder: 'Soru setinin JSON metnini buraya yapıştır', 'aria-label': 'Soru seti (JSON)',
    oninput() {
      clearTimeout(dogrulamaZaman);
      dogrulamaSira++;
      sonuc.replaceChildren();
      if (alan.value.trim()) dogrulamaZaman = setTimeout(dogrula, 600);
    },
  });
  const dosya = el('input', {
    type: 'file', accept: '.json,application/json', id: 'dosya', class: 'gorunmez',
    onchange() {
      const f = dosya.files[0];
      if (!f) return;
      const okuyucu = new FileReader();
      clearTimeout(dogrulamaZaman);
      const sira = ++dogrulamaSira;
      okuyucu.onload = () => {
        if (sira !== dogrulamaSira || !alan.isConnected) return;
        alan.value = String(okuyucu.result); dosya.value = ''; dogrula();
      };
      okuyucu.onerror = () => { if (sira === dogrulamaSira && alan.isConnected) sonucYaz([el('p', { class: 'hata', text: 'Dosya okunamadı.' })]); };
      okuyucu.readAsText(f);
    },
  });
  const sonuc = el('div', { class: 'dogrulama', 'aria-live': 'polite' });
  const sonucYaz = (d) => sonuc.replaceChildren(...d);

  async function dogrula() {
    clearTimeout(dogrulamaZaman);
    const sira = ++dogrulamaSira;
    const metin = alan.value.trim();
    if (!metin) { sonuc.replaceChildren(); return false; }
    if (!alan.isConnected) return false;
    const r = await api('/api/dogrula', { set: metin });
    if (sira !== dogrulamaSira || !alan.isConnected) return false;
    if (r.ok && r.veri.tamam) {
      sonucYaz([el('p', { class: 'basari', text: `Geçerli ✓ ${r.veri.soruSayisi} soru` })]);
      return true;
    }
    hatalariYaz(r.veri);
    return false;
  }
  function hatalariYaz(veri) {
    if (Array.isArray(veri.hatalar) && veri.hatalar.length) {
      sonucYaz([el('p', { class: 'hata', text: 'Sette hatalar var:' }),
        el('ul', { class: 'hatalar' }, veri.hatalar.map((h) => el('li', { text: String(h) })))]);
    } else sonucYaz([el('p', { class: 'hata', text: hataMetni(veri) })]);
  }

  const sureKutu = el('div');
  const sureCiz = () => sureKutu.replaceChildren(mod === 'kahoot'
    ? el('fieldset', {}, el('legend', { text: 'Soru başına süre' }),
      secenekler('soruSuresi', SORU_SURELERI, soruSuresi, (v) => { soruSuresi = v; }))
    : el('fieldset', {}, el('legend', { text: 'Toplam süre' }),
      secenekler('toplamSure', TOPLAM_SURELER, toplamSure, (v) => { toplamSure = v; })));
  sureCiz();

  const ad = el('input', { type: 'text', maxLength: 20, value: depo.sonAd(), autocomplete: 'nickname', autocapitalize: 'words', placeholder: 'Adın', enterKeyHint: 'done' });
  const kurHata = el('div', { 'aria-live': 'polite' });
  const kur = el('button', {
    type: 'button', class: 'dugme ana buyuk', text: 'Odayı kur',
    async onclick() {
      kurHata.replaceChildren();
      const adi = ad.value.trim();
      if (!alan.value.trim()) { kurHata.append(el('p', { class: 'hata', text: 'Soru seti boş.' })); return; }
      if (!adi) { kurHata.append(el('p', { class: 'hata', text: 'Adını yaz.' })); ad.focus(); return; }
      kur.disabled = true;
      const r = await api('/api/odalar', { set: alan.value.trim(), mod, soruSuresi, toplamSure, ad: adi });
      kur.disabled = false;
      if (r.ok && r.veri.kod) {
        depo.kaydet({ kod: r.veri.kod, oyuncuId: r.veri.oyuncuId, anahtar: r.veri.anahtar, ad: adi });
        location.hash = `#/oda/${r.veri.kod}`;
        return;
      }
      if (Array.isArray(r.veri.hatalar)) {
        kurHata.append(el('ul', { class: 'hatalar' }, r.veri.hatalar.map((h) => el('li', { text: String(h) }))));
      } else kurHata.append(el('p', { class: 'hata', text: hataMetni(r.veri) }));
    },
  });

  goster(
    el('a', { href: '#/', class: 'geri', text: '‹ Ana sayfa' }),
    el('h1', { text: 'Yeni test' }),
    el('section', { class: 'kart' },
      el('h2', { text: 'Soru seti' }),
      alan,
      el('label', { for: 'dosya', class: 'dugme', text: '.json dosyası seç' }),
      dosya, sonuc),
    el('section', { class: 'kart' },
      el('fieldset', {}, el('legend', { text: 'Mod' }),
        secenekler('mod', [['kahoot', 'Süreli (Kahoot)'], ['serbest', 'Kendi hızında']], mod, (v) => { mod = v; sureCiz(); })),
      sureKutu,
      el('label', { class: 'alan' }, el('span', { text: 'Adın' }), ad)),
    kur, kurHata,
  );
}

yonlendir();
