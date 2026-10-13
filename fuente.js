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
