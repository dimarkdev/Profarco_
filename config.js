// Configuracion. Con APPS_SCRIPT_URL vacio la app funciona en MODO PRUEBA:
// guarda todo en este navegador y no sube nada a Drive.
window.CONFIG = {
  CLIENTE: 'Profarco',
  // URL de la aplicacion web de Apps Script (ver README.md).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby6p0jT2C7fBJHqsBQD96-y-q5zZ_X03B3ilrZ71z9MGYP2iPr7UYrAIluqX1UsNy1czQ/exec',
  // Mismo valor que la propiedad TOKEN del Apps Script.
  TOKEN: 'profarco-k7Xq29mTw4vB8nZ3',
  // Solo modo prueba: PIN de administracion. Con Drive lo valida el script (ADMIN_PIN).
  ADMIN_PIN_PRUEBA: '1234',
  // Solo modo prueba: clave de acceso al tablero del cliente (con Drive es la propiedad TABLERO_PIN).
  TABLERO_PIN_PRUEBA: '0000',
  // Fotos: lado mayor en px y calidad JPEG (0-1).
  FOTO_MAX_PX: 1600,
  FOTO_CALIDAD: 0.8,
  // Maximo de fotos por relevamiento (un espacio de una marca).
  MAX_FOTOS: 2,

  // Marcas que se relevan (el relevador elige una despues del punto de venta).
  MARCAS: ['Bauducco', 'Bettanin', 'Fini', 'Kellogg’s', 'M&M’s', 'Nosotras', 'Pedigree', 'Panasonic', 'Broterra',
    'Halls', 'Trident', 'Bubbaloo', 'Whiskas', 'Parmalat', 'Invicta', 'Zumuva', 'Snickers'],

  // Tipos de espacio (despues de la marca). El id va en los datos: no lo cambies una vez que haya registros.
  TIPOS: [
    { id: 'puntera', nombre: 'Puntera', img: 'img/tipos/puntera.png', color: '#0f6e91' },
    { id: 'puntera_caja', nombre: 'Puntera de caja', img: 'img/tipos/puntera_caja.png', color: '#2a9d8f' },
    { id: 'pestana', nombre: 'Pestaña', img: 'img/tipos/pestana.png', color: '#3b82e6' },
    { id: 'pestana_caja', nombre: 'Pestaña de caja', img: 'img/tipos/pestana_caja.png', color: '#2a9d8f' },
    { id: 'exhibidor', nombre: 'Exhibidor', img: 'img/tipos/exhibidor.png', color: '#3cc47f' },
    { id: 'isla', nombre: 'Isla', img: 'img/tipos/isla.png', color: '#3cc47f' },
    { id: 'bandeja_lateral', nombre: 'Bandeja / lateral', img: 'img/tipos/bandeja_lateral.png', color: '#0f6e91' },
    { id: 'ganchera', nombre: 'Ganchera', img: 'img/tipos/ganchera.png', color: '#3b82e6' },
    { id: 'portico', nombre: 'Pórtico', img: 'img/tipos/portico.png', color: '#2a9d8f' },
    { id: 'enmarcado', nombre: 'Enmarcado', img: 'img/tipos/enmarcado.png', color: '#0f6e91' },
    { id: 'tramo_gondola', nombre: 'Tramo de góndola', img: 'img/tipos/tramo_gondola.png', color: '#3b82e6' },
    { id: 'pedestal', nombre: 'Pedestal', img: 'img/tipos/pedestal.png', color: '#3cc47f' },
  ],

  // Tipos de espacio que tiene cada marca (por id): son los unicos que se ofrecen al relevar esa marca y al cargar sus planogramas.
  // Una marca que no figura aqui muestra todos los tipos.
  ESPACIOS_POR_MARCA: {
    'Bauducco': ['puntera', 'pestana', 'exhibidor', 'isla'],
    'Bettanin': ['puntera', 'exhibidor', 'bandeja_lateral'],
    'Broterra': ['bandeja_lateral', 'enmarcado'],
    'Bubbaloo': ['puntera_caja'],
    'Fini': ['pestana', 'exhibidor', 'isla', 'ganchera', 'tramo_gondola', 'pedestal'],
    'Halls': ['puntera_caja', 'exhibidor'],
    'Invicta': ['exhibidor'],
    'Kellogg’s': ['puntera', 'pestana', 'exhibidor', 'isla', 'portico', 'enmarcado'],
    'M&M’s': ['puntera', 'puntera_caja', 'pestana_caja', 'isla', 'portico'],
    'Nosotras': ['puntera', 'exhibidor', 'isla'],
    'Panasonic': ['puntera_caja', 'pestana_caja', 'exhibidor'],
    'Parmalat': ['pestana', 'bandeja_lateral'],
    'Pedigree': ['puntera', 'pestana', 'exhibidor', 'isla'],
    'Snickers': ['pestana'],
    'Trident': ['puntera_caja', 'exhibidor'],
    'Whiskas': ['puntera', 'exhibidor'],
    'Zumuva': ['exhibidor'],
  },

  // Preguntas del relevamiento (una sola opcion por pregunta). Se responden despues de tomar las fotos.
  // "si": la pregunta solo aparece cuando se eligio esa opcion. Los id se guardan en el registro: no los cambies una vez que haya datos.
  // "tono" (ok / warn / bad) lo usa el tablero para colorear la respuesta y contar hallazgos.
  PREGUNTAS: [
    { id: 'presente', corto: 'Marca en el espacio', titulo: '¿Se encuentra la marca en el espacio designado?', opciones: [
      { id: 'presente_si', texto: 'Sí, se encuentra.', tono: 'ok' },
      { id: 'presente_no', texto: 'No, no se encontró.', tono: 'bad' } ] },
    { id: 'ocupa', corto: 'Ocupa el espacio', numero: 1, si: 'presente_no', titulo: 'Si la marca contratada no está, ¿qué ocupa el espacio?',
      nota: 'Aplica solo cuando la marca contratada no está en el espacio.', opciones: [
      { id: 'ocupa_profarco', texto: 'Otra marca de Profarco', tono: 'warn' },
      { id: 'ocupa_otra', texto: 'Otra marca (no Profarco)', tono: 'bad' },
      { id: 'ocupa_propia', texto: 'Marca propia o producto del supermercado', tono: 'bad' },
      { id: 'ocupa_material', texto: 'Material sin producto', tono: 'warn' },
      { id: 'ocupa_vacio', texto: 'Vacío', tono: 'bad' } ] },
    { id: 'abast', corto: 'Abastecimiento', numero: 2, titulo: 'Nivel de abastecimiento del espacio', opciones: [
      { id: 'abast_completo', texto: 'Completo (mayoría de productos).', tono: 'ok' },
      { id: 'abast_bajo', texto: 'Bajo (poca cantidad de productos).', tono: 'bad' },
      { id: 'abast_sin', texto: 'Sin producto.', tono: 'bad' } ] },
    { id: 'visib', corto: 'Visibilidad', numero: 3, titulo: 'Visibilidad del espacio', opciones: [
      { id: 'visib_total', texto: 'Totalmente visible', tono: 'ok' },
      { id: 'visib_parcial', texto: 'Parcialmente obstruido', tono: 'warn' },
      { id: 'visib_obstruido', texto: 'Obstruido (por otros muebles, cajas, productos que no corresponden, etc.)', tono: 'bad' } ] },
    { id: 'estado', corto: 'Estado del mueble', numero: 4, titulo: 'Estado del mueble', opciones: [
      { id: 'estado_bueno', texto: 'Bueno', tono: 'ok' },
      { id: 'estado_sucio', texto: 'Sucio', tono: 'warn' },
      { id: 'estado_roto', texto: 'Deteriorado o roto', tono: 'bad' } ] },
  ],
};

// Lista plana de respuestas posibles (la usan el tablero y los filtros). Los tres resultados se calculan solos: no se preguntan.
window.CONFIG.CRITERIOS = [
  { id: 'cumple', texto: 'Cumple', grupo: 'resultado', tono: 'ok', derivado: true },
  { id: 'no_cumple', texto: 'No cumple', grupo: 'resultado', tono: 'bad', derivado: true },
  ...window.CONFIG.PREGUNTAS.flatMap((q) => q.opciones.map((o) => ({ id: o.id, texto: o.texto, etiqueta: q.corto + ': ' + o.texto, grupo: q.id, tono: o.tono }))),
];

// Regla de cumplimiento a partir de las respuestas (ids elegidos). Cambiala aqui si el criterio cambia.
//   Cumple:    marca presente, abastecimiento completo, totalmente visible y mueble en buen estado.
//   No cumple: todo lo demas (solo hay dos resultados).
window.CONFIG.resultado = (ids) => {
  const t = (id) => ids.includes(id);
  if (t('presente_si') && t('abast_completo') && t('visib_total') && t('estado_bueno')) return 'cumple';
  return 'no_cumple';
};
