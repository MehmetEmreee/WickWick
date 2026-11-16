# WickWick — şartname

İki ile dört kişinin aynı soru setini kendi telefonundan çözdüğü, yalnız yerel ağda çalışan web uygulaması.
Hedef cihazlar: iPhone 13 ve iPhone 17 Pro Max, Safari. Arayüzün tamamı Türkçe. Hesap yok, yalnız adla katılınır.

Bu dosya sunucu ile arayüz arasındaki sözleşmedir. Sözleşmeyi değiştirmek gerekirse önce bu dosya güncellenir.

## 1. Yapı

```
test-odasi/
  package.json        "start": "node sunucu/sunucu.js"; bağımlılıklar yalnız: ws, katex
  sunucu/             Node 22, ESM. HTTP + WebSocket. (SUNUCU AJANI)
    sunucu.js         HTTP, statik dosya, WS bağlantıları
    oda.js            oda durumu, geçişler, puan, kişiye özel görünüm (saf mantık, test edilebilir)
    dogrula.js        soru seti doğrulaması, Türkçe hata iletileri
    depo.js           veri/odalar.json'a yazma ve okuma
    test/             node --test ile çalışan testler
  public/             derleme adımı yok, düz HTML + CSS + ES modülleri (ARAYÜZ AJANI)
    index.html, stil.css, uygulama.js (+ gerekirse birkaç küçük modül)
  ornek/modul3_soru_seti.json   7 soruluk örnek set (SUNUCU AJANI üretir)
  veri/               çalışma zamanı verisi, .gitignore'da
  OKU.md              çalıştırma adımları (SUNUCU AJANI)
```

- Çerçeve yok (Express, React, derleyici yok). Kısa ve okunur kod.
- Sunucu `0.0.0.0:3000` dinler (`PORT` ile değişir). Açılışta yerel ağ adreslerini yazar:
  `http://<yerel-ip>:3000` ve `http://<bilgisayar-adı>.local:3000`.
- KaTeX internet gerektirmeden sunulur: sunucu `node_modules/katex/dist` klasörünü `/vendor/katex/` altında verir
  (`katex.min.css`, `katex.min.js`, `contrib/auto-render.min.js`, `fonts/`).
- `GET /` ve bilinmeyen yollar `public/index.html` döner (oda linki `/#/oda/KOD` biçimindedir, yani hash yönlendirme).
- Sayfa düz HTTP üzerinden açılır. Bu yüzden `navigator.clipboard` yoktur; kopyalama için görünmez `textarea` +
  `document.execCommand('copy')` kullanılır, o da olmazsa metin seçili bir kutuda gösterilir.

## 2. Soru seti

```json
{
  "surum": 1, "set_id": "istatistik-modul-3", "baslik": "…", "ders": "…",
  "aciklamalari_goster": true,
  "sorular": [
    { "id": "S1", "etiket": "Ünite 5", "metin": "…", "siklar": ["…","…"],
      "dogru": "B", "aciklama": "…", "gorsel": "https://…", "sure": 45 }
  ]
}
```

