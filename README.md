# 💰 Gestor de Gastos

Aplicación web **local y multiusuario** para registrar gastos y ver los totales **por mes** y **por categoría**, con importes en **pesos colombianos (COP)**. Cada persona tiene su propia lista: nadie más puede ver ni modificar sus gastos.

Hecha con Node.js puro y MongoDB. El frontend es HTML/CSS/JavaScript sin bundler, con un tema cyberpunk minimalista.

Incluye un **modo demo** pensado para un despliegue público en Render: cuentas temporales, datos de ejemplo y rotación de cupos. La guía manual está en [`docs/render-demo.md`](docs/render-demo.md).

## Características

- Hasta **4 cuentas** (`MAX_USERS`), creadas con un **código de invitación**.
- Login con usuario y contraseña; sesión en cookie `HttpOnly` firmada.
- Cada cuenta ve **solo sus gastos**.
- Alta, edición, borrado y filtrado por mes/categoría.
- Resumen del mes, total histórico y desglose por categoría.
- Exportación de los gastos a JSON.
- Formato de moneda COP con 0 decimales.
- Interfaz y mensajes de error en español.
- Modo demo opcional: cuentas de 24 h, 14 gastos de ejemplo, limpieza automática y rotación de la cuenta más antigua.

## Requisitos

