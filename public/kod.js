// Açık kod blokları ve eski soru setlerindeki çok satırlı C++ örnekleri.
// İçerik HTML olarak yorumlanmaz; gösterim katmanı textContent kullanır.
export function metinParcalari(metin, eskiCpp = false) {
  const parcalar = [];
  const blok = /```[^\n`]*\n([\s\S]*?)```/g;
  let son = 0;
  for (const eslesme of metin.matchAll(blok)) {
    if (eslesme.index > son) parcalar.push({ tur: 'metin', metin: metin.slice(son, eslesme.index) });
    parcalar.push({ tur: 'kod', metin: eslesme[1].replace(/\n$/, '') });
    son = eslesme.index + eslesme[0].length;
  }
  if (son > 0) {
    // Bloktan sonraki satır sonu boş satır olarak görünmesin.
    const kalan = metin.slice(son).replace(/^\n/, '');
    if (kalan) parcalar.push({ tur: 'metin', metin: kalan });
    return parcalar;
  }
  if (eskiCpp) {
    // Eski MCP setleri açıklamadan sonra doğrudan C++ bildirimiyle başlıyor.
    const bas = /\n(?=(?:const\s+)?(?:int|double|float|bool|char|void|auto|struct|class)\b|std::|#include)/.exec(metin);
    if (bas) return [
      { tur: 'metin', metin: metin.slice(0, bas.index) },
      { tur: 'kod', metin: metin.slice(bas.index + 1) },
    ];
  }
  return [{ tur: 'metin', metin }];
}

// Düz metin içi: `satır içi kod`, $formül$ (dokunulmaz) ve yalnız <b>/<strong>, <i>/<em>, <u>.
// Sonuç: { tur: 'metin' | 'kod', metin } ya da { tur: 'b' | 'i' | 'u', parcalar }. Başka her şey düz metin kalır.
const SATIR = /(?<!`)`([^`\n]+)`(?!`)|(\$\$[\s\S]*?\$\$|\$[^$]*\$)|<(b|strong|i|em|u)>([\s\S]*?)<\/\3>/gi;
const ETIKET = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u' };
export function satirParcalari(metin) {
  const parcalar = [];
  let son = 0;
  for (const e of metin.matchAll(SATIR)) {
    if (e[2] != null) continue; // formül KaTeX'e olduğu gibi kalır
    if (e.index > son) parcalar.push({ tur: 'metin', metin: metin.slice(son, e.index) });
    parcalar.push(e[1] != null ? { tur: 'kod', metin: e[1] }
      : { tur: ETIKET[e[3].toLowerCase()], parcalar: satirParcalari(e[4]) });
    son = e.index + e[0].length;
  }
  if (son < metin.length) parcalar.push({ tur: 'metin', metin: metin.slice(son) });
  return parcalar;
}

// Hafif C/C++ renklendirme: satır dizisi, her satır { tur, metin } jetonları (tur null = renksiz).
// Eşleşmeyen her karakter renksiz kalır; birleştirilince kod aynen geri gelir.
const ANAHTAR = new Set(('if else for while do switch case default break continue return goto new delete this true false nullptr ' +
  'const constexpr static inline virtual override public private protected class struct enum union namespace using typedef ' +
  'template typename operator sizeof try catch throw friend explicit mutable volatile extern auto').split(' '));
