# Vista de admin para las presentaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jesús adds, edits and deletes presentations from his phone through `/admin.html`. The data lives in a Google Sheet, behind an Apps Script that needs a password, and the public page reads from that Sheet.

**Architecture:**
- **Rules:** `agenda.js` stays the one source of validation rules. It runs in the browser, in Node (the tests) and in Apps Script, where a pasted copy leaves `Agenda` in the global scope.
- **Server:** `apps-script/Code.gs` is the backend: `doGet` is public, `doPost` needs the password. It is tested in Node by loading it into a `vm` context with in-memory doubles of the Google services.
- **Loading:** `fuente.js` decides where the public page's presentations come from (Sheet, the browser's saved copy, or the backup in `presentaciones.js`).
- **Admin:** `admin-datos.js` turns the form into a presentation and back, and `admin.js` + `admin.html` are the admin view.

**Tech Stack:** HTML/CSS/vanilla JS with no build step; `node:test` + `node:assert` + `node:vm` (Node 24); Google Apps Script (V8); GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-presentaciones-design.md` (it extends `2026-09-29-agenda-presentaciones-design.md`)

## Global Constraints

- **"sintecho" is ONE word.** Never write "sin techo".
- **Language:** all text Jesús or a visitor sees is in Spanish.
- **No dependencies.** No `package.json` and no npm install. Tests run with bare **`node --test`** (`node --test tests/` fails on Node 24).
- **Text from the Sheet** reaches the DOM only through `textContent` or attributes, never `innerHTML`.
- **POSTs to Apps Script** go as `Content-Type: text/plain;charset=utf-8`. With `application/json` the browser sends a preflight that Apps Script doesn't answer.
- **The password** lives only in the Script Properties as `ADMIN_CLAVE`, never in the repo or the page.
- **Limits:**

  | Field | Limit |
  |---|---|
  | `lugar` | 120 |
  | `direccion` | 200 |
  | `notas` | 200 |
  | `mapa` / `masInfo` | 500 |
  | `invitados` | 10 lines of up to 120 |
  | data rows | 200 |
  | lockout | 10 wrong passwords → 10 min (600 s) |

- **Time zone:** `America/Puerto_Rico` (UTC−4, no DST).
- **Commits:** with the repo's git identity (`cfigueroa0695@gmail.com`), ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Nothing is pushed or merged** without Carlos asking.
- **Layout:** 44 px or larger touch targets, no horizontal scroll at 360 px, AA contrast.

## Review Focus

1. **Cells that Google Sheets turned into a date or time** when Carlos edits by hand ("2026-10-17" → Date, "19:00" → Date). They must be read back as `2026-10-17` / `19:00`, not dropped. *Test: Task 2.*
2. **Phone keyboard:** trailing spaces, blank lines in the guests field, and a password with spaces around it. These must be normalized, never turned into errors. *Tests: Task 2 (password, normalization) and Task 4 (`deFormulario`).*
3. **A Sheet response that arrives after the 6 s wait.** The page already showed the backup or the error, and must still paint the real dates when they arrive. *Test: Task 3.*
4. **Editing or deleting a presentation someone else already deleted.** The answer is "Esa presentación ya no existe." and the list reloads, with no crash and no new row. *Test: Task 2 (the server); `admin.js` reloads in Task 5.*
5. **Corrupt saved copy or blocked storage** (Safari private browsing). The page behaves like a first visit and doesn't throw. *Test: Task 3.*

## File Structure

| File | Responsibility |
|---|---|
| `agenda.js` (modify) | Shared rules: adds `validarPresentacion`, `erroresPorCampo`, `TOPES` and the global export for Apps Script. |
| `apps-script/Code.gs` (create) | Apps Script backend: Sheet ↔ presentations, password, lockout, limits, write lock. |
| `tests/gas-fake.js` (create) | In-memory doubles of the Google services + a loader of `agenda.js` and `Code.gs` into a `vm` context. |
| `tests/apps-script.test.js` (create) | Tests for `Code.gs`. |
| `fuente.js` (create) | Picks and refreshes the public page's list (Sheet / copy / backup), with no DOM. |
| `tests/fuente.test.js` (create) | Tests for `fuente.js`. |
| `presentaciones.js` (modify) | Adds `window.agendaConfig.url`. |
| `app.js` (modify) | `pintarAgenda(lista)` can paint more than once; loading and no-data states; uses `fuente.js`. |
| `index.html` (modify) | Loading / error / Retry states; loads `fuente.js`. |
| `admin-datos.js` (create) | Form ⇄ presentation, with no DOM. |
| `tests/admin-datos.test.js` (create) | Tests for `admin-datos.js`. |
| `admin.html`, `admin.js` (create) | The admin view. |
| `styles.css` (modify) | Loading states + `/* admin */` section. |
| `README.md` (modify) | "Admin" section: Sheet + Apps Script setup, step by step. |

---

### Task 1: Shared rules in `agenda.js`

**Files:**
- Modify: `agenda.js`: replace `erroresDePresentacion` (lines 202–233), and extend the export (lines 267–275)
- Test: `tests/agenda.test.js` (append)

**Interfaces:**
- Produces:
  - `Agenda.validarPresentacion(p) → string[]`: the same problems as `validar()`, without a path (`'fecha: requerido'`).
  - `Agenda.erroresPorCampo(p) → { [campo]: mensajeHumano }`: if `p` is not an object, the key is `general`.
  - `Agenda.TOPES = { lugar:120, direccion:200, notas:200, mapa:500, masInfo:500, invitado:120, invitados:10 }`.
  - In a context with neither `window` nor `module` (Apps Script), `agenda.js` sets `globalThis.Agenda`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/agenda.test.js`:

```js
// ---------- reglas compartidas con el Apps Script ----------

test('validarPresentacion: los mismos problemas que validar(), sin ruta', () => {
  assert.deepEqual(A.validarPresentacion(base()), []);
  assert.deepEqual(A.validarPresentacion({ hora: '7:00' }), [
    'fecha: requerido', 'lugar: requerido', 'direccion: requerido',
    'hora: debe ser HH:MM en 24 horas (ej. 19:00)'
  ]);
  assert.deepEqual(A.validarPresentacion(null), ['debe ser un objeto { ... }']);
});

test('topes: lugar 120, notas 200, invitados 10 de 120', () => {
  assert.deepEqual(A.validarPresentacion(base({ lugar: 'x'.repeat(120) })), []);
  assert.deepEqual(A.validarPresentacion(base({ lugar: 'x'.repeat(121) })), ['lugar: máximo 120 caracteres']);
  assert.deepEqual(A.validarPresentacion(base({ notas: 'n'.repeat(201) })), ['notas: máximo 200 caracteres']);
  const once = Array.from({ length: 11 }, (_, i) => `Invitado ${i}`);
  assert.deepEqual(A.validarPresentacion(base({ invitados: once })),
    ['invitados: máximo 10 invitados de 120 caracteres']);
  assert.deepEqual(A.validar(LIBRO, [base({ lugar: 'x'.repeat(121) })]).errores,
    ['presentaciones[0].lugar: máximo 120 caracteres']);
});

test('erroresPorCampo: mensajes para Jesús, uno por campo', () => {
  assert.deepEqual(A.erroresPorCampo(base()), {});
  assert.deepEqual(A.erroresPorCampo({ fecha: '2026-02-30', direccion: 'D', masInfo: 'http://x', invitados: ['A', ''] }), {
    fecha: 'La fecha no es válida.',
    hora: 'Escoge la hora.',
    lugar: 'Escribe el lugar.',
    masInfo: 'El enlace debe empezar con https://',
    invitados: 'Escribe un nombre por línea.'
  });
  assert.deepEqual(A.erroresPorCampo(base({ notas: 'n'.repeat(201) })), { notas: 'Máximo 200 caracteres.' });
  assert.deepEqual(A.erroresPorCampo(base({ duracionMin: 0 })), { duracionMin: 'Escoge una duración.' });
  assert.deepEqual(A.erroresPorCampo(null), { general: 'La presentación no tiene el formato correcto.' });
});

test('agenda.js deja Agenda en el ámbito global cuando no hay window ni module (Apps Script)', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'agenda.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.Agenda.validarPresentacion, 'function');
  assert.equal(typeof ctx.Agenda.erroresPorCampo, 'function');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test`
