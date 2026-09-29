# Agenda de presentaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, Spanish, mobile-first page listing the upcoming presentations of *"Resilientes" sintecho*. Each presentation has a map link and add-to-calendar options, and the page is maintained by editing one data file.

**Architecture:** No build and no dependencies.
- `agenda.js` is pure logic (validation, Puerto Rico time, splitting into upcoming and past, formatting, calendar links and .ics). It is a classic script that also loads in Node, which is how it gets tested.
- `app.js` does all the DOM work.
- `presentaciones.js` holds the data and is the only file edited day to day.
- The site deploys to Netlify from `main`.

**Tech Stack:** HTML, CSS and vanilla JS (ES2020); `node:test` + `node:assert` (Node 24); Pillow, used once to resize the cover; Google Fonts (Big Shoulders Stencil Display, Montserrat).

**Spec:** `docs/superpowers/specs/2026-09-29-agenda-presentaciones-design.md`

## Global Constraints

- **"sintecho" is ONE word** everywhere: copy, `<title>`, meta, file names, UID domain. Never write "sin techo".
- **Time zone:** `America/Puerto_Rico`, a fixed UTC−4 with no DST. "Today" is always today's date in PR, whatever the visitor's time zone.
- **No runtime or dev dependencies.** No `package.json` and no npm install. Tests run with `node --test tests/`.
- **All user-facing text is in Spanish.** `<html lang="es">`.
- **Data file edits never blank the page:** invalid entries are skipped and reported in a red banner, and valid entries still render.
- **Data text is inserted with `textContent` or attributes only.** Never use `innerHTML` with data.
- **Layout:** no horizontal scroll at 360px width, and WCAG AA contrast for all text.
- **Committed images:** `assets/portada.jpg` has a long side ≤ 1200px and is ≤ 300 KB. `assets/og.jpg` is 1200×630. The 3.5 MB original is never committed.
- **Nothing is pushed and no remote or Netlify site is created** unless the owner explicitly asks.
- **Commit identity:** the repo's default git identity. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the cases most likely to bite a real user:

1. **Optional fields left empty** (`mapa: ""`, `notas: ""`, `invitados: []`, or `null`). They should count as absent: no error, no empty "Con:" line, and the map falls back to a search link. *Tested in Task 1 (validation) and Task 3 (`urlMapa`).*
2. **A visitor outside PR** (for example Madrid, UTC+2) late at night. An event that is today in PR must still show as upcoming. *Tested in Task 2.*
3. **Accents, commas, semicolons, ampersands and quotes in venue, guest or notes text.**
   - .ics escaping, URL encoding and the UID slug must all be correct.
   - The DOM must show the text literally.
   *Tested in Tasks 3 and 4; the DOM part is a manual check in Task 5.*
4. **Two presentations on the same day** (same or different venue). They are ordered by time, and each gets its own calendar UID. *Tested in Tasks 2 and 4.*
5. **Long notes or guest lists in the .ics.** Lines must be folded at ≤ 75 octets without splitting a multi-byte character, or calendar apps reject or garble the file. *Tested in Task 4.*

**Deliberate refinements of the spec** (a reviewer should not flag these):
- `validar` returns `{ errores, validas }` instead of just the error list, so `app.js` gets the valid entries in one call.
- The UID includes the time (`<fecha>-<HHMM>-<slug>@resilientes-sintecho`), so two events at the same venue on the same day don't collide (Review Focus 4).
- Dates and times are formatted with fixed Spanish name tables instead of `Intl`. PR has a fixed offset, and ICU output varies between engines (for example "p. m." with a narrow no-break space).
- The spec's example card line was "sábado, 18 de octubre"; 18 Oct 2026 is actually a Sunday, and the tests use real weekdays.

## File Structure

| File | Responsibility |
|---|---|
| `agenda.js` | Pure functions, exported as `window.Agenda` or via `module.exports`. No DOM. |
| `tests/agenda.test.js` | All unit tests for `agenda.js`. |
| `presentaciones.js` | `window.libro` + `window.presentaciones`. The only file edited day to day. |
| `index.html` | Skeleton, meta and OG tags, fonts, hero fallback text, card `<template>`. |
| `styles.css` | Tokens and mobile-first layout. |
| `app.js` | Validates, renders the hero, error banner, upcoming list and past list, and wires the calendar menu. |
| `assets/portada.jpg`, `assets/og.jpg` | Web-sized cover and share image. |
| `netlify.toml` | Publish dir and cache headers. |
| `README.md` | How to add a presentation, preview, test and deploy. |

---

### Task 1: `agenda.js` module shell + `validar`

**Files:**
- Create: `agenda.js`
- Test: `tests/agenda.test.js`

**Interfaces:**
- Produces:
  - `Agenda.validar(libro: object, presentaciones: any) → { errores: string[], validas: object[] }`.
  - Internal helpers `esTextoNoVacio(v)`, `esAusente(v)`, `fechaValida(s)` and `horaValida(s)`, used by later tasks inside the same file.
  - Each error string has the form `"<ruta>: <mensaje>"`, where `ruta` is `libro`, `libro.<campo>`, `presentaciones`, `presentaciones[i]` or `presentaciones[i].<campo>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/agenda.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test tests/`
Expected: FAIL with `Cannot find module '../agenda.js'`.

- [ ] **Step 3: Write the implementation**

Create `agenda.js`:

