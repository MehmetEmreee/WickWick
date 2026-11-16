# WickWick

WickWick, aynı soru setini en fazla dört kişinin kendi telefonundan çözmesi için hazırlanmış Türkçe bir yerel ağ uygulamasıdır. Hesap açmadan oda oluşturabilir, bağlantıyı paylaşabilir ve cevaplar açıldıktan sonra gerekçeleri karşılaştırabilirsiniz. Soru setlerini JSON olarak içe aktarabilir veya MCP bağlantısı olan bir asistana hazırlatabilirsiniz.

## Kurulum

Node.js **22 veya üzeri** gerekir. Proje klasöründe:

```sh
npm install
npm start
```

Bilgisayarda [localhost:3000](http://localhost:3000) adresini açın. Ayrı bir derleme adımı yoktur; arayüz düz HTML, CSS ve JavaScript modüllerinden oluşur. Sunucuyu terminalde `Ctrl+C` ile kapatabilirsiniz.

Farklı port kullanmak için:

```sh
PORT=3001 npm start
```

### Telefondan bağlanma

1. Bilgisayarı ve telefonu aynı yerel ağa bağlayın.
2. Sunucunun terminalde yazdığı `http://192.168.…:3000` veya `.local` adresini telefonda açın.
3. Oda bağlantısını diğer katılımcılarla paylaşın.

Telefonda `localhost` telefonun kendisini gösterir; bilgisayarın LAN adresini kullanın. Bağlantı kurulamazsa aynı ağı, misafir ağının cihaz yalıtımını ve güvenlik duvarındaki Node iznini kontrol edin. IP adresi veya port değişirse bağlantı da değişir.

Uygulama yerel ağ kullanımı için tasarlanmıştır. Dahili HTTPS, hesap yönetimi veya internete açık barındırma kurulumu sağlamaz. KaTeX ve uygulama dosyaları yerel sunucudan gelir; dış URL kullanan soru görselleri ayrıca internet isteyebilir.

## Test oluşturma ve çözme

1. Ana sayfada yeni test oluşturun; JSON soru setini yapıştırın veya içe aktarın. Örnekler [`ornek/`](ornek/) klasöründedir.
2. Modu seçin, odayı oluşturun ve beş haneli kodu ya da bağlantıyı paylaşın.
3. Katılımcılar adlarıyla katılır; kurucu testi başlatır.
4. Şıkkınızı seçin. Güven seviyesi ve kısa gerekçe isteğe bağlıdır; soruyu boş bırakabilirsiniz.
5. Cevaplar açılınca doğru şık, açıklamalar ve katılımcıların seçimleri görünür. Sonuçları kopyalayabilir ve yanlış cevaplarınızı süzebilirsiniz.

| Mod | Akış | Süre ve değerlendirme |
| --- | --- | --- |
| **Süreli yarış** | Herkes aynı soruyu çözer; her sorudan sonra cevaplar açılır. | Varsayılan soru süresi 30 saniyedir; 5–600 saniye seçilebilir. Doğru ve hızlı cevap daha çok puan getirir. |
| **Kendi hızında** | Sorular arasında ileri geri gezilir; herkes gönderince veya süre dolunca sonuçlar açılır. | İsteğe bağlı toplam süre vardır; 0 süresizdir. Sıralama doğru sayısına göredir. |

Başkasının cevabı açılış anından önce oyuncuya gönderilmez. Kendi hızında modunda “Cevabı gör”, yalnız o soruyu kilitleyen kişiye doğru şıkkı ve açıklamasını açar.

Odalar `veri/odalar.json` içinde atomik olarak saklanır. Yeniden başlatmada süreler duraklatılmaz; kayıtlı bitiş anına göre devam eder. Oyuncu kimliği aynı tarayıcının yerel kaydında tutulur. Tarayıcı verisini silmek veya başka tarayıcıya geçmek mevcut oyuncu kimliğini otomatik taşımaz.

## Soru seti biçimi

```json
{
  "surum": 1,
  "set_id": "temel-matematik",
  "baslik": "Temel Matematik",
  "sorular": [
    {
      "id": "S1",
      "metin": "$2 + 2$ kaçtır?",
      "siklar": ["3", "4", "5"],
      "dogru": "B",
      "aciklama": "İki ile ikinin toplamı dörttür."
    }
  ]
}
```

`surum: 1`, boş olmayan `set_id`, `baslik` ve en az bir soru gerekir. Her sorunun `id` değeri benzersiz olmalı; `metin` ve 2–5 boş olmayan `siklar` içermelidir. `dogru`, şıklara uygun A–E harfidir ve isteğe bağlıdır. `ders`, `etiket`, `aciklama`, `sik_aciklamalari`, `gorsel` ve soru başına `sure` eklenebilir. Hatalı alanlar arayüzde Türkçe olarak belirtilir.

- Formüller: satır içinde `$…$`, ayrı satırda `$$…$$`. JSON içinde LaTeX ters eğik çizgilerini çift yazın: `\\frac`.
- Kod: tek ters tırnakla satır içi kod; dil etiketli üç ters tırnakla kod bloğu. Mevcut renklendirme C/C++ odaklıdır; diğer dillerin gösterimi tam dil desteği anlamına gelmez.
- Vurgu: soru metinlerinde `<b>`, `<i>`, `<u>` desteklenir. Diğer HTML metin olarak gösterilir.
- Görseller: HTTP/HTTPS URL veya desteklenen `data:image/...` veri URI’si.

Ayrıntılı alanlar, sınırlar ve HTTP/WS sözleşmesi için [`SARTNAME.md`](SARTNAME.md) dosyasına bakın. Teknik uyumluluk için süreli yarışın protokol değeri `kahoot`, kendi hızında modunun değeri `serbest` olarak korunur.

## MCP ile asistan kullanımı

[`mcp/sunucu.mjs`](mcp/sunucu.mjs), stdio üzerinden çalışan MCP sunucusudur. Önce `npm install` çalıştırın. MCP istemcinize `node` komutunu ve bu dosyanın **gerçek mutlak yolunu** tanımlayın. Yerel klasörünüzün adını değiştirmek gerekmez.

Codex yapılandırma örneği (`~/.codex/config.toml`):

```toml
[mcp_servers.wickwick]
command = "node"
args = ["/tam/yol/WickWick/mcp/sunucu.mjs"]
```

JSON yapılandırması kullanan MCP istemcileri için:

```json
{
  "mcpServers": {
    "wickwick": {
      "command": "node",
      "args": ["/tam/yol/WickWick/mcp/sunucu.mjs"]
    }
  }
}
```

Mevcut MCP kayıt adınızı değiştirmek zorunda değilsiniz. `node` istemcinin PATH ortamında yoksa çalıştırılabilir dosyanın mutlak yolunu kullanın. İstemcinin yapılandırma dosyası ve yeniden yükleme yöntemi kendi sürümüne bağlıdır.

| Araç | İşlev |
| --- | --- |
| `soru_seti_semasi` | Geçerli soru seti biçimini verir. |
| `test_olustur` | Seti yükler, asistan odasını kurar ve katılım bağlantısını döndürür. |
| `test_durumu` | Odanın evresini ve ilerlemesini getirir. |
| `test_sonucu` | Test sonuçlarını getirir. |
| `soru_bekle` | Oyuncu sorularını bağlamlarıyla bekler; tek bekleme en çok 55 saniyedir. |
| `soru_yanitla` | Alınan `mesajId` için asistan yanıtını gönderir. |

Örnek istek: “Beni olasılık konusundan 8 soruyla sına; testi aç ve sorularımı yanıtlamak için bekle.”

MCP varsayılan olarak `http://localhost:3000` adresini kullanır; erişemezse sunucuyu başlatmayı dener. `TEST_ODASI_URL` ile adresi, `TEST_ODASI_VERI_DIZINI` ile veri dizinini değiştirebilirsiniz. Çalışan sunucu ile MCP aynı veri dizinini kullanmalıdır.

`test_olustur`, görünür açıklamalarda genel açıklamanın en az 120, her şık açıklamasının en az 30 karakter olmasını ve şık açıklamalarının birbirinden farklı olmasını denetler. Kullanıcı açıkça açıklamasız test istediğinde `aciklamasiz: true` bu ek denetimi atlayabilir. Yukarıdaki küçük JSON örneği arayüzde geçerlidir; MCP'nin açıklama denetimini karşılaması için genişletilmelidir.

### WickWick’e sor

Asistan odalarında cevabı gördükten sonra “WickWick’e sor” düğmesiyle o soruya özel sohbet açılır. Kullanıcı mesajları sağda kompakt balon, asistan yanıtları geniş alanda gösterilir. Asistan mesajları kısa paragrafları, basit başlık ve listeleri, **kalın** / *italik* vurguyu, kodu ve KaTeX formüllerini destekler. Uzun kod ve formüller kendi alanlarında yatay kayar. Bu, tüm Markdown özelliklerini kapsayan bir düzenleyici değildir.

Bekleyen mesaj için kuyruk, gerçek yanıt hakkı alındığında “Düşünüyor…”, asistan çevrimdışıyken ayrı durum gösterilir. Yanıt tamamlandığında bütün olarak gelir; token akışı yoktur. Asistanın `soru_bekle` döngüsünde çalışması gerekir; web sunucusu tek başına AI yanıtı üretmez.

Yeni görünüm, kaydedilmiş mesajlara da uygulanır. Eski yanıt düz metin olarak yazılmışsa geçmişe otomatik paragraf veya liste eklenmez; yalnız metindeki mevcut yapılar biçimlenir. Arayüz değişiklikleri için mevcut oda sayfasını yenilemek yeterlidir. MCP talimat değişiklikleri ise MCP süreci yeniden yüklendiğinde okunur.

## Test ve geliştirme

```sh
npm test
```

Testler geçici veri dizinleri kullanır; mevcut `veri/` odalarına yazmaz. Mantık, şema, kalıcılık ve güvenlik kontrollerine ek olarak HTTP + iki WebSocket ile uçtan uca tur ve asistan sohbet akışı sınanır. Yerel port açamayan sandbox ortamlarında bağlantı testleri atlanabilir; tam doğrulama için yerel bağlantı izni olan ortamda çalıştırın. Test sayısı ve sonucu terminal çıktısında görülür.

390px temsilî Chrome kontrolü mobil sohbet düzenini, iç yatay kaydırmayı, Markdown, kod ve KaTeX gösterimini kapsar. Gerçek telefonun ekran klavyesi ve tüm tarayıcı/cihaz kombinasyonları otomatik test kapsamında değildir.

| Dizin | İçerik |
| --- | --- |
| `public/` | Mobil arayüz ve güvenli metin gösterimi |
| `sunucu/` | HTTP, WebSocket, oda mantığı ve kalıcı kayıt |
| `sunucu/test/` | Node.js testleri |
| `mcp/` | Asistan araçları ve açıklama denetimi |
| `ornek/` | İçe aktarılabilir soru setleri |

## İşletim sınırları

- En fazla 4 oyuncu ve 300 oda tutulur. Yer gerektiğinde en eski bitmiş oda kaldırılır; açılışta 90 günden eski odalar temizlenir.
- HTTP gövdeleri ve gelen WS iletileri en fazla 1 MiB olabilir. POST istekleri JSON kullanır.
- Oyuncu kimlik anahtarını bilen kişi o oyuncuya erişebilir. Anahtarları ve `veri/` içeriğini paylaşmayın; veriler şifreli bir kasa olarak saklanmaz.
- Yerel döngü dışındaki IP adresleri için oda oluşturma ve sorgulama/katılım hız sınırları vardır. Bir oyuncunun en fazla üç eşzamanlı bağlantısı tutulur.
- Oyuncu adları, gerekçeler ve sohbet içerikleri asistan açısından güvenilmeyen veridir; sistem talimatı olarak değerlendirilmez.
- `veri/` ve `node_modules/` Git deposuna dahil değildir. Veri dizinini yedeklemek işletmecinin sorumluluğundadır.
