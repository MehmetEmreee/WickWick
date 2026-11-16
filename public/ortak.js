// Ortak yardımcılar: DOM, yerel kayıt, HTTP, KaTeX, görsel, kopyalama.

export const HARF = 'ABCDE';

// Küçük DOM kurucu. Metinler daima textContent / metin düğümü olarak girer, HTML yorumlanmaz.
export function el(etiket, ozellik = {}, ...cocuklar) {
  const d = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (v == null || (v === false && !(k in d))) continue;
    if (k === 'class') d.className = v;
    else if (k === 'text') d.textContent = v;
    else if (k.startsWith('on')) d.addEventListener(k.slice(2), v);
    else if (k in d) d[k] = v;
    else d.setAttribute(k, v);
  }
  for (const c of cocuklar.flat()) if (c != null && c !== false && c !== '') d.append(c);
  return d;
}

// ---- localStorage: oda başına { kod, oyuncuId, anahtar, ad } ve son kullanılan ad
const ODALAR = 'testOdasi.odalar';
const AD = 'testOdasi.ad';

function oku(k, varsayilan) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : varsayilan;
  } catch { return varsayilan; }
}
function yaz(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* özel pencere vb. */ }
}

export const depo = {
  odalar() {
    const l = oku(ODALAR, []);
    return Array.isArray(l) ? l.filter((o) => o && o.kod && o.oyuncuId && o.anahtar) : [];
  },
  kimlik: (kod) => depo.odalar().find((o) => o.kod === kod) || null,
  kaydet(k) {
    yaz(ODALAR, [k, ...depo.odalar().filter((o) => o.kod !== k.kod)]);
    yaz(AD, k.ad);
  },
  sil: (kod) => yaz(ODALAR, depo.odalar().filter((o) => o.kod !== kod)),
  sonAd: () => { const a = oku(AD, ''); return typeof a === 'string' ? a : ''; },
};

// ---- HTTP (JSON). Ağ hatasında da aynı biçimde döner.
export async function api(yol, govde) {
  try {
    const r = await fetch(yol, govde === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde),
    });
    let veri = null;
    try { veri = await r.json(); } catch { /* boş gövde */ }
    return { ok: r.ok, durum: r.status, veri: veri || {} };
  } catch {
    return { ok: false, durum: 0, veri: { hata: 'Sunucuya ulaşılamadı.' } };
  }
}

export function hataMetni(veri, varsayilan = 'Bir hata oluştu.') {
  if (Array.isArray(veri.hatalar) && veri.hatalar.length) return veri.hatalar.join(' ');
  return veri.hata || veri.ileti || varsayilan;
}

// ---- KaTeX: yalnız metinde $ varsa, ilk ihtiyaçta yüklenir; yalnız verilen düğümde çalışır.
let katexSozu = null;
function betik(src) {
  return new Promise((tamam, red) => document.head.append(el('script', { src, onload: tamam, onerror: red })));
}
function katexYukle() {
  if (!katexSozu) {
    const css = new Promise((tamam) => document.head.append(
      el('link', { rel: 'stylesheet', href: '/vendor/katex/katex.min.css', onload: tamam, onerror: tamam })));
    const js = betik('/vendor/katex/katex.min.js').then(() => betik('/vendor/katex/contrib/auto-render.min.js'));
    katexSozu = Promise.all([css, js]).catch(() => { katexSozu = null; });
  }
  return katexSozu;
}
const AYRACLAR = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
];

// Kutusuna sığmayan formülü (yalnız onu) bölünmeyen tek parça yapıp kendi satırında yatay kaydırır.
// Dikeyde kırpılmasın diye CSS'te cömert padding var; içerik yine de taşarsa scrollHeight farkı eklenir.
function devamIsaretle(kutu) {
  kutu.classList.toggle('devam', kutu.scrollLeft + kutu.clientWidth < kutu.scrollWidth - 2);
}
function tasmaDuzelt(dugum) {
  if (!dugum.isConnected) return;
  for (const f of dugum.querySelectorAll('.katex')) {
    const kutu = f.parentElement.classList.contains('katex-display') ? f.parentElement : f;
    kutu.classList.remove('devam');
    kutu.style.paddingBottom = '';
    kutu.classList.add('kaydir'); // ölçmek için geçici: tek satır, blok
    if (kutu.scrollWidth <= kutu.clientWidth + 1) { kutu.classList.remove('kaydir'); continue; }
    const fazla = kutu.scrollHeight - kutu.clientHeight;
    if (fazla > 0) kutu.style.paddingBottom = `${parseFloat(getComputedStyle(kutu).paddingBottom) + fazla + 2}px`;
    devamIsaretle(kutu);
    if (!kutu.dataset.dinle) {
      kutu.dataset.dinle = '1';
      kutu.addEventListener('scroll', () => devamIsaretle(kutu), { passive: true });
    }
  }
}
const islenenler = new Set();
function olc(dugum) {
  if (islenenler.size > 100) for (const d of islenenler) if (!d.isConnected) islenenler.delete(d);
  islenenler.add(dugum);
  requestAnimationFrame(() => tasmaDuzelt(dugum));
  document.fonts?.ready.then(() => requestAnimationFrame(() => tasmaDuzelt(dugum)));
}
let boyutZaman = null;
addEventListener('resize', () => {
  clearTimeout(boyutZaman);
  boyutZaman = setTimeout(() => {
    for (const d of islenenler) { if (d.isConnected) tasmaDuzelt(d); else islenenler.delete(d); }
  }, 200);
});