```js
/* Lógica pura de la agenda. Sin DOM: corre en el navegador (window.Agenda)
   y en Node (module.exports) para las pruebas. */
(function (root) {
  'use strict';

  const CAMPOS_LIBRO = ['titulo', 'subtitulo', 'autor', 'resena', 'portada'];
  const CAMPOS_REQUERIDOS = ['fecha', 'hora', 'lugar', 'direccion'];

  function esTextoNoVacio(v) {
    return typeof v === 'string' && v.trim() !== '';
  }

  // Un opcional "vacío" (undefined, null o "") cuenta como ausente.
  function esAusente(v) {
    return v === undefined || v === null || v === '';
  }

  function fechaValida(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function horaValida(s) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  }

  function erroresDePresentacion(p, ruta) {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      return [`${ruta}: debe ser un objeto { ... }`];
    }
    const errores = [];
    for (const campo of CAMPOS_REQUERIDOS) {
      if (!esTextoNoVacio(p[campo])) errores.push(`${ruta}.${campo}: requerido`);
    }
    if (esTextoNoVacio(p.fecha) && !fechaValida(p.fecha)) {
      errores.push(`${ruta}.fecha: debe ser AAAA-MM-DD y una fecha real`);
    }
    if (esTextoNoVacio(p.hora) && !horaValida(p.hora)) {
      errores.push(`${ruta}.hora: debe ser HH:MM en 24 horas (ej. 19:00)`);
    }
    if (!esAusente(p.duracionMin) && !(Number.isInteger(p.duracionMin) && p.duracionMin > 0)) {
      errores.push(`${ruta}.duracionMin: debe ser un número entero de minutos mayor que 0`);
    }
    if (!esAusente(p.invitados) &&
        !(Array.isArray(p.invitados) && p.invitados.every(esTextoNoVacio))) {
      errores.push(`${ruta}.invitados: debe ser una lista de textos, ej. ["Nombre (rol)"]`);
    }
    if (!esAusente(p.mapa) && !(typeof p.mapa === 'string' && p.mapa.startsWith('https://'))) {
      errores.push(`${ruta}.mapa: debe empezar con https://`);
    }
    if (!esAusente(p.notas) && typeof p.notas !== 'string') {
      errores.push(`${ruta}.notas: debe ser texto`);
    }
    return errores;
  }

  function validar(libro, presentaciones) {
    const errores = [];
    const validas = [];

    if (libro === null || typeof libro !== 'object') {
      errores.push('libro: falta window.libro');
    } else {
      for (const campo of CAMPOS_LIBRO) {
        if (!esTextoNoVacio(libro[campo])) errores.push(`libro.${campo}: requerido`);
      }
    }

    if (!Array.isArray(presentaciones)) {
      errores.push('presentaciones: falta window.presentaciones o no es una lista [ ... ]');
      return { errores, validas };
    }

    presentaciones.forEach((p, i) => {
      const e = erroresDePresentacion(p, `presentaciones[${i}]`);
      if (e.length) errores.push(...e);
      else validas.push(p);
    });
    return { errores, validas };
  }

  const Agenda = { validar };

  if (typeof module !== 'undefined' && module.exports) module.exports = Agenda;
  if (root) root.Agenda = Agenda;
})(typeof window !== 'undefined' ? window : null);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/`
Expected: all tests pass (13 tests), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add agenda.js tests/agenda.test.js
git commit -m "feat: agenda.js validation of libro and presentaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Puerto Rico time + split into upcoming and past

**Files:**
- Modify: `agenda.js` (add functions above `const Agenda = …`; extend the exported object)
- Test: `tests/agenda.test.js` (append)

**Interfaces:**
- Consumes: `base()`, `LIBRO`, `A` from the test file (Task 1).
- Produces:
  - `Agenda.instante(p) → Date`: the start instant (`fecha`T`hora` at −04:00).
  - `Agenda.fin(p) → Date`: start + `duracionMin` (default 120) minutes.
  - `Agenda.hoyPR(ahora: Date) → "YYYY-MM-DD"`.
  - `Agenda.dividir(lista, ahora: Date) → { proximas: object[], anteriores: object[] }`. `proximas` is ascending by start and `anteriores` descending. The input is not mutated.
  - Constants `DURACION_DEFECTO = 120`, `DESFASE_PR = '-04:00'` and `TZ = 'America/Puerto_Rico'` are used by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `tests/agenda.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test tests/`
Expected: the new tests FAIL with `A.instante is not a function` (and similar); the Task 1 tests still pass.

- [ ] **Step 3: Write the implementation**

In `agenda.js`, add these right after `horaValida`:

```js
  // Puerto Rico: UTC−4 todo el año, sin horario de verano.
  const TZ = 'America/Puerto_Rico';
  const DESFASE_PR = '-04:00';
  const DESFASE_PR_MS = -4 * 60 * 60 * 1000;
  const DURACION_DEFECTO = 120;

  function instante(p) {
    return new Date(`${p.fecha}T${p.hora}:00${DESFASE_PR}`);
  }

  function fin(p) {
    const minutos = esAusente(p.duracionMin) ? DURACION_DEFECTO : p.duracionMin;
    return new Date(instante(p).getTime() + minutos * 60 * 1000);
  }

  // Fecha de hoy en PR como "AAAA-MM-DD", sea cual sea la zona del visitante.
  function hoyPR(ahora) {
    return new Date(ahora.getTime() + DESFASE_PR_MS).toISOString().slice(0, 10);
  }

  // Un evento es "próximo" durante todo su día en PR; pasa a "anterior" al día siguiente.
  function dividir(lista, ahora) {
    const hoy = hoyPR(ahora);
    const porInicio = (a, b) => instante(a) - instante(b);
    return {
      proximas: lista.filter(p => p.fecha >= hoy).sort(porInicio),
      anteriores: lista.filter(p => p.fecha < hoy).sort((a, b) => porInicio(b, a))
    };
  }
