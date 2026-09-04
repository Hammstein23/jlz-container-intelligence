# CLAUDE.md — JLZ Container Intelligence

## Qué es esto
ERP de un solo archivo HTML/vanilla JS (~21k líneas, sin frameworks, sin build
step) para JLZ Produce — importador/broker de especialidades orgánicas
(jengibre, cúrcuma, ajo, chalotes) desde Perú, Salinas CA. Cubre procurement,
operaciones, analytics, market intelligence, buy planning, inventario,
pricing, customer intelligence, simulación. Backend: Google Apps Script +
Google Sheet. Hosting: GitHub Pages.

Los dos co-founders (Juan, Michael) son no-técnicos. **Toda UI debe
entenderse sin explicación** — es el criterio de diseño #1, siempre.

## Verdades de datos — NUNCA violar
- **Sea y air nunca se promedian juntos**, en ningún agregado.
- **Formal e informal (supplier) nunca se mezclan** — bandas de percentil
  ponderadas por lbs, no simples.
- **30 lbs por caja es una constante fija**, nunca una variable.
- Normalización FOB es siempre per-order (`mibOrderFobUsd()`);
  `destHandlingUsd` no es parte del FOB.
- Cualquier nueva categoría de segregación (ej. orgánico vs. convencional)
  sigue el mismo criterio: nunca se mezcla en un agregado "orgánico"/"formal"
  existente. Antes de agregar algo nuevo, preguntar: ¿qué pregunta comercial
  responde este número, y a qué agregado NO debería sumarse?
- **El inventario de los cinco productos se carga igual: las cajas BRUTAS** (físicas, incluidas
  las reservadas) y la app resta el committed. Hasta 2026-09-03 ginger-Perú era al revés —
  guardaba el libre y la app sumaba— por herencia, no por diseño. No lo vuelvas a separar.
- `localStorage` es por dispositivo — History no sincroniza solo por abrir el
  archivo en otra máquina.

## Antes de tocar este archivo
- Hay un blob base64/JSON gigante embebido cerca del inicio del `<script>`
  principal — **excluilo de cualquier grep** (`grep -v` por su número de
  línea) o vas a inundar el output.
- Comentarios de sección usan caracteres Unicode de dibujo de cajas (─) que
  rompen el matching de string exacto — anclá con substrings ASCII.
- Si en algún momento aparece un archivo `JLZ_Container_Intelligence.html` en
  otro lugar del repo/proyecto que no sea el HEAD de la rama en la que estás
  parado: **es un snapshot viejo, no lo edites ni lo uses de referencia.**

## Disciplina de patches — no negociable
- Nunca edites a ciegas. Antes de un cambio no trivial: `git diff`/`git log`
  para saber en qué estado real estás (en git, esto reemplaza el ritual de
  "verificar líneas+md5" que se usaba subiendo el archivo por chat — acá el
  repo mismo es la fuente de verdad).
- Anclás por string único, nunca por número de línea (los números se corren).
- Después de CUALQUIER patch sobre un `<script>` inline: chequeo de sintaxis por
  bloque + balance de divs. Si `node` no está en el entorno (pasa seguido acá),
  usá `osascript -l JavaScript` sobre el bloque extraído, con stubs de
  `window`/`document`/`localStorage` al inicio (un `SyntaxError` falla; un
  `ReferenceError` de runtime es esperable). La sintaxis válida NO implica lógica
  correcta — para lógica nueva, smoke test con data sintética (ver ejemplos de
  sesiones anteriores: un bug real pasó el check de sintaxis limpio y solo se
  agarró releyendo la función completa).
- Verificación en navegador: por DOM (`preview_eval` para estado,
  `preview_inspect` para estilos computados), NO por screenshots. La app está
  detrás de un login gate (no se puede ver la UI logueada sin credenciales — no
  las ingreses) y el preview headless a veces saca capturas en blanco. Screenshots
  solo si Juan los pide para verlos él.
- Cambios grandes de UI/estructura: mockup interactivo primero, aprobación
  antes de tocar producción. Fixes chicos: directo.
- Commits chicos y por tema — no un commit gigante mezclando módulos
  distintos.

## Mapa de módulos (orientativo, no exhaustivo — gréalo vos mismo para lo específico)
- **Simulator** (`renderSimulator`, `simRender*`) — proyección de cobertura
  pura en cases (nunca dólares): stock orgánico + pipeline + hipotéticos −
  demanda.
- **Orders** (`renderOrders`, `getOrders`/`saveOrders` sobre
  `jlz_orders_pipeline`) — pipeline real, status Contracted→In Transit→
  Arrived/Cancelled.
- **Inventory** (`invm*`, `bpInv*`) — lots físicos en mano, curados a mano
  (no automático desde Orders), FEFO.
- **History** (`renderComparison`, `currentSnapshot`) — el módulo más denso:
  4 secciones (S1 Profitability, S2 Weight&Yield, S3 Landed costs, S4
  Supplier credit), cada una con su footer de agregados sea/air.
- **Market Intel** (`mib*`) — bandas formal/informal de Veritrade.

## Cómo trabaja Juan
- Conversación en español; código/UI/deliverables en inglés.
- Shorthands de aprobación (go-ahead completo, sin re-confirmar): "dale",
  "implementemos", "implementa todo", "sigue todas tus recomendaciones",
  "procedamos".
- Preguntas bloqueantes en un solo batch antes de implementar, nunca
  goteadas.
- Trade-offs honestos: si algo no se puede o falta data, decirlo y proponer
  caminos — nunca inventar.

## Ver también
- El handoff más reciente (si los commiteás en el repo, ej. `/handoffs/`, no
  hace falta que Juan pegue nada — abrilo vos mismo) para: estado de deploy,
  pendientes priorizados, y decisiones tomadas en la sesión anterior que no
  hay que re-abrir.
- `Playbook_maestro_Claude.md` (si está en el repo o el proyecto de
  claude.ai) para la arquitectura completa de las 3 capas de contexto.
