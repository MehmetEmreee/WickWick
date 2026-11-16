import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = fileURLToPath(new URL('../', import.meta.url));
const adres = new URL(process.env.TEST_ODASI_URL ?? 'http://localhost:3000');
const veriDizini = resolve(process.env.TEST_ODASI_VERI_DIZINI ?? resolve(kok, 'veri'));
const kayitDosyasi = resolve(veriDizini, 'asistan-odalar.json');
const { version } = JSON.parse(await readFile(resolve(kok, 'package.json'), 'utf8'));
const akis = 'Önce soru_seti_semasi ile biçimi öğren, seti üret, test_olustur ile yükle ve linki kullanıcıya ver. Kullanıcı bitti deyince test_sonucu çağır.';
const bosSema = { type: 'object', properties: {}, additionalProperties: false };
const kodSemasi = { type: 'object', properties: { kod: { type: 'string', pattern: '^\\d{5}$', description: 'Boş bırakılırsa son kurulan oda.' } }, additionalProperties: false };
const araclar = [
  { name: 'soru_seti_semasi', description: `Soru setinin kurallarını, LaTeX ve görsel biçimini örnekle açıklar. ${akis}`, inputSchema: bosSema },
  { name: 'test_olustur', description: `Soru setini doğrular ve oyuncusuz bir asistan odası kurar. İlk katılan kişi kurucu olur. ${akis}`, inputSchema: {
    type: 'object', properties: {
      set: { type: 'object', description: 'soru_seti_semasi aracındaki biçime uygun soru seti.' },
      mod: { type: 'string', enum: ['kahoot', 'serbest'], default: 'kahoot' },
      soruSuresi: { type: 'integer', minimum: 5, maximum: 600, default: 30, description: 'Saniye; yalnız Kahoot.' },
      toplamSure: { type: 'integer', minimum: 0, maximum: 35791, default: 0, description: 'Dakika; serbest modda 0 süresiz.' }
    }, required: ['set'], additionalProperties: false
  } },
  { name: 'test_durumu', description: `Evreyi ve kişi kişi ilerlemeyi verir; cevapları göstermez. ${akis}`, inputSchema: kodSemasi },
  { name: 'test_sonucu', description: `Test bittiyse sonuç metni ve soru bazında ayrıntıları verir; bitmediyse yalnız ilerlemeyi bildirir. ${akis}`, inputSchema: kodSemasi }
];
const semaMetni = String.raw`Soru seti JSON nesnesidir. HTTP gövde sınırı 5 MiB.
Zorunlu üst alanlar: surum: 1; set_id ve baslik: boş olmayan metin; sorular: en az 1 soru içeren dizi.
İsteğe bağlı üst alanlar: ders (metin), aciklamalari_goster (boolean; varsayılan true; false ise açıklamalar oyunculara hiç gönderilmez).
Her soruda zorunlu: id (boş olmayan metin, sette benzersiz), metin (boş olmayan metin), siklar (2–5 boş olmayan metinden oluşan dizi).
İsteğe bağlı soru alanları: etiket (metin), dogru (şık sayısına uygun A–E harfi: ilk şık A), aciklama (metin), gorsel, sure.
Görsel: http/https URL ya da data:image/png|jpeg|gif|webp|svg+xml veri URI'si. Grafik için data:image/svg+xml;base64,... önerilir: SVG'yi UTF-8 olarak base64 kodla, beyaz zemin ve okunur eksen/ölçek yazıları ekle. İnternet gerektirmez. Diğer şemalar yasaktır.
sure: 5–600 arası tam sayı saniye; yalnız Kahoot'ta o sorunun süresini ezer (oda varsayılanı 30 saniye).
LaTeX: metin, siklar, aciklama içinde satır içi $...$ ve blok $$...$$ kullan. JSON'da ters eğik çizgi çift yazılır: \\frac, \\sqrt.
Kod: çok satırlı kodu metin/siklar/aciklama içinde çitli blokla yaz: "${'```'}cpp\n...\n${'```'}" (JSON'da satır sonu \n, girinti aynen kalır); cümle içindeki ya da şık olan kısa kodu tek ters tırnakla yaz: ${'`'}x += 1${'`'}. Kod içindeki $ LaTeX sayılmaz.
Vurgu: yalnız <b>...</b> (ayrıca <i>, <u>) işlenir; diğer bütün HTML olduğu gibi (metin olarak) görünür.
İyi soru: Tek, tartışmasız bir doğru cevap yaz; çeldiriciler makul olsun. Birimleri ve yuvarlama hassasiyetini belirt. dogru ve aciklama alanlarını hesaplayıp doğrula; açıklamada çözüm gerekçesini ver.
Küçük, geçerli JSON örneği:
{"surum":1,"set_id":"ortalama-1","baslik":"Ortalama","ders":"İstatistik","aciklamalari_goster":true,"sorular":[{"id":"S1","metin":"$\\bar x=\\frac{\\sum x}{n}$ ile 2 ve 4'ün ortalaması kaçtır?","siklar":["2","3","4"],"dogru":"B","aciklama":"$$\\bar x=\\frac{2+4}{2}=3$$","sure":45}]}
Akış: Bu biçimde set üret, test_olustur çağır, telefon linkini kullanıcıya ver. Kullanıcı bitti deyince test_sonucu çağır.`;

