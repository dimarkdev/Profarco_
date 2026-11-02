// Configuracion. Con APPS_SCRIPT_URL vacio la app funciona en MODO PRUEBA:
// guarda todo en este navegador y no sube nada a Drive.
window.CONFIG = {
  CLIENTE: 'Profarco',
  // URL de la aplicacion web de Apps Script (ver README.md).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzkaW6Tim-UZ4FHDtWdap2VdBljoEtc4EdAWxiVPgurk898c8FWiAEcRcqRc_SFb0GMRQ/exec',
  // Mismo valor que la propiedad TOKEN del Apps Script.
  TOKEN: 'profarco-k7Xq29mTw4vB8nZ3',
  // Solo modo prueba: PIN de administracion. Con Drive lo valida el script (ADMIN_PIN).
  ADMIN_PIN_PRUEBA: '1234',
  // Solo modo prueba: clave de acceso al tablero del cliente (con Drive es la propiedad TABLERO_PIN).
  TABLERO_PIN_PRUEBA: '0000',
  // Fotos: lado mayor en px y calidad JPEG (0-1).
  FOTO_MAX_PX: 1600,
  FOTO_CALIDAD: 0.8,

  // Marcas que se relevan (el relevador elige una despues del punto de venta).
  MARCAS: ['Bauducco', 'Bettanin', 'Fini', 'Kellogg’s', 'M&M’s', 'Nosotras', 'Pedigree', 'Panasonic', 'Broterra',
    'Halls', 'Trident', 'Bubbaloo', 'Whiskas', 'Parmalat', 'Invicta', 'Zumuva', 'Snickers', 'Alaska'],

  // Tipos de espacio (despues de la marca). El id va en los datos: no lo cambies una vez que haya registros.
  TIPOS: [
    { id: 'puntera', nombre: 'Puntera', img: 'img/punteras.png', color: '#0f6e91' },
    { id: 'puntera_caja', nombre: 'Puntera de caja', color: '#2a9d8f' },
    { id: 'pestana', nombre: 'Pestaña', img: 'img/pestanas.png', color: '#3b82e6' },
    { id: 'pestana_caja', nombre: 'Pestaña de caja', color: '#2a9d8f' },
    { id: 'exhibidor', nombre: 'Exhibidor', color: '#3cc47f' },
    { id: 'isla', nombre: 'Isla', img: 'img/islas.png', color: '#3cc47f' },
    { id: 'bandeja_lateral', nombre: 'Bandeja / lateral', color: '#0f6e91' },
    { id: 'ganchera', nombre: 'Ganchera', color: '#3b82e6' },
    { id: 'portico', nombre: 'Pórtico', color: '#2a9d8f' },
    { id: 'enmarcado', nombre: 'Enmarcado', color: '#0f6e91' },
    { id: 'tramo_gondola', nombre: 'Tramo de góndola', img: 'img/gondola.png', color: '#3b82e6' },
    { id: 'pedestal', nombre: 'Pedestal', color: '#3cc47f' },
  ],

  // Preguntas del relevamiento (una sola opcion por pregunta). Se responden despues de tomar las fotos.
  // "si": la pregunta solo aparece cuando se eligio esa opcion. Los id se guardan en el registro: no los cambies una vez que haya datos.
  // "tono" (ok / warn / bad) lo usa el tablero para colorear la respuesta y contar hallazgos.
  PREGUNTAS: [
    { id: 'presente', corto: 'Marca contratada', titulo: '¿Está la marca contratada en el espacio?', nota: 'Una opción.', opciones: [
      { id: 'presente_si', texto: 'Sí, está', tono: 'ok' },
      { id: 'presente_no', texto: 'No está', tono: 'bad' } ] },
    { id: 'ocupa', corto: 'Ocupa el espacio', numero: 1, si: 'presente_no', titulo: 'Si la marca contratada no está, ¿qué ocupa el espacio?',
      nota: 'Una opción. Aplica solo cuando la marca contratada no está en el espacio.', opciones: [
      { id: 'ocupa_profarco', texto: 'Otra marca de Profarco', tono: 'warn' },
      { id: 'ocupa_otra', texto: 'Otra marca (no Profarco)', tono: 'bad' },
      { id: 'ocupa_propia', texto: 'Marca propia o producto del supermercado', tono: 'bad' },
      { id: 'ocupa_material', texto: 'Material sin producto', tono: 'warn' },
      { id: 'ocupa_vacio', texto: 'Vacío', tono: 'bad' } ] },
    { id: 'abast', corto: 'Abastecimiento', numero: 2, titulo: 'Nivel de abastecimiento del espacio', nota: 'Una opción. Aplica siempre.', opciones: [
      { id: 'abast_completo', texto: 'Completo (más del 80%)', tono: 'ok' },
      { id: 'abast_parcial', texto: 'Parcial (50 a 80%)', tono: 'warn' },
      { id: 'abast_bajo', texto: 'Bajo (menos del 50%)', tono: 'bad' },
      { id: 'abast_sin', texto: 'Sin producto', tono: 'bad' } ] },
    { id: 'precio', corto: 'Precio visible', numero: 3, titulo: 'Precio visible', nota: 'Una opción. Aplica siempre.', opciones: [
      { id: 'precio_ok', texto: 'Sí, correcto', tono: 'ok' },
      { id: 'precio_mal', texto: 'Sí, pero incorrecto', tono: 'warn' },
      { id: 'precio_no', texto: 'No tiene precio', tono: 'bad' } ] },
    { id: 'visib', corto: 'Visibilidad', numero: 4, titulo: 'Visibilidad del espacio', nota: 'Una opción. Aplica siempre.', opciones: [
      { id: 'visib_total', texto: 'Totalmente visible', tono: 'ok' },
      { id: 'visib_parcial', texto: 'Parcialmente obstruido', tono: 'warn' },
      { id: 'visib_obstruido', texto: 'Obstruido (carros, pallets, cajas)', tono: 'bad' } ] },
    { id: 'estado', corto: 'Estado del mueble', numero: 5, titulo: 'Estado del mueble o material', nota: 'Una opción. Aplica siempre.', opciones: [
      { id: 'estado_bueno', texto: 'Bueno', tono: 'ok' },
      { id: 'estado_sucio', texto: 'Sucio', tono: 'warn' },
      { id: 'estado_roto', texto: 'Deteriorado o roto', tono: 'bad' },
      { id: 'estado_sin', texto: 'Sin material', tono: 'warn' } ] },
  ],
};

