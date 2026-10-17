/* Lógica pura de la agenda. Sin DOM: corre en el navegador (window.Agenda)
   y en Node (module.exports) para las pruebas. */
(function (root) {
  'use strict';

  const CAMPOS_LIBRO = ['titulo', 'subtitulo', 'autor'];
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

  // Como en la portada: el "sin" de "sintecho" va en rojo. Sigue siendo una sola palabra.
  function partirTitulo(titulo) {
    const m = /sin(?=techo)/i.exec(titulo);
    if (!m) return [{ texto: titulo, rojo: false }];
    const partes = [
      { texto: titulo.slice(0, m.index), rojo: false },
      { texto: m[0], rojo: true },
      { texto: titulo.slice(m.index + 3), rojo: false }
    ];
    return partes.filter(p => p.texto !== '');
  }

  // Solo reels y posts de instagram.com: el iframe nunca apunta a otro sitio.
  function urlInstagramEmbed(url) {
    if (typeof url !== 'string') return null;
    const m = /^https:\/\/(?:www\.)?instagram\.com\/(reel|p)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(url.trim());
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
  }

  function tituloEvento(libro) {
    return `Presentación: ${libro.titulo} — ${libro.autor}`;
  }

  function descripcion(p, urlPagina) {
    const lineas = [];
    if (Array.isArray(p.invitados) && p.invitados.length) lineas.push(`Con: ${p.invitados.join(', ')}`);
    if (esTextoNoVacio(p.notas)) lineas.push(p.notas);
    lineas.push(`Más información: ${esTextoNoVacio(p.masInfo) ? p.masInfo : urlPagina}`);
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
  // Octetos UTF-8 de un carácter. Sin TextEncoder: Apps Script no lo tiene y este archivo también corre allí.
  function octetosUtf8(ch) {
    const cp = ch.codePointAt(0);
    return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  function plegar(linea) {
    const partes = [];
    let actual = '';
    let octetos = 0;
    for (const ch of linea) {
      const n = octetosUtf8(ch);
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

  function validar(libro, presentaciones) {
    const errores = [];
    const validas = [];

    if (libro === null || typeof libro !== 'object') {
      errores.push('libro: falta window.libro');
    } else {
      for (const campo of CAMPOS_LIBRO) {
        if (!esTextoNoVacio(libro[campo])) errores.push(`libro.${campo}: requerido`);
      }
      if (!esAusente(libro.comprar) &&
          !(typeof libro.comprar === 'string' && libro.comprar.startsWith('https://'))) {
        errores.push('libro.comprar: debe empezar con https://');
      }
      if (!esAusente(libro.video) && !urlInstagramEmbed(libro.video)) {
        errores.push('libro.video: debe ser un enlace https:// a un reel o post de Instagram');
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
