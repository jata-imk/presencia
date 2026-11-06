# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `openai`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-tabla (Telegram)

> te paso lo que anoté de 5 cafeterías para trabajar, compáramelas para ver cuál me conviene: Café Créme, americano $45, de 7 a 22, wifi sí, estacionamiento no; Manifesto, $55, de 8 a 20, wifi sí, estacionamiento sí; Bengala Kafe, $40, de 8 a 21, wifi sí, estacionamiento no; Rossina, $60, de 9 a 23, wifi no, estacionamiento sí; Latte Lab, $50, de 7 a 21, wifi sí, estacionamiento sí

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `google:gemini-3.8-flash@medium`

Aquí tienes la comparación rápida para trabajar:

### Descarte inmediato

- **Rossina ($60)**: Queda descartada para trabajar si necesitas internet, ya que **no tiene WiFi** (además de ser la más cara).

---

### Si vas en coche (con estacionamiento y WiFi)

- **Latte Lab ($50) — La mejor opción con auto:** Abre temprano (7:00 a 21:00) y tiene buen balance de precio y servicios.
- **Manifesto ($55):** Tiene horario más reducido (8:00 a 20:00) y el café cuesta $5 más.

---

### Si no necesitas estacionamiento (a pie o transporte)

- **Café Créme ($45) — La mejor para jornadas largas:** Es la que más horas abre (7:00 a 22:00) y tiene WiFi.
- **Bengala Kafe ($40) — La más económica:** Buen horario (8:00 a 21:00) y el mejor precio en café.

---

### Resumen para elegir:

- **Si llevas coche:** Ve a **Latte Lab**.
- **Si buscas pasar muchas horas o abrir/cerrar el día:** Ve a **Café Créme**.
- **Si buscas cuidar el bolsillo:** Ve a **Bengala Kafe**.

* Tokens: input 2522 / output 825 (razonamiento 526) / total 3347
* Primer token visible: 7.4 s · total 9.8 s · costo $0.0050

* Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 4 ⚠️ · HTML válido: sí ✅
* ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `google:gemini-3.8-flash@medium`

Aquí tienes la comparación rápida para trabajar:

### Descarte inmediato

- **Rossina ($60):** Queda fuera si necesitas trabajar en línea porque **no tiene wifi** (además de ser la más cara).

---

### Si vas en coche (con wifi y estacionamiento)

- **Latte Lab ($50 | 7:00 a 21:00):** **La mejor opción con auto.** Es más barata que Manifesto y abre desde temprano (7:00).
- **Manifesto ($55 | 8:00 a 20:00):** Buena alternativa, aunque con horario más corto y café un poco más caro.

---

### Si no necesitas estacionamiento

- **Café Créme ($45 | 7:00 a 22:00):** **La ganadora en horario.** Es la que más horas abre (15 hrs continuas) y a muy buen precio.
- **Bengala Kafe ($40 | 8:00 a 21:00):** **La más barata.** Excelente si buscas cuidar el bolsillo y tienes buen rango de horas.

---

**Veredicto:**

- Con coche: **Latte Lab**.
- A pie o transporte: **Café Créme** (por horario) o **Bengala Kafe** (por precio).

* Tokens: input 2522 / output 726 (razonamiento 430) / total 3248
* Primer token visible: 5.8 s · total 8.5 s · costo $0.0046

* Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 3 ⚠️ · HTML válido: sí ✅
* ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `google:gemini-3.8-flash@medium`

Aquí tienes la comparativa directa para que elijas según tus prioridades:

### 1. La mejor opción completa (si vas en auto)

- **Latte Lab ($50):** Tiene **wifi y estacionamiento**, abre temprano (7:00 a 21:00) y tiene buen precio. Supera a **Manifesto** ($55), que cuesta $5 más y abre menos horas (8:00 a 20:00).

### 2. Si no necesitas estacionamiento (mejores precios y horarios)

- **Café Créme ($45):** El mejor horario para trabajar largo (7:00 a 22:00) con wifi.
- **Bengala Kafe ($40):** La opción más barata con wifi, de 8:00 a 21:00.

### 3. La descartada para trabajar

- **Rossina ($60):** Aunque cierra tarde (23:00) y tiene estacionamiento, **no tiene wifi** y es la más cara. Solo convendría si usas tus propios datos y necesitas trabajar de noche.

---

**Veredicto rápido:**

- **Con coche:** Vete a **Latte Lab**.
- **Sin coche:** Vete a **Café Créme** (por horario) o **Bengala Kafe** (por precio).

* Tokens: input 2522 / output 900 (razonamiento 597) / total 3422
* Primer token visible: 8.0 s · total 10.4 s · costo $0.0053

* Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 3 ⚠️ · HTML válido: sí ✅
* ¿Card cuando debía?: no debía ✅ · voseo: no ✅

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 7566  | 2451   | 1553         | 63%            | 7.4 s / 8.0 s                 | $0.0050         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                           | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| -------------------------------- | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `google:gemini-3.8-flash@medium` | 3/3 (100%)      | 3/3 (100%)        | 0             | 10          | 0             | 0         | 0       |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
