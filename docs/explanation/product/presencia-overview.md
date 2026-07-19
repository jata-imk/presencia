# Presencia — Overview del Producto

> Este documento explica QUÉ es Presencia, POR QUÉ existe,
> y CÓMO está estructurado a nivel macro. Para detalles
> específicos de cada módulo, ver los documentos individuales
> (`presencia-chat.md`, `presencia-calendario.md`, etc.).

---

## 1. La historia detrás del producto

### El problema que resolvemos

Crear contenido para redes sociales hoy es una tarea fragmentada.
Un creator tiene una idea camino al gym. Llega a casa y la
escribe en Notion. Después la pasa por ChatGPT para refinarla.
Después la adapta manualmente para cada red social (porque
LinkedIn no es Twitter, Twitter no es Instagram). Después la
copia a Buffer para programarla. Dos semanas después, no
recuerda dónde quedó el contenido ni qué le funcionó.

Este proceso tiene tres problemas reales:

**Problema 1: La fragmentación mata la consistencia.**
Cuando saltás entre 5 herramientas, perdés el hilo. Los
creators que conocemos publican en rachas (una semana con
mucho contenido, tres semanas en silencio) precisamente
porque mantener el flujo entre tantas herramientas agota.

**Problema 2: La adaptación manual es repetitiva y mediocre.**
Adaptar un concepto a 5 redes diferentes lleva 40 minutos.
Y en general, cuando estás cansado, terminás haciendo
copy-paste en lugar de adaptar genuinamente para cada
plataforma. El contenido sufre.

**Problema 3: Las herramientas de IA genéricas no conocen
al creator.** ChatGPT produce contenido que suena a IA.
No conoce tu tono, tu audiencia, tus tendencias del nicho,
tus posts que funcionaron antes. Cada conversación empieza
de cero.

### Nuestra hipótesis

Si convertimos toda esa fragmentación en una sola conversación
con un asistente que SÍ te conoce —tu voz, tu audiencia, tu
nicho, y crucialmente tu contexto cultural y regional—, y que
es accesible desde donde ya vives (chat web, WhatsApp,
Telegram), el flujo de creación de contenido se vuelve natural
en lugar de extenuante.

No es "una herramienta más de IA". Es el reemplazo del flujo
completo: idea → generación → adaptación → programación →
análisis. Todo conversacional. Todo con memoria persistente.

**El diferenciador real no es el multi-canal (eso es solo cómo
entra el pedido). El diferenciador es la profundidad cultural.**
Las IA genéricas de los gigantes (ChatGPT, y ahora Meta+Manus
metido nativo en WhatsApp e Instagram) hablan un español de
aeropuerto: neutro, sin patria, correcto pero ajeno. Sirven a
mil millones de personas a la vez, así que son genéricos por
diseño. Presencia hace lo contrario: le habla a un creator
mexicano como se habla en México, conoce las tendencias de SU
mercado en español, y mantiene SU registro. Ese foso no se
puede comoditizar desde un producto global.

### La promesa

**"Tu marca personal, en automático."**

El creator tiene la idea, Presencia se encarga del resto.
No de forma mágica que reemplaza al humano, sino de forma
asistida donde el humano sigue siendo el director creativo
pero deja de hacer el trabajo mecánico.

### El registro: español mexicano por defecto

Presencia tutea como se tutea en México. Nada de "vos" ni
"querés" salvo que el usuario elija explícitamente ese
registro. La interfaz, el copy, y el tono por defecto de la
IA están en español mexicano neutro-profesional. Esto no es
un detalle cosmético: es la manifestación más chiquita y más
defendible del moat cultural. Un mexicano que lee "¿querés
publicar hoy?" siente algo importado aunque no sepa nombrarlo.
Que Presencia hable su español es una batalla que el gigante
global no puede pelear sin volverse chiquito.

---

## 2. Quién usa Presencia

### El mercado objetivo: creator mexicano (beachhead Mérida/sureste)

