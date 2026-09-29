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
