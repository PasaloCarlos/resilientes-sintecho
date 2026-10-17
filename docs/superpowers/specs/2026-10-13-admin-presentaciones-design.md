# Diseño — Vista de admin para las presentaciones

**Fecha:** 2026-10-13
**Estado:** aprobado en conversación (3 partes); falta revisar esta spec escrita
**Proyecto:** `resilientes-sintecho` (sitio en https://pasalocarlos.github.io/resilientes-sintecho/)
**Spec anterior:** `2026-09-29-agenda-presentaciones-design.md`, que esta extiende y no reemplaza
**Vault:** `pasaloVault/10-projects/resilientes-sintecho/`

## 1. Propósito

Jesús Vélez Méndez, el autor, debe poder **agregar, editar y borrar** presentaciones él mismo, sobre todo desde el teléfono, sin tocar código, sin GitHub y sin esperar un deploy.

- **Quién lo usa:** Jesús, una persona no técnica, y Carlos como dueño y soporte.
- **Éxito:** Jesús añade una presentación desde el teléfono en menos de un minuto. Aparece en la página pública en la próxima carga, sin que Carlos intervenga. Un error de escritura se marca en el formulario antes de enviarse, nunca después en la página.

## 2. Fuera de alcance

Estas cosas quedan fuera a propósito:
- Editar los datos del libro (título, reseña, enlace de compra, video): siguen en `presentaciones.js` y los cambia Carlos.
- Cuentas por persona, historial de cambios o deshacer.
- Subir imágenes.
- Notificaciones.
- Un panel para varios libros.

## 3. Enfoque

Google Sheet + Apps Script + una página `/admin.html` en el mismo sitio, el mismo patrón que ya funciona en `la-vibra-no-falla`.

Se descartaron dos opciones:
- **Escribir directo a GitHub:** Jesús necesitaría una cuenta y un token, y cada cambio tarda en publicarse.
- **Supabase o Firebase con login:** es más infraestructura, y el plan gratis de Supabase pausa el proyecto si pasa días sin uso.

## 4. Datos — el Google Sheet

- **Dueño:** Carlos (cfigueroa0695@gmail.com).
- **Nombre del archivo:** *Resilientes sintecho — Presentaciones*.
- **Hoja:** `Presentaciones`.
- **Fila 1 (encabezados exactos):**

  `id | fecha | hora | duracionMin | lugar | direccion | mapa | invitados | masInfo | notas | actualizado`

- **Formato de las columnas:**

  | Columna | Formato |
  |---|---|
  | `id` | UUID (`Utilities.getUuid()`), asignado por el script; **nunca cambia** |
  | `fecha` | `AAAA-MM-DD` |
  | `hora` | `HH:MM`, de 24 horas, hora de Puerto Rico |
  | `duracionMin` | entero, o vacío (= 120) |
  | `invitados` | un nombre por línea dentro de la celda (`\n`) |
  | `actualizado` | fecha y hora del último cambio, puesta por el script |

- **Trampa de Sheets:** Google convierte `2026-10-17` en fecha y `19:00` en hora. El script:
  - pone el formato de texto plano (`@`) en las columnas `fecha` y `hora` al crear la hoja;
  - al leer, convierte de vuelta a texto cualquier `Date` que encuentre, con `Utilities.formatDate(…, 'America/Puerto_Rico', …)`, por si alguien escribió a mano.
- **Correcciones a mano:** Carlos puede corregir filas directamente. Una fila inválida no rompe nada: ver §6.
- **Arranque:** la hoja empieza vacía. Los tres eventos actuales son ejemplos y no se migran.

## 5. Apps Script (`apps-script/Code.gs` en el repo)

- **Publicación:** se publica como aplicación web, con *Ejecutar como: Yo* y *Acceso: Cualquier usuario*.
- **Dos archivos en el proyecto de Apps Script:**
  - `Code.gs`, desde el repo;
  - `agenda.gs`, una copia literal de `agenda.js`.

  Así **un solo juego de reglas de validación** sirve en el navegador y en el servidor. Si `agenda.js` cambia, se vuelve a pegar; el README lo dice.
- **Cambio necesario en `agenda.js`:** además de `window.Agenda` y `module.exports`, debe dejar `Agenda` en el ámbito global cuando no hay ninguno de los dos (Apps Script). También exporta `validarPresentacion(p) → string[]`, que es el actual `erroresDePresentacion` con ruta vacía.

### 5.1 `doGet` (público, sin clave)

Responde:

```
{ ok: true, presentaciones: [ {id, fecha, hora, ...} ], invalidas: [ {fila, id, errores: [..]} ] }
```

- `presentaciones` trae solo las filas válidas, sin `actualizado`.
- `invalidas` lista las filas que no pasan la validación, por número de fila del Sheet, para el aviso del admin.
- `invitados` sale como lista, y los vacíos se omiten.

### 5.2 `doPost` (necesita clave)

El cuerpo es JSON enviado como **`text/plain`**, para evitar el preflight que Apps Script no contesta:

| `accion` | Campos | Respuesta exitosa |
|---|---|---|
| `verificar` | `clave` | `{ok:true}` |
| `crear` | `clave`, `presentacion` | `{ok:true, presentacion}` (con el `id` nuevo) |
| `editar` | `clave`, `id`, `presentacion` | `{ok:true, presentacion}` |
| `borrar` | `clave`, `id` | `{ok:true}` |

Si algo falla, la respuesta es `{ok:false, error:'<mensaje en español>', campos?: {<campo>: '<mensaje>'}}`. Los casos:
- **Clave incorrecta:** `"Clave incorrecta."`
- **Demasiados intentos:** `"Demasiados intentos. Espera 10 minutos."`
- **Datos inválidos:** `campos` trae los errores de `validarPresentacion`, ya traducidos a mensajes por campo.
- **`id` inexistente:** `"Esa presentación ya no existe."`
- **Hoja llena:** `"Se alcanzó el máximo de 200 presentaciones."`
- **Ocupado** (no se obtuvo el bloqueo en 10 s): `"El sistema está ocupado, intenta otra vez."`

### 5.3 Seguridad

- **La clave:** está en las Propiedades del script, `ADMIN_CLAVE`. Nunca está en el repo ni en la página. Si no está configurada, toda escritura responde `"Falta configurar la clave."`
- **Contra adivinar la clave:**
  - un contador global en `CacheService` (llave `fallos`) suma cada clave equivocada y caduca a los 600 s;
  - con **10 o más fallos**, toda verificación se rechaza con "Demasiados intentos", **incluso la clave correcta**, hasta que caduque;
  - una clave correcta no reinicia el contador.
- **Topes por campo:**

  | Campo | Tope |
  |---|---|
  | `lugar` | 120 caracteres |
  | `direccion` | 200 |
  | `notas` | 200 |
  | `invitados` | 10 líneas, cada una de hasta 120 |
  | `mapa`, `masInfo` | 500 |

  Además hay un máximo de 200 filas de datos.
- **Bloqueo al guardar:** `LockService.getScriptLock()` en cada escritura, así que dos ediciones simultáneas no se pisan.
- **Normalización:** el script recorta espacios y descarta campos desconocidos. Nunca escribe en el Sheet nada que el cliente no pueda mandar.

## 6. Página pública

- **Configuración:** `presentaciones.js` gana `window.agendaConfig = { url: '' }`, la URL `/exec` del Apps Script.
  - Con `url` vacía, todo funciona como hoy, desde `window.presentaciones`.
  - Con `url` puesta, `window.presentaciones` pasa a ser el **respaldo** y se deja como lista vacía.
- **Nuevo módulo `fuente.js`** (lógica sin DOM, probada en Node, con `fetch` y el almacenamiento inyectados):
  - **Visitante que vuelve** (hay copia en `localStorage`, llave `resilientes.presentaciones.v1` = `{guardado, presentaciones}`): pinta la copia **de inmediato**. Luego pide al Sheet y, si la respuesta es distinta, vuelve a pintar y guarda la copia nueva.
  - **Primera visita** (sin copia): muestra "Cargando fechas…" hasta que responda el Sheet. Si pasan **6 segundos** o falla:
    - con respaldo, pinta el respaldo;
    - sin respaldo, muestra "No pudimos cargar las fechas." con un botón **Reintentar**.
  - **Almacenamiento:** todo acceso a `localStorage` va en `try/catch`. Sin almacenamiento, se comporta como una primera visita.
- **Validación:** las presentaciones del Sheet pasan por el mismo `Agenda.validar` y las inválidas se ignoran en silencio.
- **Errores visibles:** el aviso rojo de errores se muestra **solo** para errores de `presentaciones.js` (archivo editado por Carlos), nunca por filas del Sheet.
- **`app.js`:** se reorganiza para exponer `pintarAgenda(lista)`, de modo que se pueda pintar más de una vez sin duplicar tarjetas, y la usan la carga inicial y la actualización.

## 7. Vista `/admin.html`

- **Archivos nuevos:** `admin.html` y `admin.js`. Reutiliza `styles.css`, más una sección `/* admin */`. Usa `<meta name="robots" content="noindex">`, no tiene enlace desde la página pública, y aplica la misma carga sin caché (`?t=`) a sus scripts.
- **Encabezado:** "Admin · Presentaciones" y el título en esténcil en pequeño, sobre la lona.
- **Entrar:**
  - un campo **Clave** (`type=password`) y el botón **Entrar**;
  - la casilla **Recordar en este teléfono** viene marcada: guarda la clave en `localStorage` (si no, en `sessionStorage`);
  - la clave se comprueba con `verificar`, y si falla se muestra el error del servidor;
  - el botón **Salir** borra la clave guardada.
- **Lista:**
  - secciones **Próximas** (ascendente) y **Anteriores** (descendente, colapsada), con tarjetas como las públicas;
  - cada tarjeta tiene **Editar** y **Borrar**, y arriba hay un botón grande **+ Añadir presentación**;
  - si `invalidas` no viene vacío, un aviso ámbar dice "Hay N filas en el Sheet con errores", con el número de fila y el problema.
- **Formulario:** uno solo para añadir y para editar; al editar viene precargado.

  | Campo | Tipo | Notas |
  |---|---|---|
  | Fecha | `type=date` | obligatoria |
  | Hora | `type=time` | obligatoria |
  | Lugar | texto | obligatorio, `maxlength` 120 |
  | Dirección | texto | obligatoria, `maxlength` 200 |
  | Invitados | `textarea` | "un nombre por línea" |
  | Notas | texto | `maxlength` 200 |
  | Enlace "Más información" | `type=url` | opcional |
  | Duración | `select` | 60 / 90 / **120** / 180 min |
  | Enlace de mapa | `type=url` | dentro de "Opciones avanzadas" (`<details>`), opcional |

- **Validación antes de enviar:** con `Agenda.validarPresentacion`. Cada error se muestra en rojo bajo su campo, con un texto en español entendible: por ejemplo "El enlace debe empezar con https://", no el mensaje técnico. Si el servidor devuelve `campos`, se muestran igual.
- **Al guardar:**
  - el botón queda deshabilitado y dice "Guardando…";
  - si sale bien, un mensaje "Guardado. Ya aparece en la página." y la lista se recarga;
  - si falla, un mensaje con el error y **el formulario conserva lo escrito**.
- **Borrar:** la confirmación aparece dentro de la tarjeta, sin `confirm()`: "¿Borrar la presentación del {fecha legible} en {lugar}? **Sí, borrar** / Cancelar".
- **Ver el resultado:** un enlace **Ver la página** (nueva pestaña).
- **Seguridad del contenido:** todo texto del Sheet se pinta con `textContent`.
- **Teléfono primero:** botones de 44 px o más, sin scroll lateral a 360 px y contraste AA.

## 8. Pruebas

Con `node --test` y sin dependencias:

- **`Code.gs` en Node**, con dobles en memoria de `SpreadsheetApp`, `PropertiesService`, `CacheService`, `LockService`, `ContentService` y `Utilities`. `Agenda` se carga como global antes. Se prueba:
  - crear, editar y borrar, con sus respuestas;
  - `id` inexistente;
  - validación y mensajes por campo;
  - topes por campo y de filas;
  - clave ausente, incorrecta y correcta;
  - bloqueo tras 10 fallos, incluida la clave correcta;
  - `doGet` con filas válidas e inválidas;
  - conversión de `Date` a texto en `fecha` y `hora`;
  - invitados por línea;
  - campos desconocidos descartados.
- **`fuente.js`:**
  - copia guardada y luego Sheet distinto: se pinta dos veces;
  - Sheet igual a la copia: se pinta una sola vez;
  - primera visita con éxito;
  - primera visita con tiempo agotado: respaldo, o el mensaje de error si no hay respaldo;
  - almacenamiento que lanza error;
  - respuesta con `ok:false`.
- **`agenda.js`:** `validarPresentacion` y la exportación global.
- **En el navegador**, a 360 px y en escritorio, contra un Apps Script real de prueba:
  - entrar con clave mala y con la buena;
  - añadir, editar y borrar, viendo cada cambio reflejado en la página pública;
  - error de campo;
  - sin conexión: el mensaje aparece y el formulario conserva lo escrito.

## 9. Lo que hace Carlos una sola vez

El README trae estos pasos:
1. Crear el Sheet con la hoja `Presentaciones` (los encabezados los pone el script la primera vez).
2. *Extensiones → Apps Script*: pegar `Code.gs` y crear el archivo `agenda` con el contenido de `agenda.js`.
3. *Configuración del proyecto → Propiedades del script*: `ADMIN_CLAVE` = la clave para Jesús.
4. *Implementar → Nueva implementación → Aplicación web* (Yo / Cualquier usuario) y copiar la URL `/exec`.
5. Pasarla a Claude o ponerla en `window.agendaConfig.url`, y hacer push.
6. Mandarle a Jesús el enlace `…/admin.html` y la clave **por canales separados**.

**Si cambia el código del script:** *Administrar implementaciones → Editar → Nueva versión*, para conservar la misma URL.