export function mat(dugum) {
  if (dugum.textContent.includes('$')) {
    katexYukle().then(() => {
      if (!window.renderMathInElement) return;
      window.renderMathInElement(dugum, { delimiters: AYRACLAR, throwOnError: false });
      olc(dugum);
    });
  }
  return dugum;
}
// Metni textContent ile yazan, sonra KaTeX uygulayan düğüm.
export const matDugum = (etiket, sinif, metin) => mat(el(etiket, { class: `mat ${sinif}`, text: metin }));

// ---- Görsel: yalnız http/https ya da data:image/(png|jpeg|gif|webp|svg+xml)
export function gorselGecerli(u) {
  return typeof u === 'string' &&
    (/^https?:\/\//i.test(u) || /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(u));
}

export function gorselKutusu(url) {
  if (!gorselGecerli(url)) return null;
  const img = el('img', { src: url, alt: 'Soru görseli', decoding: 'async', referrerPolicy: 'no-referrer' });
  const kutu = el('button', { type: 'button', class: 'gorsel', 'aria-label': 'Görseli tam boy aç', onclick: () => tamBoy(url) }, img);
  // Yüklenene kadar 16/9 yer tutucu; yüklenince görselin kendi oranı.
  const oranla = () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) kutu.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
  };
  img.addEventListener('load', oranla);
  img.addEventListener('error', () => {
    kutu.disabled = true;
    kutu.classList.add('yuklenemedi');
    kutu.style.aspectRatio = '';
    kutu.replaceChildren(el('span', { class: 'gorsel-hata', text: 'Görsel yüklenemedi' }));
  });
  if (img.complete) oranla();
  return kutu;
}

function tamBoy(url) {
  const kapat = () => { katman.remove(); removeEventListener('keydown', tus); };
  const tus = (e) => { if (e.key === 'Escape') kapat(); };
  const katman = el('div', { class: 'tam-boy', role: 'dialog', 'aria-label': 'Görsel', onclick: kapat },
    el('button', { type: 'button', class: 'dugme tam-boy-kapat', text: 'Kapat' }),
    el('div', { class: 'tam-boy-zemin' }, el('img', { src: url, alt: 'Soru görseli', referrerPolicy: 'no-referrer' })));
  addEventListener('keydown', tus);
  document.body.append(katman);
}

// ---- Kopyalama (düz HTTP: navigator.clipboard yok). Kullanıcı dokunuşu içinde çağrılmalı.
export function kopyala(metin) {
  const t = el('textarea', { value: metin, class: 'gizli-kopya', 'aria-hidden': 'true' });
  t.setAttribute('readonly', '');
  document.body.append(t);
  let tamam = false;
  try {
    t.focus({ preventScroll: true });
    t.select();
    t.setSelectionRange(0, metin.length);
    tamam = document.execCommand('copy');
  } catch { tamam = false; }
  t.remove();
  try { getSelection().removeAllRanges(); } catch { /* yok say */ }
  return tamam;
}

// Kopyala düğmesi; olmazsa metni seçili bir kutuda gösterir.
export function kopyaDugmesi(yazi, metinVer, sinif = 'dugme') {
  let zaman = null;
  const alan = el('textarea', { class: 'kopya-alan', rows: 6 });
  alan.setAttribute('readonly', '');
  const yedek = el('div', { class: 'kopya-yedek', hidden: true },
    el('p', { class: 'not', text: 'Otomatik kopyalanamadı. Metin aşağıda seçili; basılı tutup "Kopyala"ya dokun.' }), alan);
  const d = el('button', {
    type: 'button', class: sinif, text: yazi,
    onclick() {
      const m = metinVer();
      if (kopyala(m)) {
        yedek.hidden = true;
        d.textContent = 'Kopyalandı ✓';
        clearTimeout(zaman);
        zaman = setTimeout(() => { d.textContent = yazi; }, 2000);
      } else {
        alan.value = m;
        yedek.hidden = false;
        alan.focus({ preventScroll: true });
        alan.setSelectionRange(0, m.length);
      }
    },
  });
  return el('div', { class: 'kopya' }, d, yedek);
}

// Seçenek grubu (radyo düğmeleri, büyük dokunma hedefli)
export function secenekler(ad, liste, secili, degisti) {
  return el('div', { class: 'segment', role: 'radiogroup' }, liste.map(([deger, yazi]) =>
    el('label', { class: 'segment-oge' },
      el('input', { type: 'radio', name: ad, value: String(deger), checked: deger === secili, onchange: () => degisti(deger) }),
      el('span', { text: yazi }))));
}