Presencia no le habla a "todos los hispanohablantes". Eso
serían ~600 millones de personas repartidas en mercados que
escriben, venden y consumen distinto —el español de Madrid,
CDMX, Buenos Aires y Bogotá no son el mismo idioma operativo—.
Apuntar a "hispanohablante" en general es un _wildcard import_:
traes todo el namespace y no controlas nada, y terminas
compitiendo de frente contra el genérico global sin ventaja.

El foco es **México**, con **Mérida / sureste como cabeza de
playa (beachhead)**: donde desembarcamos primero porque es
nuestro terreno —conocemos el mercado, los creators, podemos
tener usuarios cara a cara y feedback de carne y hueso—. La
jugada no es "conquistar México" de día uno; es clavar
Mérida/sureste tan profundo que sea imbatible ahí, y dejar
que el círculo se expanda solo hacia el resto del país y
después LATAM. Nadie conquista un país; conquistas una ciudad
y el resto es escalamiento.

Mérida es el beachhead, no el techo. México es el mercado.
LATAM es la expansión.

### Persona primaria: El creator independiente

**Quién es:** Adulto entre 25 y 40 años. Crea contenido como
actividad principal o complementaria importante. Maneja
entre 3 y 5 redes sociales activamente. Genera ingresos por
contenido (sponsoreos, productos digitales, audiencia
monetizada, info-productos).

**Su día típico:** Tiene ideas todo el tiempo pero no siempre
está frente a la computadora cuando le llegan. Pasa horas
adaptando un mismo concepto a diferentes redes. Sufre la
inconsistencia: cuando está en racha publica todo el día,
cuando no, desaparece por semanas.

**Lo que le importa:** Que su contenido suene a él, no a IA
genérica. Mantener consistencia sin sacrificar calidad.
Aprovechar al máximo cada idea (porque las buenas ideas son
escasas).

**Lo que NO le importa:** Tener mil features. Tener integraciones
exóticas. Pagar barato (paga si el producto le devuelve tiempo
real).

### Persona secundaria: El community manager freelance

**Quién es:** Adulto entre 25 y 35 años. Gestiona redes para
entre 3 y 8 clientes simultáneamente. Su modelo de negocio es
cobrar mensualidad por gestión.

**Su día típico:** Cambia constantemente entre los tonos de
cada cliente (formal para uno, casual para otro, técnico para
otro). Justifica horas a cada cliente. Quiere crecer su negocio
pero está en el límite de lo que puede hacer solo.

**Lo que le importa:** Mantener voces distintas para cada
cliente sin confundirlas. Escalar sin contratar. Reportes que
pueda mandar a cada cliente sin hacer trabajo manual.

**Cómo lo resolvemos:** Las carpetas tipo Projects de Presencia
funcionan como un workspace por cliente, cada uno con su
contexto de marca propio.

### Persona V2: Pequeñas empresas y solopreneurs

Founders que necesitan presencia digital pero no es su core
business. Para esta persona, V2 traerá plantillas industria-
específicas y un modo "automático asistido" donde la IA
propone y el humano aprueba.

---

## 3. Cómo está estructurada la app

### El principio fundamental

**Información architecture plana.** El sidebar principal tiene
máximo 5 módulos. Cero "creatividad" en la navegación: si vas
a Chats, el botón dice "Chats", no algo poético.

Razón de fondo: cada item nuevo en el sidebar es deuda
cognitiva para el usuario. Cuando una app tiene 15 items, el
usuario tarda en encontrar lo que busca. Cuando tiene 5, lo
encuentra inmediatamente. La sobre-organización aparenta ser
útil pero en realidad confunde.

### Los 5 módulos principales

#### Chats

El núcleo creativo. Donde el usuario conversa con la IA para
generar, adaptar y refinar todo su contenido. Es donde el
usuario pasa la mayoría del tiempo dentro de Presencia. Si
falla este módulo, falla el producto.

Detalles en `presencia-chat.md`.

#### Calendario

El módulo de control temporal. Donde el usuario ve qué se
publica cuándo, gestiona borradores que aún no programó, y
ajusta su pipeline editorial. Responde la pregunta operativa:
"¿qué pasa esta semana?".

Detalles en `presencia-calendario.md`.

#### Ritmo

