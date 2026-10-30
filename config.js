// Configuracion. Con APPS_SCRIPT_URL vacio la app funciona en MODO PRUEBA:
// guarda todo en este navegador y no sube nada a Drive.
window.CONFIG = {
  CLIENTE: 'Profarco',
  // URL de la aplicacion web de Apps Script (ver README.md).
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx13I9C4PQQbriC9w7vPv2fnyt_yYYrNL-9FI6dCTdladRBbZ5ImnoLOVDNm_pnEMHz/exec',
  // Mismo valor que la propiedad TOKEN del Apps Script.
  TOKEN: 'profarco-k7Xq29mTw4vB8nZ3',
  // Solo modo prueba: PIN de administracion. Con Drive lo valida el script (ADMIN_PIN).
  ADMIN_PIN_PRUEBA: '1234',
  // Solo modo prueba: clave de acceso al tablero del cliente (con Drive es la propiedad TABLERO_PIN).
  TABLERO_PIN_PRUEBA: '0000',
  // Fotos: lado mayor en px y calidad JPEG (0-1).
  FOTO_MAX_PX: 1600,
  FOTO_CALIDAD: 0.8,

  // Tipos de relevamiento (los mosaicos de la pantalla principal).
  TIPOS: [
    { id: 'pestanas', nombre: 'Pestañas', detalle: 'Tiras o colgantes', img: 'img/pestanas.png', color: '#3b82e6' },
    { id: 'punteras', nombre: 'Punteras', detalle: 'Extremos de pasillo', img: 'img/punteras.png', color: '#0f6e91' },
    { id: 'gondola', nombre: 'Góndola Principal', detalle: 'Pasillo de estanterías', img: 'img/gondola.png', color: '#3b82e6' },
    { id: 'islas', nombre: 'Islas / Exhibidores', detalle: 'Islas y exhibidores', img: 'img/islas.png', color: '#3cc47f' },
  ],

  // Preguntas de cumplimiento (seleccion multiple) que aparecen despues de las fotos.
  // Las que comparten "grupo" son excluyentes entre si (elegir una desmarca las otras).
  // El id se guarda en el registro: no lo cambies una vez que haya datos.
  CRITERIOS: [
    { id: 'cumple', texto: 'Cumple con el planograma', grupo: 'resultado', tono: 'ok' },
    { id: 'parcial', texto: 'Cumple parcialmente', grupo: 'resultado', tono: 'warn' },
    { id: 'no_cumple', texto: 'No cumple con el planograma', grupo: 'resultado', tono: 'bad' },
    { id: 'faltan_productos', texto: 'Faltan productos / quiebre de stock' },
    { id: 'mal_ubicado', texto: 'Producto mal ubicado' },
    { id: 'sin_pop', texto: 'Falta material POP o cartelería' },
    { id: 'sin_precio', texto: 'Precios sin etiquetar o desactualizados' },
    { id: 'competencia', texto: 'La competencia ocupa el espacio' },
    { id: 'sin_espacio', texto: 'No hay espacio asignado' },
    { id: 'corregido', texto: 'Se corrigió durante la visita' },
    { id: 'no_modificar', texto: 'No se pudo realizar modificaciones' },
  ],
};
