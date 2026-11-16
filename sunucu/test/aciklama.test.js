import test from 'node:test';
import assert from 'node:assert/strict';
import { aciklamaHatalari } from '../../mcp/aciklama.mjs';

const setUret = () => ({ sorular: [{ id: 'S1', siklar: ['Bir', 'İki'], aciklama: 'a'.repeat(120), sik_aciklamalari: ['b'.repeat(30), 'c'.repeat(30)] }] });
test('MCP açıklama: sınır uzunlukları geçer', () => {
  assert.deepEqual(aciklamaHatalari(setUret()), []);
});
for (const [ad, degistir, beklenen] of [
  ['açıklama eksik', (s) => { delete s.aciklama; }, /aciklama eksik/],
  ['açıklama boş', (s) => { s.aciklama = '   '; }, /aciklama eksik\/boş/],
  ['açıklama metin değil', (s) => { s.aciklama = 123; }, /aciklama eksik/],
  ['açıklama kısa', (s) => { s.aciklama = 'a'.repeat(119); }, /aciklama çok kısa/],
  ['şık açıklamaları eksik', (s) => { delete s.sik_aciklamalari; }, /sik_aciklamalari eksik/],
  ['şık açıklamaları dizi değil', (s) => { s.sik_aciklamalari = 'metin'; }, /sik_aciklamalari eksik/],
  ['şık açıklaması eksik', (s) => { s.sik_aciklamalari.pop(); }, /sayısı şık sayısıyla aynı/],
  ['fazladan şık açıklaması', (s) => { s.sik_aciklamalari.push('d'.repeat(30)); }, /sayısı şık sayısıyla aynı/],
  ['şık açıklaması boş', (s) => { s.sik_aciklamalari[1] = ' '; }, /\[1\] eksik\/boş/],
  ['şık açıklaması metin değil', (s) => { s.sik_aciklamalari[1] = null; }, /\[1\] eksik/],
  ['şık açıklaması kısa', (s) => { s.sik_aciklamalari[1] = 'c'.repeat(29); }, /\[1\] çok kısa/],
  ['aynı şık açıklamaları', (s) => { s.sik_aciklamalari[1] = ' ' + s.sik_aciklamalari[0] + ' '; }, /\[1\] başka bir şıkla aynı/],
]) test(`MCP açıklama: ${ad}`, () => {
  const set = setUret(); degistir(set.sorular[0]);
  assert.match(aciklamaHatalari(set).join('\n'), beklenen);
  assert.match(aciklamaHatalari(set).join('\n'), /S1:/);
});
test('MCP açıklama: tüm sorunlu soru kimliklerini bildirir', () => {
  const set = { sorular: [{ id: 'S1', siklar: ['A', 'B'] }, { id: 'S2', siklar: ['A', 'B'], aciklama: 'Kısa' }] };
  const hata = aciklamaHatalari(set).join('\n');
  assert.match(hata, /S1:/); assert.match(hata, /S2:/);
});
test('MCP açıklama: gizleme reddedilir; yalnız true denetimi atlar', () => {
  const set = setUret(); set.aciklamalari_goster = false;
  assert.match(aciklamaHatalari(set).join('\n'), /görünür kalmalı/);
  delete set.sorular[0].aciklama;
  assert.deepEqual(aciklamaHatalari(set, true), []);
  assert.ok(aciklamaHatalari(set, false).length);
  assert.ok(aciklamaHatalari(set, 'true').length);
});
