# ADR-024 · Tendencias por usuario, personalizables

**Reemplaza a [ADR-023](./adr-023-cache-de-tendencias.md)** en lo que hace a la llave y al aislamiento. Todo lo que aquel ADR decidió sobre **cómo se busca** —dos llamadas, fuente estructural por índice, modelo con capacidad de grounding y su propio default— sigue vigente y no se repite acá.

**Decisión:** las tendencias se buscan y se guardan **por usuario**, en `user_trends` (con RLS, como todo lo demás). El nicho libre, la audiencia, la región y el objetivo del usuario **sí entran** a la búsqueda, y además puede registrar sus propios medios (`trend_sources`), escribir qué quiere que busquemos, qué no quiere ver y en qué idiomas. `niche_trends` se elimina.

## Razón

**El cubo era demasiado grueso, y eso no se arregla afinándolo.** ADR-023 llaveaba por `(vertical, país, macro-región)` con un catálogo cerrado de 17 verticales. Un creator de "programación, IA y devops" cae en `tech`, que es la industria entera: recibía tendencias de un nicho que no era el suyo. Agrandar el catálogo no lo resuelve —el problema es que cualquier partición fija de "nichos" es más gruesa que el nicho real de una persona— y agrandarlo mucho destruiría la propia palanca de compartir.

**La palanca valía menos de lo que costaba.** El argumento de ADR-023 era económico: costo sublineal en usuarios. Medida la tarifa real, el grounding con búsqueda trae una capa gratuita mensual y después cobra **por consulta**, y una tanda cuesta unos pocos miles de tokens de un modelo Flash. Con los volúmenes de esta etapa la capa gratuita cubre todo, y aun con mil usuarios refrescando una vez por semana el gasto es del orden de una suscripción. Compartir la caché ahorraba dinero que no era el cuello de botella, a cambio de entregar tendencias equivocadas — que sí lo es.

**La excepción a ADR-003 desaparece, y eso es una simplificación de verdad.** `niche_trends` era la única tabla del dominio sin `user_id` y sin RLS. Su justificación era honesta —la fila no pertenecía a nadie— pero obligaba a razonar aparte sobre ella cada vez que alguien tocaba el módulo. Ahora no hay excepción que recordar.

**El nicho libre sí viaja, y ese era el punto.** ADR-023 lo prohibía expresamente: si el texto libre entraba al prompt, cada usuario generaba su propia consulta y la caché dejaba de compartirse _sin que nada fallara_. Esa prohibición era correcta **dado** el modelo compartido. Sin caché que proteger, el texto libre pasa de ser un riesgo a ser exactamente lo que hace útil la búsqueda.

## El prompt va en capas, y el orden no es negociable

1. **Base del sistema.** Qué es Presencia, para qué sirve esta búsqueda, y quién es la persona: nicho, audiencia, categoría, región y objetivo. Sale del onboarding y de Configuración, así que **existe aunque nadie personalice nada**.
2. **Sus fuentes**, acotadas con `site:`.
3. **Lo que escribió** —qué buscar, qué excluir— delimitado entre marcas y presentado como **dato**, no como instrucción.
4. **Los guardrails, al final**, con una regla explícita de que nada del bloque del usuario los anula.

Eso último es la lección del prompt de la narración, donde el nombre del perfil —texto libre— estaba en la primera línea, por encima de las reglas que podía contradecir. Se movió a dato y las reglas quedaron después. Acá el texto del usuario es bastante más largo y bastante más libre, así que la precaución pesa más.

**Personalizar es opcional. El prompt base nunca lo es.** Un usuario que no toca nada recibe tendencias de su nicho igual que antes, solo que armadas con su nicho real y no con su casilla.

**Dónde se edita.** Configuración › Tendencias, servida por `GET`/`PUT /api/ritmo/tendencias/ajustes` (TrendsModule sigue sin controller propio). El `PUT` recibe la configuración **entera** y reemplaza: las fuentes se normalizan a host en el schema compartido, con un 400 que nombra la que no lo es, y los tres campos de texto e idiomas se escriben en `brand_voices` en la misma transacción. La pantalla muestra la capa 1 con `baseDeBusqueda`, la misma función que la escribe en el prompt, para que "lo que buscamos si no tocas nada" no pueda divergir de lo que se busca.

## Cadencia y costo

