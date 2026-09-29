'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../agenda.js');

const LIBRO = {
  titulo: '"Resilientes" sintecho',
  subtitulo: 'Etnografía de las tecnologías de poder estadounidense en el posdesastre',
  autor: 'Jesús Vélez Méndez',
  resena: 'Reseña de prueba.',
  portada: 'assets/portada.jpg'
};

const base = (extra = {}) => ({
  fecha: '2026-10-18',
  hora: '19:00',
  lugar: 'Librería Mágica',
  direccion: 'Calle Ponce de León 1126, San Juan',
  ...extra
});

// ---------- validar ----------

test('validar: presentación completa no da errores', () => {
  const r = A.validar(LIBRO, [base({
    duracionMin: 90, mapa: 'https://maps.app.goo.gl/abc',
    invitados: ['Ana Rivera (moderadora)'], notas: 'Entrada libre'
  })]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.validas.length, 1);
});

test('validar: requeridos faltantes nombran índice y campo; la válida sobrevive', () => {
  const r = A.validar(LIBRO, [base(), { hora: '19:00' }]);
  assert.deepEqual(r.errores, [
    'presentaciones[1].fecha: requerido',
    'presentaciones[1].lugar: requerido',
    'presentaciones[1].direccion: requerido'
  ]);
  assert.equal(r.validas.length, 1);
  assert.equal(r.validas[0].lugar, 'Librería Mágica');
});

test('validar: texto en blanco cuenta como faltante', () => {
  const r = A.validar(LIBRO, [base({ lugar: '   ' })]);
  assert.deepEqual(r.errores, ['presentaciones[0].lugar: requerido']);
});

test('validar: fecha mal formada o inexistente', () => {
  for (const fecha of ['18/10/2026', '2026-2-3', '2026-02-30', '2026-13-01']) {
    const r = A.validar(LIBRO, [base({ fecha })]);
    assert.deepEqual(r.errores, ['presentaciones[0].fecha: debe ser AAAA-MM-DD y una fecha real'], fecha);
  }
});

test('validar: hora debe ser HH:MM de 24 horas', () => {
  for (const hora of ['7:00', '24:00', '19:60', '7 pm', '19.00']) {
    const r = A.validar(LIBRO, [base({ hora })]);
    assert.deepEqual(r.errores, ['presentaciones[0].hora: debe ser HH:MM en 24 horas (ej. 19:00)'], hora);
  }
  assert.deepEqual(A.validar(LIBRO, [base({ hora: '00:00' })]).errores, []);
  assert.deepEqual(A.validar(LIBRO, [base({ hora: '23:59' })]).errores, []);
});

test('validar: duracionMin debe ser entero positivo', () => {
  for (const duracionMin of [0, -5, 90.5, '90']) {
    const r = A.validar(LIBRO, [base({ duracionMin })]);
    assert.deepEqual(r.errores, ['presentaciones[0].duracionMin: debe ser un número entero de minutos mayor que 0'], String(duracionMin));
  }
});

test('validar: invitados debe ser lista de textos', () => {
  assert.deepEqual(A.validar(LIBRO, [base({ invitados: 'Ana' })]).errores,
    ['presentaciones[0].invitados: debe ser una lista de textos, ej. ["Nombre (rol)"]']);
  assert.deepEqual(A.validar(LIBRO, [base({ invitados: ['Ana', ''] })]).errores,
    ['presentaciones[0].invitados: debe ser una lista de textos, ej. ["Nombre (rol)"]']);
});

test('validar: mapa debe empezar con https://', () => {
  assert.deepEqual(A.validar(LIBRO, [base({ mapa: 'http://maps.google.com' })]).errores,
    ['presentaciones[0].mapa: debe empezar con https://']);
});

test('validar: notas debe ser texto', () => {
  assert.deepEqual(A.validar(LIBRO, [base({ notas: 5 })]).errores,
    ['presentaciones[0].notas: debe ser texto']);
});

test('validar: opcionales vacíos o null cuentan como ausentes (Review Focus 1)', () => {
  const r = A.validar(LIBRO, [
    base({ mapa: '', notas: '', invitados: [], duracionMin: null }),
    base({ mapa: null, notas: null, invitados: null, duracionMin: undefined })
  ]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.validas.length, 2);
});