```

Replace `const Agenda = { validar };` with:

```js
  const Agenda = { validar, instante, fin, hoyPR, dividir };
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/`
Expected: all tests pass (21), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add agenda.js tests/agenda.test.js
git commit -m "feat: Puerto Rico time and upcoming/past split

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Spanish date formatting, map link, slug

**Files:**
- Modify: `agenda.js`
- Test: `tests/agenda.test.js` (append)

**Interfaces:**
- Consumes: `esAusente`, `esTextoNoVacio` (Task 1).
- Produces:
  - `Agenda.formatear(p) → { dia: "18", mes: "OCT", semana: "dom", completa: "domingo, 18 de octubre · 7:00 p.m." }`.
  - `Agenda.horaLegible("19:00") → "7:00 p.m."`.
  - `Agenda.urlMapa(p) → string`.
  - `Agenda.slug(s) → string`.

- [ ] **Step 1: Write the failing tests**

Append:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test tests/`
Expected: the new tests FAIL with `A.formatear is not a function`.

- [ ] **Step 3: Write the implementation**

Add after `dividir` in `agenda.js`:

```js
  // Tablas fijas en vez de Intl: PR tiene desfase fijo y así el texto es idéntico en todo navegador.
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  function horaLegible(hora) {
    const [h, m] = hora.split(':').map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  }

  function formatear(p) {
    const [y, m, d] = p.fecha.split('-').map(Number);
    const semana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return {
      dia: String(d),
      mes: MESES_CORTOS[m - 1],
      semana: DIAS_CORTOS[semana],
      completa: `${DIAS[semana]}, ${d} de ${MESES[m - 1]} · ${horaLegible(p.hora)}`
    };
  }

  function urlMapa(p) {
    if (esTextoNoVacio(p.mapa)) return p.mapa;
    return 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(`${p.lugar}, ${p.direccion}`);
  }

  function slug(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
```

Update the export:

```js
  const Agenda = { validar, instante, fin, hoyPR, dividir, horaLegible, formatear, urlMapa, slug };
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/`
Expected: all tests pass (26), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add agenda.js tests/agenda.test.js
git commit -m "feat: Spanish date formatting, map fallback link, slug

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Calendar links — Google URL and .ics

**Files:**
- Modify: `agenda.js`
- Test: `tests/agenda.test.js` (append)

**Interfaces:**
- Consumes: `instante`, `fin`, `slug`, `esTextoNoVacio`, `TZ` (Tasks 1–3).
- Produces:
  - `Agenda.tituloEvento(libro) → 'Presentación: "Resilientes" sintecho — Jesús Vélez Méndez'`.
  - `Agenda.descripcion(p, urlPagina) → string`: lines joined with `\n`, in this order: `Con: …` (if there are guests), the notes (if any), `Más información: <url>`.
  - `Agenda.urlGoogle(p, libro, urlPagina) → string`.
  - `Agenda.ics(p, libro, urlPagina, ahora = new Date()) → string`: CRLF lines, folded at 75 octets, ending in CRLF.
  - `Agenda.nombreIcs(p) → "presentacion-2026-10-18.ics"`.
  - Also exported for tests: `Agenda.escaparIcs(s)`, `Agenda.plegar(linea)`, `Agenda.utcCompacto(date)`.

- [ ] **Step 1: Write the failing tests**

