// Configuracion. Con APPS_SCRIPT_URL vacio la app funciona en MODO PRUEBA:
// guarda todo en este navegador (IndexedDB) y no sube nada a Drive.
window.CONFIG = {
  CLIENTE: 'Profarco',
  // URL de la aplicacion web de Apps Script (ver README.md, paso 3).
  APPS_SCRIPT_URL: '',
  // Mismo valor que la propiedad TOKEN del Apps Script.
  TOKEN: '',
  // Solo modo prueba: PIN para cargar/borrar planogramas. Con Drive lo valida el script (ADMIN_PIN).
  ADMIN_PIN_PRUEBA: '1234',
  // Fotos: lado mayor en px y calidad JPEG (0-1).
  FOTO_MAX_PX: 1600,
  FOTO_CALIDAD: 0.8,
  // Categorias de gondola entre las que elige el promotor.
  CATEGORIAS: ['Góndola principal', 'Punta de góndola', 'Exhibición adicional', 'Cooler / frío'],
  // Locales que se ofrecen aunque aun no tengan planograma cargado.
  LOCALES: [],
};