Expected: 4 new tests FAIL (`A.validarPresentacion is not a function`, and `ctx.Agenda` undefined). The other 45 tests pass.

- [ ] **Step 3: Implement**

In `agenda.js`, replace the whole `function erroresDePresentacion(p, ruta) { … }` (lines 202–233) with:

```js
  const TOPES = { lugar: 120, direccion: 200, notas: 200, mapa: 500, masInfo: 500, invitado: 120, invitados: 10 };

  // Cada problema es { campo, codigo }. validar() y validarPresentacion() lo escriben en técnico
  // (para quien edita presentaciones.js); erroresPorCampo() en palabras para Jesús.
  function problemas(p) {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) return [{ campo: '', codigo: 'objeto' }];
    const lista = [];
    for (const campo of CAMPOS_REQUERIDOS) {
      if (!esTextoNoVacio(p[campo])) lista.push({ campo, codigo: 'requerido' });
    }
    if (esTextoNoVacio(p.fecha) && !fechaValida(p.fecha)) lista.push({ campo: 'fecha', codigo: 'fecha' });
    if (esTextoNoVacio(p.hora) && !horaValida(p.hora)) lista.push({ campo: 'hora', codigo: 'hora' });
    if (!esAusente(p.duracionMin) && !(Number.isInteger(p.duracionMin) && p.duracionMin > 0)) {
      lista.push({ campo: 'duracionMin', codigo: 'duracion' });
    }
    if (!esAusente(p.invitados)) {
      if (!(Array.isArray(p.invitados) && p.invitados.every(esTextoNoVacio))) {
        lista.push({ campo: 'invitados', codigo: 'invitados' });
      } else if (p.invitados.length > TOPES.invitados || p.invitados.some(i => i.length > TOPES.invitado)) {
        lista.push({ campo: 'invitados', codigo: 'largo' });
      }
    }
    for (const campo of ['mapa', 'masInfo']) {
      const v = p[campo];
      if (!esAusente(v) && !(typeof v === 'string' && v.startsWith('https://'))) lista.push({ campo, codigo: 'https' });
    }
    if (!esAusente(p.notas) && typeof p.notas !== 'string') lista.push({ campo: 'notas', codigo: 'texto' });
    for (const campo of ['lugar', 'direccion', 'notas', 'mapa', 'masInfo']) {
      if (typeof p[campo] === 'string' && p[campo].length > TOPES[campo]) lista.push({ campo, codigo: 'largo' });
    }
    return lista;
  }

  function textoTecnico(campo, codigo) {
    switch (codigo) {
      case 'requerido': return 'requerido';
      case 'fecha': return 'debe ser AAAA-MM-DD y una fecha real';
      case 'hora': return 'debe ser HH:MM en 24 horas (ej. 19:00)';
      case 'duracion': return 'debe ser un número entero de minutos mayor que 0';
      case 'invitados': return 'debe ser una lista de textos, ej. ["Nombre (rol)"]';
      case 'https': return 'debe empezar con https://';
      case 'texto': return 'debe ser texto';
      case 'largo': return campo === 'invitados'
        ? `máximo ${TOPES.invitados} invitados de ${TOPES.invitado} caracteres`
        : `máximo ${TOPES[campo]} caracteres`;
    }
    return codigo;
  }

  const REQUERIDO_HUMANO = {
    fecha: 'Escoge la fecha.', hora: 'Escoge la hora.',
    lugar: 'Escribe el lugar.', direccion: 'Escribe la dirección.'
  };

  function textoHumano(campo, codigo) {
    switch (codigo) {
      case 'objeto': return 'La presentación no tiene el formato correcto.';
      case 'requerido': return REQUERIDO_HUMANO[campo];
      case 'fecha': return 'La fecha no es válida.';
      case 'hora': return 'La hora no es válida.';
      case 'duracion': return 'Escoge una duración.';
      case 'invitados': return 'Escribe un nombre por línea.';
      case 'https': return 'El enlace debe empezar con https://';
      case 'texto': return 'Las notas deben ser texto.';
      case 'largo': return campo === 'invitados'
        ? `Máximo ${TOPES.invitados} invitados, de hasta ${TOPES.invitado} caracteres cada uno.`
        : `Máximo ${TOPES[campo]} caracteres.`;
    }
    return 'Revisa este campo.';
  }

  function erroresDePresentacion(p, ruta) {
    return problemas(p).map(({ campo, codigo }) =>
      codigo === 'objeto' ? `${ruta}: debe ser un objeto { ... }` : `${ruta}.${campo}: ${textoTecnico(campo, codigo)}`);
  }

  function validarPresentacion(p) {
    return problemas(p).map(({ campo, codigo }) =>
      codigo === 'objeto' ? 'debe ser un objeto { ... }' : `${campo}: ${textoTecnico(campo, codigo)}`);
  }

  // { campo: mensaje } con el primer problema de cada campo; sin problemas → {}.
  function erroresPorCampo(p) {
    const salida = {};
    for (const { campo, codigo } of problemas(p)) {
      const llave = campo || 'general';
      if (!(llave in salida)) salida[llave] = textoHumano(campo, codigo);
    }
    return salida;
  }
```

Replace the export block (from `const Agenda = {` to the end of the file) with:

```js
  const Agenda = {
    validar, validarPresentacion, erroresPorCampo, TOPES,
    instante, fin, hoyPR, dividir, horaLegible, formatear, urlMapa, slug, partirTitulo,
    urlInstagramEmbed,
    tituloEvento, descripcion, utcCompacto, urlGoogle, escaparIcs, plegar, ics, nombreIcs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Agenda;
  if (root) root.Agenda = Agenda;
  // Apps Script: no hay window ni module; el archivo "agenda" pegado allí deja Agenda global para Code.gs.
  else if (typeof module === 'undefined' && typeof globalThis !== 'undefined') globalThis.Agenda = Agenda;
})(typeof window !== 'undefined' ? window : null);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test`
Expected: 49 tests, 49 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add agenda.js tests/agenda.test.js
git commit -m "feat: reglas compartidas para el admin — validarPresentacion, erroresPorCampo, topes, export global

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Apps Script backend (`apps-script/Code.gs`)

**Files:**
- Create: `apps-script/Code.gs`, `tests/gas-fake.js`
- Test: `tests/apps-script.test.js`

**Interfaces:**
- Consumes: `Agenda.validarPresentacion`, `Agenda.erroresPorCampo` (Task 1), as a global.
- Produces the HTTP contract that Tasks 3 and 5 depend on:
  - **`GET <url>`** → `{ ok:true, presentaciones:[{id, fecha, hora, lugar, direccion, duracionMin?, mapa?, invitados?:string[], masInfo?, notas?}], invalidas:[{fila:number, id:string, errores:string[]}] }`
  - **`POST <url>`** with a `text/plain` body `{"accion":"verificar"|"crear"|"editar"|"borrar","clave":"…","id"?:"…","presentacion"?:{…}}`
    - success: `{ok:true}` or `{ok:true, presentacion}`
    - failure: `{ok:false, error, campos?}`
    - The exact error messages are in spec §5.2.

- [ ] **Step 1: Write the fake Google services**

Create `tests/gas-fake.js`:

