'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../admin-datos.js');
const A = require('../agenda.js');

const VACIO = { fecha: '', hora: '', lugar: '', direccion: '', invitados: '', notas: '', masInfo: '', duracionMin: '120', mapa: '' };

test('deFormulario: recorta, separa invitados, ignora líneas vacías (Review Focus 2)', () => {
  const p = D.deFormulario({ ...VACIO, fecha: '2026-10-17', hora: '19:00', lugar: ' Librería ', direccion: 'Calle 1 ',
    invitados: 'Ana (moderadora) \n\n  Luis\n', notas: '  ', duracionMin: '90' });
  assert.deepEqual(p, { fecha: '2026-10-17', hora: '19:00', lugar: 'Librería', direccion: 'Calle 1',
    invitados: ['Ana (moderadora)', 'Luis'], duracionMin: 90 });
  assert.deepEqual(A.validarPresentacion(p), []);
});

test('deFormulario: 2 horas es el valor por defecto y no se guarda', () => {
  assert.equal('duracionMin' in D.deFormulario({ ...VACIO, duracionMin: '120' }), false);
});

test('aFormulario y deFormulario son inversos', () => {
  const p = { fecha: '2026-11-12', hora: '10:30', lugar: 'L', direccion: 'D', invitados: ['Ana', 'Luis'],
    notas: 'Entrada libre', masInfo: 'https://x.org/e', mapa: 'https://maps.app.goo.gl/x', duracionMin: 90 };
  assert.deepEqual(D.aFormulario(p), { fecha: '2026-11-12', hora: '10:30', lugar: 'L', direccion: 'D',
    invitados: 'Ana\nLuis', notas: 'Entrada libre', masInfo: 'https://x.org/e', mapa: 'https://maps.app.goo.gl/x', duracionMin: '90' });
  assert.deepEqual(D.deFormulario(D.aFormulario(p)), p);
  assert.deepEqual(D.aFormulario({}), VACIO);
});