- Zorunlu: `surum` (1), `set_id` (boş olmayan metin), `baslik`, `sorular` (en az 1).
- Soru: `id` (zorunlu, set içinde benzersiz), `metin` (zorunlu), `siklar` (2–5 boş olmayan metin).
- İsteğe bağlı: `ders`, `aciklamalari_goster` (varsayılan true), `etiket`, `dogru` (şık sayısına uygun A–E harfi),
  `aciklama`, `sik_aciklamalari` (`siklar` ile aynı uzunlukta metin dizisi; boş metin olabilir), `gorsel` (http/https URL ya da `data:image/png|jpeg|gif|webp|svg+xml` veri URI'si; asistan grafiği
  SVG veri URI'si olarak sete gömebilir, internet gerekmez; yalnız `<img>` ile gösterilir), `sure` (saniye, 5–600 tam sayı; yalnız Kahoot modunda o sorunun süresini ezer).
- etiket yalnız ünite/bölüm adıdır (ör. 'Ünite 5'); isteğe bağlı ' | konu' eki yalnız cevap açıldıktan sonra görünür. '|' öncesinde cevaba ipucu verme.
- Hata iletisi alanı adıyla söyler: `sorular[2].siklar: 2 ile 5 arası şık olmalı (6 var)`. Bütün hatalar bir listede döner.
- Bozuk JSON için: `JSON okunamadı: <ayrıştırıcı iletisi>`.

## 3. Modlar ve evreler

Oda kurulurken mod seçilir.

### `kahoot`
`lobi → soru(i) → acik(i) → … → bitti`

- Lobi: katılanlar listelenir. Kurucu "Başlat" der (en az 1 kişi yeter).
- `soru`: herkes aynı soruyu görür. Bitiş anı = başlangıç + süre (sorunun `sure` alanı, yoksa odanın `soruSuresi`).
  Kişi şık seçer, isterse güven (1–3) ve neden yazar (soruyu boş da kilitleyebilir, 0 puan), "Kilitle" der. Kilitlenen cevap değişmez. Kilitleme anı sunucu saatiyle kaydedilir.
- Odadaki herkes kilitleyince ya da süre dolunca sunucu kendiliğinden `acik` evresine geçer. Süre dolduğunda kilitlememiş kişinin cevabı boştur.
- `acik`: o sorunun doğru şıkkı, açıklaması, herkesin şıkkı/güveni/nedeni, o sorudan alınan puan ve puan tablosu görünür.
- Sıradaki soruya kurucu geçirir ("Sıradaki soru"). Kurucu bağlı değilse düğme herkese açılır. Son sorudan sonra `bitti`.
- Soru başladıktan sonra katılan kişi o andaki sorudan devam eder; önceki soruları boştur.
- Puan: `dogru` varsa ve cevap doğruysa `round(1000 × (1 − (geçenSüre / süre) / 2))`, değilse 0. `dogru` yoksa puan yok.

### `serbest`
`lobi → cozum → bitti`

- Lobi: kurucu "Başlat" der.
- `cozum`: herkes kendi hızında, ileri-geri gezerek çözer. Her işaretleme sunucuya taslak olarak kaydedilir
  (yenileyince kaldığı yerden devam, başkaları için "4/7 işaretledi" bilgisi).
  "Cevabı gör" o sorudaki cevabı kilitler ve doğru şık/açıklamayı yalnız o kişiye açar.
  "Gönder" boş sorular olsa da kabul edilir; cevaplar kilitlenir.
- Toplam süre isteğe bağlıdır (`toplamSure` dakika, 0 = süresiz). Süre dolunca göndermemiş kişinin o anki taslağı kilitlenir,
  şıksız sorular boş sayılır.
- Herkes gönderince, süre dolunca ya da kurucu "Şimdi aç" deyince `bitti`.
- `cozum` sırasında yeni kişi katılabilir. Puan yok; sıralama doğru sayısına göre.

Ortak kurallar:
- Oda en fazla 4 kişi. Aynı ad ikinci kez alınamaz. `bitti` evresinde katılım kapalıdır.
- "Tamam" bir cevap: şık (A–E) seçilmiş olmasıdır; güven (1–3) isteğe bağlıdır. Neden en çok 120 karakter, tek satır.
- Oda kodu 5 haneli rakam, benzersiz.
- Odalar `veri/odalar.json` dosyasında saklanır (her değişiklikte gecikmeli, atomik yazma) ve sunucu yeniden başlayınca geri yüklenir.
  90 günden eski odalar açılışta silinir. Sunucu yeniden başladığında süren zamanlayıcılar bitiş anından yeniden kurulur.

## 4. Gizlilik (en önemli kural)

Sunucu her bağlantıya **o kişiye özel** bir görünüm üretir. Aşağıdakiler ilgili açılış anından önce hiçbir istemciye,
hiçbir uçtan (HTTP ya da WS) gönderilmez:

- Başkasının şıkkı, güveni, nedeni. (Yalnız "kilitledi / kaç soru işaretledi" bilgisi gider.)
- `dogru`, `aciklama` ve `sik_aciklamalari` alanları (serbestte `kontrol` ile kilitlenen soru, yalnız kilitleyen kişiye açılır).

Açılış anı: Kahoot'ta soru bazında (`acik(i)` evresine geçince yalnız i. ve önceki sorular), serbestte `bitti` evresi.
`aciklamalari_goster: false` ise `aciklama` ve `sik_aciklamalari` hiçbir zaman gönderilmez. Kişinin kendi cevabı kendisine her zaman gider.
Kimlik: her oyuncunun gizli bir `anahtar`ı vardır (rastgele, en az 128 bit); `oyuncuId` herkese açıktır, `anahtar` yalnız sahibine gider.

## 5. HTTP uçları (JSON)

POST istekleri `Content-Type: application/json` kullanır. HTTP gövdesi ve gelen WebSocket iletisi en çok 1 MiB olabilir. POST ve WebSocket bağlantılarında `Origin` gönderilmişse alan adı ve port `Host` ile eşleşmelidir. Yerel döngü adresleri dışında her IP bir dakikada 10 oda kurma ve toplam 60 oda sorgulama veya katılım isteği gönderebilir. Oyuncunun dördüncü WebSocket bağlantısı en eski bağlantısını kapatır.

| Uç | Gövde | Yanıt |
| --- | --- | --- |
| `POST /api/dogrula` | `{ set }` | `{ tamam: true, soruSayisi }` ya da `400 { hatalar: [..] }` |
| `POST /api/odalar` | `{ set, mod, soruSuresi, toplamSure, ad }` | `{ kod, oyuncuId, anahtar }` ya da `400 { hatalar }` |
| `POST /api/odalar/:kod/katil` | `{ ad }` | `{ oyuncuId, anahtar }` ya da `400/404 { hata }` |
| `GET /api/odalar/:kod` | — | `{ kod, baslik, mod, evre, oyuncular: [ad..], dolu }` (katılma ekranı için, gizli veri yok) |
| `POST /api/gecmis` | `{ odalar: [{ kod, oyuncuId, anahtar }] }` | `{ odalar: [{ kod, baslik, ders, mod, evre, tarih, oyuncular: [{ ad, dogruSayisi, puan }], soruSayisi, puanli }] }` (bulunamayanlar atlanır; skorlar yalnız `bitti` ise) |
| `GET /api/adres` | — | `{ adresler: ["http://192.168.1.146:3000", "http://<ad>.local:3000"] }` (sunucunun yerel ağ adresleri; ilk sıradaki IPv4) |

Paylaşım linki: sayfa `localhost`/`127.0.0.1` üzerinden açılmışsa arayüz linkte `location.origin` yerine `adresler[0]` kullanır
(Mac'te kurulan odanın linki telefonda açılabilsin).

`set` hem nesne hem JSON metni olarak kabul edilir. `soruSuresi` saniye (varsayılan 30), `toplamSure` dakika (varsayılan 0).

## 5b. Asistan kullanımı (Claude, Codex)

Amaç: sohbetteki asistan soru setini kendisi yükler, kullanıcıya link verir, test bitince sonuçları kendisi okur.

### Sunucu uçları

| Uç | Gövde | Yanıt |
| --- | --- | --- |
| `POST /api/odalar` (asistan odası) | `{ set, mod, soruSuresi, toplamSure, asistan: true }` (`ad` yok) | `{ kod, yonetici, link }` ya da `400 { hatalar }` |
| `POST /api/odalar/:kod/sonuc` | `{ yonetici }` | aşağıda; yanlış anahtarda `403 { hata }` |
| `POST /api/odalar/:kod/sorular/bekle` | `{ yonetici, sureMs }` | `{ bitti, sorular }`; ayrıntılar Asistana soru sohbeti bölümünde |
| `POST /api/odalar/:kod/sorular/yanitla` | `{ yonetici, mesajId, metin }` | `{ tamam: true }`; bilinmeyen mesaj 404 |

- Asistan odasında başlangıçta oyuncu yoktur; asistan oyuncu değildir. **İlk katılan kişi kurucu olur** (Başlat, Sıradaki soru, Şimdi aç onda).
- `yonetici`: rastgele gizli anahtar (en az 128 bit), yalnız odayı kuran asistana döner; hiçbir oyuncu görünümünde yer almaz.
- `link`: `adresler[0] + "/#/oda/KOD"` (yerel ağ adresi; yoksa `http://localhost:PORT`).
- `sonuc` yanıtı: `{ kod, baslik, mod, evre, bitti, soruSayisi, oyuncular: [{ ad, bagli, isaretli, gonderdi, kilitledi }], sira }`.
  Yalnız `bitti` ise ek olarak: `metin` ("Sonuçları kopyala" ile birebir aynı metin; `public/sonucMetni.js` yeniden kullanılır),
  `skorlar: [{ ad, dogruSayisi, puan }]` ve `sorular: [{ id, metin, dogru, cevaplar: [{ ad, sik, guven, neden, dogruMu, puan }] }]`.
  **Bitmeden önce hiçbir cevap dönmez** (asistan da açılışı bekler).

### MCP sunucusu (`mcp/sunucu.mjs`)

Standart girdi/çıktı üzerinden çalışan, ek bağımlılığı olmayan MCP sunucusu (satır başına bir JSON-RPC 2.0 iletisi; `initialize`,
`notifications/initialized`, `ping`, `tools/list`, `tools/call`). stdout'a yalnız protokol iletileri yazılır, günlük stderr'e.
Test sunucusunun adresi `TEST_ODASI_URL` (varsayılan `http://localhost:3000`). Sunucu yanıt vermiyorsa MCP sunucusu
`sunucu/sunucu.js`'i ayrık (detached) süreç olarak başlatır ve hazır olmasını bekler.
Kurduğu odaların `yonetici` anahtarlarını `veri/asistan-odalar.json` dosyasında saklar; araçlara yönetici anahtarı vermek gerekmez.

| Araç | Girdi | Ne yapar |
| --- | --- | --- |
| `soru_seti_semasi` | — | Soru seti biçimini, kuralları ve kısa bir örneği döner (LaTeX, `gorsel` veri URI'si, `sure` dahil). |
| `test_olustur` | `set` (nesne), `mod` (`kahoot` varsayılan / `serbest`), `soruSuresi`, `toplamSure` | Doğrular, odayı kurar; oda kodu ve telefon linkini döner. Hata varsa Türkçe hata listesi (`isError`). |
| `test_durumu` | `kod` (verilmezse son kurulan oda) | Evre ve kişi kişi ilerleme. |
| `test_sonucu` | `kod` (verilmezse son kurulan oda) | Bittiyse sonuç metni + soru bazında ayrıntı; bitmediyse durum ve "henüz bitmedi" iletisi. |
| `soru_bekle` | `kod?`, `sure?` (saniye, 50 varsayılan, en çok 55) | Soruları bağlamıyla bekler; boşsa yeniden çağrılır. |
| `soru_yanitla` | `kod?`, `mesajId`, `metin` | Oyuncuya özel yanıt ekler. |

`soru_bekle`, `test_sonucu` ve `test_durumu` oyuncu adlarını, gerekçeleri, sohbet geçmişini ve oyuncu metni içeren sonuç özetini ilgili nesnenin `oyuncuVerisi` alanına yerleştirir. Asistan bu alanları soruyu açıklamak için okur. Soru kimliği ve yanıtın gönderileceği `mesajId` ayrı kalır.

Araç açıklamaları Türkçe yazılır ve asistana akışı anlatır: önce şemaya bak, seti üret, `test_olustur`, linki kullanıcıya ver,
kullanıcı "bitti" deyince `test_sonucu`; yerel sunucu kayıtlı odaları otomatik yanıtlar.

## 6. WebSocket

Bağlantı: `ws://<host>/ws?kod=..&oyuncuId=..&anahtar=..`. Yanlış kimlikte `{ tur: "hata", kod: "kimlik", ileti }` gönderip kapatır.

İstemci → sunucu (hepsi `{ tur, ... }`):

| `tur` | Alanlar | Kim / ne zaman |
| --- | --- | --- |
| `baslat` | — | kurucu, lobi |
| `kilitle` | `soruId, sik, guven, neden` (sik/guven `null` olabilir; sik `null` boş kilittir) | kahoot, `soru` evresi, o anki soru, bir kez |
| `taslak` | `soruId, sik, guven, neden` (sik/guven `null` olabilir) | serbest, `cozum`, göndermemişse |
| `kontrol` | `soruId` | serbest, `cozum`, göndermemişse; o cevabı kilitler, `dogru`/`aciklama` yalnız kendisine gider (`acik: false`, `cevaplar` yok); kilitli soruya `taslak` reddedilir |
| `konum` | `sira` | serbest; kişinin baktığı soru sırası (yenileyince dönmek için) |
| `gonder` | — | serbest, `cozum`; boş sorular olsa da kabul edilir |
| `sonraki` | — | kahoot, `acik`; kurucu, kurucu bağlı değilse herkes |
| `simdiAc` | — | serbest, `cozum`; kurucu |
| `sor` | `soruId, metin` | asistan odası; soru cevabı oyuncuya açılmışsa, 1–500 karakter, en çok 20 oyuncu mesajı |

Sunucu → istemci:

- `{ tur: "hata", ileti, islem? }` — Türkçe ileti; `islem` hatalı istemci ileti türüdür.
- `{ tur: "durum", durum }` — her değişiklikte o kişiye özel tam görünüm:

```js
durum = {
  sunucuSaat: 1731580000000,          // ms; istemci saat farkını bundan hesaplar
  kod: "48213", mod: "kahoot" | "serbest",
  evre: "lobi" | "soru" | "acik" | "cozum" | "bitti",
  set: { set_id, baslik, ders, soruSayisi },
  soruSuresi: 30, toplamSure: 0,
  ben: { id, ad, kurucu: true, gonderdi: false, konum: 0 },
  oyuncular: [                        // katılma sırasıyla, ben dahil
    { id, ad, kurucu, bagli, isaretli: 4, gonderdi: false,   // serbest: tamam cevap sayısı / gönderdi mi
      kilitledi: false,                                      // kahoot: o anki soruyu kilitledi mi
      puan: 0, dogruSayisi: 0 }                              // yalnız açılmış sorulardan hesaplanır
  ],
  puanli: true,                       // sette en az bir `dogru` var mı (skor gösterilsin mi)
  sira: 2,                            // kahoot: o anki soru sırası (0 tabanlı); serbestte null
  bitis: 1731580030000,               // kahoot `soru` ya da süreli serbest `cozum` bitiş anı (ms), yoksa null
  sureMs: 30000,                      // o anki sayacın toplam süresi, yoksa null
  sorular: [                          // kahoot: 0..sira arası; serbest: lobi hariç hepsi; lobi: []
    { id, sira, etiket, metin, siklar: [..], gorsel,
      benim: { sik: "B", guven: 2, neden: "", kilitli: true } | null,
      acik: false,
      // yalnız acik === true iken:
      dogru: "B" | null, aciklama: "…" | null, sik_aciklamalari: [..], // varsa; açıklamalar gizliyse ikisi de yok
      cevaplar: [ { oyuncuId, sik: "B" | null, guven: 2 | null, neden: "", dogruMu: true | false | null, puan: 870 } ]
    }
  ]
}
```

`cevaplar` oyuncu sırasıyla, boş bırakan için `sik: null`. `dogruMu` yalnız soruda `dogru` varsa boolean, yoksa null.
Soru sayacı istemcide `bitis − (Date.now() + fark)` ile gösterilir; karar sunucudadır.

## 7. Arayüz

Mobil öncelikli, tek sayfa. `prefers-color-scheme` ile açık ve koyu tema. Dokunma hedefleri en az 48 px, giriş kutularında yazı en az 16 px
(Safari yakınlaştırmasın). `100dvh`, `env(safe-area-inset-*)`. Bağlantı koparsa (ekran kilidi, ağ) kendiliğinden yeniden bağlanır;
`visibilitychange` ile sayfa öne gelince hemen dener. Kimlikler `localStorage`'da: oda başına `{ kod, oyuncuId, anahtar, ad }` ve son kullanılan ad.

Ekranlar:
1. **Ana sayfa**: varsa bitmemiş ilk oda için başlık, mod ve oda bağlantısıyla "Devam et" kartı (geçmiş yüklenirken yeri ayrılır); "Koda katıl" (kod kutusu), ikincil "Yeni test", "Geçmiş testler" (o cihazın odaları; başlık, tarih, kişiler ve skorları; dokununca oda açılır).
2. **Yeni test**: JSON yapıştırma alanı + `.json` dosya seçme; metin değişimi durduktan yaklaşık 600 ms sonra veya dosya seçilince otomatik doğrulama (boş alanda sonuç yok, eski yanıtlar yok sayılır), hatalar liste halinde; mod seçimi (Kahoot / Kendi hızında);
   soru süresi (20/30/45/60/90 sn) ya da toplam süre (süresiz/10/20/30/45 dk); kurucunun adı; "Odayı kur".
3. **Katıl**: linkten ya da koddan gelen kişi yalnız adını yazar.
4. **Lobi**: büyük oda kodu, katılanlar, kurucuda "Başlat"; ardından yan yana "Linki kopyala" ve "WhatsApp ile paylaş" (`https://wa.me/?text=`); ham link gösterilmez.
   Link `location.origin + "/#/oda/KOD"`.
5. **Kahoot soru**: üstte "3/7", geri sayım çubuğu ve saniye; soru metni, varsa görsel (sorunun altında); büyük şık düğmeleri (A–E);
   güven 1–3 (isteğe bağlı); "+ Not ekle" ile açılan neden alanı (mevcut not açıktır, kilitli ve boşsa gizlidir); yapışkan alt çubukta "Kilitle" ve "Boş bırak". Durum küçük rozetlerle: "Ali ✓ / Ayşe …"; bağlı değil bilgisi korunur.
6. **Kahoot açılış**: şıkların altında seçenlerin adı, varsa güveni, ✓/✗ ve doğru cevapta +puan; şıkların hemen altında açıklama; ayrı kısa satırlarda yalnız yazılmış nedenler ve boş bırakanlar; puan tablosu, yapışkan alt çubukta "Sıradaki soru" / "Sonuçları göster".
7. **Serbest çözüm**: tek soru; "5/7 ▾" düğmesiyle açılıp kapanan, başlangıçta kapalı soru noktaları (soru seçilince kapanır); varsa toplam geri sayım; yapışkan alt çubukta "Önceki" ve birincil "Sonraki ›", son soruda birincil "Gönder"; diğer sorularda sayfa sonunda ikincil "Gönder". "Gönder" boş sorular olsa da kabul edilir. Oyuncu durumu küçük rozetlerle "Ali 4/7" / "Ali ✓"; kurucuda gönderdikten sonra "Şimdi aç".
8. **Sonuç (bitti)**: skorlar (Kahoot'ta puan + doğru sayısı, serbestte doğru sayısı; `puanli` değilse skor yok);
   her şıkta seçenlerin adı, varsa güveni, ✓/✗ ve Kahoot’ta doğru cevapta +puan; kendi adında "(sen)"; şıkların hemen altında açıklama, ardından yalnız yazılmış nedenler ve "Boş: Ali, Can" satırı; ayrı oyuncu kartları yok.
   Vurgular: **"Hepiniz yanlış"** (2 kişiyse "İkiniz de yanlış"; cevap veren herkes yanlışsa) ve **"emin ama yanlış"** (güven 3 + yanlış).
   "Sonuçları kopyala".

`metin`, `siklar`, `aciklama`, `sik_aciklamalari` içindeki `$…$` ve `$$…$$` KaTeX ile işlenir. Kullanıcıdan ve setten gelen bütün metin
`textContent` ile yazılır (HTML olarak asla basılmaz); KaTeX auto-render o düğüm üzerinde çalıştırılır.

### "Sonuçları kopyala" biçimi (birebir)

```
[TEST SONUCU] istatistik-modul-3 · Modül 3 · Ortalama, medyan, mod (+ Modül 2 telafi)
Katılımcılar: Mehmet, Ali
T1 | Mehmet: A, güven 3 | Ali: C, güven 2, neden: kayıt sırası zaman
S1 | Mehmet: B, güven 2, neden: n çift | Ali: B, güven 3
Skor | Mehmet: 5/7 | Ali: 4/7
```

- İlk satır: `[TEST SONUCU] <set_id> · <baslik>`. Satırlar setteki soru sırasıyla, başında soru `id`'si.
- Neden boşsa `, neden: …` yazılmaz. Boş bırakılan cevap: `Mehmet: boş`.
- `Skor` satırı yalnız `puanli` ise; doğru sayısı / soru sayısı (Kahoot puanı yazılmaz).
- Sonda fazladan boş satır yok.

## Asistana soru sohbeti

- Yalnız `asistan: true` ile kurulan, `yonetici` anahtarlı odalarda bulunur. `gorunum` üstünde `asistanVar` ve son otomatik çalışma veya `soru_bekle` çağrısından itibaren 90 saniye boyunca `asistanBagli` vardır.
- WS `sor { soruId, metin }`: yalnız oyuncu cevabı gördüyse (Kahoot açılışı, oda sonu veya serbest `kontrol` kilidi). Aksi halde `Önce cevabı gör`; yönetici yoksa `Bu odada asistan yok`. Kırpılmış metin 1–500 karakter, oyuncu/soru başına en çok 20 oyuncu mesajı.
- Her oyuncunun soru başına `sohbetler` kaydı kalıcıdır: `{ soruId, mesajlar: [{ id, kim: 'oyuncu'|'asistan', metin, an }] }`. Eski odalarda boş kabul edilir. Görünüm yalnız sahibine, yalnız açılan soruda `sohbet` ve `sohbetDurum` verir. Yanıtlar hangi oyuncu mesajına kadar yanıt verildiğini `yanitlanan` ile kaydeder. Bekleyen oyuncu mesajı için 120 saniyelik claim geçerliyse `sohbetDurum: 'yaziyor'`, değilse `null`.
- `POST /api/odalar/:kod/sorular/bekle { yonetici, sureMs }`: `/sonuc` ile aynı yönetici doğrulaması. Süre 1000–55000 ms (varsayılan 50000); bekleyen, claim edilmemiş soruları hemen, yoksa yeni soru/claim süresi dolunca veya zaman aşımında `{ bitti, sorular }` döndürür. Her öğe `{ mesajId, oyuncu, soru: { id, metin, siklar, dogru, aciklama, sik_aciklamalari }, oyuncuCevabi: { sik, guven, neden }|null, gecmis, metin }`; geçmiş yalnız bu mesajdan önceki aynı kişiye ait soru sohbetidir. Dönen mesajlar 120 saniye claim edilir, yanıt gelmezse yeniden alınabilir. İstek kapanınca, zaman aşımında ve sunucu kapanırken bekleyenler temizlenir.
- `POST /api/odalar/:kod/sorular/yanitla { yonetici, mesajId, metin }`: 1–4000 karakter yanıt ekler, claim temizler, kaydeder ve yayınlar. Bilinmeyen oyuncu mesajı 404; tekrar gönderim ikinci bir yanıt eklemez.
- MCP `soru_bekle { kod?, sure? }` (saniye, varsayılan 50, üst sınır 55), `soru_yanitla { kod?, mesajId, metin }`. Otomatik yanıtlar için sunucu kayıtlı oda anahtarını doğrular ve LM Studio ile iletişim kurar. Bu iki MCP aracı elle yanıt vermek için de kullanılabilir. Yanıt Türkçe, soruya odaklı ve gerekçeli olur; kod, LaTeX ve vurgu desteklenir.
- Cevap açıklamasının altında “WickWick'e sor” ikincil düğmesi, okunmamış yanıt noktası (serbest soru ızgarasında da) ve cihazda `testOdasi.` önekli son görülme kaydı bulunur. %85 yüksekliğindeki alt panelde mesajlar, dört başlangıç önerisi, yazıyor/çevrimdışı durumu ve klavye üstünde kalan gönderim alanı vardır. Sohbet yalnız o oyuncuya özeldir.
