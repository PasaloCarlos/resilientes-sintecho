# "Resilientes" sintecho — Agenda de presentaciones

Página estática con las presentaciones del libro *"Resilientes" sintecho* de Jesús Vélez Méndez.
Sin build, sin dependencias. **"sintecho" es una sola palabra.**

## Añadir o cambiar una presentación

Edita **solo** `presentaciones.js`. Copia un bloque `{ ... }` dentro de la lista y cambia los datos:

```js
{
  fecha: '2026-10-17',          // AAAA-MM-DD
  hora: '19:00',                // 24 horas, hora de Puerto Rico
  duracionMin: 90,              // opcional (por defecto 120)
  lugar: 'Nombre del lugar',
  direccion: 'Calle 123, Pueblo',
  mapa: 'https://maps.app.goo.gl/...',            // opcional
  invitados: ['Nombre Apellido (moderadora)'],   // opcional
  masInfo: 'https://www.facebook.com/events/...',  // opcional: botón "Más información" del evento
  notas: 'Entrada libre'                           // opcional
},
```

- El orden no importa: la página ordena por fecha.
- Las presentaciones pasadas se mueven solas a "Presentaciones anteriores" al día siguiente. No hay que borrarlas.
- Si algo está mal escrito, la página muestra un aviso rojo con la entrada y el campo.

Después: `git commit` y `git push`. Netlify publica en ~1 minuto.

## Ver localmente

```bash
python -m http.server 8000
# abre http://localhost:8000
```

## Pruebas

```bash
node --test
```

## Archivos

- `presentaciones.js` — los datos (el único archivo que se edita).
- `agenda.js` — la lógica pura: validación, hora de PR, formato, enlaces de calendario. Es lo que prueban las pruebas.
- `app.js` — pinta la página.
- `index.html`, `styles.css` — estructura y apariencia.
- `assets/` — imagen para compartir (`og.jpg`) y la lona azul del fondo (`lona.jpg`), ambas recortadas de la portada original. La página no muestra la foto de la portada: el título en esténcil sobre la lona hace ese papel. Cómo regenerarlas: ver el plan en `docs/superpowers/plans/`.

## Publicar (primera vez)

1. Crea un repo en GitHub y haz `git push -u origin main`.
2. En Netlify, **Add new site → Import from Git**, elige el repo. No build command; publish directory `.` (ya está en `netlify.toml`).
3. Hecho el 2026-09-29: el sitio es **https://resilientes-sintecho.netlify.app** y `og:image`/`og:url` ya apuntan ahí.
   Si algún día cambia el dominio, actualiza esas dos etiquetas en `index.html`.
