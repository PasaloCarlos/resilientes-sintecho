'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./gas-fake.js');

const BUENA = {
  fecha: '2026-10-17', hora: '19:00',
  lugar: 'Librería Mágica', direccion: 'Calle Ponce de León 1126, San Juan'
};
const ENCABEZADOS = ['id', 'fecha', 'hora', 'duracionMin', 'lugar', 'direccion', 'mapa', 'invitados', 'masInfo', 'notas', 'actualizado'];
const esFecha = v => Object.prototype.toString.call(v) === '[object Date]';
const crear = (e, presentacion, clave = 'secreta') => e.post({ accion: 'crear', clave, presentacion });

test('doGet en hoja nueva: crea encabezados, fecha/hora como texto, lista vacía', () => {
  const e = crearEntorno();
  assert.deepEqual(e.get(), { ok: true, presentaciones: [], invalidas: [] });
  assert.deepEqual(e.hoja().filas[0], ENCABEZADOS);
  assert.deepEqual(e.hoja().formatos, [['B:C', '@']]);
});

test('crear: normaliza lo escrito en el teléfono y guarda la fila (Review Focus 2)', () => {
  const e = crearEntorno();
  const r = crear(e, {
    ...BUENA, lugar: '  Librería Mágica ', duracionMin: '90', notas: ' Entrada libre ',
    invitados: 'Ana (moderadora)\n\n   Luis  \n'
  });
  assert.deepEqual(r, { ok: true, presentacion: {
    ...BUENA, duracionMin: 90, notas: 'Entrada libre', invitados: ['Ana (moderadora)', 'Luis'], id: 'uuid-1'
  } });
  const fila = e.hoja().filas[1];
  assert.deepEqual(fila.slice(0, 10), ['uuid-1', '2026-10-17', '19:00', 90, 'Librería Mágica',
    'Calle Ponce de León 1126, San Juan', '', 'Ana (moderadora)\nLuis', '', 'Entrada libre']);
  assert.ok(esFecha(fila[10]), 'actualizado es una fecha');
  assert.deepEqual(e.get().presentaciones, [r.presentacion]);
});

test('crear: descarta campos desconocidos', () => {
  const e = crearEntorno();
  const r = crear(e, { ...BUENA, admin: true, '<script>': 'x', id: 'elegido-por-mi' });
  assert.equal(r.ok, true);
  assert.equal(r.presentacion.id, 'uuid-1');
  assert.equal('admin' in r.presentacion, false);
  assert.equal(e.hoja().filas[1].length, 11);
});

test('crear: datos inválidos → mensajes por campo y no se guarda nada', () => {
  const e = crearEntorno();
  e.get();
  const r = crear(e, { fecha: '2026-02-30', direccion: 'D', masInfo: 'http://x' });
  assert.deepEqual(r, { ok: false, error: 'Revisa los campos marcados.', campos: {
    fecha: 'La fecha no es válida.', hora: 'Escoge la hora.', lugar: 'Escribe el lugar.',
    masInfo: 'El enlace debe empezar con https://'
  } });
  assert.equal(e.hoja().filas.length, 1);
});

test('crear: topes por campo', () => {
  const e = crearEntorno();
  assert.deepEqual(crear(e, { ...BUENA, lugar: 'x'.repeat(121) }).campos, { lugar: 'Máximo 120 caracteres.' });
  const once = Array.from({ length: 11 }, (_, i) => `Invitado ${i}`).join('\n');
  assert.deepEqual(crear(e, { ...BUENA, invitados: once }).campos,
    { invitados: 'Máximo 10 invitados, de hasta 120 caracteres cada uno.' });
});

test('crear: máximo 200 presentaciones', () => {
  const e = crearEntorno();
  for (let i = 0; i < 200; i++) assert.equal(crear(e, BUENA).ok, true);
  assert.deepEqual(crear(e, BUENA), { ok: false, error: 'Se alcanzó el máximo de 200 presentaciones.' });
});

test('editar: cambia la fila y conserva el id', () => {
  const e = crearEntorno();
  const { presentacion } = crear(e, BUENA);
  const r = e.post({ accion: 'editar', clave: 'secreta', id: presentacion.id, presentacion: { ...BUENA, hora: '15:30' } });
  assert.deepEqual(r, { ok: true, presentacion: { ...BUENA, hora: '15:30', id: 'uuid-1' } });
  assert.equal(e.hoja().filas.length, 2);
  assert.deepEqual(e.get().presentaciones, [{ ...BUENA, hora: '15:30', id: 'uuid-1' }]);
});