- Node.js **26.13.1** en local (fijado en `.node-version`). En Render también funciona **24.22.1**.
- [fnm](https://github.com/Schniz/fnm) para cambiar de versión.
- MongoDB: **Atlas gratuito** o **MongoDB local**.

```bash
fnm install 26.13.1   # solo la primera vez
fnm use               # dentro de la carpeta del proyecto
node -v               # v26.13.1
```

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env con tu MONGODB_URI, SESSION_SECRET y REGISTRATION_CODE
npm start
```

Abre <http://127.0.0.1:3000>. La primera vez te llevará al acceso; usa **Crear una** para registrar la primera cuenta con el código de invitación.

Para desarrollo con recarga automática:

```bash
npm run dev
```

## MongoDB

### Opción A: MongoDB Atlas (gratis)

1. Crea un cluster **M0** en [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Crea un usuario de base de datos con permiso de lectura/escritura sobre `gestor_gastos`.
3. En **Network Access**, permite tu IP actual. Si tu IP cambia mucho, puedes usar `0.0.0.0/0` (menos restrictivo).
4. Copia la cadena de conexión en `.env`:

```bash
MONGODB_URI=mongodb+srv://usuario:clave@cluster.mongodb.net/gestor_gastos
```

No hace falta crear la base de datos ni las colecciones: se crean al primer uso.

> El plan gratuito se pausa tras 30 días sin conexiones y no ofrece backups automáticos. Usa el botón **Guardar copia** o `GET /api/export`.

### Opción B: MongoDB local

Instala MongoDB Community en Windows o en WSL y arranca el servicio. Después usa:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/gestor_gastos
```

Si MongoDB está en Windows y la app corre en WSL, `127.0.0.1` suele funcionar. Si no, usa la IP del host de Windows.

Con Docker Desktop (con integración WSL activada):

```bash
docker run -d --name gestor-mongo -p 27017:27017 -v gestor-mongo-data:/data/db mongo:7
```

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `MONGODB_URI` | — (obligatoria) | Cadena de conexión de Atlas o MongoDB local |
| `MONGODB_DB` | `gestor_gastos` | Nombre de la base de datos |
| `MONGODB_USERS_COLLECTION` | `users` | Colección de usuarios |
| `MONGODB_EXPENSES_COLLECTION` | `expenses` | Colección de gastos |
| `SESSION_SECRET` | — (obligatoria, ≥32 caracteres) | Firma de las cookies. Genera con `openssl rand -hex 32` |
| `SESSION_DAYS` | `30` | Duración de la sesión en días |
| `REGISTRATION_CODE` | vacío | Código de invitación. Si está vacío, el registro está cerrado |
| `MAX_USERS` | `4` | Número máximo de cuentas |
| `CURRENCY` | `COP` | Código ISO de 3 letras |
| `HOST` | `127.0.0.1` | Interfaz de escucha; en Render usa `0.0.0.0` |
| `PORT` | `3000` | Puerto; Render lo define automáticamente |
| `COOKIE_SECURE` | sin definir | Pon `1` solo si sirves la app por HTTPS |
| `DEMO_MODE` | `0` | `1` activa cuentas temporales y datos de ejemplo |
| `DEMO_USER_TTL_HOURS` | `24` | Horas que dura una cuenta demo |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Ventana del límite de intentos |
| `RATE_LIMIT_MAX_ATTEMPTS` | `10` | Intentos permitidos por IP y ventana |
| `NODE_VERSION` | — | Solo en Render; usa `26.13.1` o `24.22.1` |

`.env` contiene secretos y está en `.gitignore`. No lo subas al repositorio.

## Primer uso

1. Abre <http://127.0.0.1:3000/register.html>.
2. Introduce el código de `REGISTRATION_CODE`, un usuario y una contraseña de al menos 8 caracteres.
3. Repite el proceso para las otras personas. Al llegar a `MAX_USERS`, el registro se cierra solo.
4. Cada cuenta verá únicamente sus propios gastos.
5. Usa **Salir** en la cabecera para cerrar sesión.

## Comandos

| Comando | Descripción |
|---|---|
| `npm start` | Arranca en <http://127.0.0.1:3000> |
| `npm run dev` | Arranca con `node --watch` |
| `npm test` | Ejecuta todos los tests |
| `npm run check` | Comprueba la sintaxis de `src/app.js` y `public/app.js` |
| `npm run user -- list` | Lista las cuentas |
| `npm run user -- add <usuario>` | Crea una cuenta (pide contraseña) |
| `npm run user -- passwd <usuario>` | Cambia la contraseña |
| `npm run user -- delete <usuario>` | Borra la cuenta y todos sus gastos |

Ejemplo:

```bash
npm run user -- list
npm run user -- passwd ana
```

## API

Todas las rutas devuelven JSON. Las que requieren sesión usan la cookie `gg_session`.

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | No | Comprueba que el servidor responde e informa si el demo está activo |
| `POST` | `/api/register` | No | Crea una cuenta con `inviteCode`, `username` y `password` |
| `POST` | `/api/login` | No | Inicia sesión con `username` y `password` |
| `POST` | `/api/logout` | No | Borra la cookie de sesión |
| `GET` | `/api/me` | Sí | Devuelve el usuario actual |
| `GET` | `/api/meta` | Sí | Categorías, moneda e información del modo demo |
| `GET` | `/api/expenses` | Sí | Lista gastos; admite `month=YYYY-MM` y `category` |
| `POST` | `/api/expenses` | Sí | Crea un gasto |
| `GET` | `/api/expenses/:id` | Sí | Devuelve un gasto propio |
| `PUT` / `PATCH` | `/api/expenses/:id` | Sí | Actualiza un gasto propio |
| `DELETE` | `/api/expenses/:id` | Sí | Borra un gasto propio |
| `GET` | `/api/summary` | Sí | Totales; admite `month=YYYY-MM` |
| `GET` | `/api/export` | Sí | Descarga los gastos propios en JSON |

### Ejemplos con curl

```bash
# Registro (guarda la cookie en cookies.txt)
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{"inviteCode":"TU_CODIGO","username":"ana","password":"secreto123"}'

# Login
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"ana","password":"secreto123"}'

# Crear un gasto (25.000 COP)
curl -s -b cookies.txt -X POST http://127.0.0.1:3000/api/expenses \
  -H 'Content-Type: application/json' \
  -d '{"amount":25000,"category":"Comida","date":"2026-11-25","description":"Mercado"}'

# Listar los gastos de noviembre
curl -s -b cookies.txt 'http://127.0.0.1:3000/api/expenses?month=2026-11'

# Resumen del mes
curl -s -b cookies.txt 'http://127.0.0.1:3000/api/summary?month=2026-11'

# Descargar copia
curl -s -b cookies.txt -o gastos.json http://127.0.0.1:3000/api/export

# Cerrar sesión
curl -s -b cookies.txt -X POST http://127.0.0.1:3000/api/logout
```

`cookies.txt` está en `.gitignore`.

### Códigos de error

| Código | Significado |
|---|---|
| `400` | Datos inválidos |
| `401` | Sin sesión o credenciales incorrectas |
| `403` | Registro cerrado, código de invitación incorrecto u origen no válido |
| `404` | Gasto o ruta no encontrada |
| `409` | El usuario ya existe |
| `413` | Cuerpo de la petición demasiado grande |
| `429` | Demasiados intentos de login o registro; espera la ventana indicada |
| `503` | No se pudo conectar con MongoDB |

## Datos y dinero

- Los importes se guardan como **enteros en céntimos** (`amountCents`); nunca como decimales.
- `toCents` acepta números o cadenas como `"12,50"` / `"12.50"` y redondea.
- En COP se aceptan pesos enteros con puntos de miles (`25000`, `25.000`); los decimales se rechazan en el formulario.
- Las categorías están fijas en `CATEGORIES` (`src/domain.js`): Comida, Transporte, Vivienda, Ocio, Salud y Otros.
- Las fechas usan `YYYY-MM-DD` y los meses `YYYY-MM`.

### Modelo en MongoDB

```js
// users
{
  _id,
  username,
  usernameLower,   // único, para login sin distinguir mayúsculas
  passwordHash,    // scrypt$N$r$p$salt$hash
  demo,            // true en cuentas temporales del demo
  expiresAt,       // fecha de caducidad o null
  createdAt
}

// expenses
{
  _id,
  ownerId,         // id del usuario, siempre desde la sesión
  amountCents,
  category,
  date,
  description,
  createdAt,
  updatedAt
}
```

Índices:

- `users.usernameLower` único.
- `users { demo: 1, createdAt: 1 }` y `users { demo: 1, expiresAt: 1 }` para la limpieza del demo.
- `expenses { ownerId: 1, date: -1, createdAt: -1 }`.
- `expenses { ownerId: 1, category: 1, date: -1 }`.

Todas las consultas filtran por `ownerId`. Si intentas acceder a un gasto de otra persona, la API responde `404`, no `403`.

## Copias de seguridad

- Usa el botón **Guardar copia** o `GET /api/export` para descargar tus gastos.
- Atlas gratuito no incluye backups automáticos. Si quieres una copia completa, puedes usar `mongodump` con tu cadena de conexión.
- La exportación incluye solo los gastos del usuario que la solicita.

## Demo en Render

El modo demo permite publicar una versión de prueba sin mezclar datos con la app real:

- Cada registro con el código crea una cuenta `demo` con caducidad de 24 h.
- Se añaden 14 gastos de ejemplo en COP para que el panel se vea completo.
- Al llegar a 4 cuentas, se libera la demo más antigua.
- La limpieza borra cuentas caducadas y sus gastos cada hora.
- Login y registro tienen límite de intentos; el demo no se indexa en buscadores.

La guía manual completa (Atlas, Render, variables, pruebas y problemas frecuentes) está en [`docs/render-demo.md`](docs/render-demo.md).

Variables mínimas del demo:

```bash
DEMO_MODE=1
DEMO_USER_TTL_HOURS=24
HOST=0.0.0.0
COOKIE_SECURE=1
MONGODB_DB=gestor_gastos_demo
```

## Tests

```bash
npm test
```

Los tests usan repositorios en memoria y **no tocan tu base de datos real**. Cubren validaciones, contraseñas, cookies de sesión, registro, login, aislamiento entre usuarios, resumen, exportación y modo demo (siembra, caducidad, rotación y rate limit).

Para probar también contra MongoDB, define una base de pruebas desechable:

```bash
MONGODB_URI_TEST='mongodb://127.0.0.1:27017' npm test
```

El test crea una base con nombre aleatorio y la borra al terminar. **No uses tu `MONGODB_URI` real.**

## Seguridad y limitaciones

- Contraseñas con `scrypt` y comparación en tiempo constante.
- Cookie `gg_session` `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` con HTTPS.
- Registro cerrado con código de invitación y límite de cuentas.
- Comprobación de `Origin` en peticiones que modifican datos.
- Cuerpo máximo de 1 MB.
- Límite de intentos en login y registro (`429`).
- En modo demo: cuentas temporales, rotación, `X-Robots-Tag: noindex` y `robots.txt` cerrado.
- Sin revocación de sesión al cambiar contraseña y sin recuperación de contraseña por email. Para cambiar una contraseña usa `npm run user -- passwd`.
- La app escucha en `127.0.0.1` por defecto: no es accesible desde otros equipos de la red. En Render debe usarse `HOST=0.0.0.0`.
- Si el equipo es compartido, cualquier persona con acceso al sistema y a MongoDB podría leer los datos por fuera de la app.

## Estructura

```text
.
├── src/
│   ├── server.js      # Servidor local: estáticos + API
│   ├── app.js         # Rutas, autenticación y errores
│   ├── domain.js      # Validaciones, categorías y errores
│   ├── mongo.js       # Repositorios e índices de MongoDB
│   ├── demo.js        # Datos de ejemplo, caducidad y rotación
│   ├── rate-limit.js  # Límite de intentos en memoria
│   ├── users.js       # Hash y verificación de contraseñas
│   ├── auth.js        # Firma y lectura de cookies de sesión
│   ├── config.js      # Variables de entorno
│   └── summary.js     # Totales por mes y categoría
├── public/
│   ├── index.html     # Pantalla principal
│   ├── app.js         # Estado y llamadas a la API
│   ├── login.html     # Acceso
│   ├── login.js
│   ├── register.html  # Registro con invitación
│   ├── register.js
│   ├── styles.css     # Tema cyberpunk
│   ├── robots.txt     # Bloquea la indexación del demo
│   └── favicon.svg
├── scripts/
│   └── user.js        # Administración de cuentas
├── docs/
│   └── render-demo.md # Guía manual del demo en Render
├── test/              # Tests de dominio, auth, API, demo y resumen
├── test-support/      # Repositorios y servidor en memoria
├── data/              # Datos del sistema anterior (legado)
├── .env.example
├── AGENTS.md
└── README.md
```

## Datos del sistema anterior

`data/expenses.json` pertenece a la versión de un solo usuario con almacenamiento en archivo. La app actual **no lo lee**. No lo borres: se conserva como respaldo. Si quieres pasar esos gastos a una cuenta, hay que hacerlo de forma manual o con un script de migración.
