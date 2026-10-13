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