test('editar y borrar una presentación que ya no existe (Review Focus 4)', () => {
  const e = crearEntorno();
  e.get();
  const editar = e.post({ accion: 'editar', clave: 'secreta', id: 'no-existe', presentacion: BUENA });
  const borrar = e.post({ accion: 'borrar', clave: 'secreta', id: 'no-existe' });
  assert.deepEqual(editar, { ok: false, error: 'Esa presentación ya no existe.' });
  assert.deepEqual(borrar, { ok: false, error: 'Esa presentación ya no existe.' });
  assert.equal(e.hoja().filas.length, 1);
});

test('borrar: quita la fila', () => {
  const e = crearEntorno();
  const a = crear(e, BUENA).presentacion;
  const b = crear(e, { ...BUENA, hora: '10:00' }).presentacion;
  assert.deepEqual(e.post({ accion: 'borrar', clave: 'secreta', id: a.id }), { ok: true });
  assert.deepEqual(e.get().presentaciones.map(p => p.id), [b.id]);
});

test('clave: sin configurar, incorrecta, ausente y con espacios (Review Focus 2)', () => {
  assert.deepEqual(crearEntorno({ clave: null }).post({ accion: 'verificar', clave: 'x' }),
    { ok: false, error: 'Falta configurar la clave.' });
  const e = crearEntorno();
  assert.deepEqual(e.post({ accion: 'verificar', clave: 'otra' }), { ok: false, error: 'Clave incorrecta.' });
  assert.deepEqual(e.post({ accion: 'verificar' }), { ok: false, error: 'Clave incorrecta.' });
  assert.deepEqual(e.post({ accion: 'verificar', clave: '  secreta ' }), { ok: true });
  assert.deepEqual(crear(e, BUENA, 'otra'), { ok: false, error: 'Clave incorrecta.' });
});

test('clave: 10 fallos bloquean 10 minutos, incluso la clave correcta', () => {
  const e = crearEntorno();
  for (let i = 0; i < 10; i++) e.post({ accion: 'verificar', clave: 'mala' });
  assert.deepEqual(e.post({ accion: 'verificar', clave: 'secreta' }),
    { ok: false, error: 'Demasiados intentos. Espera 10 minutos.' });
  e.avanzar(601);
  assert.deepEqual(e.post({ accion: 'verificar', clave: 'secreta' }), { ok: true });
});

test('ocupado, cuerpo inválido y acción desconocida', () => {
  assert.deepEqual(crearEntorno({ lockFalla: true }).post({ accion: 'verificar', clave: 'secreta' }),
    { ok: false, error: 'El sistema está ocupado, intenta otra vez.' });
  const e = crearEntorno();
  assert.deepEqual(e.postCrudo('esto no es json'), { ok: false, error: 'Solicitud inválida.' });
  assert.deepEqual(e.post({ accion: 'explotar', clave: 'secreta' }), { ok: false, error: 'Acción desconocida.' });
});

test('doGet: celdas que Sheets convirtió en fecha/hora se leen como texto (Review Focus 1)', () => {
  const e = crearEntorno();
  e.get();
  e.hoja().filas.push(['a-mano', new Date('2026-10-17T04:00:00Z'), new Date('1899-12-30T23:00:00Z'), 90,
    'Lugar', 'Dirección', '', 'Ana\nLuis', '', '', '']);
  assert.deepEqual(e.get().presentaciones, [{
    id: 'a-mano', fecha: '2026-10-17', hora: '19:00', lugar: 'Lugar', direccion: 'Dirección',
    duracionMin: 90, invitados: ['Ana', 'Luis']
  }]);
});

test('doGet: filas inválidas van a "invalidas", las vacías se ignoran, sin id es inválida', () => {
  const e = crearEntorno();
  e.get();
  e.hoja().filas.push(['mala', '17/10/2026', '7pm', '', 'L', 'D', '', '', '', '', '']);
  e.hoja().filas.push(['', '', '', '', '', '', '', '', '', '', '']);
  e.hoja().filas.push(['', '2026-10-20', '18:00', '', 'L', 'D', '', '', '', '', '']);
  assert.deepEqual(e.get(), { ok: true, presentaciones: [], invalidas: [
    { fila: 2, id: 'mala', errores: ['fecha: debe ser AAAA-MM-DD y una fecha real', 'hora: debe ser HH:MM en 24 horas (ej. 19:00)'] },
    { fila: 4, id: '', errores: ['id: falta; bórrala y créala desde el admin'] }
  ] });
});
