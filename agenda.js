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

  const Agenda = { validar, instante, fin, hoyPR, dividir, horaLegible, formatear, urlMapa, slug };

  if (typeof module !== 'undefined' && module.exports) module.exports = Agenda;
  if (root) root.Agenda = Agenda;
})(typeof window !== 'undefined' ? window : null);