// Lista plana de respuestas posibles (la usan el tablero y los filtros). Los tres resultados se calculan solos: no se preguntan.
window.CONFIG.CRITERIOS = [
  { id: 'cumple', texto: 'Cumple', grupo: 'resultado', tono: 'ok', derivado: true },
  { id: 'parcial', texto: 'Cumple parcialmente', grupo: 'resultado', tono: 'warn', derivado: true },
  { id: 'no_cumple', texto: 'No cumple', grupo: 'resultado', tono: 'bad', derivado: true },
  ...window.CONFIG.PREGUNTAS.flatMap((q) => q.opciones.map((o) => ({ id: o.id, texto: o.texto, etiqueta: q.corto + ': ' + o.texto, grupo: q.id, tono: o.tono }))),
];

// Regla de cumplimiento a partir de las respuestas (ids elegidos). Cambiala aqui si el criterio cambia.
//   No cumple: la marca no esta, el espacio esta sin producto o esta obstruido.
//   Cumple:    marca presente, abastecimiento completo, precio correcto, totalmente visible y mueble en buen estado.
//   Parcial:   todo lo demas.
window.CONFIG.resultado = (ids) => {
  const t = (id) => ids.includes(id);
  if (t('presente_no') || t('abast_sin') || t('visib_obstruido')) return 'no_cumple';
  if (t('presente_si') && t('abast_completo') && t('precio_ok') && t('visib_total') && t('estado_bueno')) return 'cumple';
  return 'parcial';
};
