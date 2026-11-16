import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dogrula, adDogrula, gorselGecerli } from '../dogrula.js';
import { odaKur, oyuncuEkle, islem, gorunum, sureyiIsle, puan } from '../oda.js';
import { depoAc } from '../depo.js';

const setUret = (aciklamalari_goster = true) => ({ surum: 1, set_id: 'deneme', baslik: 'Test', aciklamalari_goster, sorular: [
  { id: 'Q1', metin: 'Birinci', siklar: ['Bir', 'İki'], dogru: 'B', aciklama: 'GİZLİ-AÇIKLAMA-1' },
  { id: 'Q2', metin: 'İkinci', siklar: ['Üç', 'Dört'], dogru: 'A', aciklama: 'GİZLİ-AÇIKLAMA-2' }
] });
function kur(mod = 'kahoot', goster = true) {
  const oda = odaKur({ set: setUret(goster), mod, ad: 'Mehmet' }, new Map(), 1000);
  const p = oda.oyuncular[0], diger = oyuncuEkle(oda, 'Ali');
  islem(oda, p, { tur: 'baslat' }, 1000);
  return { oda, p, diger };
}
function cevap(oda, p, soruId = 'Q1', tur = 'kilitle', sik = 'B') {
  islem(oda, p, { tur, soruId, sik, guven: 3, neden: 'AYIRT-EDİCİ-GİZLİ-NEDEN' }, 2000);
}
function gizliYok(g) {
  const json = JSON.stringify(g);
  for (const gizli of ['AYIRT-EDİCİ-GİZLİ-NEDEN', 'GİZLİ-AÇIKLAMA', '"dogru":', '"aciklama":', '"cevaplar":', '"anahtar":']) assert.ok(!json.includes(gizli), gizli);
}
for (const mod of ['kahoot', 'serbest']) {
  test(`${mod}: cevaplar açılışa kadar kişiye özel; açılıştan sonra görünür`, () => {
    const { oda, p, diger } = kur(mod);
    cevap(oda, p, 'Q1', mod === 'kahoot' ? 'kilitle' : 'taslak');
    const kendi = gorunum(oda, p.id), baskasi = gorunum(oda, diger.id);
    assert.equal(kendi.sorular[0].benim.guven, 3);
    assert.equal(baskasi.sorular[0].benim, null);
    gizliYok(baskasi);
    assert.equal(baskasi.oyuncular[0].dogruSayisi, 0);
    assert.equal(baskasi.oyuncular[0].puan, 0);
    assert.ok(!('sik' in baskasi.oyuncular[0]));
    assert.ok(!('guven' in baskasi.oyuncular[0]));
    assert.ok(!('neden' in baskasi.oyuncular[0]));
    if (mod === 'kahoot') cevap(oda, diger);
    else islem(oda, p, { tur: 'simdiAc' }, 3000);
    const acik = gorunum(oda, diger.id);
    assert.equal(acik.sorular[0].dogru, 'B');
    assert.ok(JSON.stringify(acik).includes('GİZLİ-AÇIKLAMA-1'));
    assert.ok(JSON.stringify(acik).includes('AYIRT-EDİCİ-GİZLİ-NEDEN'));
  });
  test(`${mod}: aciklamalari_goster false ise hiç açıklama gönderilmez`, () => {
    const { oda, p } = kur(mod, false);
    if (mod === 'kahoot') sureyiIsle(oda, 31000);
    else islem(oda, p, { tur: 'simdiAc' }, 2000);
    const json = JSON.stringify(gorunum(oda, p.id));
    assert.ok(!json.includes('aciklama'));
    assert.ok(!json.includes('GİZLİ-AÇIKLAMA'));
  });
}
test('Kahoot sonraki sorunun anahtarı açılmaz; önceki soru açık kalır', () => {
  const { oda, p, diger } = kur();
  sureyiIsle(oda, 31000);
  islem(oda, p, { tur: 'sonraki' }, 32000);
  const g = gorunum(oda, diger.id);
  assert.equal(g.sorular.length, 2);
  assert.equal(g.sorular[0].dogru, 'B');
  assert.ok(!('dogru' in g.sorular[1]));
  assert.ok(!('aciklama' in g.sorular[1]));
  assert.equal(oda.evre, 'soru');
  sureyiIsle(oda, 62000);
  islem(oda, p, { tur: 'sonraki' }, 63000);
  assert.equal(oda.evre, 'bitti');
});
test('Kahoot: bağlı olmayan oyuncu beklenir, süre biter ve geç cevap reddedilir', () => {
  const { oda, p, diger } = kur();
  cevap(oda, p);
  assert.equal(oda.evre, 'soru');
  assert.equal(sureyiIsle(oda, 30999), false);
  assert.equal(sureyiIsle(oda, 31000), true);
  assert.equal(oda.evre, 'acik');
  assert.throws(() => cevap(oda, diger), /evrede/);
  assert.equal(gorunum(oda, p.id).sorular[0].cevaplar[1].sik, null);
});
test('Puan formülü, sınırlar ve anahtarsız soru', () => {
  const s = { dogru: 'A' };
  for (const [an, beklenen] of [[0,1000], [7500,875], [15000,750], [30000,500]]) assert.equal(puan(s,{ sik: 'A', an },30000,0),beklenen);
  assert.equal(puan(s,{ sik: 'B', an: 0 },30000,0),0);
  assert.equal(puan({}, { sik: 'A', an: 0 },30000,0),0);
  assert.equal(puan(s,null,30000,0),0);
});
test('Serbest: eksikler, taslak, kilit ve herkes gönderince açılış', () => {
  const { oda, p, diger } = kur('serbest');
  islem(oda, p, { tur: 'taslak', soruId: 'Q1', sik: 'B', guven: null }, 2000);
  assert.throws(() => islem(oda, p, { tur: 'gonder' }), e => { assert.deepEqual(e.eksikler,['Q1','Q2']); return true; });
  for (const kisi of [p,diger]) {
    cevap(oda,kisi,'Q1','taslak'); cevap(oda,kisi,'Q2','taslak','A');
    islem(oda,kisi,{ tur: 'gonder' },3000);
    assert.throws(() => cevap(oda,kisi,'Q1','taslak'), /evrede/);
  }
  assert.equal(oda.evre,'bitti');
  assert.equal(gorunum(oda,p.id).oyuncular[0].dogruSayisi,2);
  assert.equal(gorunum(oda,p.id).oyuncular[0].puan,0);
});
test('Serbest süre dolunca tam taslak kilitlenir, eksik cevap boş sayılır', () => {
  const { oda, p } = kur('serbest');
  oda.bitis = 5000; oda.sureMs = 4000;
  cevap(oda,p,'Q1','taslak');
  islem(oda,p,{ tur:'taslak', soruId:'Q2', sik:'A', guven:null, neden:'eksik' },3000);
  assert.equal(sureyiIsle(oda,5000),true);
  const g = gorunum(oda,p.id);
  assert.equal(g.evre,'bitti');
  assert.equal(g.sorular[0].benim.kilitli,true);
  assert.equal(g.sorular[1].cevaplar[0].sik,null);
  assert.equal(g.sorular[1].benim.sik,'A'); // Kendi taslağı yine kendisine gider.
  assert.equal(g.oyuncular[0].dogruSayisi,1);
});
test('Girdi sınırları, tek satır neden, tekrar kilitleme ve yetki', () => {
  const { oda, p, diger } = kur();
  assert.throws(() => islem(oda,diger,{ tur:'simdiAc' },2000),/kurucu/);
  for (const ek of [{sik:'E',guven:1},{sik:'A',guven:4},{sik:'A',guven:1.5},{sik:null,guven:1}]) assert.throws(() => islem(oda,p,{tur:'kilitle',soruId:'Q1',...ek},2000));
  islem(oda,p,{tur:'kilitle',soruId:'Q1',sik:'A',guven:1,neden:'a\nb\r\n'+'c'.repeat(150)},2000);
  assert.equal(p.cevaplar.Q1.neden.length,120);
  assert.ok(!/[\r\n]/.test(p.cevaplar.Q1.neden));
  assert.throws(() => cevap(oda,p),/kilitli/);
  assert.throws(() => islem(oda,p,null),/nesne/);
  assert.throws(() => islem(oda,p,{tur:'yanlis'}),/Bilinmeyen/);
});
test('Ad, kapasite, geç katılım ve kurucu yokken sonraki', () => {
  const { oda, p, diger } = kur();
  assert.equal(adDogrula(' Mehmet '),'Mehmet');
  for (const ad of ['', ' '.repeat(3), 'a'.repeat(21), null]) assert.throws(() => adDogrula(ad),/ad:/);
  assert.throws(() => oyuncuEkle(oda,' Mehmet '),/alınmış/);
  assert.ok(p.anahtar.length >= 32);
  oyuncuEkle(oda,'Üç'); oyuncuEkle(oda,'Dört');
  assert.throws(() => oyuncuEkle(oda,'Beş'),/dolu/);
  p.baglantilar.add('sekme1'); p.baglantilar.add('sekme2'); p.baglantilar.delete('sekme1');
  assert.equal(gorunum(oda,diger.id).oyuncular[0].bagli,true);
  sureyiIsle(oda,31000);
  assert.throws(() => islem(oda,diger,{tur:'sonraki'},32000));
  p.baglantilar.clear(); islem(oda,diger,{tur:'sonraki'},32000);
  const yeni = oda.oyuncular[2]; assert.equal(gorunum(oda,yeni.id).sorular[0].benim,null);
  oda.evre='bitti'; assert.throws(() => oyuncuEkle(oda,'Yeni'),/kapalı/);
});
test('Doğrulama bütün hataları alanlarıyla listeler; JSON metni kabul edilir', () => {
  const s = setUret(); s.surum=2; s.baslik=''; s.sorular[0].siklar=['a']; s.sorular[0].dogru='E'; s.sorular[1].id='Q1'; s.sorular[1].sure=4;
  const {hatalar} = dogrula(s);
  for (const alan of ['surum','baslik','sorular[0].siklar','sorular[0].dogru','sorular[1].id','sorular[1].sure']) assert.ok(hatalar.some(h=>h.startsWith(alan+':')));
  assert.match(dogrula('{').hatalar[0],/^JSON okunamadı:/);
  assert.equal(dogrula(JSON.stringify(setUret())).hatalar.length,0);
});
test('gorsel yalnız izin verilen URL ve veri URI şemalarını kabul eder', () => {
  for (const gorsel of ['https://example.com/a.png','http://example.com/a',...['png','jpeg','gif','webp','svg+xml'].flatMap(t=>[`data:image/${t};base64,YQ==`,`data:image/${t},%3Csvg%3E`])]) assert.equal(gorselGecerli(gorsel),true,gorsel);
  for (const gorsel of ['javascript:alert(1)','data:text/html,%3Cscript%3E','file:///tmp/a.png','ftp://example.com/a','data:image/bmp;base64,YQ==','data:image/png,',null,123]) {
    const s=setUret(); s.sorular[0].gorsel=gorsel;
    assert.ok(dogrula(s).hatalar.some(h=>h.startsWith('sorular[0].gorsel:')),String(gorsel));
  }
});
for (const dosya of ['modul3_soru_seti','gorsel_latex_test']) test(`Örnek ${dosya} geçerli ve cevaplı`, async () => {
  const s=JSON.parse(await readFile(new URL(`../../ornek/${dosya}.json`,import.meta.url),'utf8'));
  assert.deepEqual(dogrula(s).hatalar,[]);
  assert.equal(s.sorular.length,dosya==='modul3_soru_seti'?7:10);
  for (const soru of s.sorular) { assert.ok(soru.dogru); assert.ok(soru.aciklama); }
});
test('Depo atomik geri yükleme, zamanlayıcı hariç kayıt ve 90 günlük temizleme', async () => {
  const dizin=await mkdtemp(join(tmpdir(),'test-odasi-'));
  try {
    const dosya=join(dizin,'odalar.json'), depo=depoAc(dosya);
    assert.equal((await depo.oku()).size,0);
    const {oda,p}=kur(); oda.tarih=new Date().toISOString();
    const eski=odaKur({set:setUret(),mod:'serbest',ad:'Eski'},new Map(),Date.now()-91*86400000);
    oda.zamanlayici=setTimeout(()=>{},60000);
    p.baglantilar.add({dairesel:p});
    try { depo.kaydet(new Map([[oda.kod,oda],[eski.kod,eski]])); await depo.bosalt(); }
    finally { clearTimeout(oda.zamanlayici); }
    const metin=await readFile(dosya,'utf8'); assert.ok(!metin.includes('baglantilar')); assert.ok(!metin.includes('zamanlayici'));
    const odalar=await depo.oku(); assert.equal(odalar.size,1);
    const geri=odalar.get(oda.kod); assert.equal(geri.oyuncular[0].anahtar,p.anahtar); assert.equal(geri.oyuncular[0].baglantilar.size,0);
    assert.equal(geri.bitis,31000); assert.equal(sureyiIsle(geri,32000),true); assert.equal(geri.evre,'acik');
  } finally { await rm(dizin,{recursive:true,force:true}); }
});
