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
