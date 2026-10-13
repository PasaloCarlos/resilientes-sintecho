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
  var vistos = {};
  for (var i = 1; i < valores.length; i++) {
    if (valores[i].every(function (v) { return texto(v) === ''; })) continue;   // fila vacía
    var p = deFila(valores[i], zona);
    var errores = !p.id ? ['id: falta; bórrala y créala desde el admin']
      : vistos[p.id] ? ['id: repetido; borra esta copia y créala desde el admin']   // fila copiada a mano
      : Agenda.validarPresentacion(p);
    if (p.id) vistos[p.id] = true;
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
    (p.invitados || []).join('\n'), p.masInfo || '', p.notas || ''].map(comoTexto).concat([new Date()]);
}

// Un apóstrofo al inicio hace que Sheets guarde el valor como texto (y no forma parte del valor):
// sin él, "- Ana" o "=..." se vuelven fórmulas y "3-4" una fecha.
function comoTexto(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
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
