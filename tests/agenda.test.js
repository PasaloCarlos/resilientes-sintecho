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

// ---------- formato ----------

test('formatear: bloque de fecha y línea completa en español', () => {
  assert.deepEqual(A.formatear(base()), {
    dia: '18', mes: 'OCT', semana: 'dom',
    completa: 'domingo, 18 de octubre · 7:00 p.m.'
  });
  assert.deepEqual(A.formatear(base({ fecha: '2026-11-12', hora: '10:30' })), {
    dia: '12', mes: 'NOV', semana: 'jue',
    completa: 'jueves, 12 de noviembre · 10:30 a.m.'
  });
  assert.equal(A.formatear(base({ fecha: '2026-10-17' })).completa, 'sábado, 17 de octubre · 7:00 p.m.');
  assert.equal(A.formatear(base({ fecha: '2026-11-08' })).dia, '8');
});

test('horaLegible: medianoche, mediodía y ceros', () => {
  assert.equal(A.horaLegible('00:15'), '12:15 a.m.');
  assert.equal(A.horaLegible('12:00'), '12:00 p.m.');
  assert.equal(A.horaLegible('09:05'), '9:05 a.m.');
  assert.equal(A.horaLegible('23:59'), '11:59 p.m.');
});

test('urlMapa: usa mapa si existe', () => {
  assert.equal(A.urlMapa(base({ mapa: 'https://maps.app.goo.gl/abc' })), 'https://maps.app.goo.gl/abc');
});

test('urlMapa: sin mapa (o vacío) busca lugar + dirección, codificado (Review Focus 1 y 3)', () => {
  const esperado = 'https://www.google.com/maps/search/?api=1&query=' +
    'Librer%C3%ADa%20M%C3%A1gica%2C%20Calle%20Ponce%20de%20Le%C3%B3n%201126%2C%20San%20Juan';
  assert.equal(A.urlMapa(base()), esperado);
  assert.equal(A.urlMapa(base({ mapa: '' })), esperado);
  assert.equal(A.urlMapa(base({ lugar: 'Café & Libros' })).includes('Caf%C3%A9%20%26%20Libros'), true);
});

test('slug: sin acentos ni símbolos (Review Focus 3)', () => {
  assert.equal(A.slug('Librería Mágica'), 'libreria-magica');
  assert.equal(A.slug('  Café & Libros, Río Piedras! '), 'cafe-libros-rio-piedras');
  assert.equal(A.slug('Ñandú'), 'nandu');
});

// ---------- calendario ----------

const URL_PAGINA = 'https://resilientes-sintecho.netlify.app/';
const desplegar = t => t.replace(/\r\n /g, '');
const bytes = s => Buffer.byteLength(s, 'utf8');

test('tituloEvento y descripcion', () => {
  assert.equal(A.tituloEvento(LIBRO), 'Presentación: "Resilientes" sintecho — Jesús Vélez Méndez');
  assert.equal(A.descripcion(base({ invitados: ['Ana', 'Luis'], notas: 'Entrada libre' }), URL_PAGINA),
    'Con: Ana, Luis\nEntrada libre\nMás información: ' + URL_PAGINA);
  assert.equal(A.descripcion(base({ invitados: [], notas: '' }), URL_PAGINA),
    'Más información: ' + URL_PAGINA);
});

test('utcCompacto', () => {
  assert.equal(A.utcCompacto(new Date('2026-10-18T23:00:00.000Z')), '20261018T230000Z');
});

test('urlGoogle: parámetros completos y en UTC', () => {
  const u = new URL(A.urlGoogle(base({ invitados: ['Ana'], notas: 'Entrada libre' }), LIBRO, URL_PAGINA));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  const q = u.searchParams;
  assert.equal(q.get('action'), 'TEMPLATE');
  assert.equal(q.get('text'), 'Presentación: "Resilientes" sintecho — Jesús Vélez Méndez');
  assert.equal(q.get('dates'), '20261018T230000Z/20261019T010000Z');
  assert.equal(q.get('location'), 'Librería Mágica, Calle Ponce de León 1126, San Juan');
  assert.equal(q.get('details'), 'Con: Ana\nEntrada libre\nMás información: ' + URL_PAGINA);
  assert.equal(q.get('ctz'), 'America/Puerto_Rico');
});

