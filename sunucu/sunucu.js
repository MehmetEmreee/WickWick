import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, hostname } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { dogrula, GÖVDE_SINIRI } from './dogrula.js';
import { odaKur, oyuncuEkle, kimlik, gorunum, islem, sureyiIsle, asistanSonucu } from './oda.js';
import { depoAc } from './depo.js';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const TIPLER = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const json = (res, kod, veri) => { res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(veri)); };

export function yerelAdresler(port, arayuzler = networkInterfaces(), ad = hostname()) {
  const adresler = [];
  for (const arayuz of Object.values(arayuzler)) for (const adres of arayuz ?? []) {
    if (adres.family === 'IPv4' && !adres.internal) adresler.push(`http://${adres.address}:${port}`);
  }
  adresler.push(`http://${ad.replace(/\.local$/, '')}.local:${port}`);
  return adresler;
}

async function govde(req) {
  const parcalar = []; let boyut = 0;
  for await (const parca of req.iterator({ destroyOnReturn: false })) {
    boyut += parca.length;
    if (boyut > GÖVDE_SINIRI) { req.resume(); throw Object.assign(new Error('Gövde: en çok 5 MB olabilir'), { durum: 413 }); }
    parcalar.push(parca);
  }
  try { return JSON.parse(Buffer.concat(parcalar).toString('utf8')); }
  catch (e) { throw new Error(`JSON okunamadı: ${e.message}`); }
}

async function statik(req, res, yol) {
  const vendor = yol.startsWith('/vendor/katex/');
  const kok = resolve(KOK, vendor ? 'node_modules/katex/dist' : 'public');
  let dosya = resolve(kok, '.' + (vendor ? yol.slice('/vendor/katex'.length) : yol));
  if (dosya !== kok && !dosya.startsWith(kok + sep)) return json(res, 403, { hata: 'Geçersiz yol' });
  try {
    let bilgi;
    try { bilgi = await stat(dosya); } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; }
    if (!bilgi?.isFile()) {
      if (vendor) return json(res, 404, { hata: 'Dosya bulunamadı' });
      dosya = resolve(kok, 'index.html');
      bilgi = await stat(dosya);
    }
    const gercek = await realpath(dosya);
    const gercekKok = await realpath(kok);
    if (!gercek.startsWith(gercekKok + sep)) return json(res, 403, { hata: 'Geçersiz yol' });
    const etag = `W/"${bilgi.size}-${bilgi.mtimeMs}"`;
    const basliklar = { 'Content-Type': TIPLER[extname(dosya)] ?? 'application/octet-stream', 'Cache-Control': vendor ? 'public, max-age=31536000' : 'no-cache', ETag: etag, 'Last-Modified': bilgi.mtime.toUTCString(), 'X-Content-Type-Options': 'nosniff' };
    if (req.headers['if-none-match'] === etag || (!req.headers['if-none-match'] && req.headers['if-modified-since'] && Math.floor(bilgi.mtimeMs / 1000) <= Date.parse(req.headers['if-modified-since']) / 1000)) { res.writeHead(304, basliklar); return res.end(); }
    const veri = await readFile(dosya);
    res.writeHead(200, { ...basliklar, 'Content-Length': veri.length });
    res.end(req.method === 'HEAD' ? undefined : veri);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return json(res, 404, { hata: 'Arayüz dosyası henüz yok' });
    throw e;
  }
}

