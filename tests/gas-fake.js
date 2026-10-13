'use strict';
// Dobles en memoria de los servicios de Google que usa apps-script/Code.gs.
// Cargan agenda.js y Code.gs en un contexto vm, igual que Apps Script: todo global, sin module.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DESFASES = { 'America/Puerto_Rico': -4, UTC: 0 };

// Como Sheets al escribir un valor: "'" al inicio fuerza texto (y no se guarda);
// = + - @ al inicio se toma como fórmula; "3-4" se toma como fecha.
function comoSheets(v) {
  if (typeof v !== 'string' || v === '') return v;
  if (v[0] === "'") return v.slice(1);
  if (/^[=+\-@]/.test(v)) return '#ERROR!';
  if (/^\d{1,2}-\d{1,2}$/.test(v)) return new Date(Date.UTC(2026, Number(v.split('-')[1]) - 1, Number(v.split('-')[0])));
  return v;
}

function crearHoja() {
  const filas = [];
  const formatos = [];
  return {
    filas,
    formatos,
    getLastRow: () => filas.length,
    appendRow: fila => { filas.push(Array.from(fila, comoSheets)); },   // Array.from: arreglo del reino de las pruebas, no del vm
    getDataRange: () => ({ getValues: () => filas.map(f => f.slice()) }),
    getRange: (fila, columna) => {
      if (typeof fila === 'string') return { setNumberFormat: f => { formatos.push([fila, f]); } };
      return { setValues: valores => { valores.forEach((v, i) => { filas[fila - 1 + i] = Array.from(v, comoSheets); }); } };
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
