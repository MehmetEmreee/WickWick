import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { odaKur, oyuncuEkle, islem, gorunum, sorulariAl, bekleyenSorular, soruYanitla } from '../oda.js';
import { sunucuOlustur } from '../sunucu.js';
import { otomatikYanitBaslat } from '../otomatik-yanit.js';
import { depoAc } from '../depo.js';

const set = () => ({ surum: 1, set_id: 'sohbet', baslik: 'Sohbet', sorular: ['S1', 'S2'].map(id => ({ id, metin: 'İki artı iki?', siklar: ['3', '4'], dogru: 'B', aciklama: 'Topla', sik_aciklamalari: ['Eksik', 'Doğru'] })) });
function kur(mod = 'serbest', asistan = true) {
  const oda = odaKur({ set: set(), mod, asistan, ad: 'Ali' });
  const p = asistan ? oyuncuEkle(oda, 'Ali') : oda.oyuncular[0], diger = oyuncuEkle(oda, 'Veli');
  islem(oda, p, { tur: 'baslat' });
  return { oda, p, diger };
}
const sor = (oda, p, metin = 'Neden?', soruId = 'S1', an) => islem(oda, p, { tur: 'sor', soruId, metin }, an);
const kontrol = (oda, p) => islem(oda, p, { tur: 'kontrol', soruId: 'S1' });

test('Sohbet: açılış yetkisi, kişisel görünüm ve içerik sınırları', () => {
  const { oda, p, diger } = kur();
  assert.throws(() => sor(oda, p), /Önce cevabı gör/);
  assert.ok(!('sohbet' in gorunum(oda, p.id).sorular[0]));
  kontrol(oda, p);
  for (const metin of ['', '   ', null, 123, 'x'.repeat(501)]) assert.throws(() => sor(oda, p, metin), /metin:/);
  sor(oda, p, '  ÖZEL  ');
  const g = gorunum(oda, p.id);
  assert.equal(g.asistanVar, true); assert.equal(g.asistanBagli, false);
  assert.equal(g.sorular[0].sohbet[0].metin, 'ÖZEL'); assert.equal(g.sorular[0].sohbetDurum, null);
  assert.ok(!('sohbet' in g.sorular[1]));
  assert.ok(!JSON.stringify(gorunum(oda, diger.id)).includes('ÖZEL'));
  kontrol(oda, diger);
  assert.deepEqual(gorunum(oda, diger.id).sorular[0].sohbet, []);
  for (let i = 1; i < 20; i++) sor(oda, p, 'x'.repeat(500));
  assert.throws(() => sor(oda, p), /20 mesaj/);
  assert.equal(p.sohbetler[0].mesajlar.length, 20);
  assert.throws(() => sor(oda, p, 'x', 'bilinmeyen'), /Önce cevabı gör/);
});
for (const mod of ['serbest', 'kahoot']) test(`Sohbet ${mod}: oda bitince kabul edilir`, () => {
  const { oda, p, diger } = kur(mod);
  if (mod === 'serbest') islem(oda, p, { tur: 'simdiAc' });
  else {
    assert.throws(() => sor(oda, p), /Önce cevabı gör/);
    islem(oda, p, { tur: 'kilitle', soruId: 'S1', sik: 'A', guven: 1 });
    assert.throws(() => sor(oda, p), /Önce cevabı gör/);
    islem(oda, diger, { tur: 'kilitle', soruId: 'S1', sik: 'B', guven: 2 });
    sor(oda, p); // Zamanlı açılışta da kullanılabilir.
    islem(oda, p, { tur: 'sonraki' });
    islem(oda, p, { tur: 'kilitle', soruId: 'S2', sik: 'A', guven: 1 });
    islem(oda, diger, { tur: 'kilitle', soruId: 'S2', sik: 'B', guven: 2 });
    islem(oda, p, { tur: 'sonraki' });
  }
  assert.equal(oda.evre, 'bitti'); sor(oda, p, 'Son sorum', 'S2');
  assert.equal(gorunum(oda, p.id).sorular[1].sohbet[0].metin, 'Son sorum');
});
test('Sohbet: asistanı olmayan oda ve eski oda', () => {
  const { oda, p } = kur('serbest', false); kontrol(oda, p);
  assert.equal(gorunum(oda, p.id).asistanVar, false);
  assert.deepEqual(gorunum(oda, p.id).sorular[0].sohbet, []);
  assert.throws(() => sor(oda, p), /Bu odada asistan yok/);
});
test('Sohbet: bağlam, geçmiş, claim süresi, yanıt ve yinelenen yanıt', () => {
  const { oda, p } = kur(); kontrol(oda, p);
  sor(oda, p, 'İlk', 'S1', 1000); sor(oda, p, 'İkinci', 'S1', 1001);
  const { sorular, bitti } = sorulariAl(oda, 2000);
  assert.equal(bitti, false); assert.equal(sorular.length, 2);
  assert.deepEqual(sorular[0].soru, set().sorular[0]);
  assert.equal(sorular[0].oyuncu, 'Ali');
  assert.deepEqual(sorular[0].oyuncuCevabi, { sik: null, guven: null, neden: '' });
  assert.deepEqual(sorular[0].gecmis, []); assert.equal(sorular[1].gecmis[0].metin, 'İlk');
  assert.equal(gorunum(oda, p.id, 2000).sorular[0].sohbetDurum, 'yaziyor');
  assert.equal(sorulariAl(oda, 121999).sorular.length, 0);
  assert.equal(bekleyenSorular(oda, 122000).length, 2);
  assert.equal(gorunum(oda, p.id, 122000).sorular[0].sohbetDurum, null);
  assert.throws(() => soruYanitla(oda, 'yok', 'x'), e => e.durum === 404);
  for (const metin of ['', ' ', 1, 'x'.repeat(4001)]) assert.throws(() => soruYanitla(oda, sorular[0].mesajId, metin), /metin:/);
  soruYanitla(oda, sorular[1].mesajId, '  Yanıt  ', 3000);
  assert.equal(gorunum(oda, p.id, 3000).sorular[0].sohbetDurum, null);
  assert.equal(bekleyenSorular(oda, 3000).length, 0); assert.deepEqual(oda.sohbetHaklari, {});
  soruYanitla(oda, sorular[1].mesajId, 'x'.repeat(4000), 3001);
  assert.equal(p.sohbetler[0].mesajlar.length, 3);
  sor(oda, p, 'Takip', 'S1', 3002);
  assert.equal(sorulariAl(oda, 3003).sorular[0].gecmis.length, 3);
});
test('Sohbet: kalıcı kayıt geri yüklenir', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'sohbet-depo-'));
  try {
    const { oda, p } = kur(); kontrol(oda, p); sor(oda, p);
    const soru = sorulariAl(oda).sorular[0]; soruYanitla(oda, soru.mesajId, 'Yanıt');
    sor(oda, p, 'Takip'); sorulariAl(oda);
    const depo = depoAc(join(dizin, 'odalar.json')); depo.kaydet(new Map([[oda.kod, oda]])); await depo.bosalt();
    const geri = (await depo.oku()).get(oda.kod);
    assert.deepEqual(gorunum(geri, p.id).sorular, gorunum(oda, p.id).sorular);
    assert.deepEqual(geri.sohbetHaklari, oda.sohbetHaklari);
  } finally { await rm(dizin, { recursive: true, force: true }); }
});

