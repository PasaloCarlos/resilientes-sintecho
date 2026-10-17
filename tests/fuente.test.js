'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fuente.js');

const UNA = [{ id: 'a', fecha: '2026-10-17', hora: '19:00', lugar: 'L', direccion: 'D' }];
const DOS = [...UNA, { id: 'b', fecha: '2026-11-12', hora: '10:00', lugar: 'L2', direccion: 'D2' }];

const responde = (datos, ms = 0) => () => new Promise(r => setTimeout(() => r({ json: async () => datos }), ms));
const falla = (ms = 0) => () => new Promise((_, no) => setTimeout(() => no(new Error('red')), ms));

function almacen(copia) {
  const m = new Map();
  if (copia !== undefined) m.set(F.LLAVE, typeof copia === 'string' ? copia : JSON.stringify(copia));
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

function pantalla() {
  const eventos = [];
  return {
    eventos,
    pintar: (lista, origen) => eventos.push(['pintar', origen, lista.length]),
    cargando: () => eventos.push(['cargando']),
    sinDatos: () => eventos.push(['sinDatos'])
  };
}

const opciones = (extra) => ({ url: 'https://script.example/exec', esperaMs: 30, respaldo: [], ahora: () => 123, ...extra });

test('sin url: pinta presentaciones.js tal cual', async () => {
  const s = pantalla();
  assert.equal(await F.cargarPresentaciones({ ...s, url: '', respaldo: UNA }), 'archivo');
  assert.deepEqual(s.eventos, [['pintar', 'archivo', 1]]);
});

test('primera visita: "cargando", luego el Sheet, y guarda la copia', async () => {
  const s = pantalla();
  const a = almacen();
  const r = await F.cargarPresentaciones(opciones({ ...s, almacen: a, fetchFn: responde({ ok: true, presentaciones: UNA }) }));
  assert.equal(r, 'sheet');
  assert.deepEqual(s.eventos, [['cargando'], ['pintar', 'sheet', 1]]);
  assert.deepEqual(JSON.parse(a.m.get(F.LLAVE)), { guardado: 123, presentaciones: UNA });
});

test('visita repetida: la copia al instante y luego el Sheet si cambió', async () => {
  const s = pantalla();
  await F.cargarPresentaciones(opciones({ ...s, almacen: almacen({ guardado: 1, presentaciones: UNA }),
    fetchFn: responde({ ok: true, presentaciones: DOS }) }));
  assert.deepEqual(s.eventos, [['pintar', 'copia', 1], ['pintar', 'sheet', 2]]);
});

test('visita repetida: si el Sheet trae lo mismo, no se vuelve a pintar', async () => {
  const s = pantalla();
  await F.cargarPresentaciones(opciones({ ...s, almacen: almacen({ guardado: 1, presentaciones: UNA }),
    fetchFn: responde({ ok: true, presentaciones: UNA }) }));
  assert.deepEqual(s.eventos, [['pintar', 'copia', 1]]);
});

test('el Sheet llega después del plazo: respaldo primero y luego las fechas reales (Review Focus 3)', async () => {
  const s = pantalla();
  const r = await F.cargarPresentaciones(opciones({ ...s, almacen: almacen(), respaldo: UNA,
    fetchFn: responde({ ok: true, presentaciones: DOS }, 80) }));
  assert.equal(r, 'sheet');
  assert.deepEqual(s.eventos, [['cargando'], ['pintar', 'respaldo', 1], ['pintar', 'sheet', 2]]);
});

test('primera visita, el Sheet falla y no hay respaldo → mensaje de error', async () => {
  const s = pantalla();
  assert.equal(await F.cargarPresentaciones(opciones({ ...s, almacen: almacen(), fetchFn: falla() })), 'fallo');
  assert.deepEqual(s.eventos, [['cargando'], ['sinDatos']]);
});

test('respuesta ok:false cuenta como fallo', async () => {
  const s = pantalla();
  await F.cargarPresentaciones(opciones({ ...s, almacen: almacen(), respaldo: UNA,
    fetchFn: responde({ ok: false, error: 'x' }) }));
  assert.deepEqual(s.eventos, [['cargando'], ['pintar', 'respaldo', 1]]);
});

test('con copia y el Sheet falla: se queda la copia', async () => {
  const s = pantalla();
  await F.cargarPresentaciones(opciones({ ...s, almacen: almacen({ guardado: 1, presentaciones: UNA }), fetchFn: falla() }));
  assert.deepEqual(s.eventos, [['pintar', 'copia', 1]]);
});

test('copia corrupta o almacenamiento bloqueado: como primera visita, sin lanzar (Review Focus 5)', async () => {
  const s1 = pantalla();
  await F.cargarPresentaciones(opciones({ ...s1, almacen: almacen('{no es json'),
    fetchFn: responde({ ok: true, presentaciones: UNA }) }));
  assert.deepEqual(s1.eventos, [['cargando'], ['pintar', 'sheet', 1]]);

  const bloqueado = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  const s2 = pantalla();
  assert.equal(await F.cargarPresentaciones(opciones({ ...s2, almacen: bloqueado,
    fetchFn: responde({ ok: true, presentaciones: UNA }) })), 'sheet');
  assert.deepEqual(s2.eventos, [['cargando'], ['pintar', 'sheet', 1]]);
});