const TURLER = new Set('int double float bool char void long short unsigned signed size_t wchar_t string vector array map'.split(' '));
const JETON = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|((?<![^\n])[ \t]*#[^\n]*)|(\b\d(?:[eE][+-]|[\w.])*)|([A-Za-z_]\w*)/g;
const JETON_TURU = [null, 'yorum', 'dizgi', 'on', 'sayi'];
export function kodSatirlari(kod) {
  const satirlar = [[]];
  const ekle = (tur, metin) => metin.split('\n').forEach((s, k) => {
    if (k) satirlar.push([]);
    if (s) satirlar[satirlar.length - 1].push({ tur, metin: s });
  });
  let son = 0;
  for (const e of kod.matchAll(JETON)) {
    const tur = e[5] != null ? (ANAHTAR.has(e[5]) ? 'anahtar' : TURLER.has(e[5]) ? 'tur' : null)
      : JETON_TURU[[1, 2, 3, 4].find((k) => e[k] != null)];
    if (!tur) continue;
    ekle(null, kod.slice(son, e.index));
    ekle(tur, e[0]);
    son = e.index + e[0].length;
  }
  ekle(null, kod.slice(son));
  return satirlar;
}

// Eski setlerde ters tırnaksız kod şıkları (ör. "hiz = limit;"): yalnız eş aralıklı yazı için, temkinli.
export function kodGibi(metin) {
  if (/[`$\n]/.test(metin)) return false;
  const t = metin.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').trim();
  if (/[çğıöşüÇĞİÖŞÜ]/.test(t)) return false;
  return /;$|::|<<|>>|\w(?:\+\+|--)|(?:\+\+|--)\w|^#include/.test(t);
}

// Eski C++ setlerinde ters tırnaksız satır içi kod (ör. "int x; tanımlandıktan sonra std::cin >> x").
// Yalnız C++ izi taşıyan, formülsüz metinde çalışır; emin olunmayan parça düz metin kalır.
const CPP_IZI = /C\+\+|::|\bsizeof\b|#(?:include|define|ifndef|endif)\b|\b(?:int|char|double|float|bool|void|unsigned|struct|enum|union|const|nullptr|delete)\b|\b0x[0-9A-Fa-f]+\b/;
const SOZCUK = /^(?:const|constexpr|static|unsigned|signed|long|short|int|char|double|float|bool|void|auto|struct|class|enum|union|new|delete|return|sizeof|if|else|for|while|do|switch|case)$/;
const KOD_SOZ = /::|[[\]{}=<>&|^~#]|\w\(.*\)|^\w+\(|\w\*+$|^0x[0-9A-Fa-f]+[,.]?$|^"[^"]*"[;,]?$/;
const ISLEC = /^(?:[-+*\/%]|<<|>>|==|!=|&&|\|\||[-+*\/]?=)$/;
const ADSI = /^[A-Za-z_]\w*[,)]*;?$|^\d[\w.]*[,)]*;?$/;
const EK = /'[a-zçğıöşü]+$/i;
export function eskiSatirIci(metin) {
  if (/[`$]/.test(metin) || !CPP_IZI.test(metin)) return null;
  const soz = metin.split(/(\s+)/); // çift dizinler sözcük, tekler boşluk
  const tur = [];
  for (let i = 0; i < soz.length; i += 2) {
    const s = soz[i].replace(EK, ''), once = tur[i - 2];
    // "x;" gibi yalın sözcük yalnız bir tür/kod ya da büyük harfli addan sonra koddur ("bayt;" değil).
    tur[i] = KOD_SOZ.test(s) ? 'kod' : SOZCUK.test(s) ? 'soz' : ISLEC.test(s) ? 'islec'
      : /^\w+;$/.test(s) ? (once === 'kod' || once === 'soz' || once === 'islec' || /^[A-Z]\w*$/.test(soz[i - 2] ?? '') ? 'kod' : 'metin')
        : ADSI.test(s) ? 'ad' : 'metin';
  }
  const parcalar = [];
  let duz = '';
  for (let i = 0; i < soz.length; i += 2) {
    let son = -1;
    const buyukAd = tur[i] === 'ad' && /^[A-Z]\w*$/.test(soz[i]) && tur[i + 2] === 'kod' && /^\w+;$/.test(soz[i + 2]);
    if (tur[i] === 'kod' || tur[i] === 'soz' || buyukAd) {
      for (let j = i; j < soz.length && tur[j] !== 'metin'; j += 2) {
        const o = soz[j - 2] ?? '';
        const sonraki = tur[j + 2], adli = /[,);]$|^\d/.test(soz[j]) || sonraki === undefined || sonraki === 'kod' || sonraki === 'islec' || sonraki === 'soz'; // "sonra", "olarak" gibi düz sözcük koda eklenmez
        if (tur[j] === 'kod' || (tur[j] === 'ad' && j > i && (ISLEC.test(o) || ((/[(,*&]$/.test(o) || tur[j - 2] === 'soz') && adli)))) son = j;
        if (EK.test(soz[j])) break;
      }
      if (son >= 0 && !soz.slice(i, son + 1).some((s, k) => k % 2 === 0 && tur[i + k] === 'kod')) son = -1;
    }
    if (son < 0) { duz += soz[i] + (soz[i + 1] ?? ''); continue; }
    let kod = soz.slice(i, son + 1).join('');
    const ek = /(?:'[a-zçğıöşü]+)?[.,?:]*$/i.exec(kod)[0]; // Türkçe ek ve cümle noktalaması dışarıda kalır
    kod = kod.slice(0, kod.length - ek.length);
    if (duz) parcalar.push({ tur: 'metin', metin: duz });
    parcalar.push({ tur: 'kod', metin: kod });
    duz = ek + (soz[son + 1] ?? '');
    i = son;
  }
  if (duz) parcalar.push({ tur: 'metin', metin: duz });
  return parcalar.some((p) => p.tur === 'kod') ? parcalar : null;
}