test('Sohbet HTTP/WS: yetki, uzun bekleme, claim, canlı yanıt, çevrimiçi süresi, kapanış', async t => {
  const dizin = await mkdtemp(join(tmpdir(), 'sohbet-http-'));
  let app, ws, an = Date.now();
  try {
    app = await sunucuOlustur({ veriDosyasi: join(dizin, 'odalar.json'), saat: () => an });
    try { await new Promise((r, j) => { app.sunucu.once('error', j); app.sunucu.listen(0, '127.0.0.1', r); }); }
    catch (e) { if (['EPERM', 'EACCES'].includes(e.code)) { t.skip(`Sandbox port açmayı engelledi: ${e.code}`); return; } throw e; }
    const adres = `http://127.0.0.1:${app.sunucu.address().port}`;
    const post = async (yol, govde) => {
      const r = await fetch(adres + yol, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
      return { durum: r.status, veri: await r.json() };
    };
    const { veri: oda } = await post('/api/odalar', { set: set(), mod: 'serbest', asistan: true });
    const yol = `/api/odalar/${oda.kod}`;
    const { veri: p } = await post(yol + '/katil', { ad: 'Ali' });
    const yonetici = oda.yonetici;
    for (const uc of ['bekle', 'yanitla']) assert.equal((await post(yol + '/sorular/' + uc, {})).durum, 403);
    const kuyruk = [], bekleyen = [];
    ws = new WebSocket(`${adres.replace('http', 'ws')}/ws?${new URLSearchParams({ kod: oda.kod, ...p })}`);
    ws.on('message', d => { const m = JSON.parse(d); if (bekleyen.length) bekleyen.shift()(m); else kuyruk.push(m); });
    const al = () => kuyruk.length ? Promise.resolve(kuyruk.shift()) : new Promise(r => bekleyen.push(r));
    const gonder = m => ws.send(JSON.stringify(m));
    await al();
    gonder({ tur: 'baslat' }); await al();
    gonder({ tur: 'sor', soruId: 'S1', metin: 'Erken' }); assert.match((await al()).ileti, /Önce cevabı gör/);
    gonder({ tur: 'kontrol', soruId: 'S1' }); await al();
    const uzun = post(yol + '/sorular/bekle', { yonetici, sureMs: 1000 });
    assert.equal((await al()).durum.asistanBagli, true); // İstek kayıtlı; uyandırma kaybolamaz.
    gonder({ tur: 'sor', soruId: 'S1', metin: 'Neden?' });
    const gelen = await uzun; assert.equal(gelen.veri.sorular.length, 1);
    const mesajId = gelen.veri.sorular[0].mesajId;
    assert.deepEqual(gelen.veri.sorular[0].soru, set().sorular[0]);
    assert.equal((await al()).durum.sorular[0].sohbetDurum, 'yaziyor');
    const bos = post(yol + '/sorular/bekle', { yonetici, sureMs: -1 }); await al();
    assert.deepEqual((await bos).veri.sorular, []);
    assert.equal((await post(yol + '/sorular/yanitla', { yonetici, mesajId: 'yok', metin: 'x' })).durum, 404);
    assert.equal((await post(yol + '/sorular/yanitla', { yonetici, mesajId, metin: 'Çünkü 2+2=4.' })).durum, 200);
    const yanit = (await al()).durum.sorular[0];
    assert.equal(yanit.sohbetDurum, null); assert.equal(yanit.sohbet.at(-1).kim, 'asistan');
    an += 90000;
    // Geçerli WS olayı yeni saati yayınlar; son-görülme kesin sınırı 90 saniyedir.
    gonder({ tur: 'konum', sira: 0 }); assert.equal((await al()).durum.asistanBagli, false);
    const son = post(yol + '/sorular/bekle', { yonetici, sureMs: 55000 }); await al();
    ws.close(); await new Promise(r => ws.once('close', r)); ws = null;
    await app.kapat(); app = null;
    assert.deepEqual((await son).veri.sorular, []);
  } finally { ws?.close(); if (app) await app.kapat(); await rm(dizin, { recursive: true, force: true }); }
});

// Aynı HTTP işleyicisini port açmadan da sına; sandboxta bekleme/temizlik kapsamı korunur.
test('Sohbet HTTP işleyicisi: claim, uyanma, süreler, bağlantı kapatma ve kapat temizliği', async t => {
  const dizin = await mkdtemp(join(tmpdir(), 'sohbet-isleyici-'));
  let app, simdi = Date.now();
  try {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    app = await sunucuOlustur({ veriDosyasi: join(dizin, 'odalar.json'), saat: () => simdi });
    const { oda, p, diger } = kur(); kontrol(oda, p); kontrol(oda, diger);
    app.odalar.set(oda.kod, oda);
    const yayinlar = [];
    p.baglantilar.add({ readyState: 1, send(s) { yayinlar.push(JSON.parse(s).durum); } });
    const yol = `/api/odalar/${oda.kod}`;
    function istek(uc, govde) {
      const req = Readable.from([Buffer.from(JSON.stringify(govde))]); req.url = yol + uc; req.method = 'POST';
      req.headers = { 'content-type': 'application/json', host: 'localhost' };
      req.socket = { remoteAddress: '127.0.0.1' };
      const res = new EventEmitter();
      res.setHeader = () => {};
      res.writeHead = kod => { res.kod = kod; };
      res.end = veri => { res.veri = JSON.parse(veri); };
      const bitti = app.sunucu.listeners('request')[0](req, res);
      return { res, bitti };
    }
    const bekle = sureMs => istek('/sorular/bekle', { yonetici: oda.yonetici, sureMs });
    const yanitla = (mesajId, metin) => istek('/sorular/yanitla', { yonetici: oda.yonetici, mesajId, metin });
    const yetkisiz = istek('/sorular/bekle', {}); await yetkisiz.bitti; assert.equal(yetkisiz.res.kod, 403);
    sor(oda, p, 'Özel', 'S1', simdi);
    const ilk = bekle(55000); await ilk.bitti;
    assert.equal(ilk.res.veri.sorular.length, 1); assert.equal(ilk.res.veri.bitti, false);
    assert.equal(yayinlar.at(-1).asistanBagli, true); assert.equal(yayinlar.at(-1).sorular[0].sohbetDurum, 'yaziyor');
    const mesajId = ilk.res.veri.sorular[0].mesajId;
    const bos = bekle(-1); await setImmediate();
    assert.equal(bos.res.veri, undefined); assert.equal(bos.res.listenerCount('close'), 1);
    t.mock.timers.tick(999); assert.equal(bos.res.veri, undefined);
    t.mock.timers.tick(1); await bos.bitti;
    assert.deepEqual(bos.res.veri.sorular, []); assert.equal(bos.res.listenerCount('close'), 0);
    const yok = yanitla('bilinmeyen', 'x'); await yok.bitti; assert.equal(yok.res.kod, 404);
    const yanit = yanitla(mesajId, 'Yanıt'); await yanit.bitti;
    assert.equal(yanit.res.kod, 200); assert.equal(yayinlar.at(-1).sorular[0].sohbetDurum, null);
    assert.deepEqual(oda.sohbetHaklari, {});
    // Yeni oyuncu sorusu, başka HTTP değişikliğiyle yayınlandığında uzun beklemeyi uyandırır.
    const uzun = bekle(55000); await setImmediate();
    sor(oda, diger, 'Diğer oyuncunun sorusu', 'S1', simdi);
    const yayinSayisi = yayinlar.length;
    const katil = istek('/katil', { ad: 'Ayşe' }); await katil.bitti; await uzun.bitti;
    assert.equal(yayinlar.length - yayinSayisi, 1, 'Uzun bekleme uyanınca yalnız bir durum yayınlanır');
    assert.equal(uzun.res.veri.sorular[0].oyuncu, 'Veli'); assert.equal(uzun.res.listenerCount('close'), 0);
    assert.ok(!JSON.stringify(yayinlar.at(-1)).includes('Diğer oyuncunun sorusu'));
    // Yanıtsız claim kendiliğinden sona erer, tekrar alınır.
    simdi += 120000; t.mock.timers.tick(120000);
    const tekrar = bekle(55000); await tekrar.bitti;
    assert.equal(tekrar.res.veri.sorular[0].mesajId, uzun.res.veri.sorular[0].mesajId);
    const bekleyen = bekle(55000); await setImmediate();
    simdi += 90000; t.mock.timers.tick(90000); await bekleyen.bitti;
    assert.equal(yayinlar.at(-1).asistanBagli, false);
    const kopan = bekle(55000); await setImmediate(); kopan.res.emit('close'); await kopan.bitti;
    assert.equal(kopan.res.listenerCount('close'), 0);
    assert.equal(kopan.res.veri, undefined);
    const son = bekle(55000); await setImmediate();
    await app.kapat(); app = null; await son.bitti;
    assert.deepEqual(son.res.veri.sorular, []); assert.equal(son.res.listenerCount('close'), 0);
    t.mock.timers.tick(200000); assert.equal(kopan.res.veri, undefined);
  } finally { if (app) await app.kapat(); t.mock.timers.reset(); await rm(dizin, { recursive: true, force: true }); }
});

test('Otomatik yanıt: güvenilir oda, yeniden deneme, eşzamanlı takip ve MCP ile tek teslim', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'wickwick-isci-'));
  const kayitDosyasi = join(dizin, 'asistan-odalar.json');
  const { oda, p, diger } = kur(); kontrol(oda, p); sor(oda, p, 'Birinci');
  const odalar = new Map([[oda.kod, oda]]);
  let an = 10000, deneme = 0;
  const isci = otomatikYanitBaslat({ odalar, kayitDosyasi, saat: () => an, degisti() {},
    async yanitUret(soru) {
      deneme++;
      if (deneme === 1) throw new TypeError('Bağlantı yok');
      if (deneme === 2) sor(oda, p, 'İkinci');
      if (deneme === 3) soruYanitla(oda, soru.mesajId, 'Elle yanıt');
      return 'Otomatik yanıt';
    }
  });
  try {
    await writeFile(kayitDosyasi, JSON.stringify([{ kod: oda.kod, yonetici: 'yanlış' }]));
    await isci.uyandir(); assert.equal(deneme, 0);
    await writeFile(kayitDosyasi, JSON.stringify([{ kod: oda.kod, yonetici: oda.yonetici }]));
    await isci.uyandir();
    assert.match(gorunum(oda, p.id).sorular[0].sohbetHata, /LM Studio/);
    await isci.uyandir(); assert.equal(deneme, 1);
    an += 60000; await isci.uyandir();
    assert.equal(gorunum(oda, p.id).sorular[0].sohbetBekliyor, true);
    assert.deepEqual(bekleyenSorular(oda).map(s => s.metin), ['İkinci']);
    await isci.uyandir(); await isci.uyandir();
    assert.equal(deneme, 3);
    assert.deepEqual(gorunum(oda, p.id).sorular[0].sohbet.filter(m => m.kim === 'asistan').map(m => m.metin), ['Otomatik yanıt', 'Elle yanıt']);
    assert.ok(!JSON.stringify(gorunum(oda, diger.id)).includes('Otomatik yanıt'));
  } finally { await isci.kapat(); await rm(dizin, { recursive: true, force: true }); }
});