El módulo estratégico. Configura cadencia (cuántos posts por
semana en cada red), define mejores horarios, monitorea
tendencias del nicho del usuario, y propone publicaciones por
temas virales. Responde la pregunta estratégica: "¿cuándo y
sobre qué debo publicar?".

Diferencia clave con Analíticas: **Ritmo mira hacia adelante**
(planificación, estrategia). Analíticas mira hacia atrás
(evaluación, performance). Son verbos opuestos del flujo de
trabajo.

Detalles en `presencia-ritmo.md`.

#### Analíticas

El módulo de evaluación. Performance detallado de las
publicaciones: engagement, alcance, conversión. Comparativas
entre plataformas. Insights accionables ("tus posts educativos
generan 3x más engagement").

#### Biblioteca

El repositorio multimedia. Donde viven todos los assets
generados por la IA (imágenes, videos, audio) y los que el
usuario subió. Cada asset linkea de vuelta a su chat de origen.
Es el "Drive creativo" de la app.

### La página de Configuración

Configuración NO es un módulo en el sidebar principal. Es una
página standalone con su propio sub-sidebar.

Razón: configuración se usa esporádicamente (una vez al
principio, ajustes ocasionales). Si la mezclamos con módulos
de uso diario, satura. Apps top-tier modernas (Linear, Notion,
Slack) hacen exactamente esto.

Configuración se accede desde:

- El footer del sidebar principal (icono engranaje, junto al
  avatar)
- El menú del avatar (al hacer click en el avatar de cualquier
  pantalla)
  Y se divide en 3 grupos:

**CUENTA:** Mi perfil, Apariencia
**CONTENIDO:** Voz de marca, Plantillas, Canales conectados
**PLAN:** Créditos y plan, Facturación

La sub-sección más importante es **Voz de marca**. Es donde el
usuario configura el tono, estilo, audiencia, temas clave y
CTAs preferidos. Esa configuración alimenta TODO el output de
la IA en el resto de la app. Sin esto bien configurado,
Presencia produce contenido genérico. Con esto bien
configurado, Presencia produce contenido que suena al usuario.

Acá vive buena parte del **moat cultural**. La Voz de marca no
es solo "formal vs casual"; incluye el registro cultural y
regional: de qué mercado eres, a qué audiencia le hablas, qué
modismos están permitidos o prohibidos, si se usan anglicismos
o no. Esto es lo que el genérico global no afina.

**Sistema de registros de tono.** El tono por defecto es
neutro-profesional, pero el usuario puede elegir variantes:
informal, "de barrio", investigador/técnico, profesional, etc.
Este sistema de tonos es uno de los facilitadores centrales del
producto, junto con Ritmo (las tendencias del nicho).

El "Tono" **no es una feature ni un módulo aparte**: vive dentro
de la Voz de marca como el registro base persistente. El
selector de "Estilo de respuesta" ad-hoc por mensaje en Chat
(Conciso, Explicativo, Creativo) es una capa distinta y
complementaria —ajuste puntual de una respuesta, no del
registro de marca—. Decisión cerrada: un solo lugar canónico
para el tono (Voz de marca), sin 6º módulo en el sidebar.

### Las redes sociales soportadas y la capa de publicación

Presencia soporta 7 redes en V1, pero **no las trata parejo**.
Hay una jerarquía clara que refleja a nuestro creator mexicano:

- **Primarias — Facebook, Instagram, TikTok.** Son el corazón
  del producto. Redes **visuales** (imagen y video primero),
  donde vive la mayoría de nuestro público. El diseño y los
  previews deben optimizarse para estas tres.
- **Secundaria — LinkedIn.** Para el segmento profesionista
  que quiere mejorar su perfil. Importante pero no es el caso
  central. (Ojo: el módulo Chat ya diseñado usa LinkedIn como
  ejemplo estrella; eso es deuda de ejemplos heredada del
  posicionamiento viejo, no la prioridad real.)
- **Terciarias — YouTube, Threads, X.** Soportadas vía la capa de
  publicación, pero no son foco de diseño en V1.
  **El modelo de contenido cambia según la red (decisión clave):**

- **Instagram / Facebook (visual-first):** la imagen es
  **ciudadano de primera clase**, no "acompañante". Generar,
  iterar, elegir variantes de imagen es un flujo central de
  cara al usuario, no un subproducto automático. La card de
  publicación de estas redes pone la imagen como protagonista
  y el texto debajo (como se ve realmente en el feed).
- **TikTok (video, modo guion):** Presencia **no genera video
  con IA en V1**. Hace la parte de dirección creativa: guion,
  hook, caption, hashtags y notas de grabación. El creator
  graba y sube su propio video. Razón: video IA es caro, lento
  y de calidad dudosa hoy; y mantiene al humano como director
  creativo (coherente con la promesa del producto). La "card"
  de TikTok es entonces un paquete de guion, no un preview de
  video.
- **LinkedIn / X / Threads (texto-first):** el texto es
  protagonista, imagen opcional acompañante. Es el molde con el
  que se diseñó el módulo Chat original.
  Implicación de diseño: **no existe una sola card de publicación
  universal.** Hay al menos tres arquetipos (visual-first,
  guion-de-video, texto-first). El módulo Chat actual asume el
  arquetipo texto-first como molde único; eso hay que reconciliar.

La publicación y programación real se apoya en **PostFast**
(postfa.st) como capa de infraestructura vía su REST API / MCP
Server. PostFast es plomería: cubre las 6 redes (y más),
programación, drafts, calendario y analíticas básicas.
Presencia construye SOBRE esa capa, lo que tiene una
implicación de posicionamiento crítica: **el valor de Presencia
NO puede estar en programar/publicar** (eso es comodity que
PostFast revende por ~€10/mes). El valor está exclusivamente en
la capa conversacional + cultural que ponemos encima.

> **Nota de arquitectura (riesgo de proveedor):** depender de
> una sola API de publicación de un proveedor indie es un
> _single point of failure_. Conviene envolver PostFast detrás
> de un adaptador (patrón adapter) para poder cambiar de
> proveedor sin tocar el resto del sistema. No te cases con la
> API; ponle una capa de abstracción.

---

## 4. Cómo se ve y se siente

### La identidad visual

Pastel suave + Plum profundo. No es la paleta típica de SaaS
B2B (azules corporativos, grises plomos). Tampoco es
infantil tipo Duolingo. Está en un punto medio: cálido pero
serio, con personalidad pero profesional.

**Brand palette pastel:**

- Pink Orchid (`#CDB4DB`) — el "color de la marca" más usado
- Pastel Petal (`#FFC8DD`) — secundario, blush
- Blush Pop (`#FFAFCC`) — vibrante, para CTAs
- Icy Blue (`#BDE0FE`) — informativo, AI indicators
- Sky Blue (`#A2D2FF`) — links, estado programado
  **Deep brand:**
- Plum (`#3D2645`) — el ancla de marca, logo, headings
- Plum Light (`#6B4A7A`) — accents

### Las tipografías

- **Display:** Space Grotesk (para títulos grandes)
- **Body:** Noto Sans (para todo el resto)
  La combinación da personalidad sin sacrificar legibilidad.

### El tono visual general

Modern minimalism con personalidad. Spacing generoso.
Animaciones sutiles (sin bounces, sin spring physics, sin
neon, sin glassmorphism exagerado). El producto debe sentirse
calmado, no abrumador. El usuario viene a crear contenido,
no a admirar la UI.

### Iconografía

Lucide Icons en toda la UI (stroke 1.5px). Logos oficiales
de redes cuando aparecen plataformas (LinkedIn azul, X negro,
etc.). Emojis SOLO para iconos personalizables (carpetas del
usuario) y copy de marketing. **Nunca emojis en chrome de
navegación.**

---

## 5. El App Shell: la estructura común a toda la app

Cada pantalla autenticada de Presencia vive dentro de un
contenedor llamado App Shell. Entender el App Shell es
entender la app entera.

### El Sidebar principal

Es el navegador izquierdo, siempre visible (colapsable en
mobile). De arriba a abajo:

**Logo Presencia.** Click lleva al estado inicial (Chats
vacío).

**Botón "+ Nuevo chat".** Prominente, color destacado. Crea
una conversación nueva desde cualquier pantalla. Razón de
prominencia: la acción más común y deseable del producto es
empezar a crear. Hacerla fácil es estratégico.

**Lista de módulos (5 items).** Chats, Calendario, Ritmo,
Analíticas, Biblioteca. Cada uno con su icono Lucide y nombre
descriptivo. El módulo actualmente activo se destaca
visualmente (highlighted con tinte de la paleta).

**Sección Carpetas.** Hasta 5 carpetas visibles + link "Ver
todas". Las carpetas son tipo Projects (no solo agrupaciones
visuales — comparten contexto entre los chats que contienen).
El usuario las usa para organizar chats por proyecto, cliente,
o tema.