Append:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test tests/`
Expected: the new tests FAIL with `A.tituloEvento is not a function`.

- [ ] **Step 3: Write the implementation**

Add after `slug` in `agenda.js`:

```js
  function tituloEvento(libro) {
    return `Presentación: ${libro.titulo} — ${libro.autor}`;
  }

  function descripcion(p, urlPagina) {
    const lineas = [];
    if (Array.isArray(p.invitados) && p.invitados.length) lineas.push(`Con: ${p.invitados.join(', ')}`);
    if (esTextoNoVacio(p.notas)) lineas.push(p.notas);
    lineas.push(`Más información: ${urlPagina}`);
    return lineas.join('\n');
  }

  function ubicacion(p) {
    return `${p.lugar}, ${p.direccion}`;
  }

  function utcCompacto(fecha) {
    return fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function urlGoogle(p, libro, urlPagina) {
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: tituloEvento(libro),
      dates: `${utcCompacto(instante(p))}/${utcCompacto(fin(p))}`,
      details: descripcion(p, urlPagina),
      location: ubicacion(p),
      ctz: TZ
    });
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
  }

  // RFC 5545 §3.3.11
  function escaparIcs(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // RFC 5545 §3.1: líneas de ≤75 octetos; la continuación empieza con un espacio.
  // Se recorre por caracteres (for…of) para nunca partir un carácter multibyte.
  const codificador = new TextEncoder();
  function plegar(linea) {
    const partes = [];
    let actual = '';
    let octetos = 0;
    for (const ch of linea) {
      const n = codificador.encode(ch).length;
      if (octetos + n > 75) {
        partes.push(actual);
        actual = ' ' + ch;
        octetos = 1 + n;
      } else {
        actual += ch;
        octetos += n;
      }
    }
    partes.push(actual);
    return partes.join('\r\n');
  }

  function ics(p, libro, urlPagina, ahora = new Date()) {
    const uid = `${p.fecha}-${p.hora.replace(':', '')}-${slug(p.lugar)}@resilientes-sintecho`;
    const lineas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//resilientes-sintecho//agenda//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${utcCompacto(ahora)}`,
      `DTSTART:${utcCompacto(instante(p))}`,
      `DTEND:${utcCompacto(fin(p))}`,
      `SUMMARY:${escaparIcs(tituloEvento(libro))}`,
      `LOCATION:${escaparIcs(ubicacion(p))}`,
      `DESCRIPTION:${escaparIcs(descripcion(p, urlPagina))}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lineas.map(plegar).join('\r\n') + '\r\n';
  }

  function nombreIcs(p) {
    return `presentacion-${p.fecha}.ics`;
  }
```

Update the export:

```js
  const Agenda = {
    validar, instante, fin, hoyPR, dividir, horaLegible, formatear, urlMapa, slug,
    tituloEvento, descripcion, utcCompacto, urlGoogle, escaparIcs, plegar, ics, nombreIcs
  };
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/`
Expected: all tests pass (35), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add agenda.js tests/agenda.test.js
git commit -m "feat: Google Calendar link and RFC 5545 .ics generation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The page — images, data file, HTML, CSS, rendering

**Files:**
- Create: `assets/portada.jpg`, `assets/og.jpg`, `assets/lona.jpg` (generated from `C:\Users\carlosfigueroa\Downloads\jesuslibro-1 copy.jpg`, which is 1800×2700)
- Create: `presentaciones.js`, `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Consumes: `window.Agenda` from Tasks 1–4: `validar`, `dividir`, `formatear`, `urlMapa`, `urlGoogle`, `ics`, `nombreIcs`.
- Produces: the finished page. `presentaciones.js` defines `window.libro` and `window.presentaciones` in the shape from spec §5.

- [ ] **Step 1: Generate the web images**

Run from the repo root (this is a one-off; the script is not committed):

```bash
mkdir -p assets
python - <<'EOF'
from PIL import Image
src = Image.open(r"C:\Users\carlosfigueroa\Downloads\jesuslibro-1 copy.jpg").convert("RGB")
# Cover: 800x1200 (long side 1200)
portada = src.resize((800, 1200), Image.LANCZOS)
portada.save("assets/portada.jpg", "JPEG", quality=80, optimize=True, progressive=True)
# Share image 1200x630: band with the title, subtitle and author
ancho = src.resize((1200, 1800), Image.LANCZOS)
top = int(1800 * 0.235)
ancho.crop((0, top, 1200, top + 630)).save("assets/og.jpg", "JPEG", quality=82, optimize=True, progressive=True)
# Page background: clean tarp region (no text, grommet or seal), slightly enlarged
lona = src.crop((1100, 1650, 1800, 2650)).resize((1000, 1429), Image.LANCZOS)
lona.save("assets/lona.jpg", "JPEG", quality=70, optimize=True, progressive=True)
EOF
ls -l assets
python -c "from PIL import Image; [print(f, Image.open('assets/'+f).size) for f in ('portada.jpg','og.jpg','lona.jpg')]"
```

Expected: `portada.jpg (800, 1200)` at ≤ 300 KB, `og.jpg (1200, 630)`, and `lona.jpg (1000, 1429)` at ≤ 250 KB (if over, re-run with `quality=60`). If `portada.jpg` is over 300 KB, re-run with `quality=72`.

- [ ] **Step 2: Check the share image visually**

Open `assets/og.jpg` (for example with the Read tool). The frame must contain the full `"RESILIENTES"`, `SIN` and `TECHO` lettering, the two-line subtitle, and the author line, none of it cut off. If anything is clipped, adjust `0.235` (lower moves the band up) and repeat Step 1.

- [ ] **Step 3: Create `presentaciones.js`**

```js
/* ÚNICO ARCHIVO QUE SE EDITA PARA AÑADIR O CAMBIAR PRESENTACIONES.
   Cada presentación es un objeto { ... } dentro de la lista.
   El orden no importa: la página ordena por fecha.
   Las presentaciones pasadas se mueven solas a "Presentaciones anteriores".

   Campos:
     fecha        requerido  "AAAA-MM-DD"
     hora         requerido  "HH:MM" en 24 horas, hora de Puerto Rico (7 p.m. = "19:00")
     lugar        requerido  nombre del lugar
     direccion    requerido  dirección con pueblo
     duracionMin  opcional   minutos (por defecto 120); solo se usa para el calendario
     mapa         opcional   enlace https:// de Google Maps; si falta, se busca lugar + dirección
     invitados    opcional   lista: ["Nombre Apellido (moderadora)", "..."]
     notas        opcional   una línea, ej. "Entrada libre"

   Si algo está mal escrito, la página muestra un aviso rojo diciendo qué y dónde.
*/

window.libro = {
  titulo: '"Resilientes" sintecho',
  subtitulo: 'Etnografía de las tecnologías de poder estadounidense en el posdesastre',
  autor: 'Jesús Vélez Méndez',
  resena: 'RESEÑA PENDIENTE — reemplazar con 2 o 3 líneas sobre el libro.',
  portada: 'assets/portada.jpg'
};

window.presentaciones = [
  // EJEMPLOS — reemplazar con las fechas reales antes de compartir el enlace.
  {
    fecha: '2026-10-17',
    hora: '15:00',
    lugar: 'Librería de ejemplo',
    direccion: 'Calle Ejemplo 123, San Juan',
    invitados: ['Nombre Apellido (moderadora)'],
    notas: 'EJEMPLO — entrada libre'
  },
  {
    fecha: '2026-11-12',
    hora: '19:00',
    duracionMin: 90,
    lugar: 'Centro cultural de ejemplo',
    direccion: 'Calle Ejemplo 45, Caguas',
    invitados: ['Nombre Apellido (comentarista)', 'Nombre Apellido (moderador)'],
    notas: 'EJEMPLO'
  },
  {
    fecha: '2026-09-20',
    hora: '18:00',
    lugar: 'Biblioteca de ejemplo',
    direccion: 'Avenida Ejemplo 7, Mayagüez',
    notas: 'EJEMPLO de presentación ya pasada'
  }
];
```

- [ ] **Step 4: Create `index.html`**

`width`/`height` on the cover are the real output size from Step 1.

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>"Resilientes" sintecho — Presentaciones</title>
  <meta name="description" content="Fechas y lugares de las presentaciones del libro &quot;Resilientes&quot; sintecho de Jesús Vélez Méndez.">
  <meta name="theme-color" content="#1c4fd6">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_PR">
  <meta property="og:title" content="&quot;Resilientes&quot; sintecho — Presentaciones">
  <meta property="og:description" content="Etnografía de las tecnologías de poder estadounidense en el posdesastre. Jesús Vélez Méndez. Fechas y lugares de las presentaciones.">
  <meta property="og:image" content="assets/og.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800&family=Montserrat:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="errores" class="errores" role="alert" hidden>
    <p><strong>Hay errores en presentaciones.js</strong> (las entradas con error no se muestran):</p>
    <ul></ul>
  </div>

  <header class="portada">
    <img class="portada__img" data-libro-img src="assets/portada.jpg" width="800" height="1200"
         alt="Portada del libro &quot;Resilientes&quot; sintecho de Jesús Vélez Méndez">
    <div class="portada__texto">
      <p class="portada__antetitulo">Presentaciones del libro</p>
      <h1 class="portada__titulo" data-libro="titulo">"Resilientes" sintecho</h1>
      <p class="portada__subtitulo" data-libro="subtitulo">Etnografía de las tecnologías de poder estadounidense en el posdesastre</p>
      <p class="portada__autor" data-libro="autor">Jesús Vélez Méndez</p>
      <p class="portada__resena" data-libro="resena"></p>
    </div>
  </header>

  <main class="agenda">
    <section aria-labelledby="t-proximas">
      <h2 id="t-proximas" class="agenda__titulo">Próximas presentaciones</h2>
      <ol id="proximas" class="tarjetas"></ol>
      <p id="sin-proximas" class="agenda__vacio" hidden>Pronto anunciaremos nuevas fechas.</p>
    </section>

    <section id="bloque-anteriores" hidden>
      <details class="anteriores">
        <summary class="anteriores__resumen">Presentaciones anteriores</summary>
        <ol id="anteriores" class="tarjetas tarjetas--pasadas"></ol>
      </details>
    </section>
  </main>

  <footer class="pie">
    <p>"Resilientes" sintecho · Jesús Vélez Méndez</p>
  </footer>

  <template id="tpl-tarjeta">
    <li class="tarjeta">
      <div class="tarjeta__fecha" aria-hidden="true">
        <span class="tarjeta__dia"></span>
        <span class="tarjeta__mes"></span>
        <span class="tarjeta__semana"></span>
      </div>
      <div class="tarjeta__cuerpo">
        <span class="tarjeta__badge" hidden>Próxima</span>
        <p class="tarjeta__cuando"><time></time></p>
        <p class="tarjeta__lugar"></p>
        <p class="tarjeta__direccion"></p>
        <p class="tarjeta__invitados" hidden></p>
        <p class="tarjeta__notas" hidden></p>
        <div class="tarjeta__acciones">
          <a class="boton boton--claro tarjeta__mapa" target="_blank" rel="noopener">Cómo llegar</a>
          <div class="calendario">
            <button type="button" class="boton tarjeta__cal" aria-expanded="false">Añadir al calendario</button>
            <div class="calendario__menu" hidden>
              <a class="calendario__opcion calendario__google" target="_blank" rel="noopener">Google Calendar</a>
              <button type="button" class="calendario__opcion calendario__ics">Apple / Outlook (.ics)</button>
            </div>
          </div>
        </div>
      </div>
    </li>
  </template>

  <script src="presentaciones.js"></script>
  <script src="agenda.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `styles.css`**

Contrast (checked):
- white on `--azul` #1c4fd6 ≈ 6.8:1;
- white on `--rojo` #d11f25 ≈ 5.1:1;
- `--tinta` #16213a on `--papel` ≈ 14:1;
- `--tinta-suave` #4a5470 on `--papel` ≈ 6.9:1;
- `--rojo-texto` #b3141a on `--papel` ≈ 6.2:1.

```css
:root {
  --azul: #1c4fd6;
  --azul-hondo: #0e2a86;
  --rojo: #d11f25;
  --rojo-texto: #b3141a;
  --papel: #f6f3ea;
  --tinta: #16213a;
  --tinta-suave: #4a5470;
  --blanco: #ffffff;
  --display: 'Big Shoulders Stencil Display', 'Arial Narrow', Impact, sans-serif;
  --texto: 'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --radio: 6px;
  --sombra: 0 2px 0 rgba(0, 0, 0, .15), 0 10px 24px rgba(0, 0, 0, .25);
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--texto);
  font-size: 1rem;
  line-height: 1.5;
  color: var(--blanco);
  background: var(--azul);
}
/* Fondo: la lona azul de la portada, fija al viewport (iOS ignora background-attachment: fixed). */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(14, 42, 134, .35) 0%, rgba(14, 42, 134, .6) 100%),
    url('assets/lona.jpg') center / cover no-repeat,
    var(--azul);
}
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; }
:focus-visible { outline: 3px solid var(--blanco); outline-offset: 3px; }
.tarjeta :focus-visible { outline-color: var(--azul); }

