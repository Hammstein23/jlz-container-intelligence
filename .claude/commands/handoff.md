---
description: Handoff — leer el estado de la sesión anterior, o escribir el de esta
---

# Handoff

Las dos puntas de lo mismo: **leer** el último al empezar, **escribir** el nuevo al terminar.
Los handoffs viven en `handoffs/`, commiteados en el repo. Juan no pega nada — los abrís vos.

`$ARGUMENTS` decide el modo:

| Argumento | Modo |
|---|---|
| vacío, `leer`, `estado` | **Parte A** — leer el último y reportar dónde estamos |
| cualquier otro texto | **Parte B** — escribir el handoff de esta sesión; el texto es el tema |

---

## Parte A — Leer (arranque de sesión)

1. **Buscá el más reciente:** `ls -t handoffs/*.md | head -1`. El nombre lleva la fecha; si el
   `mtime` y el nombre no coinciden, mandá el nombre.

2. **Leelo entero.** No lo resumas de memoria ni de un handoff anterior.

3. **Contrastalo con el repo, siempre.** `git log --oneline -8` y `git status --short`.
   El handoff dice lo que era cierto cuando se escribió; el repo dice lo que es cierto ahora.
   **Si no coinciden, manda el repo** — y decilo en el reporte.
   > Ya pasó: el commit `8486d25` existe solo para corregir un handoff que daba por commiteado
   > algo que no lo estaba.

4. **Mirá si algún pendiente ya se resolvió solo** entre sesiones (un deploy, un push, un dato
   que llegó). Tacharlo vale tanto como hacerlo.

5. **Reportá corto** — no repitas el handoff entero:
   - **Estado**: hasta qué commit, árbol limpio o no, **y si está desplegado** (son cosas distintas).
   - **Pendientes en orden**, con el número que valida cada uno.
   - **Lo que espera una decisión de Juan**, aparte y marcado — es lo único que bloquea.

6. **No re-abras decisiones cerradas.** Si el handoff dice "decidido" o "descartado", está cerrado.
   Se re-abre solo si Juan lo pide o si apareció data nueva que lo contradice — y ahí lo decís.

---

## Parte B — Escribir (cierre de sesión)

### Antes de escribir una sola línea

`git log --oneline -15` y `git status --short`. **El estado real, nunca el recordado.**
Los hashes se copian de ahí, no del chat. Si algo quedó sin commitear, se escribe con esas
palabras — "sin commitear", no "hecho".

### El archivo

`handoffs/AAAA-MM-DD-tema-corto.md` — kebab-case, dos a cuatro palabras en español.

```
# Handoff — <tema en una línea>

**Fecha:** AAAA-MM-DD · **Ejecutado por:** <modelo> en Claude Code.
**Sesión origen:** `<id corto>` (qué fue la sesión, media línea).

## Estado
## Lo que se arregló / se decidió
## Pendiente — en orden
## Cosas del método que conviene no repetir
```

### Reglas del contenido

- **Cada pendiente lleva el número que lo valida**, no "verificar que ande".
  Sirve: *"ginger bruto ~3.213, libre ~2.246; si sigue en ~1.057, el deploy no entró"*.
  No sirve: *"probar el importer"*.
- **Priorizado de verdad.** El 1 es lo primero que se hace la sesión que viene.
- **Las decisiones que esperan a Juan van marcadas como tales**, con las opciones y el riesgo de
  cada una — sobre todo si un camino lleva a comprar de menos.
- **Las decisiones cerradas se escriben para que no se re-abran.** Si algo se descartó, por qué.
- **Un diagnóstico sin arreglo igual se escribe entero** — dónde (función y línea aproximada),
  causa, arreglo propuesto. Es lo más caro de re-derivar y lo primero que se pierde.
- **Si un diagnóstico anterior resultó falso, marcalo en mayúsculas.** Un handoff que deja en pie
  una causa equivocada hace perder la sesión siguiente.
- **Nunca el token ni ningún secreto**, ni parcial, ni "por contexto". Si algo quedó expuesto,
  se escribe *"rotar el token"*, no el token.
- **Lo permanente va a memoria, no acá.** El handoff es estado que caduca; lo que va a valer en
  seis meses es una memoria, y desde el handoff se linkea con `[[slug]]`.
- **Largo: 60 a 90 líneas.** Si pasa de 120, sobra relato de proceso.

### Al terminar

- Commiteá el handoff **solo**, no mezclado con código: `git add handoffs/… && git commit`.
- Si el estado del proyecto cambió, actualizá la memoria correspondiente.
- Cerrá con tres líneas para Juan: qué quedó hecho, qué quedó abierto, qué necesita decidir él.

---

## Cosas que conviene no olvidar

- **El handoff no reemplaza al `CLAUDE.md`.** Ahí van las reglas que valen siempre; acá, el estado
  que caduca. Si algo se escribió tres handoffs seguidos, ya no es estado — subilo al CLAUDE.md.
- **"Commiteado" y "desplegado" son dos cosas.** Este proyecto se publica por GitHub Pages con
  push, y Juan además tiene que hacer Cmd+Shift+R. Decí las dos por separado.
- **Un handoff que dice "todo bien" y no dice qué número mirar, no sirve.**

## Ver también

- `.claude/commands/lunes.md` — la rutina semanal
- `.claude/commands/cierre.md` — el cierre diario de órdenes
- `handoffs/` — los anteriores, como referencia de formato