**Sección Recientes.** Los últimos 5-7 chats del usuario.
Cada uno muestra: iconos de canales tocados (max 2 + número
si hay más), título del chat, timestamp relativo. Hover
muestra menú contextual con opciones (renombrar, mover,
archivar, eliminar).

**Footer del sidebar:**

- Avatar + nombre del usuario
- Indicador de créditos: "⚡ 142 créditos restantes"
- Click en el footer abre menú: Mi cuenta, Configuración,
  Modo oscuro toggle, Cerrar sesión

### El Topbar

Es la barra superior, siempre visible. De izquierda a derecha:

**Título de la sección actual.** O breadcrumb si está dentro
de un sub-flujo (ej: "Chats > Post sobre IA").

**Search global.** Con atajo Cmd/Ctrl+K visible. Busca en
chats, posts, plantillas — todo el contenido del usuario.
Click expande a modal de búsqueda con resultados categorizados.

**Toggle modo claro/oscuro.** Icono sun/moon.

**Avatar del usuario.** Mismo menú que el footer del sidebar.

### El área de contenido

Es donde cada módulo renderiza su pantalla específica.
Tiene padding consistente, scroll independiente del sidebar,
y soporta diferentes layouts internos según el módulo:

- Layout simple de una columna (Chat estado vacío)
- Layout con panel lateral (Calendario con borradores)
- Layout split (Chat con panel expandido de publicación)