/* ---------- errores ---------- */
.errores {
  background: #7f0d11;
  color: var(--blanco);
  padding: 12px 16px;
  font-size: .9rem;
  border-bottom: 4px solid var(--rojo);
}
.errores p { margin: 0 0 4px; }
.errores ul { margin: 0; padding-left: 20px; }
.errores li { font-family: ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }

/* ---------- portada ---------- */
.portada {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 16px 8px;
  display: grid;
  gap: 24px;
  justify-items: center;
  text-align: center;
}
.portada__img {
  width: min(60vw, 280px);
  border-radius: 2px;
  box-shadow: var(--sombra);
}
.portada__texto { max-width: 34rem; }
.portada__antetitulo {
  margin: 0 0 4px;
  font-weight: 700;
  font-size: .8rem;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.portada__titulo {
  margin: 0;
  font-family: var(--display);
  font-weight: 800;
  font-size: clamp(2.6rem, 11vw, 4.5rem);
  line-height: .95;
  text-transform: uppercase;
  letter-spacing: .01em;
}
.portada__subtitulo {
  margin: 12px 0 0;
  font-weight: 700;
  text-transform: uppercase;
  font-size: .95rem;
  line-height: 1.3;
}
.portada__autor {
  margin: 14px 0 0;
  font-family: var(--display);
  font-weight: 700;
  font-size: 1.6rem;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.portada__autor::before {
  content: '';
  display: block;
  width: 64px;
  height: 6px;
  margin: 0 auto 10px;
  background: var(--rojo);
}
.portada__resena { margin: 16px 0 0; }
.portada__resena:empty { display: none; }

@media (min-width: 768px) {
  .portada {
    grid-template-columns: 280px 1fr;
    align-items: center;
    justify-items: start;
    text-align: left;
    padding-top: 56px;
    gap: 40px;
  }
  .portada__autor::before { margin-left: 0; }
}

/* ---------- agenda ---------- */
.agenda {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.agenda__titulo {
  margin: 24px 0 16px;
  font-family: var(--display);
  font-weight: 800;
  font-size: 2rem;
  text-transform: uppercase;
  letter-spacing: .02em;
}
.agenda__vacio {
  background: rgba(255, 255, 255, .1);
  border: 2px dashed rgba(255, 255, 255, .5);
  border-radius: var(--radio);
  padding: 20px;
  text-align: center;
  font-weight: 600;
}

.tarjetas { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }

.tarjeta {
  display: grid;
  grid-template-columns: 72px 1fr;
  background: var(--papel);
  color: var(--tinta);
  border-radius: var(--radio);
  box-shadow: var(--sombra);
  overflow: visible;
}
.tarjeta__fecha {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 4px;
  background: var(--rojo);
  color: var(--blanco);
  border-radius: var(--radio) 0 0 var(--radio);
  text-transform: uppercase;
  line-height: 1;
}
.tarjeta__dia { font-family: var(--display); font-weight: 800; font-size: 2.4rem; }
.tarjeta__mes { font-weight: 700; font-size: .85rem; letter-spacing: .08em; margin-top: 4px; }
.tarjeta__semana { font-size: .75rem; margin-top: 4px; }

.tarjeta__cuerpo { padding: 14px 16px 16px; min-width: 0; }
.tarjeta__cuerpo p { margin: 0; overflow-wrap: anywhere; }
.tarjeta__badge {
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rojo);
  color: var(--blanco);
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.tarjeta__badge[hidden] { display: none; }
.tarjeta__cuando { font-weight: 700; color: var(--rojo-texto); }
.tarjeta__cuando::first-letter { text-transform: uppercase; }
.tarjeta__cuerpo .tarjeta__lugar { font-weight: 700; font-size: 1.1rem; margin-top: 4px; }
.tarjeta__direccion, .tarjeta__invitados, .tarjeta__notas { color: var(--tinta-suave); font-size: .95rem; }
.tarjeta__cuerpo .tarjeta__invitados { margin-top: 6px; }
.tarjeta__acciones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

.boton {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--azul);
  border-radius: var(--radio);
  background: var(--azul);
  color: var(--blanco);
  font: 700 .9rem var(--texto);
  text-decoration: none;
  cursor: pointer;
}
.boton:hover { background: var(--azul-hondo); border-color: var(--azul-hondo); }
.boton--claro { background: transparent; color: var(--azul-hondo); }
.boton--claro:hover { background: rgba(28, 79, 214, .08); color: var(--azul-hondo); }

.calendario { position: relative; }
.calendario__menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + 6px);
  left: 0;
  min-width: 230px;
  display: grid;
  background: var(--blanco);
  border-radius: var(--radio);
  box-shadow: var(--sombra);
  padding: 6px;
  animation: aparecer .12s ease-out;
}
.calendario__menu[hidden] { display: none; }
.calendario__opcion {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--tinta);
  font: 600 .9rem var(--texto);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.calendario__opcion:hover { background: var(--papel); }
