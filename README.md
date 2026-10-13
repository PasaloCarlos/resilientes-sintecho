# "Resilientes" sintecho — Agenda de presentaciones

Página estática con las presentaciones del libro *"Resilientes" sintecho* de Jesús Vélez Méndez.
Sin build, sin dependencias. **"sintecho" es una sola palabra.**

## Dónde comprar

`comprar` en `window.libro` (en `presentaciones.js`) es el enlace del botón "Comprar el libro".
Si se borra o se deja vacío, el botón desaparece.

## Video del autor

`video` en `window.libro` es un reel o post de Instagram (`https://www.instagram.com/reel/…/`).
La página muestra el reproductor de Instagram bajo la reseña, con "Comprar el libro" entre la reseña y el video.
Instagram no permite que su reproductor arranque solo (autoplay); para eso haría falta el archivo del video.
Si se borra o se deja vacío, el video desaparece. El reel tiene que ser público para que se vea.

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

## Admin (Jesús maneja las presentaciones)

Las presentaciones viven en un Google Sheet. Jesús las agrega, edita y borra desde
**`https://pasalocarlos.github.io/resilientes-sintecho/admin.html`** con una clave.
La página pública las lee del Sheet: no hace falta tocar código ni hacer push.

### Instalación (una sola vez, Carlos)

1. Crea un Google Sheet con la cuenta cfigueroa0695@gmail.com y llámalo
   **Resilientes sintecho — Presentaciones**. La hoja `Presentaciones` y sus encabezados
   los crea el script la primera vez.
2. En el Sheet: **Extensiones → Apps Script**.
   - Borra lo que trae y pega el contenido de `apps-script/Code.gs`.
   - **+ → Secuencia de comandos**, llámala `agenda` y pega el contenido completo de `agenda.js`.
   - Guarda.
3. **Configuración del proyecto (⚙) → Propiedades del script → Añadir propiedad:**
   `ADMIN_CLAVE` = la clave para Jesús (una frase larga es mejor que una palabra).
4. **Implementar → Nueva implementación → ⚙ Aplicación web.**
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
   - Autoriza cuando lo pida.
   - Copia la URL que termina en **`/exec`**.
5. En `presentaciones.js`: pon esa URL en `window.agendaConfig.url` y deja
   `window.presentaciones = []`. Luego haz commit y push.
6. Mándale a Jesús el enlace de `admin.html` y la clave **por canales distintos**.

### Mantenimiento

- **Cambiar la clave:** edita `ADMIN_CLAVE` en las Propiedades del script. Jesús tendrá que volver a entrar.
- **Si cambias `Code.gs` o `agenda.js`:** vuelve a pegarlos en el Apps Script y luego
  **Implementar → Administrar implementaciones → ✏ → Versión: Nueva versión → Implementar**.
  Así la URL `/exec` no cambia.
- **Corregir a mano:** puedes editar filas en el Sheet. **No cambies la columna `id`.**
  Si una fila queda mal, la página la ignora y el admin la muestra en un aviso amarillo con el problema.
- **Bloqueo por intentos:** tras 10 claves equivocadas, el admin dice "Demasiados intentos. Espera 10 minutos.",
  incluso con la clave correcta.
- **Si Google no responde:** la página muestra la última copia guardada en cada navegador o,
  en una primera visita, "No pudimos cargar las fechas." con un botón Reintentar.

## Publicar

El sitio vive en **GitHub Pages**: https://pasalocarlos.github.io/resilientes-sintecho/
Se publica solo desde la rama `main` (raíz) cada vez que haces `git push`; tarda ~1 minuto.
Estilos, código y `presentaciones.js` se piden con `?t=<hora>` para saltarse la caché; solo `index.html`
puede quedar guardado hasta 10 min (límite de GitHub Pages), y una pestaña vieja se recarga sola.
`.nojekyll` evita que GitHub procese los archivos.

`og:image` y `og:url` en `index.html` apuntan a esa dirección (para la vista previa en WhatsApp/Facebook).
Si el sitio se muda (dominio propio o Netlify), actualiza esas dos etiquetas.

`netlify.toml` queda por si se vuelve a Netlify (el sitio `resilientes-sintecho` existe allí, pero la
cuenta respondía 429 a todas las visitas el 2026-09-29).