### El layout responsive

**Desktop (≥1024px):** Sidebar expandido (240-280px),
contenido cómodo.

**Tablet (768-1023px):** Sidebar colapsado por default (solo
iconos, 64px). Hover lo expande temporalmente.

**Mobile (<768px):** Sidebar oculto. Hamburger en topbar abre
drawer overlay con backdrop. Search se vuelve un icono que
expande a fullscreen modal.

---

## 6. El sistema de créditos

Presencia se monetiza con un modelo de **créditos**, no de
mensajes ilimitados.

### Por qué créditos y no "mensajes ilimitados"

Diferentes acciones tienen costos reales muy distintos (un
chat simple consume mucho menos cómputo que generar una imagen
de alta calidad o adaptar contenido para 5 redes). Un modelo
de mensajes ilimitados forzaría a poner caps fuertes para
evitar abuso, lo cual frustra a usuarios pesados. Un modelo
de créditos permite que cada usuario gaste según sus
necesidades reales.

### Costos aproximados (referenciales)

- Chatear con la IA: 1 crédito
- Generar idea de post: 2 créditos
- Adaptar a 5 redes: 5 créditos
- Generar imagen: 3-5 créditos
- Generar calendario semanal: 10 créditos
  Esto es referencial. El balance fino se ajusta con uso real.

### Cómo se ve en la app

- El indicador en el footer del sidebar es siempre visible
  pero discreto: "⚡ 142 créditos restantes"
- Al lado del botón de enviar mensaje aparece un costo
  estimado cuando hay texto: "≈ 2 créditos"
- Cuando el usuario baja del 20% de su balance mensual,
  aparece un banner sutil arriba del input: "Te quedan 28
  créditos este mes. [Ver plan]". Razón: avisar antes de
  bloquear es mejor UX que sorprender con un error.
- Cuando se queda sin créditos al intentar una acción:
  modal explicativo (no técnico) con opción de upgrade o
  esperar al próximo ciclo.

---

## 7. Multi-canal: un canal de captura, no el killer feature

### Aclaración importante de posicionamiento