```js
'use strict';
// Dobles en memoria de los servicios de Google que usa apps-script/Code.gs.
// Cargan agenda.js y Code.gs en un contexto vm, igual que Apps Script: todo global, sin module.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DESFASES = { 'America/Puerto_Rico': -4, UTC: 0 };

function crearHoja() {
  const filas = [];
  const formatos = [];
  return {
    filas,
    formatos,
    getLastRow: () => filas.length,
    appendRow: fila => { filas.push(fila.slice()); },
    getDataRange: () => ({ getValues: () => filas.map(f => f.slice()) }),
    getRange: (fila, columna) => {
      if (typeof fila === 'string') return { setNumberFormat: f => { formatos.push([fila, f]); } };
      return { setValues: valores => { valores.forEach((v, i) => { filas[fila - 1 + i] = v.slice(); }); } };
    },
    deleteRow: n => { filas.splice(n - 1, 1); },
    setFrozenRows: () => {}
  };
}

function crearEntorno({ clave = 'secreta', zona = 'America/Puerto_Rico', lockFalla = false } = {}) {
  const hojas = {};
  const cache = {};
  let reloj = 0;   // segundos simulados, solo para la caché
  let uuid = 0;

  const ctx = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => hojas[n] || null,
        insertSheet: n => (hojas[n] = crearHoja()),
        getSpreadsheetTimeZone: () => zona
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: k => (k === 'ADMIN_CLAVE' ? clave : null) })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (cache[k] && cache[k].vence > reloj ? cache[k].valor : null),
        put: (k, v, segundos) => { cache[k] = { valor: String(v), vence: reloj + segundos }; }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { if (lockFalla) throw new Error('Lock timeout'); },
        releaseLock: () => {}
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: texto => ({ setMimeType() { return this; }, getContent: () => texto })
    },
    Utilities: {
      getUuid: () => `uuid-${++uuid}`,
      formatDate: (fecha, z, formato) => {
        const t = new Date(fecha.getTime() + (DESFASES[z] || 0) * 3600 * 1000);
        const dos = n => String(n).padStart(2, '0');
        if (formato === 'yyyy-MM-dd') return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
        if (formato === 'HH:mm') return `${dos(t.getUTCHours())}:${dos(t.getUTCMinutes())}`;
        throw new Error('formato no soportado: ' + formato);
      }
    }
  });

  const raiz = path.join(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(raiz, 'agenda.js'), 'utf8'), ctx, { filename: 'agenda.gs' });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

  // Las respuestas viajan como texto JSON, igual que en la web: se leen en el reino de las pruebas.
  const leer = salida => JSON.parse(salida.getContent());
  return {
    hoja: () => hojas.Presentaciones,
    avanzar: segundos => { reloj += segundos; },
    get: () => leer(ctx.doGet({})),
    post: cuerpo => leer(ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } })),
    postCrudo: contenido => leer(ctx.doPost({ postData: { contents: contenido } }))
  };
}

module.exports = { crearEntorno };
```

- [ ] **Step 2: Write the failing tests**

Create `tests/apps-script.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `node --test`
Expected: the new tests FAIL with `ENOENT … apps-script/Code.gs`. The previous ones pass.

- [ ] **Step 4: Implement `apps-script/Code.gs`**

```js
/**
 * "Resilientes" sintecho — presentaciones (el servidor de admin.html).
 *
 * Vive DENTRO del Google Sheet (Extensiones → Apps Script), junto a un archivo
 * llamado "agenda" con la copia literal de agenda.js: de ahí salen las reglas
 * (Agenda.validarPresentacion / Agenda.erroresPorCampo), las mismas del navegador.
 * Instalación paso a paso: README del repo, sección "Admin".
 *
 * GET  → público: las presentaciones válidas + las filas con errores.
 * POST → con clave (Propiedad del script ADMIN_CLAVE): verificar, crear, editar, borrar.
 * El POST llega como text/plain a propósito (sin preflight).
 */

var HOJA = 'Presentaciones';
var ENCABEZADOS = ['id', 'fecha', 'hora', 'duracionMin', 'lugar', 'direccion', 'mapa', 'invitados', 'masInfo', 'notas', 'actualizado'];
var CAMPOS_TEXTO = ['fecha', 'hora', 'lugar', 'direccion', 'mapa', 'masInfo', 'notas'];
var MAX_FILAS = 200;
var MAX_FALLOS = 10;
var VENTANA_SEGUNDOS = 600;

function doGet() {
  var todo = leerTodo();
  return responder({ ok: true, presentaciones: todo.presentaciones, invalidas: todo.invalidas });
}

function doPost(e) {
  var cuerpo;
  try {
    cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return responder({ ok: false, error: 'Solicitud inválida.' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return responder({ ok: false, error: 'El sistema está ocupado, intenta otra vez.' });
  }

  try {
    var problemaClave = verificarClave(cuerpo.clave);
    if (problemaClave) return responder({ ok: false, error: problemaClave });
    switch (cuerpo.accion) {
      case 'verificar': return responder({ ok: true });
      case 'crear': return responder(crear(cuerpo.presentacion));
      case 'editar': return responder(editar(cuerpo.id, cuerpo.presentacion));
      case 'borrar': return responder(borrar(cuerpo.id));
      default: return responder({ ok: false, error: 'Acción desconocida.' });
    }
  } finally {
    lock.releaseLock();
  }
}

// '' si la clave es buena; si no, el mensaje para mostrar.
// Tras MAX_FALLOS claves malas se rechaza todo (incluida la buena) hasta que caduque el contador.
function verificarClave(clave) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_FALLOS) return 'Demasiados intentos. Espera 10 minutos.';
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_CLAVE');
  if (!real) return 'Falta configurar la clave.';
  if (typeof clave !== 'string' || clave.trim() !== String(real).trim()) {
    cache.put('fallos', String(fallos + 1), VENTANA_SEGUNDOS);
    return 'Clave incorrecta.';
  }
  return '';
}

function crear(entrada) {
  var p = normalizar(entrada);
  var campos = Agenda.erroresPorCampo(p);
  if (Object.keys(campos).length) return { ok: false, error: 'Revisa los campos marcados.', campos: campos };
  var hoja = obtenerHoja();
  if (hoja.getLastRow() - 1 >= MAX_FILAS) {
    return { ok: false, error: 'Se alcanzó el máximo de ' + MAX_FILAS + ' presentaciones.' };
  }
  p.id = Utilities.getUuid();
  hoja.appendRow(aFila(p));
  return { ok: true, presentacion: p };
}

function editar(id, entrada) {
  var hoja = obtenerHoja();
  var fila = buscarFila(hoja, id);
  if (!fila) return { ok: false, error: 'Esa presentación ya no existe.' };
  var p = normalizar(entrada);
  var campos = Agenda.erroresPorCampo(p);
  if (Object.keys(campos).length) return { ok: false, error: 'Revisa los campos marcados.', campos: campos };
  p.id = id;
  hoja.getRange(fila, 1, 1, ENCABEZADOS.length).setValues([aFila(p)]);
  return { ok: true, presentacion: p };
}

function borrar(id) {
  var hoja = obtenerHoja();
  var fila = buscarFila(hoja, id);
  if (!fila) return { ok: false, error: 'Esa presentación ya no existe.' };
  hoja.deleteRow(fila);
  return { ok: true };
}

function leerTodo() {
  var hoja = obtenerHoja();
  var zona = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var valores = hoja.getDataRange().getValues();
  var presentaciones = [];
  var invalidas = [];
  for (var i = 1; i < valores.length; i++) {
    if (valores[i].every(function (v) { return texto(v) === ''; })) continue;   // fila vacía
    var p = deFila(valores[i], zona);
    var errores = p.id ? Agenda.validarPresentacion(p) : ['id: falta; bórrala y créala desde el admin'];
    if (errores.length) invalidas.push({ fila: i + 1, id: p.id || '', errores: errores });
    else presentaciones.push(p);
  }
  return { presentaciones: presentaciones, invalidas: invalidas };
}

// Solo los campos conocidos, recortados; los opcionales vacíos no aparecen.
function normalizar(entrada) {
  var e = (entrada && typeof entrada === 'object') ? entrada : {};
  var p = {};
  CAMPOS_TEXTO.forEach(function (campo) {
    var v = texto(e[campo]);
    if (v) p[campo] = v;
  });
  var duracion = e.duracionMin;
  if (typeof duracion === 'string') duracion = duracion.trim() === '' ? '' : Number(duracion.trim());
  if (duracion !== '' && duracion !== null && duracion !== undefined) p.duracionMin = duracion;
  var invitados = Array.isArray(e.invitados) ? e.invitados
    : (typeof e.invitados === 'string' ? e.invitados.split(/\r?\n/) : []);
  invitados = invitados.map(texto).filter(function (v) { return v !== ''; });
  if (invitados.length) p.invitados = invitados;
  return p;
}

function deFila(fila, zona) {
  var crudo = {};
  for (var c = 0; c < ENCABEZADOS.length; c++) crudo[ENCABEZADOS[c]] = fila[c];
  // Sheets convierte "2026-10-17" y "19:00" escritos a mano en fechas: se vuelven texto.
  if (esFecha(crudo.fecha)) crudo.fecha = Utilities.formatDate(crudo.fecha, zona, 'yyyy-MM-dd');
  if (esFecha(crudo.hora)) crudo.hora = Utilities.formatDate(crudo.hora, zona, 'HH:mm');
  var p = {};
  var id = texto(crudo.id);
  if (id) p.id = id;
  var resto = normalizar(crudo);
  for (var k in resto) p[k] = resto[k];
  return p;
}