test('validar: una entrada que no es objeto', () => {
  const r = A.validar(LIBRO, [null, 'x', base()]);
  assert.deepEqual(r.errores, [
    'presentaciones[0]: debe ser un objeto { ... }',
    'presentaciones[1]: debe ser un objeto { ... }'
  ]);
  assert.equal(r.validas.length, 1);
});

test('validar: presentaciones que no es lista', () => {
  const r = A.validar(LIBRO, undefined);
  assert.deepEqual(r.errores, ['presentaciones: falta window.presentaciones o no es una lista [ ... ]']);
  assert.deepEqual(r.validas, []);
});

test('validar: libro faltante o incompleto', () => {
  assert.deepEqual(A.validar(undefined, []).errores, ['libro: falta window.libro']);
  const { resena, ...sinResena } = LIBRO;
  assert.deepEqual(A.validar(sinResena, []).errores, ['libro.resena: requerido']);
});

// ---------- tiempo ----------

test('instante: fecha+hora de PR es UTC−4', () => {
  assert.equal(A.instante(base()).toISOString(), '2026-10-18T23:00:00.000Z');
});

test('fin: 120 minutos por defecto o duracionMin', () => {
  assert.equal(A.fin(base()).toISOString(), '2026-10-19T01:00:00.000Z');
  assert.equal(A.fin(base({ duracionMin: 90 })).toISOString(), '2026-10-19T00:30:00.000Z');
  assert.equal(A.fin(base({ duracionMin: null })).toISOString(), '2026-10-19T01:00:00.000Z');
});

test('hoyPR: 03:59Z del 19 sigue siendo el 18 en PR; 04:00Z ya es el 19', () => {
  assert.equal(A.hoyPR(new Date('2026-10-19T03:59:59Z')), '2026-10-18');
  assert.equal(A.hoyPR(new Date('2026-10-19T04:00:00Z')), '2026-10-19');
});

test('dividir: el evento sigue en próximas todo su día (hasta 23:59 PR)', () => {
  const p = base();
  let r = A.dividir([p], new Date('2026-10-19T03:59:00Z')); // 23:59 PR del 18
  assert.deepEqual(r, { proximas: [p], anteriores: [] });
  r = A.dividir([p], new Date('2026-10-19T04:00:00Z'));     // 00:00 PR del 19
  assert.deepEqual(r, { proximas: [], anteriores: [p] });
});

test('dividir: un evento de la mañana ya terminado sigue en próximas esa noche', () => {
  const p = base({ hora: '10:00' });
  const r = A.dividir([p], new Date('2026-10-19T00:00:00Z')); // 20:00 PR del 18
  assert.deepEqual(r.proximas, [p]);
});

test('dividir: visitante en Madrid a la 1:00 del 19 ve el evento del 18 de PR como próximo (Review Focus 2)', () => {
  const p = base();
  const r = A.dividir([p], new Date('2026-10-19T01:00:00+02:00')); // = 19:00 PR del 18
  assert.deepEqual(r.proximas, [p]);
});

test('dividir: próximas ascendentes (misma fecha por hora), anteriores descendentes (Review Focus 4)', () => {
  const a = base({ fecha: '2026-11-12', hora: '19:00' });
  const b = base({ fecha: '2026-11-12', hora: '10:00', lugar: 'Otro lugar' });
  const c = base({ fecha: '2026-10-17', hora: '15:00' });
  const v1 = base({ fecha: '2026-09-01' });
  const v2 = base({ fecha: '2026-09-20' });
  const lista = [a, v1, b, c, v2];
  const copia = lista.slice();
  const r = A.dividir(lista, new Date('2026-09-29T16:00:00Z'));
  assert.deepEqual(r.proximas, [c, b, a]);
  assert.deepEqual(r.anteriores, [v2, v1]);
  assert.deepEqual(lista, copia, 'no muta la entrada');
});

test('dividir: lista vacía', () => {
  assert.deepEqual(A.dividir([], new Date()), { proximas: [], anteriores: [] });
});
