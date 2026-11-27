# Guía: demo en Render (manual)

Esta guía deja el proyecto como un **demo público** en Render, con cuentas temporales de 24 horas y datos de ejemplo. La app real de las 4 personas sigue funcionando en local; este despliegue usa una base de datos separada.

> Esta guía es manual: no incluye `render.yaml` ni automatizaciones. Tú creas el servicio en el dashboard de Render y pegas las variables.

## 1. Antes de empezar

Necesitas:

- El repositorio en GitHub con la rama `main`.
- Una cuenta gratuita en [Render](https://render.com).
- Una cuenta gratuita en [MongoDB Atlas](https://www.mongodb.com/atlas).
- El código de invitación que darás a los reclutadores.

No uses la misma base de datos que la app real. El demo crea y borra cuentas automáticamente.

## 2. Crear la base de datos en Atlas

1. Crea un cluster **M0** (gratuito).
2. Crea un usuario de base de datos con permiso de **lectura y escritura** solo sobre `gestor_gastos_demo`.
3. En **Network Access**, añade `0.0.0.0/0`. Render Free usa IPs de salida variables, así que no puedes limitar por IP.
4. En **Connect → Drivers**, copia la cadena de conexión. Sirve cualquiera de las dos:
   - **SRV** (recomendada si tu red la resuelve): `mongodb+srv://...`
   - **Estándar** (sin SRV, útil si hay problemas de DNS): `mongodb://...`

Añade el nombre de la base al final si no viene incluido:

```text
.../gestor_gastos_demo
```

No hace falta crear colecciones: se crean e indexan al primer uso.

## 3. Crear el Web Service en Render

1. Entra en el dashboard de Render y pulsa **New → Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configura:
   - **Name:** `node-gestor-gastos-demo` (o el que prefieras).
   - **Region:** la más cercana.
   - **Branch:** `main`.
   - **Runtime:** Node.
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. En **Advanced**, define el **Health Check Path** como `/api/health`.
5. No añadas discos ni comandos de pre-deploy.

## 4. Variables de entorno

En **Environment** del servicio, añade:

| Variable | Valor | Notas |
|---|---|---|
| `NODE_VERSION` | `26.13.1` | Si el build falla, usa `24.22.1`; el código es compatible |
| `HOST` | `0.0.0.0` | Obligatorio en Render |
| `COOKIE_SECURE` | `1` | Render sirve por HTTPS |
| `MONGODB_URI` | cadena de Atlas | Con `/gestor_gastos_demo` al final |
| `MONGODB_DB` | `gestor_gastos_demo` | Separada de la base real |
| `SESSION_SECRET` | 32+ caracteres | Genera uno con `openssl rand -hex 32` |
| `SESSION_DAYS` | `30` | Opcional |
| `REGISTRATION_CODE` | tu código | El que compartirás con el reclutador |
| `MAX_USERS` | `4` | Cupo del demo |
| `CURRENCY` | `COP` | Opcional |
| `DEMO_MODE` | `1` | Activa cuentas temporales y datos de ejemplo |
| `DEMO_USER_TTL_HOURS` | `24` | Duración de cada cuenta demo |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Opcional |
| `RATE_LIMIT_MAX_ATTEMPTS` | `10` | Opcional |

No pongas `PORT`: Render lo inyecta automáticamente.

## 5. Desplegar y probar

1. Pulsa **Create Web Service** y espera el build.
2. Abre la URL `https://<servicio>.onrender.com`.
3. Ve a **Crear cuenta**, introduce el código de invitación y registra un usuario de prueba.
4. Comprueba:
   - Aparece el banner de modo demo con la fecha de caducidad.
   - El panel tiene gastos de ejemplo del mes actual y del anterior.
   - Puedes crear, editar y borrar gastos.
   - El resumen y los filtros funcionan.
   - **Guardar copia** descarga el JSON.
   - **Salir** cierra la sesión y el login vuelve a funcionar.
5. Revisa los logs de Render: debe aparecer el mensaje de conexión a MongoDB y `Modo demo: cuentas de 24 h`.

## 6. Cómo funciona el demo

- Cada registro con el código crea una cuenta con `demo: true` y `expiresAt` a 24 horas.
- Al crearla se insertan 14 gastos de ejemplo en COP.
- Cada hora, y al arrancar, se eliminan las cuentas demo caducadas y sus gastos.
- Si ya hay 4 cuentas y llega otra persona, se borra la cuenta demo **más antigua** y se crea la nueva. Es el precio de mantener el demo siempre disponible.
- Login y registro tienen límite de intentos por IP; al superarlo responden `429`.
- El demo envía `X-Robots-Tag: noindex` y sirve un `robots.txt` que bloquea a los buscadores.
- La cookie de sesión es `HttpOnly` y `Secure`; el servidor añade HSTS.

## 7. Compartir con un reclutador

Envíale:

- La URL del servicio.
- El valor de `REGISTRATION_CODE`.
- Una nota: *"Es un demo. La cuenta y los datos se borran a las 24 h; si hay 4 cuentas activas, la más antigua se libera."*

Puede registrarse, probar la app y volver a entrar mientras la cuenta siga viva. Si su cuenta se borra, verá un `401` y la app lo llevará al login.

## 8. Limitaciones del plan Free

- El servicio **se duerme a los 15 minutos sin tráfico**. El primer acceso tarda alrededor de un minuto.
- **No hay shell**: no puedes ejecutar `npm run user` en Render.
- El sistema de archivos es efímero; no importa porque los datos están en Atlas.
- 750 horas de instancia al mes y 0,1 CPU. El login con `scrypt` puede tardar cerca de un segundo.
- Render puede reiniciar el servicio en cualquier momento. Las sesiones se mantienen porque la cookie está firmada y el usuario sigue en Atlas.
- Atlas M0 tiene 512 MB y puede pausarse por inactividad. No tiene backups automáticos.

## 9. Problemas frecuentes

### `querySrv ECONNREFUSED` o error de DNS

La red no resuelve registros SRV. Soluciones:

- Usa la cadena **estándar** de Atlas (sin `mongodb+srv://`).
- O cambia el DNS del entorno a `1.1.1.1` / `8.8.8.8`.

### `MongoServerSelectionError` o timeout

- Revisa que Atlas tenga `0.0.0.0/0` en Network Access.
- Verifica usuario, contraseña y que la base sea `gestor_gastos_demo`.
- Si el cluster estaba pausado, espera a que despierte.
- Codifica los caracteres especiales de la contraseña en la URI.

### `503 No se pudo conectar con la base de datos`

Mongo no responde en ese momento. Mira los logs de Render y el estado de Atlas.

### La sesión no se mantiene

- En Render debe estar `COOKIE_SECURE=1` y acceder por `https://`.
- Si usas un dominio propio, espera al certificado TLS.

### `429 Demasiados intentos`

Espera los minutos de `RATE_LIMIT_WINDOW_MINUTES` o reinicia el servicio. El límite vive en memoria y se reinicia con el proceso.

### El registro responde "El demo está completo"

Solo ocurre si las 4 cuentas son de tipo no demo. En un despliegue con `DEMO_MODE=1` todas las cuentas creadas por registro son demo y rotan.

## 10. Mantenimiento

- **Actualizar el demo:** haz push a `main`; Render vuelve a desplegar.
- **Cambiar el código de invitación:** edita `REGISTRATION_CODE` en Render y guarda; el servicio se reinicia.
- **Cambiar la duración:** ajusta `DEMO_USER_TTL_HOURS`. No afecta a cuentas ya creadas.
- **Resetear una contraseña:** desde tu equipo, apuntando a la base del demo:

```bash
MONGODB_URI='<cadena-de-atlas>' \
MONGODB_DB='gestor_gastos_demo' \
npm run user -- passwd ana
```

- **Borrar todas las cuentas demo:** elimina los documentos de `users` y `expenses` desde Atlas, o espera a que caduquen. No borres la base si quieres conservar el demo.
- **Backups:** Atlas M0 no incluye backups. Usa **Guardar copia** o `mongodump`.

## 11. Seguridad

- Usa una base de datos exclusiva para el demo.
- No pongas datos personales en las cuentas demo.
- Rota el código de invitación si se difunde demasiado.
- No subas `.env` al repositorio.
- Si el demo deja de ser público, pausa o elimina el servicio en Render.
