# Relevamiento de góndola · Profarco

Sitio estático (sin build) con tres pantallas:

- **Relevar** (celular): el promotor elige local y góndola, revisa las imágenes del **planograma de referencia** (con zoom), confirma que las entendió, cierra la referencia y recién entonces toma las fotos.
- **Tablero**: KPIs, fotos por local, cobertura local × góndola, galería con comparación foto vs. planograma y exportación a CSV.
- **Planogramas**: el administrador carga/borra las imágenes de referencia por local y góndola (protegido con PIN).

El diseño usa los tokens de +Marka (Geist, acento verde azulado, cabecera oscura).

## Probarlo ya (modo prueba)

Abrir `index.html` con un servidor local (la cámara y IndexedDB necesitan `http://localhost` o `https`):

```
python -m http.server 8080
```

Con `APPS_SCRIPT_URL` vacío todo queda en el navegador. PIN de planogramas: `1234` (`config.js`).

## Conectar con Google Drive

1. En [script.google.com](https://script.google.com) crear un proyecto y pegar `apps-script/Code.gs`.
2. *Configuración del proyecto → Propiedades del script*: agregar `TOKEN` (una clave larga al azar) y `ADMIN_PIN`.
3. *Implementar → Nueva implementación → Aplicación web*: ejecutar como **tú**, acceso **Cualquier persona**. Copiar la URL.
4. En `config.js` poner `APPS_SCRIPT_URL` y el mismo `TOKEN`.
5. Publicar el sitio (GitHub Pages, que exige https y permite la cámara).

Las fotos quedan en `Relevamiento de gondola/Fotos/<local>/<góndola>/` de tu Drive.

## Cosas a tener en cuenta

- Las fotos se reducen a 1600 px y se guardan primero en el dispositivo; si no hay señal se suben solas al volver la conexión (el contador de la cabecera muestra las pendientes).
- Las imágenes en Drive quedan con "cualquiera con el enlace puede ver" para poder mostrarlas en el tablero.
- El `TOKEN` va dentro de `config.js`, que es público en un sitio estático: evita escrituras casuales pero no es un control de acceso fuerte. Para algo más estricto hace falta login real.
- El tablero no tiene contraseña; si el sitio es público, cualquiera con el `TOKEN` puede listar las fotos.
- Los planogramas se cachean solo como lista; las imágenes sin señal dependen de la caché del navegador.