Versiones anteriores de este documento trataban el multi-canal
como "el killer feature". **Lo degradamos conscientemente.** El
multi-canal es valioso pero NO es un foso defensible, por dos
razones:

1. **WhatsApp es de Meta**, y Meta compró Manus (>$2 mil
   millones, dic 2025) y lo está metiendo nativo en WhatsApp
   Business e Instagram. Poner nuestro diferenciador #1 sobre
   la cancha del rival más grande —que además es dueño del
   estadio— es construir la casa en terreno ajeno. Riesgo de
   plataforma puro: nos pueden subir el costo por conversación,
   cambiar términos, o priorizar su Manus nativo.
2. **El multi-canal ya no diferencia.** Lo que diferencia es
   QUÉ sirve la cocina (profundidad cultural + cero setup), no
   POR DÓNDE entra el pedido.
   Por eso el killer feature real es la **profundidad cultural**
   (ver sección 1). El multi-canal es infraestructura de captura,
   no la propuesta de valor.

### Qué significa "multi-canal" en V1

El usuario puede iniciar y continuar una idea desde 3 lugares,
con las conversaciones **sincronizadas entre canales:**

- Chat web (in-app, el hogar principal del producto)
- WhatsApp
- Telegram
  **Telegram es el canal de mensajería prioritario para arrancar**,
  no WhatsApp. Razón técnica y estratégica: los bots de Telegram
  son gratis, abiertos y flexibles; la WhatsApp Business API es
  de pago por conversación, con plantillas que Meta tiene que
  aprobar, y vive bajo el techo del rival. Arrancar por Telegram
  nos **desacopla de Meta** justo cuando Meta se vuelve
  competidor. WhatsApp se suma cuando haya tracción para bancar
  el costo.

**Canales opcionales a futuro (V2+):** correo, SMS, Discord,
Facebook Messenger.

### Por qué importa el canal de mensajería

El creator no vive frente a su computadora todo el día. Las
ideas le llegan en el gym, en el súper, manejando, cenando con
amigos. Si para capturar una idea tiene que abrir una app que
usa solo a veces, la idea se pierde. Si Presencia es un
contacto más en su mensajería, la fricción de capturar baja a
cero. Eso sigue siendo cierto y valioso —solo que es
conveniencia, no foso.

### Cómo se siente en la práctica

Ejemplo de flujo real:

1. **9:30 AM, en el gym:** El creator graba un audio en
   Telegram a "Presencia": _"Se me ocurrió una idea: tres
   lecciones que aprendí en mi primer año como freelancer.
   ¿Me la desarrollas?"_
2. **9:31 AM:** Presencia transcribe el audio, genera 3
   ideas concretas con bullet points, las manda por Telegram.
3. **11:00 AM, comiendo:** El creator responde: _"Me gusta
   la segunda. Hazme un post de LinkedIn."_
4. **11:01 AM:** Presencia genera el post de LinkedIn. Lo
   manda con el preview.
5. **3:00 PM, llega a casa, abre la app web:** Ve la
   conversación completa, con todas las cards de publicación
   visibles. Refina el post en el panel lateral expandido
   (donde tiene más herramientas que en el chat de mensajería).
   Lo programa para mañana.
6. **El indicador del chat en el sidebar muestra:** 🟢💬
   (estuvo en Telegram y en web).
   Es un flujo cómodo y fluido. Pero el motivo por el que el
   usuario elige Presencia y no el Manus de WhatsApp no es este
   flujo —es que Presencia le habla en su idioma, conoce su
   mercado, y mantiene su voz. El canal es el envase; la cultura
   es el producto.

---

## 8. Lo que conscientemente NO incluimos en V1

Tomar decisiones de qué NO hacer es tan importante como qué
sí. Estas son las decisiones que tomamos para mantener el
scope manejable y el producto enfocado.

**No incluimos en V1:**

- **Dashboard / Home dedicado.** El usuario entra directo a
  Chats. No queremos sumar una pantalla intermedia que
  agregue clicks. Si después validamos que se necesita, lo
  agregamos.
- **Notificaciones in-app.** No hay icono campana, no hay
  panel de notifs. Razón: las notifs importantes pueden venir
  por Telegram/WhatsApp naturalmente. Sumar un sistema más
  es ruido innecesario en V1.