@keyframes aparecer { from { opacity: 0; transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) { .calendario__menu { animation: none; } }

/* ---------- anteriores ---------- */
.anteriores { margin-top: 40px; }
.anteriores__resumen {
  cursor: pointer;
  font-family: var(--display);
  font-weight: 700;
  font-size: 1.4rem;
  text-transform: uppercase;
  letter-spacing: .02em;
  padding: 8px 0;
}
.anteriores[open] .tarjetas { margin-top: 12px; }
.tarjetas--pasadas .tarjeta { opacity: .85; }
.tarjetas--pasadas .tarjeta__fecha { background: var(--tinta-suave); }

/* ---------- pie ---------- */
.pie { text-align: center; padding: 24px 16px 40px; font-size: .85rem; opacity: .85; }
.pie p { margin: 0; }
```

- [ ] **Step 6: Create `app.js`**

```js
/* Pinta la página a partir de window.libro y window.presentaciones. Toda la lógica vive en agenda.js. */
(function () {
  'use strict';
  const A = window.Agenda;
  const URL_PAGINA = location.href.split(/[?#]/)[0];

  // Si window.libro falta o está incompleto, la portada conserva el texto fijo del HTML.
  const LIBRO_DEFECTO = {
    titulo: '"Resilientes" sintecho',
    subtitulo: 'Etnografía de las tecnologías de poder estadounidense en el posdesastre',
    autor: 'Jesús Vélez Méndez',
    resena: '',
    portada: 'assets/portada.jpg'
  };
  const libroCrudo = (window.libro && typeof window.libro === 'object') ? window.libro : {};
  const libro = {};
  for (const k of Object.keys(LIBRO_DEFECTO)) {
    const v = libroCrudo[k];
    libro[k] = (typeof v === 'string' && v.trim() !== '') ? v : LIBRO_DEFECTO[k];
  }

  function mostrarErrores(errores) {
    const caja = document.getElementById('errores');
    const ul = caja.querySelector('ul');
    for (const e of errores) {
      const li = document.createElement('li');
      li.textContent = e;
      ul.appendChild(li);
    }
    caja.hidden = false;
  }

  function pintarLibro() {
    document.querySelectorAll('[data-libro]').forEach(el => {
      el.textContent = libro[el.dataset.libro];
    });
    document.querySelector('[data-libro-img]').src = libro.portada;
  }

  function tarjeta(p, { pasada, primera }) {
    const nodo = document.getElementById('tpl-tarjeta').content.firstElementChild.cloneNode(true);
    const f = A.formatear(p);
    const q = sel => nodo.querySelector(sel);

    q('.tarjeta__dia').textContent = f.dia;
    q('.tarjeta__mes').textContent = f.mes;
    q('.tarjeta__semana').textContent = f.semana;
    const time = q('time');
    time.dateTime = `${p.fecha}T${p.hora}-04:00`;
    time.textContent = f.completa;
    q('.tarjeta__lugar').textContent = p.lugar;
    q('.tarjeta__direccion').textContent = p.direccion;

    if (Array.isArray(p.invitados) && p.invitados.length) {
      const inv = q('.tarjeta__invitados');
      inv.textContent = `Con: ${p.invitados.join(', ')}`;
      inv.hidden = false;
    }
    if (typeof p.notas === 'string' && p.notas.trim() !== '') {
      const notas = q('.tarjeta__notas');
      notas.textContent = p.notas;
      notas.hidden = false;
    }

    if (pasada) {
      q('.tarjeta__acciones').remove();
      return nodo;
    }

    q('.tarjeta__badge').hidden = !primera;
    const mapa = q('.tarjeta__mapa');
    mapa.href = A.urlMapa(p);
    mapa.setAttribute('aria-label', `Cómo llegar a ${p.lugar}`);

    q('.calendario__google').href = A.urlGoogle(p, libro, URL_PAGINA);
    q('.calendario__ics').addEventListener('click', () => {
      descargar(A.nombreIcs(p), A.ics(p, libro, URL_PAGINA));
      cerrarMenus();
    });
    return nodo;
  }

  function descargar(nombre, texto) {
    const blob = new Blob([texto], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- menú "Añadir al calendario" ----------
  function cerrarMenus(excepto) {
    document.querySelectorAll('.calendario').forEach(c => {
      if (c === excepto) return;
      c.querySelector('.calendario__menu').hidden = true;
      c.querySelector('.tarjeta__cal').setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', e => {
    const boton = e.target.closest('.tarjeta__cal');
    if (boton) {
      const cal = boton.closest('.calendario');
      const menu = cal.querySelector('.calendario__menu');
      const abrir = menu.hidden;
      cerrarMenus(cal);
      menu.hidden = !abrir;
      boton.setAttribute('aria-expanded', String(abrir));
      if (abrir) menu.querySelector('.calendario__opcion').focus();
      return;
    }
    if (!e.target.closest('.calendario')) cerrarMenus();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const abierto = document.querySelector('.calendario__menu:not([hidden])');
    if (!abierto) return;
    const boton = abierto.closest('.calendario').querySelector('.tarjeta__cal');
    cerrarMenus();
    boton.focus();
  });

  // ---------- arranque ----------
  const { errores, validas } = A.validar(window.libro, window.presentaciones);
  if (errores.length) mostrarErrores(errores);
  pintarLibro();

  const { proximas, anteriores } = A.dividir(validas, new Date());

  const olProximas = document.getElementById('proximas');
  proximas.forEach((p, i) => olProximas.appendChild(tarjeta(p, { pasada: false, primera: i === 0 })));
  document.getElementById('sin-proximas').hidden = proximas.length > 0;

  if (anteriores.length) {
    const olAnteriores = document.getElementById('anteriores');
    anteriores.forEach(p => olAnteriores.appendChild(tarjeta(p, { pasada: true, primera: false })));
    document.getElementById('bloque-anteriores').hidden = false;
  }
})();
```

- [ ] **Step 7: Run the unit tests again**

Run: `node --test tests/`
Expected: all tests pass (35), 0 failures. (This confirms nothing in `agenda.js` was touched by accident.)

- [ ] **Step 8: Check the page in a browser**

Run: `python -m http.server 8000` (in the background) and open http://localhost:8000 with browser automation. Check each of these:

1. At **360px** wide:
   - no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth` is `true`;
   - the cover is above the title;
   - two upcoming cards appear, 17 Oct first with the "Próxima" badge (on 2026-09-29 or later, until 17 Oct);
   - "Presentaciones anteriores" is collapsed and opens to the 20 Sept card, with no buttons.
2. At **1280px:** the hero is two columns and cards are ≤ 720px wide.
3. **Añadir al calendario:**
   - the menu opens and `aria-expanded="true"`;
   - Escape closes it and returns focus to the button;
   - clicking outside closes it;
   - the Google link opens with the title, time, place and details filled in.
4. **.ics:** click "Apple / Outlook (.ics)" and check that `presentacion-2026-10-17.ics` downloads. Its content, verified against `A.ics` output in the console, has DTSTART `20261017T190000Z`.
5. **Special characters (Review Focus 3):** temporarily set one entry to `lugar: 'Café <b>& Libros</b>; "Río"'`.
   - The card shows that text literally: no bold, no broken HTML.
   - The "Cómo llegar" link encodes it.
   - Revert the change afterwards.
6. **Validation banner:** temporarily set `hora: '7:00'` on one entry.
   - The red banner reads `presentaciones[N].hora: debe ser HH:MM en 24 horas (ej. 19:00)`.
   - The other cards still render.
   - Revert afterwards.
7. **Empty list:** temporarily set `window.presentaciones = []`.
   - "Pronto anunciaremos nuevas fechas." is shown.
   - The Anteriores section is hidden.
   - Revert afterwards.
8. **Fonts:** the title renders in the stencil display face.
9. **Tarp background:** the tarp texture fills the viewport behind everything, stays put while scrolling, and white text over its lightest creases is still easy to read (check the hero and section headings in the screenshot).

Take a screenshot at 360px and at 1280px and keep them for the review.

- [ ] **Step 9: Commit**

```bash
git add assets/portada.jpg assets/og.jpg assets/lona.jpg presentaciones.js index.html styles.css app.js
git commit -m "feat: agenda page — hero, upcoming/past cards, calendar menu, example data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Netlify config + README

**Files:**
- Create: `netlify.toml`, `README.md`, `.gitignore`

**Interfaces:**
- Consumes: the file names from Tasks 1–5.
- Produces: a repo ready to link to Netlify. The link itself is made **only when the owner asks**.

- [ ] **Step 1: Create `netlify.toml`**

```toml
[build]
  publish = "."

# Los scripts cambian con cada fecha nueva: que el navegador siempre revalide.
[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "no-cache"
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# Originales pesados de imágenes: solo se commitean las versiones web de assets/
*-original.*
Thumbs.db
.DS_Store
```

- [ ] **Step 3: Create `README.md`**

````markdown
# "Resilientes" sintecho — Agenda de presentaciones

Página estática con las presentaciones del libro *"Resilientes" sintecho* de Jesús Vélez Méndez.
Sin build, sin dependencias. **"sintecho" es una sola palabra.**

## Añadir o cambiar una presentación

Edita **solo** `presentaciones.js`. Copia un bloque `{ ... }` dentro de la lista y cambia los datos:

```js
{
  fecha: '2026-10-17',          // AAAA-MM-DD
  hora: '19:00',                // 24 horas, hora de Puerto Rico
  duracionMin: 90,              // opcional (por defecto 120)
  lugar: 'Nombre del lugar',
  direccion: 'Calle 123, Pueblo',
  mapa: 'https://maps.app.goo.gl/...',            // opcional
  invitados: ['Nombre Apellido (moderadora)'],   // opcional
  notas: 'Entrada libre'                           // opcional
},
```

- El orden no importa: la página ordena por fecha.
- Las presentaciones pasadas se mueven solas a "Presentaciones anteriores" al día siguiente. No hay que borrarlas.
- Si algo está mal escrito, la página muestra un aviso rojo con la entrada y el campo.

Después: `git commit` y `git push`. Netlify publica en ~1 minuto.

## Ver localmente

```bash
python -m http.server 8000
# abre http://localhost:8000
```

## Pruebas

```bash
node --test tests/
```

## Archivos

- `presentaciones.js` holds the data (the only file edited day to day).
- `agenda.js` holds the pure logic: validation, PR time, formatting and calendar links. It's what gets tested.
- `app.js` paints the page.
- `index.html` and `styles.css` are the structure and the look.
- `assets/` holds the cover and the share image. To regenerate them, see the implementation plan.

## Publicar (primera vez)

1. Crea un repo en GitHub y haz `git push -u origin main`.
2. En Netlify, **Add new site → Import from Git**, elige el repo. No build command; publish directory `.` (ya está en `netlify.toml`).
3. Cuando exista la URL final, cambia en `index.html` `og:image` a la URL absoluta
   (ej. `https://<sitio>.netlify.app/assets/og.jpg`) y añade `<meta property="og:url" content="https://<sitio>.netlify.app/">`,
   para que WhatsApp y Facebook muestren la portada al compartir.
````

- [ ] **Step 4: Run the tests and check git status**

Run: `node --test tests/ && git status --short`
Expected:
- all tests pass (35);
- only `netlify.toml`, `README.md` and `.gitignore` are untracked;
- no image other than `assets/portada.jpg` and `assets/og.jpg` is in the repo (`git ls-files assets`).

- [ ] **Step 5: Commit**

```bash
git add netlify.toml README.md .gitignore
git commit -m "chore: Netlify config and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan

- Update the vault: add a Recent activity entry in `pasaloVault/10-projects/resilientes-sintecho/resilientes-sintecho.md` and update the `Tasks.md` entry.
- Do not push, create the GitHub repo or create the Netlify site until the owner asks.
- Still needed from the owner: the blurb (`resena`) and the real dates.
