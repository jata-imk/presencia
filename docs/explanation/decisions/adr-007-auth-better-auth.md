# ADR-007 · Auth: Better Auth (rodar el flujo, no los primitivos)

**Decisión:** Better Auth para plomería (sesiones, argon2, verificación de email, OAuth futuro). UI 100% propia (las 8 pantallas ya diseñadas en Claude Design).

**Razón:** Rodar hashing/tokens/crypto propios es la receta clásica del desastre.

**Descartado:**

- Clerk y similares — UI impuesta, vendor lock-in.
- Crypto artesanal.

**Addendum (F4, 2026-08-08) — campos propios del usuario vía `additionalFields`, no tabla aparte.** `onboardingCompletedAt` y `timezone` (capturado en el paso 1 del onboarding) viven como `additionalFields` en `apps/api/src/auth/auth.ts`, no en una tabla `profiles` separada — son atributos del usuario, no un dominio propio. El servidor declara `input`/`required`/`type`/`defaultValue` por campo; el cliente (`apps/web/src/lib/auth-client.ts`) replica el mismo shape a mano vía el plugin `inferAdditionalFields` de `better-auth/client/plugins` (`apps/web` no depende de `@presencia/api`, así que no hay import compartido — es duplicación deliberada y acotada a un objeto de config). Ojo: el parser JSON del cliente de Better Auth revive strings ISO-8601 a `Date` automáticamente sin importar el `type` declarado — cualquier campo de fecha llega como `Date | null` al front pese a estar tipado `string` en el server. `ProtectedLayout` (`apps/web/src/routes/protected.tsx`) usa `onboardingCompletedAt === null` como el único gate de onboarding: cuentas viejas (pre-F4) tienen la columna NULL y por tanto SÍ ven onboarding en su próximo login — es el comportamiento esperado, no un bug.

**Addendum (F10.8.4, 2026-10-12): una API caída no es "sin sesión".** `ProtectedLayout` mandaba a `/login` cuando `useSession()` no traía datos, y eso también pasaba cuando la API no contestaba: al recargar durante un deploy, o con la API dev reiniciándose, la pestaña terminaba en el login con la sesión intacta. Better Auth ya distingue los dos casos. Un 401 borra `data`. Un 5xx o un fallo de red la conserva si ya la tenía y pone `error`. Por eso el problema solo aparecía al abrir o recargar. Ahora la API cuenta como caída solo con un fallo de red (sin status) o un 5xx, que es lo que se ve mientras un deploy reinicia el contenedor. En ese caso se muestra `ReconnectScreen`, que reintenta `refetch()` con espera creciente (de 3 s a 30 s) y tiene un botón para preguntar ya, que reinicia la espera. Cualquier otro error (un 401, o un 403 o 404 que esperar no arregla) manda a `/login` como antes, y la pantalla también trae esa salida. Mientras dura el intento la pantalla sigue visible: Better Auth vuelve a `isPending` y borra el error, y sin esa guarda parpadearía a vacío en cada intento.

**Addendum (F10.8.4, 2026-10-12): las pantallas de acceso de Claude Design.** Login, registro y "revisa tu correo" siguen `Auth Flow.html` (proyecto de Claude Design de las 8 pantallas). Las piezas están en `apps/web/src/components/auth/`, todas con tokens y en los dos temas.

Lo que se decidió con Jose:

- **Sin Google ni Apple en V1.** Los botones del mock no van: no hay cliente OAuth y el ADR lo deja como futuro.
- **"Cuenta bloqueada" se volvió "Demasiados intentos".** Better Auth no bloquea cuentas: limita intentos por IP (3 cada 10 s en sign-in) y responde 429 con `X-Retry-After`. El login muestra esa cuenta regresiva real y deshabilita el formulario. Decir "tu cuenta está bloqueada" mentiría. El límite se prendió también en dev (`rateLimit.enabled`), por paridad.
- **"Sesión expirada" es un aviso.** `ProtectedLayout` lo pide cuando pierde una sesión que había en la pestaña y no se cerró desde el menú (`lib/auth/sesion.ts`). Al entrar se vuelve a la ruta de origen (`state.from`).
- **Registro sin chequeo de "ya existe" y sin términos.**
  - Con `requireEmailVerification`, Better Auth responde igual a un correo registrado que a uno nuevo, para no revelar qué correos tienen cuenta. El aviso le llega al dueño por correo (`onExistingUserSignUp`).
  - El checkbox de términos llega con las páginas legales (F13).
  - El medidor de fuerza pide como mínimo "Aceptable": 8 caracteres y otro criterio.

**Correos:** todos salen de una plantilla (`apps/api/src/mailer/layout.ts`, de `Email Template.html`).

- Los colores van en hex porque los clientes de correo no leen variables CSS. Están en una sola constante.
- El isotipo es `isotipo-correo.png`, la versión clara: los clientes no soportan `mask-image`.
- El pie es mínimo, sin ligas legales ni dirección, hasta F13.
- Todo dato del usuario va escapado. Antes el nombre entraba crudo al HTML de verificación.

**Addendum (F10.8.4, 2026-10-13): recuperar la contraseña con un código de 6 dígitos.** El flujo vive en `/recuperar` y tiene cuatro pasos: correo, código, contraseña nueva y listo. Usa el plugin `emailOTP` de Better Auth (`otpLength: 6`, `expiresIn: 600`, `allowedAttempts: 3`, `disableSignUp`). No hace falta migración, porque los códigos van en `verifications`.

- **Solo dos rutas del plugin quedan abiertas:** pedir el código (`request-password-reset`) y cambiar la contraseña con él (`reset-password`). El resto se apaga en `disabledPaths`, incluido entrar con código.
  - `check-verification-otp` también queda apagado: responde "usuario no encontrado" a un correo sin cuenta y dejaría averiguar quién está registrado.
  - Por eso el código se valida al cambiar la contraseña, que responde igual haya cuenta o no. Si estaba mal, la pantalla regresa al paso del código con los intentos que quedan y conserva la contraseña escrita: al corregir el código, la cambia sin pedirla otra vez.
- **Un fallo al mandar el correo no llega al navegador.** A un correo sin cuenta no se manda nada, así que un 500 solo para los registrados diría cuáles existen. El error queda en el log.
- **`revokeSessionsOnPasswordReset`:** cambiar la contraseña cierra las demás sesiones. La pantalla entra con la contraseña nueva y lleva a los chats.
- **El correo del código** usa la plantilla de `Email Template.html`, con el código en dos grupos ("483 917").