async function istek(yol, govde, zamanAsimi = 3000) {
  const res = await fetch(new URL(yol, adres), {
    ...(govde === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) }),
    signal: AbortSignal.timeout(zamanAsimi)
  });
  const veri = await res.json();
  if (!res.ok) throw new Error(veri.hatalar?.join('\n') ?? veri.hata ?? `HTTP ${res.status}`);
  return veri;
}
async function hazirla() {
  try { await istek('/api/adres', undefined, 500); return; } catch { /* Yerel sunucuyu başlat. */ }
  if (!['http:', 'https:'].includes(adres.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(adres.hostname)) throw new Error('Uzak test sunucusuna ulaşılamadı; otomatik başlatma yalnız localhost için desteklenir');
  const cocuk = spawn(process.execPath, [resolve(kok, 'sunucu/sunucu.js')], {
    cwd: kok, detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: adres.port || (adres.protocol === 'https:' ? '443' : '80'), TEST_ODASI_VERI_DIZINI: veriDizini }
  });
  let baslatmaHatasi;
  cocuk.on('error', e => { baslatmaHatasi = e; });
  cocuk.unref();
  const son = Date.now() + 4500;
  while (Date.now() < son) {
    if (baslatmaHatasi) throw baslatmaHatasi;
    try { await istek('/api/adres', undefined, Math.min(400, Math.max(1, son - Date.now()))); return; } catch { /* Henüz hazır değil. */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Test sunucusu yaklaşık 5 saniye içinde başlatılamadı');
}
async function kayitlariOku() {
  try { return JSON.parse(await readFile(kayitDosyasi, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function kaydet(oda) {
  const odalar = await kayitlariOku();
  // Farklı sunucularda aynı kod bulunabilir; kimliği sunucu adresiyle birlikte sakla.
  const yeni = odalar.filter(o => o.kod !== oda.kod || o.adres !== adres.href);
  yeni.push({ adres: adres.href, kod: oda.kod, yonetici: oda.yonetici });
  await mkdir(veriDizini, { recursive: true });
  await writeFile(`${kayitDosyasi}.tmp`, JSON.stringify(yeni, null, 2), { mode: 0o600 });
  await rename(`${kayitDosyasi}.tmp`, kayitDosyasi);
}
function ilerleme(sonuc) {
  const { kod, baslik, mod, evre, bitti, soruSayisi, oyuncular, sira } = sonuc;
  return { kod, baslik, mod, evre, bitti, soruSayisi, oyuncular, sira };
}
async function aracCagir(name, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Araç girdisi nesne olmalı');
  if (!araclar.some(a => a.name === name)) throw new Error('Bilinmeyen araç');
  if (name === 'soru_seti_semasi') return semaMetni;
  if (name === 'test_olustur') {
    if (!args.set || typeof args.set !== 'object' || Array.isArray(args.set)) throw new Error('set: nesne olmalı');
    await hazirla();
    await istek('/api/dogrula', { set: args.set });
    const oda = await istek('/api/odalar', { set: args.set, mod: args.mod ?? 'kahoot', soruSuresi: args.soruSuresi ?? 30, toplamSure: args.toplamSure ?? 0, asistan: true });
    await kaydet(oda);
    return JSON.stringify({ kod: oda.kod, link: oda.link });
  }
  const odalar = (await kayitlariOku()).filter(o => o.adres === adres.href);
  if (args.kod !== undefined && (typeof args.kod !== 'string' || !/^\d{5}$/.test(args.kod))) throw new Error('kod: 5 haneli metin olmalı');
  const oda = args.kod === undefined ? odalar.at(-1) : odalar.find(o => o.kod === args.kod);
  if (!oda) throw new Error('Kayıtlı asistan odası bulunamadı; önce test_olustur çağır');
  await hazirla();
  const sonuc = await istek(`/api/odalar/${oda.kod}/sonuc`, { yonetici: oda.yonetici });
  return JSON.stringify(name === 'test_durumu' ? ilerleme(sonuc) : sonuc.bitti ? sonuc : { ...ilerleme(sonuc), ileti: 'Test henüz bitmedi' });
}

function yaz(yanit) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...yanit }) + '\n'); }
async function isle(satir) {
  let m;
  try { m = JSON.parse(satir); }
  catch { yaz({ id: null, error: { code: -32700, message: 'JSON okunamadı' } }); return; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    if (m && Object.hasOwn(m, 'id')) yaz({ id: m.id, error: { code: -32600, message: 'Geçersiz istek' } });
    return;
  }
  if (!Object.hasOwn(m, 'id')) return; // Bildirimlere hiçbir zaman yanıt yazılmaz.
  let result;
  switch (m.method) {
    case 'initialize': result = { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'test-odasi', version } }; break;
    case 'ping': result = {}; break;
    case 'tools/list': result = { tools: araclar }; break;
    case 'tools/call':
      try { result = { content: [{ type: 'text', text: await aracCagir(m.params?.name, m.params?.arguments) }] }; }
      catch (e) { result = { content: [{ type: 'text', text: e.message }], isError: true }; }
      break;
    default: yaz({ id: m.id, error: { code: -32601, message: 'Bilinmeyen metot' } }); return;
  }
  yaz({ id: m.id, result });
}
const satirlar = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const satir of satirlar) {
  try { await isle(satir); }
  catch (e) { console.error('MCP hatası:', e.message); }
}
