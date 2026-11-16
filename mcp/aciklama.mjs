// Yalnız asistan yüklemeleri; uygulamanın set doğrulaması açıklamaları zorunlu tutmaz.
export function aciklamaHatalari(set, aciklamasiz = false) {
  if (aciklamasiz === true) return [];
  const hatalar = [];
  if (set.aciklamalari_goster === false) hatalar.push('Kullanıcı açıkça gizlemeyi istemedikçe açıklamalar görünür kalmalı (aciklamalari_goster: true).');
  for (const s of Array.isArray(set.sorular) ? set.sorular : []) {
    const eksikler = [];
    const metin = (v) => typeof v === 'string' ? v.trim() : '';
    if (!metin(s?.aciklama)) eksikler.push('aciklama eksik/boş (en az 120 karakter)');
    else if (metin(s.aciklama).length < 120) eksikler.push('aciklama çok kısa (en az 120 karakter)');
    const siklar = Array.isArray(s?.siklar) ? s.siklar : [];
    const aciklamalar = Array.isArray(s?.sik_aciklamalari) ? s.sik_aciklamalari : [];
    if (!Array.isArray(s?.sik_aciklamalari)) eksikler.push('sik_aciklamalari eksik; her şık için açıklama gerekli');
    else if (aciklamalar.length !== siklar.length) eksikler.push('sik_aciklamalari sayısı şık sayısıyla aynı olmalı');
    const gorulen = new Set();
    siklar.forEach((_, j) => {
      const a = metin(aciklamalar[j]);
      if (!a) eksikler.push(`sik_aciklamalari[${j}] eksik/boş (en az 30 karakter)`);
      else {
        if (a.length < 30) eksikler.push(`sik_aciklamalari[${j}] çok kısa (en az 30 karakter)`);
        if (gorulen.has(a)) eksikler.push(`sik_aciklamalari[${j}] başka bir şıkla aynı`);
        gorulen.add(a);
      }
    });
    if (eksikler.length) hatalar.push(`${s?.id ?? '(id yok)'}: ${eksikler.join('; ')}`);
  }
  return hatalar;
}