function aFila(p) {
  return [p.id, p.fecha, p.hora, p.duracionMin || '', p.lugar, p.direccion, p.mapa || '',
    (p.invitados || []).join('\n'), p.masInfo || '', p.notas || '', new Date()];
}

// Número de fila del Sheet (2 = primera de datos), o 0.
function buscarFila(hoja, id) {
  if (typeof id !== 'string' || !id) return 0;
  var valores = hoja.getDataRange().getValues();
  for (var i = 1; i < valores.length; i++) {
    if (texto(valores[i][0]) === id) return i + 1;
  }
  return 0;
}

function obtenerHoja() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA) || libro.insertSheet(HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS);
    hoja.getRange('B:C').setNumberFormat('@');   // fecha y hora como texto plano
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function esFecha(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `node --test`
Expected: 63 tests, 63 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.gs tests/gas-fake.js tests/apps-script.test.js
git commit -m "feat: Apps Script del admin — Sheet, clave, bloqueo por intentos, topes, lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Where the public page's list comes from (`fuente.js`)

**Files:**
- Create: `fuente.js`
- Test: `tests/fuente.test.js`

**Interfaces:**
- Consumes: the GET contract from Task 2 (`{ok, presentaciones}`).
- Produces:
  - `Fuente.cargarPresentaciones(o) → Promise<'archivo'|'sheet'|'fallo'>`, where `o` contains:

    | Option | Type |
    |---|---|
    | `url` | string |
    | `fetchFn` | `(url) → Promise<{json()}>` |
    | `almacen` | Storage-like or null |
    | `respaldo` | array |
    | `esperaMs` | number, default 6000 |
    | `pintar` | `(lista, origen)` |
    | `cargando` | `()` |
    | `sinDatos` | `()` |
    | `ahora` | `() → number`, optional |

  - `Fuente.LLAVE = 'resilientes.presentaciones.v1'`.
  - `pintar` is never called twice in a row with the same list.

- [ ] **Step 1: Write the failing tests**

Create `tests/fuente.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test`
Expected: FAIL with `Cannot find module '../fuente.js'`.

- [ ] **Step 3: Implement `fuente.js`**

```js
/* De dónde salen las presentaciones de la página pública:
   el Google Sheet (vía Apps Script) → la copia guardada en este navegador → el respaldo de presentaciones.js.
   Sin DOM: recibe fetch, almacenamiento y las funciones de pintar, así se prueba en Node. */
(function (root) {
  'use strict';
  const LLAVE = 'resilientes.presentaciones.v1';

  function leerCopia(almacen) {
    try {
      const crudo = almacen && almacen.getItem(LLAVE);
      if (!crudo) return null;
      const copia = JSON.parse(crudo);
      return copia && Array.isArray(copia.presentaciones) ? copia : null;
    } catch (_) {
      return null;
    }
  }

  function guardarCopia(almacen, presentaciones, ahora) {
    try {
      if (almacen) almacen.setItem(LLAVE, JSON.stringify({ guardado: ahora, presentaciones }));
    } catch (_) { /* sin almacenamiento: la próxima visita será como la primera */ }
  }

  function cargarPresentaciones(o) {
    const respaldo = Array.isArray(o.respaldo) ? o.respaldo : [];
    if (!o.url) {
      o.pintar(respaldo, 'archivo');
      return Promise.resolve('archivo');
    }

    let ultimo = null;   // JSON de lo último pintado, para no repintar lo mismo
    const pintar = (lista, origen) => {
      const json = JSON.stringify(lista);
      if (json === ultimo) return;
      ultimo = json;
      o.pintar(lista, origen);
    };

    const copia = leerCopia(o.almacen);
    if (copia) pintar(copia.presentaciones, 'copia');
    else o.cargando();

    const respuesta = Promise.resolve()
      .then(() => o.fetchFn(o.url))
      .then(r => r.json())
      .then(datos => {
        if (!datos || datos.ok !== true || !Array.isArray(datos.presentaciones)) throw new Error('respuesta inválida');
        pintar(datos.presentaciones, 'sheet');   // aunque llegue tarde, las fechas reales siempre se pintan
        guardarCopia(o.almacen, datos.presentaciones, o.ahora ? o.ahora() : Date.now());
        return 'sheet';
      })
      .catch(() => 'fallo');

    let temporizador;
    const plazo = new Promise(r => { temporizador = setTimeout(() => r('plazo'), o.esperaMs == null ? 6000 : o.esperaMs); });
    const alternativa = Promise.race([respuesta, plazo]).then(primero => {
      clearTimeout(temporizador);
      if (primero === 'sheet' || copia) return;
      if (respaldo.length) pintar(respaldo, 'respaldo');
      else o.sinDatos();
    });

    return Promise.all([respuesta, alternativa]).then(([final]) => final);
  }

  const Fuente = { cargarPresentaciones, LLAVE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Fuente;
  if (root) root.Fuente = Fuente;
})(typeof window !== 'undefined' ? window : null);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test`
Expected: 72 tests, 72 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add fuente.js tests/fuente.test.js
git commit -m "feat: fuente.js — Sheet, copia guardada o respaldo para la página pública

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Form ⇄ presentation (`admin-datos.js`) and the public page reading from the Sheet

**Files:**
- Create: `admin-datos.js`, `tests/admin-datos.test.js`
- Modify: `presentaciones.js` (top of file), `app.js` (lines 196–211, the startup), `index.html` (`Próximas` section + script list), `styles.css` (after `.agenda__vacio`)

**Interfaces:**
- Consumes: `Fuente.cargarPresentaciones` (Task 3), `Agenda.validarPresentacion` (Task 1).
- Produces:
  - `AdminDatos.deFormulario(valores) → presentacion`, where `valores = {fecha, hora, lugar, direccion, invitados (text with \n), notas, masInfo, duracionMin (string), mapa}`.
  - `AdminDatos.aFormulario(p) → valores`.
  - `AdminDatos.DURACIONES = [60, 90, 120, 180]`.
  - `window.agendaConfig = { url }`.
  - In `index.html`: the ids `cargando`, `sin-datos`, `reintentar`.

- [ ] **Step 1: Write the failing tests**

Create `tests/admin-datos.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test`
Expected: FAIL with `Cannot find module '../admin-datos.js'`.

- [ ] **Step 3: Implement `admin-datos.js`**

```js
/* Formulario del admin ⇄ presentación. Sin DOM, para probarlo en Node. */
(function (root) {
  'use strict';
  const DURACIONES = [60, 90, 120, 180];
  const DURACION_DEFECTO = 120;
  const TEXTOS = ['fecha', 'hora', 'lugar', 'direccion', 'notas', 'masInfo', 'mapa'];

  function deFormulario(v) {
    const p = {};
    for (const campo of TEXTOS) {
      const t = String(v[campo] == null ? '' : v[campo]).trim();
      if (t) p[campo] = t;
    }
    const invitados = String(v.invitados || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (invitados.length) p.invitados = invitados;
    const duracion = Number(v.duracionMin);
    if (duracion && duracion !== DURACION_DEFECTO) p.duracionMin = duracion;
    return p;
  }

  function aFormulario(p) {
    return {
      fecha: p.fecha || '', hora: p.hora || '', lugar: p.lugar || '', direccion: p.direccion || '',
      invitados: (p.invitados || []).join('\n'), notas: p.notas || '', masInfo: p.masInfo || '',
      duracionMin: String(p.duracionMin || DURACION_DEFECTO), mapa: p.mapa || ''
    };
  }

  const AdminDatos = { DURACIONES, deFormulario, aFormulario };
  if (typeof module !== 'undefined' && module.exports) module.exports = AdminDatos;
  if (root) root.AdminDatos = AdminDatos;
})(typeof window !== 'undefined' ? window : null);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test`
Expected: 75 tests, 75 pass, 0 fail.

- [ ] **Step 5: Wire the public page to `fuente.js`**

At the top of `presentaciones.js`, right after the opening comment, insert:

```js
// Dirección /exec del Apps Script del Google Sheet (README → "Admin").
// Vacía: la página usa la lista window.presentaciones de abajo.
// Puesta: las fechas salen del Sheet (las maneja Jesús en admin.html) y la lista de abajo es solo respaldo.
window.agendaConfig = { url: '' };
```

In `index.html`, replace:

```html
      <ol id="proximas" class="tarjetas"></ol>
      <p id="sin-proximas" class="agenda__vacio" hidden>Pronto anunciaremos nuevas fechas.</p>
```

with:

```html
      <ol id="proximas" class="tarjetas"></ol>
      <p id="cargando" class="agenda__vacio" hidden>Cargando fechas…</p>
      <div id="sin-datos" class="agenda__vacio" hidden>
        <p>No pudimos cargar las fechas.</p>
        <button type="button" id="reintentar" class="boton">Reintentar</button>
      </div>
      <p id="sin-proximas" class="agenda__vacio" hidden>Pronto anunciaremos nuevas fechas.</p>
```

and, in the script loader, `['presentaciones.js', 'agenda.js', 'app.js']` → `['presentaciones.js', 'agenda.js', 'fuente.js', 'app.js']`.

In `styles.css`, right after the `.agenda__vacio { … }` rule, add:

```css
.agenda__vacio p { margin: 0 0 12px; }
.agenda__vacio[hidden] { display: none; }
```

In `app.js`, replace the whole block from `// ---------- arranque ----------` to the end of the IIFE (lines 196–211, before `})();`) with:

```js
  // ---------- agenda: se puede pintar más de una vez (copia guardada → Sheet) ----------
  const olProximas = document.getElementById('proximas');
  const olAnteriores = document.getElementById('anteriores');
  const estadoCargando = document.getElementById('cargando');
  const estadoSinDatos = document.getElementById('sin-datos');
  const sinProximas = document.getElementById('sin-proximas');

  function pintarAgenda(lista) {
    estadoCargando.hidden = true;
    estadoSinDatos.hidden = true;
    const validas = lista.filter(p => A.validarPresentacion(p).length === 0);
    const { proximas, anteriores } = A.dividir(validas, new Date());
    olProximas.replaceChildren(...proximas.map((p, i) => tarjeta(p, { pasada: false, primera: i === 0 })));
    sinProximas.hidden = proximas.length > 0;
    olAnteriores.replaceChildren(...anteriores.map(p => tarjeta(p, { pasada: true, primera: false })));
    document.getElementById('bloque-anteriores').hidden = anteriores.length === 0;
  }

  function cargando() {
    estadoCargando.hidden = false;
    estadoSinDatos.hidden = true;
    sinProximas.hidden = true;
  }

  function sinDatos() {
    estadoCargando.hidden = true;
    estadoSinDatos.hidden = false;
    sinProximas.hidden = true;
  }

  function almacenLocal() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  function cargar() {
    window.Fuente.cargarPresentaciones({
      url: (window.agendaConfig && window.agendaConfig.url) || '',
      fetchFn: url => fetch(url),
      almacen: almacenLocal(),
      respaldo: Array.isArray(window.presentaciones) ? window.presentaciones : [],
      esperaMs: 6000,
      pintar: pintarAgenda,
      cargando,
      sinDatos
    });
  }

  // ---------- arranque ----------
  // El aviso rojo es solo para errores de presentaciones.js (lo edita Carlos), nunca por filas del Sheet.
  const { errores } = A.validar(window.libro, window.presentaciones);
  if (errores.length) mostrarErrores(errores);
  pintarLibro();
  document.getElementById('reintentar').addEventListener('click', cargar);
  cargar();
```

- [ ] **Step 6: Run the tests, then check in the browser**

Run: `node --test`
Expected: 75/75 pass.

Then run `python -m http.server 8765` (in the background) and check in the browser:

1. **Without a URL** (`agendaConfig.url = ''`): http://localhost:8765/ looks exactly as before. The 3 example cards, the "Próxima" badge and Anteriores all appear, and the console shows no errors.
2. **With a fake Sheet:**
   - Create `C:/Users/CARLOS~1/AppData/Local/Temp/.../scratchpad/sheet-falso.json` and serve it from the repo as `sheet-falso.json` (a temporary copy, **never committed**). Its content: `{"ok":true,"presentaciones":[{"id":"x","fecha":"2026-12-01","hora":"18:00","lugar":"Desde el Sheet","direccion":"Calle 1"}],"invalidas":[]}`.
   - Set `agendaConfig.url = 'sheet-falso.json'` and `window.presentaciones = []` temporarily, and load with `localStorage` cleared.
   - Expected: a single card, "Desde el Sheet", and `localStorage['resilientes.presentaciones.v1']` saved.
   - Reload: the card appears instantly, from the copy.
3. **Sheet down:** set `agendaConfig.url = 'https://no-existe.invalid/exec'` and clear `localStorage`. Expected: "Cargando fechas…", then "No pudimos cargar las fechas." with a working **Reintentar**. No red banner.
4. **Clean up:** restore `agendaConfig.url = ''` and the example list, and delete `sheet-falso.json`. `git status` should show only the intended files.

- [ ] **Step 7: Commit**

```bash
git add admin-datos.js tests/admin-datos.test.js presentaciones.js app.js index.html styles.css
git commit -m "feat: la página pública lee del Sheet (con copia y respaldo); datos del formulario del admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The admin view (`admin.html` + `admin.js`)

**Files:**
- Create: `admin.html`, `admin.js`
- Modify: `styles.css` (append a `/* admin */` section at the end)

**Interfaces:**
- Consumes:
  - `window.agendaConfig.url` and the HTTP contract (Task 2);
  - `Agenda.dividir`, `Agenda.formatear`, `Agenda.erroresPorCampo`;
  - `AdminDatos.deFormulario`, `AdminDatos.aFormulario`.
- Produces: the page `/admin.html`.

- [ ] **Step 1: Create `admin.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin · Presentaciones</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#1c4fd6">
  <meta name="color-scheme" content="only light">
  <meta name="darkreader-lock">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800&family=Montserrat:wght@400;600;700&display=swap">
  <script>window.VERSION_CARGA = Date.now();</script>
  <script>document.write('<link rel="stylesheet" href="styles.css?t=' + window.VERSION_CARGA + '">');</script>
</head>
<body>
  <header class="admin__cabecera">
    <p class="admin__marca">"Resilientes" <span class="admin__sin">sin</span>techo</p>
    <h1 class="admin__titulo">Admin · Presentaciones</h1>
    <p class="admin__enlaces">
      <a href="./" target="_blank" rel="noopener">Ver la página</a>
      <button type="button" id="salir" class="admin__salir" hidden>Salir</button>
    </p>
  </header>

  <main class="admin__main">
    <div id="aviso" class="admin__aviso" role="status" aria-live="polite" hidden></div>

    <form id="entrar" class="admin__panel" novalidate>
      <h2>Entrar</h2>
      <label for="clave">Clave</label>
      <input id="clave" name="clave" type="password" autocomplete="current-password"
             autocapitalize="off" autocorrect="off" spellcheck="false">
      <label class="admin__casilla"><input id="recordar" type="checkbox" checked> Recordar en este teléfono</label>
      <p class="admin__error" id="error-entrar" hidden></p>
      <div class="admin__botones"><button type="submit" class="boton boton--comprar">Entrar</button></div>
    </form>

    <section id="panel" hidden>
      <button type="button" id="nueva" class="boton boton--comprar admin__nueva">+ Añadir presentación</button>

      <div id="invalidas" class="admin__invalidas" hidden>
        <p><strong></strong></p>
        <ul></ul>
      </div>

      <form id="formulario" class="admin__panel" novalidate hidden>
        <h2 id="titulo-formulario">Nueva presentación</h2>

        <label for="f-fecha">Fecha</label>
        <input id="f-fecha" name="fecha" type="date">
        <p class="admin__error" data-error-de="fecha" hidden></p>

        <label for="f-hora">Hora</label>
        <input id="f-hora" name="hora" type="time">
        <p class="admin__error" data-error-de="hora" hidden></p>

        <label for="f-lugar">Lugar</label>
        <input id="f-lugar" name="lugar" type="text" maxlength="120" placeholder="Ej. Librería Mágica">
        <p class="admin__error" data-error-de="lugar" hidden></p>

        <label for="f-direccion">Dirección</label>
        <input id="f-direccion" name="direccion" type="text" maxlength="200" placeholder="Calle, número, pueblo">
        <p class="admin__error" data-error-de="direccion" hidden></p>

        <label for="f-invitados">Invitados <span>(opcional, un nombre por línea)</span></label>
        <textarea id="f-invitados" name="invitados" rows="3" placeholder="Nombre Apellido (moderadora)"></textarea>
        <p class="admin__error" data-error-de="invitados" hidden></p>

        <label for="f-notas">Notas <span>(opcional)</span></label>
        <input id="f-notas" name="notas" type="text" maxlength="200" placeholder="Ej. Entrada libre">
        <p class="admin__error" data-error-de="notas" hidden></p>

        <label for="f-masInfo">Enlace "Más información" <span>(opcional)</span></label>
        <input id="f-masInfo" name="masInfo" type="url" inputmode="url" placeholder="https://…">
        <p class="admin__error" data-error-de="masInfo" hidden></p>

        <label for="f-duracionMin">Duración <span>(para el calendario)</span></label>
        <select id="f-duracionMin" name="duracionMin">
          <option value="60">1 hora</option>
          <option value="90">1 hora 30 minutos</option>
          <option value="120" selected>2 horas</option>
          <option value="180">3 horas</option>
        </select>
        <p class="admin__error" data-error-de="duracionMin" hidden></p>

        <details class="admin__avanzadas">
          <summary>Opciones avanzadas</summary>
          <label for="f-mapa">Enlace del mapa <span>(si se deja vacío, se busca el lugar y la dirección)</span></label>
          <input id="f-mapa" name="mapa" type="url" inputmode="url" placeholder="https://maps.app.goo.gl/…">
          <p class="admin__error" data-error-de="mapa" hidden></p>
        </details>

        <p class="admin__error" id="error-formulario" hidden></p>
        <div class="admin__botones">
          <button type="submit" id="guardar" class="boton boton--comprar">Guardar</button>
          <button type="button" id="cancelar" class="boton boton--claro">Cancelar</button>
        </div>
      </form>

      <h2 class="admin__seccion">Próximas</h2>
      <ol id="lista-proximas" class="tarjetas"></ol>
      <p id="vacio-proximas" class="admin__vacio" hidden>No hay presentaciones próximas.</p>

      <details class="anteriores">
        <summary class="anteriores__resumen">Anteriores</summary>
        <ol id="lista-anteriores" class="tarjetas tarjetas--pasadas"></ol>
      </details>
    </section>
  </main>

  <template id="tpl-admin-tarjeta">
    <li class="tarjeta">
      <div class="tarjeta__fecha" aria-hidden="true">
        <span class="tarjeta__dia"></span>
        <span class="tarjeta__mes"></span>
        <span class="tarjeta__semana"></span>
      </div>
      <div class="tarjeta__cuerpo">
        <p class="tarjeta__cuando"></p>
        <p class="tarjeta__lugar"></p>
        <p class="tarjeta__direccion"></p>
        <div class="tarjeta__acciones">
          <button type="button" class="boton boton--claro" data-accion="editar">Editar</button>
          <button type="button" class="boton boton--claro admin__borrar" data-accion="borrar">Borrar</button>
        </div>
        <div class="admin__confirmar" hidden>
          <p class="admin__pregunta"></p>
          <button type="button" class="boton boton--comprar" data-accion="confirmar">Sí, borrar</button>
          <button type="button" class="boton boton--claro" data-accion="cancelar-borrar">Cancelar</button>
        </div>
      </div>
    </li>
  </template>

  <script>
    ['presentaciones.js', 'agenda.js', 'admin-datos.js', 'admin.js'].forEach(function (f) {
      document.write('<script src="' + f + '?t=' + window.VERSION_CARGA + '"><\/script>');
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Create `admin.js`**

```js
/* Vista de admin: entra con la clave y maneja las presentaciones del Google Sheet. Todo texto va con textContent. */
(function () {
  'use strict';
  const A = window.Agenda;
  const D = window.AdminDatos;
  const URL_API = (window.agendaConfig && window.agendaConfig.url) || '';
  const LLAVE_CLAVE = 'resilientes.admin.clave';
  const CAMPOS = ['fecha', 'hora', 'lugar', 'direccion', 'invitados', 'notas', 'masInfo', 'duracionMin', 'mapa'];
  const $ = id => document.getElementById(id);
  const form = $('formulario');

  let clave = '';
  let lista = [];
  let editando = null;   // id de la presentación que se edita; null = nueva

  // ---------- clave guardada ----------
  function almacen(nombre) {
    try { return window[nombre]; } catch (_) { return null; }
  }
  function claveGuardada() {
    for (const [nombre, recordar] of [['localStorage', true], ['sessionStorage', false]]) {
      try {
        const valor = almacen(nombre) && almacen(nombre).getItem(LLAVE_CLAVE);
        if (valor) return { valor, recordar };
      } catch (_) { /* almacenamiento bloqueado */ }
    }
    return null;
  }
  function guardarClave(valor, recordar) {
    try { almacen(recordar ? 'localStorage' : 'sessionStorage').setItem(LLAVE_CLAVE, valor); } catch (_) { /* nada */ }
  }
  function olvidarClave() {
    for (const nombre of ['localStorage', 'sessionStorage']) {
      try { almacen(nombre).removeItem(LLAVE_CLAVE); } catch (_) { /* nada */ }
    }
  }

  // ---------- servidor ----------
  async function leer() {
    const r = await fetch(URL_API);
    const datos = await r.json();
    if (!datos.ok) throw new Error(datos.error || 'No se pudo leer.');
    return datos;
  }

  // text/plain a propósito: con application/json el navegador manda un preflight que Apps Script no contesta.
  async function enviar(accion, extra) {
    try {
      const r = await fetch(URL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ accion, clave }, extra || {}))
      });
      return await r.json();
    } catch (_) {
      return { ok: false, error: 'No se pudo conectar. Revisa tu conexión e intenta otra vez.' };
    }
  }

  // ---------- avisos ----------
  let temporizadorAviso;
  function avisar(texto, tipo) {
    const aviso = $('aviso');
    aviso.textContent = texto;
    aviso.className = 'admin__aviso' + (tipo === 'error' ? ' admin__aviso--error' : '');
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    if (tipo !== 'error') temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 5000);
  }

  // ---------- entrar / salir ----------
  async function entrar(valor, recordar) {
    clave = String(valor || '').trim();
    const r = await enviar('verificar');
    if (!r.ok) { clave = ''; return r.error; }
    guardarClave(clave, recordar);
    $('entrar').hidden = true;
    $('panel').hidden = false;
    $('salir').hidden = false;
    await recargar();
    return '';
  }

  function mostrarErrorEntrar(texto) {
    const error = $('error-entrar');
    error.textContent = texto;
    error.hidden = !texto;
  }

  $('entrar').addEventListener('submit', async e => {
    e.preventDefault();
    mostrarErrorEntrar('');
    const boton = $('entrar').querySelector('button[type=submit]');
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    const problema = await entrar($('clave').value, $('recordar').checked);
    boton.disabled = false;
    boton.textContent = 'Entrar';
    if (problema) { mostrarErrorEntrar(problema); $('clave').focus(); }
  });

  $('salir').addEventListener('click', () => { olvidarClave(); location.reload(); });

  // ---------- lista ----------
  async function recargar() {
    let datos;
    try {
      datos = await leer();
    } catch (_) {
      avisar('No se pudo cargar la lista. Revisa tu conexión.', 'error');
      return;
    }
    lista = datos.presentaciones;
    pintarLista();
    pintarInvalidas(datos.invalidas || []);
  }

  function pintarLista() {
    const { proximas, anteriores } = A.dividir(lista, new Date());
    $('lista-proximas').replaceChildren(...proximas.map(tarjetaAdmin));
    $('vacio-proximas').hidden = proximas.length > 0;
    $('lista-anteriores').replaceChildren(...anteriores.map(tarjetaAdmin));
  }

  function pintarInvalidas(invalidas) {
    const caja = $('invalidas');
    caja.hidden = invalidas.length === 0;
    if (!invalidas.length) return;
    caja.querySelector('strong').textContent = invalidas.length === 1
      ? 'Hay 1 fila en el Sheet con errores (no aparece en la página):'
      : `Hay ${invalidas.length} filas en el Sheet con errores (no aparecen en la página):`;
    caja.querySelector('ul').replaceChildren(...invalidas.map(f => {
      const li = document.createElement('li');
      li.textContent = `Fila ${f.fila}: ${f.errores.join('; ')}`;
      return li;
    }));
  }

  function tarjetaAdmin(p) {
    const nodo = $('tpl-admin-tarjeta').content.firstElementChild.cloneNode(true);
    const f = A.formatear(p);
    const q = s => nodo.querySelector(s);
    q('.tarjeta__dia').textContent = f.dia;
    q('.tarjeta__mes').textContent = f.mes;
    q('.tarjeta__semana').textContent = f.semana;
    q('.tarjeta__cuando').textContent = f.completa;
    q('.tarjeta__lugar').textContent = p.lugar;
    q('.tarjeta__direccion').textContent = p.direccion;
    q('.admin__pregunta').textContent = `¿Borrar la presentación del ${f.completa} en ${p.lugar}?`;
    nodo.dataset.id = p.id;
    return nodo;
  }

  document.addEventListener('click', async e => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const tarjeta = boton.closest('.tarjeta');
    const id = tarjeta.dataset.id;
    const confirmar = tarjeta.querySelector('.admin__confirmar');
    switch (boton.dataset.accion) {
      case 'editar': {
        const p = lista.find(x => x.id === id);
        if (p) abrirFormulario(p);
        break;
      }
      case 'borrar':
        confirmar.hidden = false;
        confirmar.querySelector('[data-accion="cancelar-borrar"]').focus();
        break;
      case 'cancelar-borrar':
        confirmar.hidden = true;
        break;
      case 'confirmar': {
        boton.disabled = true;
        boton.textContent = 'Borrando…';
        const r = await enviar('borrar', { id });
        if (r.ok) {
          avisar('Borrada. Ya no aparece en la página.');
          await recargar();
        } else {
          boton.disabled = false;
          boton.textContent = 'Sí, borrar';
          avisar(r.error, 'error');
          if (r.error === 'Esa presentación ya no existe.') await recargar();
        }
        break;
      }
    }
  });

  // ---------- formulario ----------
  function abrirFormulario(p) {
    editando = p ? p.id : null;
    $('titulo-formulario').textContent = p ? 'Editar presentación' : 'Nueva presentación';
    const valores = D.aFormulario(p || {});
    asegurarDuracion(valores.duracionMin);
    for (const campo of CAMPOS) form.elements[campo].value = valores[campo];
    form.querySelector('.admin__avanzadas').open = Boolean(valores.mapa);
    limpiarErrores();
    form.hidden = false;
    $('nueva').hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.fecha.focus({ preventScroll: true });
  }

  // Una duración escrita a mano en el Sheet (ej. 45) que no está en la lista se añade como opción.
  function asegurarDuracion(valor) {
    const select = form.elements.duracionMin;
    if ([...select.options].some(o => o.value === valor)) return;
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = `${valor} minutos`;
    select.appendChild(opcion);
  }

  function cerrarFormulario() {
    form.hidden = true;
    $('nueva').hidden = false;
    editando = null;
  }

  function limpiarErrores() {
    form.querySelectorAll('[data-error-de]').forEach(p => { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    $('error-formulario').hidden = true;
  }

  function mostrarErrores(campos) {
    let primero = null;
    for (const [campo, mensaje] of Object.entries(campos)) {
      const p = form.querySelector(`[data-error-de="${campo}"]`);
      const control = form.elements[campo];
      if (p) { p.textContent = mensaje; p.hidden = false; }
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        if (!primero) primero = control;
      }
      if (campo === 'mapa') form.querySelector('.admin__avanzadas').open = true;
    }
    if (primero) primero.focus();
  }

  $('nueva').addEventListener('click', () => abrirFormulario(null));
  $('cancelar').addEventListener('click', cerrarFormulario);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    limpiarErrores();
    const valores = {};
    for (const campo of CAMPOS) valores[campo] = form.elements[campo].value;
    const presentacion = D.deFormulario(valores);
    const campos = A.erroresPorCampo(presentacion);
    if (Object.keys(campos).length) { mostrarErrores(campos); return; }

    const guardar = $('guardar');
    guardar.disabled = true;
    guardar.textContent = 'Guardando…';
    const r = editando
      ? await enviar('editar', { id: editando, presentacion })
      : await enviar('crear', { presentacion });
    guardar.disabled = false;
    guardar.textContent = 'Guardar';

    if (r.ok) {
      cerrarFormulario();
      avisar('Guardado. Ya aparece en la página.');
      await recargar();
      return;
    }
    if (r.campos) mostrarErrores(r.campos);   // el formulario conserva lo escrito
    const error = $('error-formulario');
    error.textContent = r.error;
    error.hidden = false;
    if (r.error === 'Esa presentación ya no existe.') { cerrarFormulario(); await recargar(); }
  });

  // ---------- arranque ----------
  if (!URL_API) {
    $('entrar').hidden = true;
    avisar('Falta configurar la dirección del Google Sheet (agendaConfig.url en presentaciones.js).', 'error');
    return;
  }
  const guardada = claveGuardada();
  if (guardada) {
    entrar(guardada.valor, guardada.recordar).then(problema => {
      if (!problema) return;
      if (problema === 'Clave incorrecta.') olvidarClave();   // con "Demasiados intentos" la clave puede ser buena
      mostrarErrorEntrar(problema);
    });
  }
})();
```

- [ ] **Step 3: Admin styles**

Append to the end of `styles.css`:

```css
/* ---------- admin ---------- */
.admin__cabecera { max-width: 640px; margin: 0 auto; padding: 32px 16px 8px; text-align: center; }
.admin__marca { margin: 0; font-family: var(--display); font-weight: 800; font-size: 1.5rem; text-transform: uppercase; letter-spacing: .02em; }
.admin__sin { color: var(--rojo-portada); }
.admin__titulo { margin: 4px 0 0; font-family: var(--display); font-weight: 800; font-size: 2.2rem; line-height: 1; text-transform: uppercase; }
.admin__enlaces { display: flex; justify-content: center; align-items: center; gap: 20px; margin: 8px 0 0; font-size: .95rem; }
.admin__enlaces a, .admin__salir { display: inline-flex; align-items: center; min-height: 44px; color: inherit; }
.admin__salir { background: none; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
.admin__salir[hidden] { display: none; }
.admin__main { max-width: 640px; margin: 0 auto; padding: 8px 16px 48px; }

.admin__panel {
  display: grid; gap: 6px; margin: 16px 0; padding: 20px 16px;
  background: var(--papel); color: var(--tinta); border-radius: var(--radio); box-shadow: var(--sombra);
}
.admin__panel[hidden] { display: none; }
.admin__panel h2 { margin: 0 0 4px; font-family: var(--display); font-size: 1.7rem; text-transform: uppercase; }
.admin__panel label { margin-top: 10px; font-weight: 700; }
.admin__panel label span { font-weight: 400; color: var(--tinta-suave); }
.admin__panel input:not([type=checkbox]), .admin__panel select, .admin__panel textarea {
  width: 100%; min-height: 44px; padding: 10px 12px;
  border: 2px solid #b9b2a0; border-radius: var(--radio);
  background: var(--blanco); color: var(--tinta); font: 1rem var(--texto);
}
.admin__panel textarea { min-height: 88px; resize: vertical; }
.admin__panel [aria-invalid="true"] { border-color: var(--rojo-texto); }
.admin__panel :focus-visible { outline: 3px solid var(--azul); outline-offset: 2px; }
.admin__casilla { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.admin__casilla input { width: 22px; height: 22px; }
.admin__error { margin: 2px 0 0; color: var(--rojo-texto); font-weight: 600; font-size: .9rem; }
.admin__error[hidden] { display: none; }
.admin__botones { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.admin__avanzadas { margin-top: 10px; }
.admin__avanzadas summary { display: flex; align-items: center; min-height: 44px; font-weight: 600; cursor: pointer; }

.admin__nueva { width: 100%; justify-content: center; min-height: 52px; margin: 16px 0 4px; font-size: 1.05rem; }
.admin__nueva[hidden] { display: none; }
.admin__seccion { margin: 28px 0 12px; font-family: var(--display); font-weight: 800; font-size: 1.8rem; text-transform: uppercase; }
.admin__vacio { padding: 16px; text-align: center; border: 2px dashed rgba(255, 255, 255, .5); border-radius: var(--radio); background: rgba(255, 255, 255, .1); }
.admin__vacio[hidden] { display: none; }

.admin__aviso { position: sticky; top: 8px; z-index: 20; margin: 12px 0; padding: 12px 16px; border-radius: var(--radio); background: #e7f6ec; color: #14532d; font-weight: 700; box-shadow: var(--sombra); }
.admin__aviso--error { background: #fdecec; color: #8a1116; }
.admin__aviso[hidden] { display: none; }
.admin__invalidas { margin: 12px 0; padding: 12px 16px; border-radius: var(--radio); background: #fff4d6; color: #5c4400; }
.admin__invalidas p { margin: 0; }
.admin__invalidas ul { margin: 6px 0 0; padding-left: 20px; }
.admin__invalidas[hidden] { display: none; }

.admin__confirmar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd6c4; }
.admin__confirmar[hidden] { display: none; }
.tarjeta__cuerpo .admin__pregunta { width: 100%; margin: 0; font-weight: 700; }
.boton.admin__borrar { border-color: var(--rojo-texto); color: var(--rojo-texto); }
```

- [ ] **Step 4: Run the tests and check the empty view in the browser**

Run: `node --test`
Expected: 75/75 pass. No logic changed in this task, so this run is just a guard.

With `python -m http.server 8765` running and `agendaConfig.url = ''`:
- open http://localhost:8765/admin.html;
- expected: the red notice "Falta configurar la dirección del Google Sheet…", no login form, and no console errors;
- at 360 px wide, `document.documentElement.scrollWidth <= innerWidth` is `true`.

The full flow (login, add, edit, delete) is tested in Task 6 against the real Apps Script.

- [ ] **Step 5: Commit**

```bash
git add admin.html admin.js styles.css
git commit -m "feat: vista de admin — entrar con clave, añadir, editar y borrar presentaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README, connecting the real Sheet, end-to-end check

**Files:**
- Modify: `README.md` (new "Admin" section), `presentaciones.js` (`agendaConfig.url` and empty the example list *once Carlos has the URL*)

**Interfaces:**
- Consumes: everything above.
- Produces: the site reading from the real Sheet, and instructions for Carlos and Jesús.

- [ ] **Step 1: "Admin" section in the README**

Insert before `## Publicar` in `README.md`:

````markdown
## Admin (Jesús maneja las presentaciones)

Las presentaciones viven en un Google Sheet. Jesús las agrega, edita y borra desde
**`https://pasalocarlos.github.io/resilientes-sintecho/admin.html`** con una clave.
La página pública las lee del Sheet: no hace falta tocar código ni hacer push.

### Instalación (una sola vez, Carlos)

1. Crea un Google Sheet con la cuenta cfigueroa0695@gmail.com y llámalo
   **Resilientes sintecho — Presentaciones**. La hoja `Presentaciones` y sus encabezados
   los crea el script la primera vez.
2. En el Sheet: **Extensiones → Apps Script**.
   - Borra lo que trae y pega el contenido de `apps-script/Code.gs`.
   - **+ → Secuencia de comandos**, llámala `agenda` y pega el contenido completo de `agenda.js`.
   - Guarda.
3. **Configuración del proyecto (⚙) → Propiedades del script → Añadir propiedad:**
   `ADMIN_CLAVE` = la clave para Jesús (una frase larga es mejor que una palabra).
4. **Implementar → Nueva implementación → ⚙ Aplicación web.**
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
   - Autoriza cuando lo pida.
   - Copia la URL que termina en **`/exec`**.
5. En `presentaciones.js`: pon esa URL en `window.agendaConfig.url` y deja
   `window.presentaciones = []`. Luego haz commit y push.
6. Mándale a Jesús el enlace de `admin.html` y la clave **por canales distintos**.

### Mantenimiento

- **Cambiar la clave:** edita `ADMIN_CLAVE` en las Propiedades del script. Jesús tendrá que volver a entrar.
- **Si cambias `Code.gs` o `agenda.js`:** vuelve a pegarlos en el Apps Script y luego
  **Implementar → Administrar implementaciones → ✏ → Versión: Nueva versión → Implementar**.
  Así la URL `/exec` no cambia.
- **Corregir a mano:** puedes editar filas en el Sheet. **No cambies la columna `id`.**
  Si una fila queda mal, la página la ignora y el admin la muestra en un aviso amarillo con el problema.
- **Bloqueo por intentos:** tras 10 claves equivocadas, el admin dice "Demasiados intentos. Espera 10 minutos.",
  incluso con la clave correcta.
- **Si Google no responde:** la página muestra la última copia guardada en cada navegador o,
  en una primera visita, "No pudimos cargar las fechas." con un botón Reintentar.
````

- [ ] **Step 2: Commit the README**

```bash
git add README.md
git commit -m "docs: README — instalación y mantenimiento del admin (Sheet + Apps Script)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: STOP — Carlos sets up the Sheet**

Ask Carlos to do steps 1–4 of the "Admin" section and send back the `/exec` URL. **Don't** continue until you have it.
- The password is never sent through the chat or written down anywhere.
- To test, Carlos can create a temporary `ADMIN_CLAVE` and give it to the executor only for the check, then change it before giving the final one to Jesús.

- [ ] **Step 4: Connect the real URL**

In `presentaciones.js`:
- set `window.agendaConfig = { url: '<la URL /exec>' };`;
- replace the example list with `window.presentaciones = [];` (keeping the comment block that explains the fields).

Then:
- run `node --test` and expect 75/75 pass;
- check that `curl -sL "<URL>"` returns `{"ok":true,"presentaciones":[],"invalidas":[]}`.

- [ ] **Step 5: End-to-end check in the browser (at 360 px and on desktop)**

With `python -m http.server 8765`:

1. **Admin, wrong password:** `admin.html` → wrong password → "Clave incorrecta.", and the field stays focused.
2. **Admin, right password:** you get in and see "No hay presentaciones próximas."
3. **Add:**
   - fill in the date (a future one), time, place with an accent and a comma, address, two guests (with a blank line in between) and "Entrada libre";
   - **Guardar** shows "Guardado. Ya aparece en la página.";
   - the card shows up in Próximas;
   - in the Sheet, a row with `fecha`/`hora` as text and the guests on 2 lines.
4. **Public page:**
   - open `index.html` in another tab: the card is there, with "Próxima" and the "Con:" line showing both guests;
   - reload: it appears instantly, from the copy.
5. **Edit:** change the time. The admin and the public page (after reloading) show the new time.
6. **Field error:** type `http://x` in "Más información" → "El enlace debe empezar con https://" under the field, and nothing is sent.
7. **No connection:** with DevTools → offline, **Guardar** shows "No se pudo conectar…" and the form **keeps** what was typed.
8. **Delete:** **Borrar** → "¿Borrar la presentación del … en …?" → **Sí, borrar** shows "Borrada…" and it disappears from both pages.
9. **Hand edit:** type `19:00` by hand in a row of the Sheet (Sheets turns it into a time). The admin and the public page still show it right.
10. **Session:** **Salir** goes back to the login. Reopen `admin.html` with "Recordar" checked: it logs in by itself.
11. **Layout:** no horizontal scroll at 360 px on either page.

Take a screenshot of the admin at 360 px with one card, and another of the open form.

- [ ] **Step 6: Commit**

```bash
git add presentaciones.js
git commit -m "feat: conectar la página y el admin al Google Sheet real

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan

- Final review of the branch, then merge to `main` and push **only when Carlos asks**.
- Update the vault:
  - `pasaloVault/10-projects/resilientes-sintecho/resilientes-sintecho.md` (Recent activity);
  - `Decisions.md`: add D6, "Admin with Google Sheet + Apps Script + password";
  - `Tasks.md`.