test('escaparIcs: \\ ; , y saltos de línea', () => {
  assert.equal(A.escaparIcs('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf');
});

test('ics: estructura, CRLF, UTC y escape (Review Focus 3)', () => {
  const t = A.ics(base({ duracionMin: 90, notas: 'Entrada libre; hay café' }), LIBRO, URL_PAGINA,
    new Date('2026-09-29T12:00:00Z'));
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(t), 'todo salto de línea es CRLF');
  const lineas = desplegar(t).split('\r\n');
  for (const l of [
    'VERSION:2.0',
    'PRODID:-//resilientes-sintecho//agenda//ES',
    'BEGIN:VEVENT',
    'UID:2026-10-18-1900-libreria-magica@resilientes-sintecho',
    'DTSTAMP:20260929T120000Z',
    'DTSTART:20261018T230000Z',
    'DTEND:20261019T003000Z',
    'SUMMARY:Presentación: "Resilientes" sintecho — Jesús Vélez Méndez',
    'LOCATION:Librería Mágica\\, Calle Ponce de León 1126\\, San Juan',
    'DESCRIPTION:Entrada libre\\; hay café\\nMás información: ' + URL_PAGINA,
    'END:VEVENT'
  ]) assert.ok(lineas.includes(l), `falta la línea: ${l}`);
});

test('ics: mismo día y lugar a distinta hora → UID distintos (Review Focus 4)', () => {
  const uid = t => desplegar(t).split('\r\n').find(l => l.startsWith('UID:'));
  const a = A.ics(base({ hora: '10:00' }), LIBRO, URL_PAGINA);
  const b = A.ics(base({ hora: '19:00' }), LIBRO, URL_PAGINA);
  assert.notEqual(uid(a), uid(b));
});

test('plegar: ≤75 octetos por línea física sin partir caracteres multibyte (Review Focus 5)', () => {
  const larga = 'DESCRIPTION:' + 'á'.repeat(100) + '🙂'.repeat(20);
  const plegada = A.plegar(larga);
  for (const fisica of plegada.split('\r\n')) assert.ok(bytes(fisica) <= 75, `${bytes(fisica)} octetos`);
  assert.equal(desplegar(plegada), larga);
  assert.equal(A.plegar('corta'), 'corta');
});

test('ics: invitados y notas largos quedan plegados y se recuperan', () => {
  const invitados = Array.from({ length: 8 }, (_, i) => `Invitada Número ${i + 1} (Universidad de Puerto Rico)`);
  const t = A.ics(base({ invitados }), LIBRO, URL_PAGINA);
  for (const fisica of t.split('\r\n')) assert.ok(bytes(fisica) <= 75);
  assert.ok(desplegar(t).includes('DESCRIPTION:Con: ' + invitados.map(A.escaparIcs).join('\\, ')));
});

test('nombreIcs', () => {
  assert.equal(A.nombreIcs(base()), 'presentacion-2026-10-18.ics');
});

// ---------- más información por evento ----------

test('validar: masInfo debe empezar con https://; vacío o null cuenta como ausente', () => {
  assert.deepEqual(A.validar(LIBRO, [base({ masInfo: 'http://facebook.com/events/1' })]).errores,
    ['presentaciones[0].masInfo: debe empezar con https://']);
  assert.deepEqual(A.validar(LIBRO, [base({ masInfo: 'facebook.com/events/1' })]).errores,
    ['presentaciones[0].masInfo: debe empezar con https://']);
  assert.deepEqual(A.validar(LIBRO, [base({ masInfo: '' }), base({ masInfo: null }),
    base({ masInfo: 'https://facebook.com/events/1' })]).errores, []);
});

test('descripcion: "Más información" apunta a masInfo si existe; si no, a la página', () => {
  const ev = 'https://www.eventbrite.com/e/presentacion-123';
  assert.equal(A.descripcion(base({ masInfo: ev }), URL_PAGINA), 'Más información: ' + ev);
  assert.equal(A.descripcion(base({ masInfo: '' }), URL_PAGINA), 'Más información: ' + URL_PAGINA);
  const q = new URL(A.urlGoogle(base({ masInfo: ev }), LIBRO, URL_PAGINA)).searchParams;
  assert.equal(q.get('details'), 'Más información: ' + ev);
  const t = A.ics(base({ masInfo: ev }), LIBRO, URL_PAGINA).replace(/\r\n /g, '');
  assert.ok(t.includes('DESCRIPTION:Más información: ' + ev));
});
