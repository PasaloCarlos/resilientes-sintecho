# Design — Agenda de presentaciones: *"Resilientes" sintecho*

**Date:** 2026-09-29
**Status:** Approved in conversation, pending written-spec review
**Vault:** `pasaloVault/10-projects/resilientes-sintecho/`

## 1. Purpose

A public, Spanish-language webpage that lists the upcoming presentations of the book
*"Resilientes" sintecho: Etnografía de las tecnologías de poder estadounidense en el
posdesastre* by **Jesús Vélez Méndez**, over the next few months.

- **Audience:** readers and anyone who might attend a presentation. Most arrive from a link
  shared on WhatsApp or social media, so they open it **on a phone**.
- **Maintainer:** the owner (Carlos), who adds and edits events **by editing one data file**
  and pushing to git. Nobody else edits it; there is no admin UI, sheet or backend.
- **Success:** someone opening the link sees the book and the next date within one screen.
  They can get directions to the venue and add the event to their calendar in one tap each.
  Adding a new presentation takes one object in one file and one push.

**Spelling rule:** *sintecho* is **one word**. It is never written "sin techo", including in
the repo name (`resilientes-sintecho`), page title, meta tags and file names.

## 2. Out of scope (v1)

These are left out on purpose:
- RSVP or registration links, and any sign-up or form.
- A full book site: synopsis, author bio or where to buy.
- Past-event photos or recaps.
- Automatic data sources (Google Sheet, CMS).
- An English version.
- A custom domain. v1 uses the Netlify subdomain.

## 3. Approach

A static site with **no build step and no dependencies**, deployed to Netlify from git. This
is the same operating model as the event-invitation template (`thursday-invitation`), but
it is a **new, purpose-built codebase**. The invitation template is not copied, because its
schema (stops, music, RSVP, countdown) does not fit an event list.

We rejected two alternatives:
- **Copying thursday-invitation:** most of it would have to be removed.
- **A static site generator (Astro or Eleventy):** it adds a build step and dependencies,
  which a handful of dates doesn't need.

## 4. Repository layout

```
resilientes-sintecho/
├── index.html          ← page skeleton, OG/meta tags, <template> for a card
├── styles.css          ← tokens (colors, fonts) + layout, mobile-first
├── presentaciones.js   ← THE ONLY FILE EDITED DAY TO DAY: window.libro + window.presentaciones
├── agenda.js           ← pure logic (validate, split/sort, format, calendar links); no DOM
├── app.js              ← DOM: reads the data, calls agenda.js, renders, wires the calendar menu
├── assets/
│   ├── portada.jpg     ← cover, resized for the web (≤ 1200px on the long side, ≤ 300 KB)
│   └── og.jpg          ← 1200×630 share image cut from the cover
├── tests/
│   └── agenda.test.js  ← node --test, no dependencies
├── netlify.toml        ← publish dir "." and cache headers
└── README.md           ← how to add a presentation, preview locally, deploy
```

The source cover is `Downloads\jesuslibro-1 copy.jpg` (3.5 MB). Only the resized versions are
committed.

`agenda.js` is a classic script that works in the browser and in Node without a build step.
It assigns `window.Agenda` when `window` exists, and `module.exports` when `module` exists.

## 5. Data file — `presentaciones.js`

```js
window.libro = {
  titulo: '"Resilientes" sintecho',
  subtitulo: "Etnografía de las tecnologías de poder estadounidense en el posdesastre",
  autor: "Jesús Vélez Méndez",
  resena: "2–3 líneas que aporta el dueño.",   // blurb
  portada: "assets/portada.jpg"
};

window.presentaciones = [
  {
    fecha: "2026-10-18",            // required, YYYY-MM-DD
    hora: "19:00",                  // required, HH:MM 24h, Puerto Rico time
    duracionMin: 90,                // optional, default 120; used only for calendar end time
    lugar: "Librería Mágica",       // required
    direccion: "Calle Ponce de León 1126, San Juan",  // required
    mapa: "https://maps.app.goo.gl/…",  // optional; if missing, built from lugar + direccion
    invitados: ["Nombre Apellido (moderadora)"],     // optional, array of strings
    notas: "Entrada libre"          // optional, one line
  }
];
```

Order in the file doesn't matter; the page sorts by date and time.

## 6. Behavior

### 6.1 Time
All events are in **America/Puerto_Rico**, which is UTC−4 all year with no daylight saving.
"Today" is today's date **in Puerto Rico**, whatever the visitor's own time zone.

### 6.2 Upcoming vs. past
- An event is **upcoming** through the **whole day** of its date (PR time). It moves to past
  the next day. This way an evening event doesn't vanish while people are on their way to it.
- **Próximas presentaciones:** ascending by date and time. The first card gets a
  "Próxima" badge.
- **Presentaciones anteriores:** descending, inside a collapsed `<details>`, and shown only
  when there is at least one past event. These cards are simplified: no calendar button and
  no map link.
- **No upcoming events:** the Próximas section shows *"Pronto anunciaremos nuevas fechas."*

### 6.3 Date formatting
Dates are formatted with `Intl.DateTimeFormat('es-PR', { timeZone: 'America/Puerto_Rico' })`.
- Card date block: the big day number, plus a short uppercase month and weekday
  (e.g. `18` / `OCT` / `sáb`).
- Full line: `sábado, 18 de octubre · 7:00 p.m.`