- **TTL de 7 días, barrido diario.** Cada usuario se refresca una vez por semana; uno nuevo espera como mucho un día para ver su primera tanda.
- **Presupuesto por pase** (`USUARIOS_POR_PASE`), para que el día que se acumulen vencimientos el gasto no llegue de golpe.
- **Solo cuentas con sesión viva.** Sin ese filtro el negocio paga una búsqueda semanal por cada cuenta que se registró y no volvió. Es la misma lección que el ciclo de créditos aprendió en F8 filtrando por correo verificado.
- **El refresco periódico lo absorbe el negocio.** Adelantarlo lo paga el usuario — ver abajo.
- **Se guarda cuántas consultas disparó cada llamada** (`usage.consultas`). El fee se cobra por consulta y una sola llamada puede lanzar varias: sin ese número, cualquier proyección de costo es una corazonada. Antes no se medía.

## Adelantar el refresco: qué se cobra y qué no

**Se cobra adelantar tendencias que el usuario ya tiene.** Esa es toda la regla, y las tres formas de _no_ tenerlas caen del lado gratis:

- **sin tanda**, porque el barrido todavía no llegó;
- **con la tanda vencida**, que es trabajo que el negocio ya le debe y que el barrido haría igual dentro del día;
- **con una tanda vacía**, que es lo que deja un intento que no encontró nada citable.

Ese tercer caso es el que obliga a mirar los items y no solo la fecha. Cuando una búsqueda no produce nada, `marcarIntento` mueve el vencimiento doce horas para que ese usuario no acapare el pase siguiente — y eso deja una tanda técnicamente "vigente" pero sin una sola tendencia adentro. Mirando solo la fecha, el siguiente click cobraría por algo que nunca llegó a la pantalla. Y posponer **nunca acorta**: se queda con el vencimiento más lejano entre el que tenía y el de reintento. Un refresco adelantado —pagado— que no encuentra nada también pasa por ahí, y sin ese tope le recortaba a una tanda vigente sus días restantes a doce horas.

**Gratis, pero con tope diario** (`MAX_FREE_TREND_REFRESHES_PER_DAY`, 3 en 24 horas). Encontrado en el review de la fase: como una búsqueda vacía deja la tanda vacía, y la tanda vacía es gratis, un nicho que nunca da nada citable convertía el botón en búsquedas con grounding ilimitadas —una cada ~40 segundos— pagadas por el negocio y por fuera del presupuesto por pase del barrido. La regla del cobro no cambia; solo se acota. Se cuenta sobre `trend_refreshes` (`billable = false`, sin los `no_encolado`, que no costaron), así que no pidió migración. El DTO dice el motivo del bloqueo (`bloqueo: "sin_saldo" | "tope_diario"`) en vez de que la web lo deduzca de `disponible`, y el `POST` lo hace valer con un 429: la pantalla puede estar vieja.

**La pantalla dice cómo terminó la última búsqueda.** Sin eso, un refresco que tronaba o no encontraba nada dejaba la pantalla igual que antes, y así pasó en prod: el botón iba y volvía sin una palabra. El DTO trae `ultimoFallo` (`error` o `sin_resultados`, y `abandonado` cuenta como `error`) solo si el último refresco liquidado terminó mal **y** es más reciente que la tanda en pantalla (`trends/estado.ts`). La web elige la frase y aclara que no se cobró. El error de un job manual además se imprime en el log del worker: pg-boss lo guardaba en `pgboss.job.output` sin imprimirlo.

**Tarifa fija, no por tokens** (`RATE_CARDS.flat.trend_refresh`). El grueso del costo no son tokens: el fee del grounding se cobra **por consulta de búsqueda** —medidas, cuatro por refresco— y los dos modelos que intervienen aportan unos pocos miles de tokens entre los dos. Cobrarlo por tokens subestimaría justo la parte cara. Es la misma razón por la que imagen y calendario semanal ya eran `flat`.

**El precio se anuncia antes de gastarse, y como porcentaje del mes.** La web nunca ve la unidad cruda del ledger (addendum ADR-012), y el otro objeto contable no sirve acá: `unitsToPublications` redondea contra 1.000 unidades, así que todo lo que cuesta menos de una publicación se muestra como "0" — inservible para el precio de un botón. El porcentaje sí distingue, y nunca se redondea a cero.

**Va por cola, no por el request.** La búsqueda tarda decenas de segundos: contestar en línea sería tener el request abierto todo ese rato, a merced del timeout del nginx de enfrente. El `POST` deja el trabajo encolado y devuelve el estado; la pantalla vuelve a pedir el `GET` mientras siga en curso.

**El cobro y la tanda, en la misma transacción.** O se cobra y se guardan las tendencias, o ninguna de las dos (`modelo-de-datos.md`). Cobrar después, aparte, deja abierta la puerta a cobrar un refresco que no se guardó.

