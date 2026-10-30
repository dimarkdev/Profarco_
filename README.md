# Relevamiento de góndola · Profarco

Tres páginas independientes, cada una con su propio enlace:

| Página | Quién la usa | Qué hace |
|---|---|---|
| `index.html` | Relevadores | Ingresan su CI, eligen punto de venta y zona (Pestañas, Punteras, Góndola Principal, Islas / Exhibidores), ven el planograma de referencia, toman las fotos y responden las preguntas de cumplimiento. |
| `tablero.html` | **Cliente** (es el enlace que se comparte) | Solo lectura, con clave. KPIs, % de cumplimiento, observaciones, cobertura por punto de venta y galería con la foto junto al planograma. Exporta CSV. No muestra CI ni enlaces a otras páginas. |
| `admin.html` | Solo nosotros | Carga y borra los planogramas (con PIN). No lo compartas. |

## Datos en Drive (carpeta PROFARCO)

```
PROFARCO/
├─ 01_Planogramas/<punto de venta o _General>/<tipo>/   imágenes de referencia
├─ 02_Fotos/<punto de venta>/<tipo>/<aaaa-mm-dd>/       fotos de los relevadores
└─ 03_Maestros/
   ├─ Relevadores        CI · Nombre completo · Activo
   ├─ Puntos de venta    Punto de venta · Cadena · Ciudad · Activo
   └─ Registro de fotos  una fila por foto (de acá lee el tablero)
```

- **Altas y bajas:** se editan las planillas `Relevadores` y `Puntos de venta`. Para dar de baja, escribir `NO` en la columna Activo.
- Un planograma `_General` vale para todos los puntos de venta que no tengan uno propio de ese tipo.
- La lista de relevadores nunca sale completa hacia la web: el formulario solo recibe el nombre que corresponde al CI ingresado.

## Preguntas de cumplimiento

Están en `config.js` (`CRITERIOS`). Las tres primeras son excluyentes entre sí (cumple / parcial / no cumple); el resto se combina. Se pueden cambiar los textos o agregar opciones; no cambies los `id` una vez que haya fotos.

## Probarlo ya (modo prueba)

```
python -m http.server 8080
```

y abrir `http://localhost:8080/index.html`. Con `APPS_SCRIPT_URL` vacío todo queda en el navegador. CI de prueba `1234567`, clave del tablero `0000`, PIN de administración `1234`.

## Conectar con Drive

1. En [script.google.com](https://script.google.com) crear un proyecto con la cuenta dueña de la carpeta PROFARCO y pegar `apps-script/Code.gs`.
2. *Configuración del proyecto → Propiedades del script*: `TOKEN` (clave larga al azar), `ADMIN_PIN` (planogramas) y `TABLERO_PIN` (clave del cliente).
3. *Implementar → Nueva implementación → Aplicación web*: ejecutar como **tú**, acceso **Cualquier persona**. Autorizar los permisos de Drive y Hojas de cálculo. Copiar la URL.
4. En `config.js` poner `APPS_SCRIPT_URL` y el mismo `TOKEN`. Publicar con GitHub Pages (https, necesario para la cámara).

## Qué tener en cuenta

- Las fotos se reducen a 1600 px y se guardan primero en el dispositivo; sin señal se suben solas al volver la conexión (el contador de abajo muestra las pendientes).
- Las imágenes quedan con "cualquiera con el enlace puede ver" para poder mostrarlas en el tablero.
- El `TOKEN` va dentro de `config.js` (público en un sitio estático): evita usos casuales pero no es un control de acceso fuerte. La protección real del tablero es su clave (`TABLERO_PIN`); cámbiala si se filtra.
- El tablero muestra el nombre del relevador; el CI no sale en ningún caso hacia el cliente.
- Los planogramas sin señal dependen de la caché del navegador.