- **Equipo / Multi-usuario.** Una cuenta es una persona.
  Para CMs freelance con múltiples clientes, usamos carpetas,
  no sub-cuentas. Multi-usuario llega en V2.
- **API pública / Webhooks.** No exponemos integraciones
  para developers en V1. Llega en V2.
- **Compartir conversaciones por URL.** Útil para colaboración
  pero no esencial. V2.
- **Modo voz interactivo.** En V1 solo transcribimos audio a
  texto. Conversación de ida y vuelta por voz queda para V2.
- **Apps nativas iOS/Android.** En V1 somos web + canales de
  mensajería. Apps nativas son una inversión grande que solo
  vale si validamos product-market fit primero.
- **Generación de video con IA.** Para TikTok/Reels, Presencia
  hace guion, hook, caption y hashtags; el creator graba.
  Generar el video entero con IA es caro, lento y de calidad
  dudosa hoy. Si se valida demanda y la tecnología madura, V2.

### Por qué importa documentar esto

Cuando estás construyendo, vas a sentir tentación de agregar
features "que serían cool". El 90% de las veces, esas
features están en esta lista por una razón. Tener un documento
explícito de "esto no se hace" te ayuda a ti mismo a no
caer en feature creep.

---

## 9. Cómo se prioriza el roadmap a partir de hoy

### Lo que ya está diseñado

- Auth completo (8 pantallas)
- Onboarding completo (5 pantallas: Welcome → Voz → Connect → Goals → Ready)
- Design System completo
- App Shell completo
- Módulo Chat (6 archivos: estado vacío, conversación, cards v2,
  programación/gestión, arquetipos standalone, módulo compartido
  `arquetipos.jsx`). _Gap conocido: el drawer de programación
  (`Chat Part 3.html`) todavía no consume `arquetipos.jsx` — falta
  adaptar la preview compacta por arquetipo y activar el toggle
  multi-red (con opción de dejar redes individuales en borrador).
  Ver `presencia-chat.md`._
- Módulo Calendario completo (6 archivos: Vista Mes, Semana y Día,
  Panel del día, Drag and drop, Responsive, Modal Ver). _Pendiente
  menor: agregar el caso de grupo multi-red a Responsive (mobile —
  anillo Pink Orchid + mini-ícono de cadena sobre el dot de estado)._
- Módulo Ritmo completo

> El paso de captura cultural vive en la pantalla "Voz" (paso 2 de 5, obligatoria, no-skippable). Captura mercado (país + región), nicho/audiencia (chips + campo libre), y registro/tono (single-select, default neutro-profesional). Esta data prellena la Voz de marca en Configuración y alimenta el grounding de tendencias de Ritmo (vertical + región).

### Lo que viene (en orden)

**Después:** Configuración (sub-secciones). Crítico antes de
lanzar porque la **Voz de marca** define todo el output del
producto. Si esto no está bien, nada funciona.

**Después:** Analíticas y Biblioteca. Son los módulos menos
críticos para el primer momento del producto. Un usuario
puede empezar a usar Presencia sin tener analíticas perfectas
todavía (ya las verá cuando publique varias semanas).
Biblioteca también puede ser más sencilla al principio.

### El criterio general

Priorizamos por **dependencia** y **frecuencia de uso**, no
por orden alfabético ni por afinidad personal con el módulo.
Lo que se usa más se diseña mejor primero.

---

## 10. Quién es Jose (founder)

**Forma de trabajar:**

- Le gusta entender conceptos a profundidad antes de ejecutar
- Combina terminología técnica con expresiones de "calle"
  ("monolito moderno", "código spaghetti", "syntactical sugar",
  "código Hadouken")
- Aprecia honestidad real, no validación automática
- Prefiere decisiones bien razonadas a opciones planteadas
  sin criterio
- Hace preguntas críticas cuando algo no le cierra (señal de
  buen product sense)
  **Para Claude que lea este documento:**
  Trata las decisiones acá como base, no como dogma. Si algo
  parece mal pensado, dilo. Jose lo prefiere así.
