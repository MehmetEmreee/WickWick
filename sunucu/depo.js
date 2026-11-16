import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export function depoAc(dosya, gecikme = 80) {
  let zamanlayici, bekleyen, zincir = Promise.resolve();
  async function oku(simdi = Date.now()) {
    let veri;
    try { veri = JSON.parse(await readFile(dosya, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return new Map(); throw e; }
    return new Map(veri.filter(o => simdi - Date.parse(o.tarih) <= 90 * 86400000).map(o => {
      o.zamanlayici = null;
      for (const p of o.oyuncular) p.baglantilar = new Set();
      return [o.kod, o];
    }));
  }
  function kaydet(odalar) {
    // Anlık, bağlantı ve zamanlayıcı içermeyen kopya; yazmalar sırayla atomik yapılır.
    bekleyen = JSON.stringify([...odalar.values()], (k, v) => ['zamanlayici', 'baglantilar'].includes(k) ? undefined : v);
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(() => bosalt().catch(e => console.error('Depo yazılamadı:', e.message)), gecikme);
  }
  async function bosalt() {
    clearTimeout(zamanlayici);
    if (bekleyen !== undefined) {
      const veri = bekleyen;
      bekleyen = undefined;
      zincir = zincir.catch(() => {}).then(async () => {
        await mkdir(dirname(dosya), { recursive: true });
        await writeFile(`${dosya}.tmp`, veri, { mode: 0o600 });
        await rename(`${dosya}.tmp`, dosya);
      });
    }
    await zincir;
  }
  return { oku, kaydet, bosalt };
}