**El candado contra el doble click es un índice, no un `if`.** `trend_refreshes` lleva uno único parcial sobre `user_id where settled_at is null`: dos requests separados por milisegundos leerían los dos "no hay ninguno", pero solo uno gana el insert. El que pierde recibe el estado "en curso", que es la verdad.

**Y el candado tiene salida.** pg-boss no mata al handler cuando el job expira: marca el job fallido y libera el slot. Con `retryLimit: 0` —que acá es obligatorio, porque un reintento vuelve a pagar la búsqueda— nadie vuelve a pasar por la liquidación. Un worker reiniciado a media búsqueda, que es lo que pasa en **cada deploy**, dejaba la fila abierta y al usuario sin botón para siempre. Las filas más viejas que el doble del techo del job se cierran como `abandonado` al leer el estado; no hace falta un barrido aparte para algo que se arregla solo en la siguiente carga de la pantalla.

**El cobro puede sobregirar, y acá corresponde.** `spend` rechaza por default porque su caso normal es cobrar _antes_ de producir el efecto, donde rechazar es gratis. Este cobro ocurre al final de una búsqueda de ~40 segundos: entre el click y ese momento, un turno de chat pudo consumir el saldo que el gate había comprobado. Sin sobregiro, `spend` lanzaría dentro de la transacción y se llevaría por delante el `upsert` de la tanda — la búsqueda ya pagada, el usuario sin tendencias **y** sin el asiento que explica el gasto. Un saldo levemente negativo dice la verdad; perder las dos cosas, no. Es la misma doctrina que `charge()`.

## Las propuestas de publicación viajan en la misma tanda

Título y gancho de cada propuesta los escribe la **llamada de estructura** (la segunda, sin herramientas), no una tercera. Esa llamada no busca, así que no paga fee de grounding, y ya tiene delante lo que hace falta: la prosa de la búsqueda y la tendencia que está armando. Una llamada aparte pagaría otra vez el contexto para decir lo mismo.

`titulo` y `gancho` son `nullable` en el schema crudo (`trends/esquema.ts`): la llave viaja **siempre** y `null` es como el modelo dice "no tengo una buena". Nunca `optional` ni `nullish`, y eso es una cicatriz: la primera versión los hizo `nullish` para tolerar un proveedor que omitiera la llave, y en prod —donde el tier utility cae a OpenAI— **toda** búsqueda terminó en error. El provider de OpenAI del AI SDK manda el schema en modo strict por default, strict exige cada llave en `required`, y el SDK convierte con `io: "input"`, donde una llave opcional sale de `required`. OpenAI rechazaba el schema entero después de que la búsqueda con grounding ya se había pagado. `esquema.spec.ts` prueba la regla de strict contra la misma conversión del SDK, para cualquier cambio futuro. El riesgo de un proveedor laxo que omita llaves es el mismo que ya corrían `topic` o `blurb`, que siempre fueron requeridas.

Van **sin tope de largo** en ese schema por otra razón: un título largo tiraría la tanda después de pagar la búsqueda. El tope lo aplica `ensamblarTendencias`, que valida la propuesta aparte y, si no pasa, descarta **solo la propuesta**. En `trendItemSchema` la propuesta es opcional: las tandas guardadas antes siguen leyéndose.

## Lo que esto cuesta y se acepta

- **Se pierde el arranque instantáneo.** Con caché compartida, un usuario nuevo heredaba la tanda de otro de su vertical y veía tendencias al primer login. Ahora espera al barrido (≤ 1 día) o paga un refresco inmediato. A cambio, lo que ve es suyo.
- **El gasto pasa a crecer con los usuarios.** Es un costo variable atado a gente que usa el producto, y con el filtro de sesión viva no se paga por cuentas dormidas. Los números están arriba; si dejaran de cerrar, la palanca a mover primero es el TTL, no volver a compartir.
- **El catálogo de verticales sobrevive** (`packages/shared/src/verticals.ts`), pero **deja de ser llave**: ahora es un default sugerido y una etiqueta de contexto en el prompt y en el estado vacío.

## Descartado

- **Afinar el catálogo con más verticales** — mueve el problema sin resolverlo, y cuantas más verticales, menos se comparte cada fila: se paga el costo de la complejidad sin conservar el beneficio.
- **Cachear por una huella de la configuración** (hash de fuentes + términos + región) — conserva algo de compartición para usuarios con configuraciones idénticas, que en la práctica son casi ninguno, y a cambio devuelve la tabla al terreno de "dato derivado de una persona viviendo fuera de RLS".
- **Mantener las dos capas** (compartida como piso del día 1, personal encima) — dos caminos, dos tablas y dos estados vacíos que mantener, para ahorrarle a un usuario nuevo un día de espera.