export async function sunucuOlustur({ veriDosyasi = resolve(process.env.TEST_ODASI_VERI_DIZINI ?? resolve(KOK, 'veri'), 'odalar.json'), saat = Date.now } = {}) {
  const depo = depoAc(veriDosyasi);
  const odalar = await depo.oku(saat());
  let kapaniyor = false;
  function yayin(oda) {
    for (const p of oda.oyuncular) for (const ws of p.baglantilar) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tur: 'durum', durum: gorunum(oda, p.id, saat()) }));
    }
  }
  function planla(oda) {
    clearTimeout(oda.zamanlayici);
    oda.zamanlayici = null;
    if (oda.bitis !== null) oda.zamanlayici = setTimeout(() => {
      sureyiIsle(oda, saat()); degisti(oda);
    }, Math.max(0, Math.min(2147483647, oda.bitis - saat())));
  }
  function degisti(oda) { depo.kaydet(odalar); planla(oda); yayin(oda); }
  for (const oda of odalar.values()) { sureyiIsle(oda, saat()); planla(oda); }
  depo.kaydet(odalar);
  const sunucu = http.createServer(async (req, res) => {
    try {
      // URL normalleştirmesinden önce çöz: kodlanmış .. ve ters eğik çizgi de kaçış yapamaz.
      const yol = decodeURIComponent(req.url.split('?')[0]);
      if (yol.includes('\\') || yol.split('/').includes('..') || yol.includes('\0')) return json(res, 403, { hata: 'Geçersiz yol' });
      if (req.method === 'GET' && yol === '/api/adres') return json(res, 200, { adresler: yerelAdresler(sunucu.address().port) });
      const eslesme = /^\/api\/odalar\/(\d{5})(\/katil|\/sonuc)?$/.exec(yol);
      if (req.method === 'POST' && (yol === '/api/dogrula' || yol === '/api/odalar')) {
        const girdi = await govde(req);
        const sonuc = dogrula(girdi?.set);
        if (sonuc.hatalar.length) return json(res, 400, { hatalar: sonuc.hatalar });
        if (yol === '/api/dogrula') return json(res, 200, { tamam: true, soruSayisi: sonuc.soruSayisi });
        try {
          const oda = odaKur({ ...girdi, set: sonuc.set }, odalar, saat());
          odalar.set(oda.kod, oda); degisti(oda);
          if (girdi.asistan === true) return json(res, 200, {
            kod: oda.kod, yonetici: oda.yonetici,
            link: `${yerelAdresler(sunucu.address().port)[0] ?? `http://localhost:${sunucu.address().port}`}/#/oda/${oda.kod}`
          });
          const p = oda.oyuncular[0];
          return json(res, 200, { kod: oda.kod, oyuncuId: p.id, anahtar: p.anahtar });
        } catch (e) { return json(res, 400, { hatalar: [e.message] }); }
      }
      if (eslesme) {
        const oda = odalar.get(eslesme[1]);
        if (!oda) return json(res, 404, { hata: 'Oda bulunamadı' });
        if (sureyiIsle(oda, saat())) degisti(oda);
        if (req.method === 'GET' && !eslesme[2]) return json(res, 200, { kod: oda.kod, baslik: oda.set.baslik, mod: oda.mod, evre: oda.evre, oyuncular: oda.oyuncular.map(p => p.ad), dolu: oda.oyuncular.length >= 4 });
        if (req.method === 'POST' && eslesme[2] === '/sonuc') {
          const girdi = await govde(req);
          if (typeof girdi?.yonetici !== 'string' || !oda.yonetici || girdi.yonetici !== oda.yonetici) return json(res, 403, { hata: 'Yönetici anahtarı geçersiz' });
          return json(res, 200, asistanSonucu(oda));
        }
        if (req.method === 'POST' && eslesme[2] === '/katil') {
          const girdi = await govde(req);
          try { const p = oyuncuEkle(oda, girdi?.ad); degisti(oda); return json(res, 200, { oyuncuId: p.id, anahtar: p.anahtar }); }
          catch (e) { return json(res, 400, { hata: e.message }); }
        }
      }
      if (req.method === 'POST' && yol === '/api/gecmis') {
        const girdi = await govde(req);
        if (!Array.isArray(girdi?.odalar)) return json(res, 400, { hata: 'odalar: liste olmalı' });
        const sonuc = [];
        const gorulen = new Set();
        for (const k of girdi.odalar) {
          const oda = odalar.get(k?.kod);
          if (!kimlik(oda, k?.oyuncuId, k?.anahtar) || gorulen.has(oda.kod)) continue;
          gorulen.add(oda.kod);
          if (sureyiIsle(oda, saat())) degisti(oda);
          const g = gorunum(oda, k.oyuncuId, saat());
          sonuc.push({ kod: oda.kod, baslik: g.set.baslik, ders: g.set.ders, mod: g.mod, evre: g.evre, tarih: oda.tarih, oyuncular: g.oyuncular.map(p => oda.evre === 'bitti' ? { ad: p.ad, dogruSayisi: p.dogruSayisi, puan: p.puan } : { ad: p.ad }), soruSayisi: g.set.soruSayisi, puanli: g.puanli });
        }
        return json(res, 200, { odalar: sonuc });
      }
      if (yol.startsWith('/api/')) return json(res, 404, { hata: 'Uç bulunamadı' });
      if (req.method === 'GET' || req.method === 'HEAD') return await statik(req, res, yol);
      json(res, 405, { hata: 'Yöntem desteklenmiyor' });
    } catch (e) {
      const liste = ['/api/dogrula', '/api/odalar'].includes(req.url.split('?')[0]);
      json(res, e.durum ?? 400, liste ? { hatalar: [e.message] } : { hata: e.message });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: GÖVDE_SINIRI });
  sunucu.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/ws') return socket.destroy();
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, url));
    } catch { socket.destroy(); }
  });
  wss.on('connection', (ws, url) => {
    const oda = odalar.get(url.searchParams.get('kod'));
    const p = kimlik(oda, url.searchParams.get('oyuncuId'), url.searchParams.get('anahtar'));
    if (!p) { ws.send(JSON.stringify({ tur: 'hata', kod: 'kimlik', ileti: 'Kimlik doğrulanamadı' })); ws.close(); return; }
    ws.canli = true;
    ws.on('pong', () => { ws.canli = true; });
    p.baglantilar.add(ws);
    sureyiIsle(oda, saat()); degisti(oda);
    ws.on('message', veri => {
      try {
        if (sureyiIsle(oda, saat())) degisti(oda);
        islem(oda, p, JSON.parse(veri.toString()), saat());
        degisti(oda);
      } catch (e) { ws.send(JSON.stringify({ tur: 'hata', ileti: e.message, ...(e.eksikler ? { eksikler: e.eksikler } : {}) })); }
    });
    ws.on('error', () => {});
    ws.on('close', () => { p.baglantilar.delete(ws); if (!kapaniyor) degisti(oda); });
  });
  const nabiz = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.canli === false) { ws.terminate(); continue; }
      ws.canli = false; ws.ping();
    }
  }, 15000);
  async function kapat() {
    kapaniyor = true; clearInterval(nabiz);
    for (const oda of odalar.values()) clearTimeout(oda.zamanlayici);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(r => wss.close(r));
    await new Promise((r, j) => sunucu.close(e => e && e.code !== 'ERR_SERVER_NOT_RUNNING' ? j(e) : r()));
    await depo.bosalt();
  }
  return { sunucu, odalar, kapat };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const uygulama = await sunucuOlustur();
  const port = Number(process.env.PORT ?? 3000);
  uygulama.sunucu.on('error', async e => { console.error('Sunucu açılamadı:', e.message); await uygulama.kapat(); process.exitCode = 1; });
  uygulama.sunucu.listen(port, '0.0.0.0', () => {
    const gercekPort = uygulama.sunucu.address().port;
    console.log(`Test Odası: http://localhost:${gercekPort}`);
    for (const adres of yerelAdresler(gercekPort)) console.log(adres);
  });
  for (const sinyal of ['SIGINT', 'SIGTERM']) process.once(sinyal, async () => { await uygulama.kapat(); });
}
