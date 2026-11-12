import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEventTitle } from '../src/utils/formatEventTitle.js';

const cases = [
  ['VOCES DE AMERICA', 'Voces de América'],
  ['OSPR CONCIERTO CLÁSICO 6', 'OSPR Concierto Clásico 6'],
  ['OSPR CONCIERTO CLÁSICO 7', 'OSPR Concierto Clásico 7'],
  ['GOMBA JAHBARI - 30 ANIVERSARIO', 'Gomba Jahbari - 30 Aniversario'],
  ['PUERTO RICO JAZZ JAM 2027', 'Puerto Rico Jazz Jam 2027'],
  ['VIVEN LAS CANCIONES DE PABLO MILANES', 'Viven las Canciones de Pablo Milanes'],
  ['DJ SET EN VIVO', 'DJ Set en Vivo'],
  ['CHUWI', 'CHUWI'],
  ['ÌFÉ FEAT. MIMA, CALMA CARMONA', 'ÌFÉ feat. MIMA, Calma Carmona'],
  ['MI PRIMERA VEZ', 'Mi Primera Vez'],
  ['BVS Freestyle: Del Tótem al PH: Penthouse Edition',
    'BVS Freestyle: Del Tótem al PH: Penthouse Edition'],
  ['iLe en vivo', 'iLe en vivo'],
  ['', ''],
  [null, '']
];

for (const [original, expected] of cases) {
  test(`format title: ${String(original)}`, () => {
    assert.equal(formatEventTitle(original), expected);
  });
}
