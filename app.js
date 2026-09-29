/* Pinta la página a partir de window.libro y window.presentaciones. Toda la lógica vive en agenda.js. */
(function () {
  'use strict';
  const A = window.Agenda;
  const URL_PAGINA = location.href.split(/[?#]/)[0];

  // Si window.libro falta o está incompleto, la portada conserva el texto fijo del HTML.
  const LIBRO_DEFECTO = {
    titulo: '"Resilientes" sintecho',
    subtitulo: 'Etnografía de las tecnologías de poder estadounidense en el posdesastre',
    autor: 'Jesús Vélez Méndez'
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

  // Como en la portada: "RESILIENTES" arriba; abajo el "SIN" rojo, de lado, junto a un "TECHO" grande.
  // Sin espacios entre las piezas: lectores de pantalla y buscadores siguen leyendo "sintecho".
  function pintarTitulo(h1, titulo) {
    const partes = A.partirTitulo(titulo);
    const i = partes.findIndex(p => p.rojo);
    if (i === -1) { h1.textContent = titulo; return; }
    const span = (clase, texto) => {
      const s = document.createElement('span');
      s.className = clase;
      s.textContent = texto;
      return s;
    };
    const linea2 = span('portada__linea2', '');
    linea2.append(span('portada__sin', partes[i].texto));
    if (partes[i + 1]) linea2.append(span('portada__techo', partes[i + 1].texto));
    h1.replaceChildren(...(i > 0 ? [span('portada__linea1', partes[0].texto)] : []), linea2);
    ajustarTitulo(h1);
    if (document.fonts) document.fonts.ready.then(() => ajustarTitulo(h1));
    window.addEventListener('resize', () => ajustarTitulo(h1));
  }

  // Como en la portada, "SIN"+"TECHO" mide lo mismo de ancho que "RESILIENTES".
  // La fuente es más estrecha que la de la portada, así que se mide en vez de fijar un tamaño.
  function ajustarTitulo(h1) {
    const l1 = h1.querySelector('.portada__linea1');
    const l2 = h1.querySelector('.portada__linea2');
    if (!l1 || !l2) return;
    l2.style.fontSize = '';
    const rango = document.createRange();
    rango.selectNodeContents(l1);
    const ancho1 = rango.getBoundingClientRect().width;
    const ancho2 = l2.getBoundingClientRect().width;
    if (!ancho1 || !ancho2) return;
    const base = parseFloat(getComputedStyle(l2).fontSize);
    l2.style.fontSize = `${base * ancho1 / ancho2}px`;
  }

  function pintarLibro() {
    document.querySelectorAll('[data-libro]').forEach(el => {
      el.textContent = libro[el.dataset.libro];
    });
    pintarTitulo(document.querySelector('[data-libro="titulo"]'), libro.titulo);

    const embed = A.urlInstagramEmbed(libroCrudo.video);
    if (embed) {
      const figura = document.querySelector('.portada__video');
      const marco = figura.querySelector('iframe');
      marco.src = embed;
      figura.querySelector('.portada__video-enlace').href = libroCrudo.video;
      figura.hidden = false;
      // El reproductor de Instagram informa su alto con postMessage; así el marco no corta ni deja hueco.
      window.addEventListener('message', e => {
        if (e.origin !== 'https://www.instagram.com' || e.source !== marco.contentWindow) return;
        try {
          const datos = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          const alto = datos && datos.type === 'MEASURE' && datos.details && Number(datos.details.height);
          if (alto > 100) marco.style.height = `${Math.ceil(alto)}px`;
        } catch (_) { /* mensaje ajeno */ }
      });
    }

    const comprar = libroCrudo.comprar;
    if (typeof comprar === 'string' && comprar.startsWith('https://')) {
      document.querySelector('.portada__comprar').href = comprar;
    } else {
      document.querySelector('.portada__acciones').remove();
    }
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

    const masInfo = q('.tarjeta__masinfo');
    if (typeof p.masInfo === 'string' && p.masInfo.trim() !== '') {
      masInfo.href = p.masInfo;
      masInfo.setAttribute('aria-label', `Más información sobre la presentación en ${p.lugar}`);
    } else {
      masInfo.remove();
    }

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
