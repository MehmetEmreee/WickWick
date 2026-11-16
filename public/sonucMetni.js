// "Sonuçları kopyala" metni (SARTNAME 7. bölüm, birebir biçim). DOM'a bağımlı değil; Node'dan test edilebilir.

function tekSatir(metin) {
  return String(metin ?? '').replace(/\s+/g, ' ').trim();
}

function cevapYazisi(c) {
  if (!c || !c.sik) return 'boş';
  let yazi = c.sik;
  if (c.guven != null) yazi += `, güven ${c.guven}`;
  const neden = tekSatir(c.neden);
  if (neden) yazi += `, neden: ${neden}`;
  return yazi;
}

export function sonucMetni(durum) {
  const { set, oyuncular } = durum;
  const satirlar = [
    `[TEST SONUCU] ${set.set_id} · ${set.baslik}`,
    `Katılımcılar: ${oyuncular.map((o) => o.ad).join(', ')}`,
  ];
  const sorular = [...durum.sorular].sort((a, b) => a.sira - b.sira);
  for (const s of sorular) {
    const parcalar = oyuncular.map((o) => {
      const c = (s.cevaplar || []).find((x) => x.oyuncuId === o.id);
      return `${o.ad}: ${cevapYazisi(c)}`;
    });
    satirlar.push([s.id, ...parcalar].join(' | '));
  }
  if (durum.puanli) {
    const n = set.soruSayisi ?? sorular.length;
    satirlar.push(['Skor', ...oyuncular.map((o) => `${o.ad}: ${o.dogruSayisi ?? 0}/${n}`)].join(' | '));
  }
  return satirlar.join('\n');
}
