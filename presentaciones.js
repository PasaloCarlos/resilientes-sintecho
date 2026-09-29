/* ÚNICO ARCHIVO QUE SE EDITA PARA AÑADIR O CAMBIAR PRESENTACIONES.
   Cada presentación es un objeto { ... } dentro de la lista.
   El orden no importa: la página ordena por fecha.
   Las presentaciones pasadas se mueven solas a "Presentaciones anteriores".

   Campos:
     fecha        requerido  "AAAA-MM-DD"
     hora         requerido  "HH:MM" en 24 horas, hora de Puerto Rico (7 p.m. = "19:00")
     lugar        requerido  nombre del lugar
     direccion    requerido  dirección con pueblo
     duracionMin  opcional   minutos (por defecto 120); solo se usa para el calendario
     mapa         opcional   enlace https:// de Google Maps; si falta, se busca lugar + dirección
     invitados    opcional   lista: ["Nombre Apellido (moderadora)", "..."]
     masInfo      opcional   enlace https:// con más información de ESE evento (evento de Facebook,
                             Eventbrite, página del lugar). Pone un botón "Más información" en la
                             tarjeta y el calendario apunta ahí; si falta, el calendario apunta a esta página.
     notas        opcional   una línea, ej. "Entrada libre"

   Si algo está mal escrito, la página muestra un aviso rojo diciendo qué y dónde.
*/

window.libro = {
  titulo: '"Resilientes" sintecho',
  subtitulo: 'Etnografía de las tecnologías de poder estadounidense en el posdesastre',
  autor: 'Jesús Vélez Méndez',
  // Opcional: enlace https:// a la tienda. Pone el botón "Comprar el libro" bajo la reseña.
  comprar: 'https://www.libreriang.com/index.php?route=product%2Fproduct&product_id=101989',
  resena: 'El libro "Resilientes" sintecho está dirigido a toda la población y en especial a estudiantes y profesores de Ciencias Sociales y Humanidades. Se compone de una serie de ensayos investigativos que, con libertad, cinismo y crítica abordan la idea de resiliencia.'
};

window.presentaciones = [
  // EJEMPLOS — reemplazar con las fechas reales antes de compartir el enlace.
  {
    fecha: '2026-10-17',
    hora: '15:00',
    lugar: 'Librería de ejemplo',
    direccion: 'Calle Ejemplo 123, San Juan',
    invitados: ['Nombre Apellido (moderadora)'],
    notas: 'EJEMPLO — entrada libre'
  },
  {
    fecha: '2026-11-12',
    hora: '19:00',
    duracionMin: 90,
    lugar: 'Centro cultural de ejemplo',
    direccion: 'Calle Ejemplo 45, Caguas',
    invitados: ['Nombre Apellido (comentarista)', 'Nombre Apellido (moderador)'],
    masInfo: 'https://www.example.com/',
    notas: 'EJEMPLO'
  },
  {
    fecha: '2026-09-20',
    hora: '18:00',
    lugar: 'Biblioteca de ejemplo',
    direccion: 'Avenida Ejemplo 7, Mayagüez',
    notas: 'EJEMPLO de presentación ya pasada'
  }
];
