# Test Odası

Node.js 22 veya üstü gerekir. Proje klasöründe:

```sh
npm install
npm start
```

Bilgisayarda `http://localhost:3000` adresini açın. Telefonları aynı yerel ağa bağlayıp açılışta konsolda yazan `http://192.168.…:3000` veya `http://bilgisayar-adı.local:3000` adresine girin. Mac güvenlik duvarı sorarsa Node için gelen yerel ağ bağlantılarına izin verin. Portu değiştirmek için `PORT=3001 npm start` kullanın. Sunucuyu Ctrl+C ile kapatın. İnternete port yönlendirmeyin; uygulama yerel ağ içindir.

`public/index.html` arayüz ajanı tarafından sağlanır; henüz yoksa sunucu 404 döndürür, çalışmaya devam eder. KaTeX dosyaları kurulumdan sonra `/vendor/katex/` altında internetsiz sunulur. Örnek JSON dosyalarını arayüzde içe aktarabilirsiniz.

## Soru seti hazırlatmak için asistana verilecek biçim

“Geçerli JSON üret: `surum: 1`, boş olmayan `set_id` ve `baslik`, isteğe bağlı `ders`, `aciklamalari_goster` (varsayılan true), en az bir elemanlı `sorular`. Her soruda benzersiz ve boş olmayan `id`, `metin`, 2–5 boş olmayan metinden oluşan `siklar` olsun. İsteğe bağlı alanlar: `etiket`, şıklara uygun `dogru` (A–E), `aciklama`, `gorsel`, `sure`. `gorsel` yalnız http/https URL veya `data:image/png`, `jpeg`, `gif`, `webp`, `svg+xml` veri URI’si olsun. SVG’yi base64 ya da URI kodlamasıyla göm; beyaz arka plan ve okunur eksen adları kullan. `sure` 5–600 arası tam sayı saniyedir ve Kahoot’ta oda süresini o soru için ezer. Metin, şık ve açıklamalarda satır içi `$…$` veya blok `$$…$$` LaTeX kullanılabilir; JSON içinde ters eğik çizgileri çift yaz (`\\frac`). Doğru şık ve açıklamaları içerik açısından doğrula.”

Örnek: `ornek/modul3_soru_seti.json` ve görsel sınaması için `ornek/gorsel_latex_test.json`. İçe aktarma gövdesi en çok 5 MiB olabilir. Kahoot varsayılan soru süresi 30 saniye; serbest modda `toplamSure` dakika, 0 süresizdir.

```sh
npm test
```

Testler geçici dizin kullanır, `veri/` içine yazmaz. Odalar çalışma sırasında `veri/odalar.json` içinde atomik saklanır; 90 günden eski odalar açılışta temizlenir. Kimlik anahtarını bilen kişi o oyuncuya erişebilir; kimlikleri paylaşmayın. Bekleyen süreler yeniden başlatmada bitiş anına göre devam eder.

## Asistanla kullanım

Önce proje klasöründe `npm install` çalıştırın. MCP sunucusu Node.js 22+ ile ek bağımlılık olmadan stdio üzerinden çalışır. Asistanın kullandığı Node çalıştırılabilir dosyası PATH'te yoksa aşağıdaki `node` yerine `which node` çıktısındaki mutlak yolu yazın.

Claude Desktop için `claude_desktop_config.json` dosyanızdaki mevcut `mcpServers` nesnesine şu girdiyi ekleyin (diğer girdileri koruyun):

```json
{
  "mcpServers": {
    "test-odasi": {
      "command": "node",
      "args": ["/Users/mehmetemre/Documents/test-odasi/mcp/sunucu.mjs"]
    }
  }
}
```

Claude Code için:

```sh
claude mcp add test-odasi -- node /Users/mehmetemre/Documents/test-odasi/mcp/sunucu.mjs
```

Codex için `~/.codex/config.toml` dosyasına:

```toml
[mcp_servers.test-odasi]
command = "node"
args = ["/Users/mehmetemre/Documents/test-odasi/mcp/sunucu.mjs"]
```

Codex alanları: [OpenAI resmî yapılandırma referansı](https://learn.chatgpt.com/docs/config-file/config-reference). Yapılandırmayı ekledikten sonra istemcinizde MCP bağlantısını yeniden yükleyin veya uygulamayı yeniden başlatın. Bu projedeki kurulum adımları bu yapılandırma dosyalarını otomatik değiştirmez.

Örnek kullanım: **“Beni şu konudan 8 soruyla sına: ortalama, medyan ve mod.”** Asistan önce `soru_seti_semasi` aracını okur, soruları üretip `test_olustur` ile yükler ve size telefon linkini verir. Linki açıp adınızla katılın; ilk katılan kişi kurucu olur ve testi başlatır. Test tamamlandığında asistana **“Bitti, sonuçlarımı yorumla.”** deyin; `test_sonucu` ile sonuçları okuyabilir. `test_durumu` yalnız evre ve ilerlemeyi verir. Son iki araçta kod verilmezse o sunucuda son kurulan oda seçilir.

MCP, varsayılan olarak `http://localhost:3000` adresini kullanır. `/api/adres` yanıt vermiyorsa yerel test sunucusunu ayrık süreç olarak başlatır ve yaklaşık 5 saniye bekler. Bu test sunucusu MCP istemcisi kapansa da çalışır. Farklı port için MCP sürecine `TEST_ODASI_URL=http://localhost:3001` verin; otomatik başlatılan sunucu bu portu kullanır. Uzak URL erişilemiyorsa o makinede süreç başlatılmaz; otomatik başlatma yalnız localhost adresleri içindir. Yeni uçları kullanmak için çalışan test sunucusunun güncel kodla başlatılmış olması gerekir.

Yönetici anahtarları `veri/asistan-odalar.json`, odalar `veri/odalar.json` dosyasına kaydedilir ve yeniden başlatmada korunur. MCP araç çıktılarında anahtar gösterilmez. `TEST_ODASI_VERI_DIZINI` ortam değişkeni, hem HTTP hem MCP sunucusunun veri dizinini değiştirir; testler geçici dizin kullanır. Claude Desktop girdisinde `env` nesnesi veya Codex girdisinde `env = { TEST_ODASI_URL = "http://localhost:3001" }` ile ortam değişkeni tanımlanabilir.
