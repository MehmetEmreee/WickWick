import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let WebSocket, sunucuOlustur, yerelAdresler, eksik;
try {
  ({ WebSocket } = await import('ws'));
  ({ sunucuOlustur, yerelAdresler } = await import('../sunucu.js'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND' || !e.message.includes("Cannot find package 'ws'")) throw e;
  eksik = `Bağımlılık kurulamadı: ${e.message}`;
}
const set = { surum:1, set_id:'e2e', baslik:'Uçtan uca', sorular:[
  {id:'Q',metin:'Soru',siklar:['Yanlış','Doğru'],dogru:'B',aciklama:'E2E-GİZLİ-AÇIKLAMA'}
] };
test('Yerel adresler: dahili olmayan IPv4 önce, .local sonra, gerçek port korunur', { skip:eksik }, () => {
  const arayuzler = {
    lo: [{ family:'IPv4', address:'127.0.0.1', internal:true }],
    en0: [
      { family:'IPv6', address:'fe80::1', internal:false },
      { family:'IPv4', address:'192.168.1.146', internal:false }
    ],
    en1: [{ family:'IPv4', address:'10.0.0.2', internal:false }]
  };
  assert.deepEqual(yerelAdresler(49152, arayuzler, 'test-mac.local'), [
    'http://192.168.1.146:49152', 'http://10.0.0.2:49152', 'http://test-mac.local:49152'
  ]);
  assert.deepEqual(yerelAdresler(49152, {}, 'test-mac'), ['http://test-mac.local:49152']);
});
function istemci(url) {
  const ws = new WebSocket(url), kuyruk=[], bekleyen=[];
  ws.on('message', veri => {
    const m=JSON.parse(veri.toString()); kuyruk.push(m);
    for (const b of [...bekleyen]) b();
  });
  ws.on('error',()=>{});
  const bekle = kosul => new Promise((resolve,reject) => {
    const kontrol=()=> {
      const i=kuyruk.findIndex(kosul);
      if (i<0) return;
      clearTimeout(zaman); bekleyen.splice(bekleyen.indexOf(kontrol),1);
      resolve(kuyruk.splice(i,1)[0]);
    };
    const zaman=setTimeout(()=>{bekleyen.splice(bekleyen.indexOf(kontrol),1);reject(new Error('WS görünümü beklenirken süre doldu'));},3000);
    bekleyen.push(kontrol); kontrol();
  });
  return { ws, bekle, gonder:m=>ws.send(JSON.stringify(m)) };
}
function sizintiYok(veri) {
  const j=JSON.stringify(veri);
  for (const x of ['E2E-GİZLİ-NEDEN','E2E-GİZLİ-AÇIKLAMA','"dogru":','"aciklama":','"guven":','"sik":','"anahtar":']) assert.ok(!j.includes(x),x);
}
for (const mod of ['kahoot','serbest']) test(`HTTP + iki WS: ${mod} tam tur, gizlilik ve geri yükleme`, { skip:eksik, timeout:15000 }, async t => {
  const dizin=await mkdtemp(join(tmpdir(),'test-odasi-e2e-'));
  let app, port, istemciler=[];
  const dosya=join(dizin,'odalar.json');
  try {
    app=await sunucuOlustur({veriDosyasi:dosya});
    try {
      await new Promise((r,j)=>{app.sunucu.once('error',j);app.sunucu.listen(0,'127.0.0.1',r);});
    } catch(e) {
      if (['EPERM','EACCES'].includes(e.code)) { t.skip(`Sandbox port açmayı engelledi: ${e.code}`); return; }
      throw e;
    }
    port=app.sunucu.address().port;
    const http=async(yol,govde)=>{
      const r=await fetch(`http://127.0.0.1:${port}${yol}`,govde===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(govde)});
      return { kod:r.status, veri:await r.json() };
    };
    const adres = await http('/api/adres');
    assert.equal(adres.kod,200);
    assert.deepEqual(adres.veri,{adresler:yerelAdresler(port)});
    assert.deepEqual((await http('/api/dogrula',{set:JSON.stringify(set)})).veri,{tamam:true,soruSayisi:1});
    assert.equal((await http('/api/dogrula',{set:{}})).kod,400);
    const bozuk=await fetch(`http://127.0.0.1:${port}/api/dogrula`,{method:'POST',body:'{'});
    assert.equal(bozuk.status,400); assert.match((await bozuk.json()).hatalar[0],/^JSON okunamadı:/);
    const kur=await http('/api/odalar',{set,mod,ad:'Mehmet'}); assert.equal(kur.kod,200);
    const a=kur.veri, kod=a.kod;
    const b=(await http(`/api/odalar/${kod}/katil`,{ad:'Ali'})).veri;
    const baglan=k=>istemci(`ws://127.0.0.1:${port}/ws?${new URLSearchParams({kod,oyuncuId:k.oyuncuId,anahtar:k.anahtar})}`);
    const bir=baglan(a), iki=baglan(b); istemciler.push(bir,iki);
    await bir.bekle(m=>m.tur==='durum'&&m.durum.oyuncular.every(p=>p.bagli));
    await iki.bekle(m=>m.tur==='durum');
    const yanlis=baglan({...a,anahtar:'yanlış'}); istemciler.push(yanlis);
    assert.equal((await yanlis.bekle(m=>m.tur==='hata')).kod,'kimlik');
    bir.gonder({tur:'baslat'});
    await iki.bekle(m=>m.tur==='durum'&&m.durum.evre===(mod==='kahoot'?'soru':'cozum'));
    bir.ws.send('{'); assert.equal((await bir.bekle(m=>m.tur==='hata')).tur,'hata');
    bir.gonder({tur:mod==='kahoot'?'kilitle':'taslak',soruId:'Q',sik:'B',guven:3,neden:'E2E-GİZLİ-NEDEN'});
    const diger=await iki.bekle(m=>m.tur==='durum'&&(mod==='kahoot'?m.durum.oyuncular[0].kilitledi:m.durum.oyuncular[0].isaretli===1));
    assert.equal(diger.durum.sorular[0].benim,null);
    sizintiYok(diger);
    sizintiYok((await http(`/api/odalar/${kod}`)).veri);
    const gecmis=await http('/api/gecmis',{odalar:[a]}); sizintiYok(gecmis.veri);
    assert.ok(!('puan' in gecmis.veri.odalar[0].oyuncular[0]));
    assert.deepEqual((await http('/api/gecmis',{odalar:[{...a,anahtar:'yanlış'}]})).veri,{odalar:[]});
    const getGecmis=await http('/api/gecmis'); assert.equal(getGecmis.kod,404); sizintiYok(getGecmis.veri);
    if(mod==='serbest') {
      iki.gonder({tur:'gonder'}); assert.deepEqual((await iki.bekle(m=>m.tur==='hata')).eksikler,['Q']);
      bir.gonder({tur:'gonder'});
      await iki.bekle(m=>m.tur==='durum'&&m.durum.oyuncular[0].gonderdi);
    }
    iki.gonder({tur:mod==='kahoot'?'kilitle':'taslak',soruId:'Q',sik:'A',guven:1,neden:'ikinci'});
    if(mod==='serbest') { await iki.bekle(m=>m.tur==='durum'&&m.durum.sorular[0].benim?.sik==='A'); iki.gonder({tur:'gonder'}); }
    const acik=await iki.bekle(m=>m.tur==='durum'&&m.durum.evre===(mod==='kahoot'?'acik':'bitti'));
    assert.equal(acik.durum.sorular[0].dogru,'B');
    assert.ok(JSON.stringify(acik).includes('E2E-GİZLİ-AÇIKLAMA'));
    assert.ok(JSON.stringify(acik).includes('E2E-GİZLİ-NEDEN'));
    if(mod==='kahoot') { bir.gonder({tur:'sonraki'}); await iki.bekle(m=>m.tur==='durum'&&m.durum.evre==='bitti'); }
    const sonuc=(await http('/api/gecmis',{odalar:[a]})).veri;
    assert.equal(sonuc.odalar[0].oyuncular[0].dogruSayisi,1);
    assert.equal(sonuc.odalar[0].oyuncular[1].dogruSayisi,0);
    assert.ok(!JSON.stringify(sonuc).includes('E2E-GİZLİ'));
    // Aynı oyuncunun iki sekmesi ve kopuş yayını.
    const sekme=baglan(a); istemciler.push(sekme);
    await sekme.bekle(m=>m.tur==='durum');
    bir.ws.close();
    await new Promise(r=>bir.ws.readyState===WebSocket.CLOSED?r():bir.ws.once('close',r));
    await iki.bekle(m=>m.tur==='durum'&&m.durum.evre==='bitti'&&m.durum.oyuncular[0].bagli);
    sekme.ws.close();
    await iki.bekle(m=>m.tur==='durum'&&!m.durum.oyuncular[0].bagli);
    const traversal=await http('/%2e%2e%2fSARTNAME.md'); assert.equal(traversal.kod,403);
    const fazla=await http('/api/dogrula',{set:'x'.repeat(5*1024*1024)}); assert.equal(fazla.kod,413);
    const css=await fetch(`http://127.0.0.1:${port}/vendor/katex/katex.min.css`);
    if(css.status===200) {
      assert.match(css.headers.get('cache-control'),/max-age=31536000/);
      assert.match(css.headers.get('content-type'),/text\/css/);
      const tekrar=await fetch(`http://127.0.0.1:${port}/vendor/katex/katex.min.css`,{headers:{'If-None-Match':css.headers.get('etag')}});
      assert.equal(tekrar.status,304);
    }
    await app.kapat(); app=null;
    const geri=await sunucuOlustur({veriDosyasi:dosya}); app=geri;
    assert.equal(geri.odalar.get(kod).evre,'bitti');
    assert.equal(geri.odalar.get(kod).oyuncular[0].cevaplar.Q.sik,'B');
  } finally {
    for(const c of istemciler) c.ws.terminate();
    if(app) await app.kapat();
    await rm(dizin,{recursive:true,force:true});
  }
});