### 6.4 Card contents
Each card has:
- the date block;
- the full date and time line;
- **lugar** in bold, then **direccion**;
- *Con:* followed by the guests joined with commas, when `invitados` is present;
- `notas`, when present;
- two actions: **Cómo llegar** (map link, new tab) and **Añadir al calendario**.

### 6.5 Añadir al calendario
The button toggles a small menu with two options:
- **Google Calendar:** opens
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=START/END&details=…&location=…&ctz=America/Puerto_Rico`,
  with the dates in UTC (`YYYYMMDDTHHMMSSZ`).
- **Apple / Outlook (.ics):** downloads a one-event iCalendar file built in the browser as a
  Blob. It has `VERSION:2.0`, `PRODID`, and a stable `UID` (`<fecha>-<slug(lugar)>@resilientes-sintecho`).
  `DTSTART` and `DTEND` are in UTC with `Z`; that is safe because PR has no DST.
  `SUMMARY`, `LOCATION` and `DESCRIPTION` are escaped per RFC 5545 (`\\`, `;`, `,`, newlines),
  and lines end in CRLF. The file name is `presentacion-<fecha>.ics`.
- **Event title:** `Presentación: "Resilientes" sintecho — Jesús Vélez Méndez`.
- **Description:** includes the guests, the notes and the page URL.

The menu closes when you click outside it or press Escape, and it can be used with the
keyboard (`aria-expanded` on the button).

### 6.6 Map link fallback
When `mapa` is missing, the link is
`https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(lugar + ", " + direccion)>`.

### 6.7 Validation
`Agenda.validar(libro, presentaciones)` returns a list of errors, each naming the entry and
field, e.g. `presentaciones[2].hora: debe ser HH:MM`.

It checks:
- required fields are present;
- `fecha` is a real date in `YYYY-MM-DD` form, and `hora` is `HH:MM` from 00–23 and 00–59;
- `duracionMin` is a positive integer when present;
- `invitados` is an array of strings when present;
- `mapa` starts with `https://` when present.

If there are errors, a **red banner** at the top lists them all, and invalid entries are
skipped. Valid entries still render, so one typo never blanks the page.

## 7. Visual direction

The design takes its cues from the cover (a blue tarp, white stencil type and red accents):
- **Background:** deep tarp blue (≈ `#1c4fd6`), with a subtle darker gradient. No photo
  texture in v1, to keep the page light on phones.
- **Text on the blue:** white. Accent red (≈ `#e3262b`) is used only for the date blocks,
  the thin rule under the author and the "Próxima" badge. It is never used for body text.
- **Fonts** (from Google Fonts):
  - display: **Big Shoulders Stencil Display**, used for the title and section headings
    (the closest free match to the cover's condensed stencil);
  - body: **Montserrat**, like the cover's subtitle.
- **Cards:** off-white (≈ `#f6f3ea`), like posters taped up, with dark ink text, a slight
  shadow, generous padding and the red date block on the left.
- **Hero:**
  - Mobile: the cover (max ~60% of the width) above the title, subtitle, author, red rule and
    blurb.
  - ≥ 768px: two columns, with the cover on the left.
- **Layout:** mobile-first, single column, max width ~720px for the schedule. There is no
  horizontal scroll at 360px.
- **Accessibility:**
  - WCAG AA contrast for all text;
  - the cover's `alt` has the title and author;
  - visible focus rings;
  - semantic `<main>`, `<section>`, `<h1>`/`<h2>`, and `<time datetime>`;
  - `prefers-reduced-motion` respected (the only motion is the menu fade).
- **Share tags:**
  - `<title>`: `"Resilientes" sintecho — Presentaciones`;
  - `og:title` and `og:description` built from the book;
  - `og:image` = `assets/og.jpg`;
  - `lang="es"`.

## 8. Testing

`node --test tests/` runs with no dependencies and covers:
- `validar`: each rule, a mix of valid and invalid entries, and error messages that name the
  index and field;
- `dividir` (the split/sort):
  - the day boundary in PR time, e.g. "today" at 23:59 PR vs. 00:00 PR the next day,
    including a UTC instant that is already the next day in UTC but still today in PR;
  - ordering of upcoming (ascending) and past (descending) events;
  - an empty list;
- time conversion: `fecha` + `hora` in PR → correct UTC instant; default and custom durations;
- Google Calendar URL: the parameters and their encoding;
- `.ics`: required lines, CRLF, escaping of `, ; \` and newlines, the UID, and UTC timestamps;
- map fallback URL.

**Manual check in a browser** at 360px and 1280px:
- with data containing past, today and future events;
- with an empty list;
- with an entry that has a deliberate error (the banner appears and the other cards still
  show);
- downloading the .ics and opening it (it lands at the right local time);
- the Google link.

## 9. Deployment

- The repo is `resilientes-sintecho`, with `main` deploying to Netlify. Publish directory is
  `.`, with no build command.
- **First deploy (one time):** create the GitHub repo, then link it in Netlify. Both are done
  by the owner or on explicit request. Nothing is pushed automatically.
- **Caching:** `presentaciones.js`, `app.js` and `agenda.js` are served with
  `Cache-Control: no-cache`, so edits show up right away. Assets cache normally.

## 10. Open items (content only, don't block the build)

- The blurb (`resena`) text. Until it's supplied, a clearly marked placeholder is used.
- The real presentation dates, venues and guests. v1 ships with example entries clearly
  marked as examples, which the owner replaces before sharing the link.
