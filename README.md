# 📱 Test Odası

**Arkadaşlarınla aynı soru setini, herkes kendi telefonundan çözsün.**
Yerel ağda çalışan, hesap istemeyen, tamamen Türkçe bir canlı test uygulaması. Sorularınızı JSON olarak yükleyin ya da asistanınıza (Claude, Codex) hazırlatın; oda linkini paylaşın, birlikte çözün, sonuçları birlikte tartışın.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Bağımlılık](https://img.shields.io/badge/ba%C4%9F%C4%B1ml%C4%B1l%C4%B1k-yaln%C4%B1z%20ws%20%2B%20katex-blue)
![Derleme](https://img.shields.io/badge/derleme%20ad%C4%B1m%C4%B1-yok-lightgrey)
![MCP](https://img.shields.io/badge/MCP-destekli-8A2BE2)

---

## ✨ Öne çıkanlar

- **İki oyun modu**
  - 🏁 **Kahoot** — herkes aynı soruyu aynı anda görür, süreye karşı yarışır. Hızlı ve doğru cevap daha çok puan getirir.
  - 📝 **Serbest** — herkes kendi hızında, sorular arasında ileri-geri gezerek çözer; isteğe bağlı toplam süre.
- **Güven seviyesi ve gerekçe** — her cevaba 1–3 arası güven ve kısa bir “neden” eklenir; açılışta herkesin düşüncesi yan yana görünür.
- **Gizlilik önce** — başkasının cevabı, doğru şık ve açıklama, açılış anına kadar hiçbir istemciye gönderilmez. Sunucu her kişiye kendine özel görünüm üretir.
- **LaTeX ve görseller** — `$…$` / `$$…$$` formülleri KaTeX ile internetsiz çizilir; sorulara URL ya da gömülü SVG/PNG grafik eklenebilir.
- **Kalıcı odalar** — odalar diske atomik yazılır; sunucu yeniden başlasa da süreler kaldığı yerden devam eder.
- **Asistan entegrasyonu (MCP)** — “Beni şu konudan 8 soruyla sına” deyin; asistan soruları üretir, odayı kurar, linki verir ve test bitince sonuçlarınızı yorumlar.
- **Sade yapı** — çerçeve yok, derleyici yok. Düz HTML + CSS + ES modülleri ve Node.js.

## 🚀 Hızlı başlangıç

Node.js 22 veya üstü gerekir.

```sh
npm install
npm start
```

- Bilgisayarda: `http://localhost:3000`
- Telefonda: aynı Wi-Fi ağına bağlanın ve konsolda yazan `http://192.168.…:3000` ya da `http://<bilgisayar-adı>.local:3000` adresini açın.

Port değiştirmek için `PORT=3001 npm start`. macOS güvenlik duvarı sorarsa Node için gelen yerel bağlantılara izin verin.

> ⚠️ Uygulama **yalnız yerel ağ** içindir. İnternete port yönlendirmeyin.

## 🎮 Nasıl oynanır?

1. Arayüzde bir soru seti içe aktarın (örnekler `ornek/` klasöründe).
2. Modu seçip odayı kurun; 5 haneli oda kodu ve paylaşım linki oluşur.
3. En fazla 4 kişi adıyla katılır. Kurucu **Başlat** der.
4. Her soruda şık + güven seçilir, istenirse gerekçe yazılır ve cevap kilitlenir.
5. Açılışta doğru cevap, açıklama, herkesin seçimi ve puan tablosu görünür.

| | Kahoot | Serbest |
| --- | --- | --- |
| Akış | `lobi → soru → açık → … → bitti` | `lobi → çözüm → bitti` |
| Süre | Soru başına (varsayılan 30 sn, soru bazında ezilebilir) | İsteğe bağlı toplam süre (dakika) |
| Puan | `1000 × (1 − (geçen/süre)/2)` | Puan yok, doğru sayısına göre sıralama |
| Açılış | Her sorudan sonra | Herkes gönderince / süre bitince |

## 🧩 Soru seti biçimi

```json
{
  "surum": 1,
  "set_id": "istatistik-modul-3",
  "baslik": "Merkezi Eğilim Ölçüleri",
  "ders": "İstatistik",
  "aciklamalari_goster": true,
  "sorular": [
    {
      "id": "S1",
      "etiket": "Kolay",
      "metin": "$\\{2, 4, 4, 7\\}$ kümesinin modu nedir?",
      "siklar": ["2", "4", "4.25", "7"],
      "dogru": "B",
      "aciklama": "En sık tekrar eden değer 4'tür.",
      "sure": 45
    }
  ]
}
```

| Alan | Zorunlu | Açıklama |
| --- | :---: | --- |
| `surum` | ✅ | Şimdilik `1` |
| `set_id`, `baslik` | ✅ | Boş olmayan metin |
| `sorular` | ✅ | En az bir soru |
| `sorular[].id`, `metin` | ✅ | `id` set içinde benzersiz |
| `sorular[].siklar` | ✅ | 2–5 boş olmayan metin |
| `dogru` | — | Şık sayısına uygun A–E harfi |
| `aciklama`, `etiket` | — | Açılışta gösterilir |
| `gorsel` | — | http/https URL ya da `data:image/...` veri URI'si |
| `sure` | — | 5–600 saniye; Kahoot'ta o sorunun süresini ezer |

Hatalı setlerde doğrulayıcı tüm hataları alan adıyla birlikte Türkçe listeler, örn. `sorular[2].siklar: 2 ile 5 arası şık olmalı (6 var)`.
Ayrıntılı sözleşme için [SARTNAME.md](SARTNAME.md) dosyasına bakın.

## 🤖 Asistanla kullanım (MCP)

Proje, Node.js 22+ ile ek bağımlılık gerektirmeyen bir stdio MCP sunucusu içerir: [`mcp/sunucu.mjs`](mcp/sunucu.mjs).

| Araç | Ne yapar? |
| --- | --- |
| `soru_seti_semasi` | Soru seti biçimini asistana anlatır |
| `test_olustur` | Seti yükler, odayı kurar, telefon linkini döner |
| `test_durumu` | Evre ve ilerleme bilgisini verir |
| `test_sonucu` | Test bitince sonuçları okur |

**Claude Code**

```sh
claude mcp add test-odasi -- node /tam/yol/test-odasi/mcp/sunucu.mjs
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "test-odasi": {
      "command": "node",
      "args": ["/tam/yol/test-odasi/mcp/sunucu.mjs"]
    }
  }
}
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.test-odasi]
command = "node"
args = ["/tam/yol/test-odasi/mcp/sunucu.mjs"]
```

Örnek akış:

> **Sen:** Beni ortalama, medyan ve mod konusundan 8 soruyla sına.
> **Asistan:** Soruları hazırladım, odayı kurdum: `http://192.168.1.20:3000/#/oda/48213`
> *(…test çözülür…)*
> **Sen:** Bitti, sonuçlarımı yorumla.

MCP varsayılan olarak `http://localhost:3000` adresini kullanır; sunucu çalışmıyorsa kendisi başlatır. Farklı adres için `TEST_ODASI_URL`, veri dizini için `TEST_ODASI_VERI_DIZINI` ortam değişkenlerini kullanın.

## 🗂️ Proje yapısı

```
test-odasi/
├── sunucu/          HTTP + WebSocket sunucusu (Node 22, ESM)
│   ├── sunucu.js    HTTP, statik dosyalar, WS bağlantıları
│   ├── oda.js       Oda durumu, evre geçişleri, puanlama, kişiye özel görünüm
│   ├── dogrula.js   Soru seti doğrulaması
│   ├── depo.js      Kalıcı kayıt (veri/odalar.json)
│   └── test/        node --test testleri
├── public/          Arayüz (düz HTML + CSS + ES modülleri)
├── mcp/             Asistanlar için MCP sunucusu
├── ornek/           Örnek soru setleri
├── OKU.md           Ayrıntılı çalıştırma notları
└── SARTNAME.md      Sunucu ↔ arayüz sözleşmesi
```

## 🧪 Testler

```sh
npm test
```

Testler geçici dizin kullanır; `veri/` klasörüne dokunmaz.

## 🔒 Güvenlik notları

- Her oyuncunun gizli bir kimlik anahtarı vardır; anahtarı bilen o oyuncu adına erişebilir, paylaşmayın.
- Çalışma verisi (`veri/`) depoya eklenmez.
- 90 günden eski odalar açılışta otomatik silinir.
