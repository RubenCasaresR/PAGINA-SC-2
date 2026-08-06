# BITÁCORA DE CAMBIOS — Societa Di Calcio

Proyecto: `PAGINA-SC-2` — Tienda oficial (Express + SQLite + Mercado Pago).

**Convención:** cada cambio realizado se registra aquí con fecha y descripción.
Estado: `Completado` | `Pendiente` | `Parcial`.

---

## 2026-08-05

| Fase | Descripción | Archivos | Estatus |
|------|-------------|----------|---------|
| Auditoría | Entrega del plan de trabajo P0/P1/P2: seguridad, bugs funcionales, estado de BD, recursos y dependencias. | — | Completado |
| P0-4 | `npm audit fix`: express 4.22.2, nodemailer 8.0.11, mercadopago 2.13.0, sqlite3 5.1.7, express-rate-limit 8.6.2, helmet 8.3.0. Restan 10 vulns (1 crítica `tar` build-time vía sqlite3; requiere `--force` con breaking changes → riesgo aceptado). | `package.json`, `package-lock.json` | Completado |
| P0-1 | Validación de configuración al arranque: `verificarConfiguracion()` detecta secretos faltantes o con valor de ejemplo y bloquea el arranque en `NODE_ENV=production`. Se añadió `PRAGMA busy_timeout = 5000` a la conexión de BD. | `server.js` | Completado |
| P0-2 | Metas Open Graph y Twitter corregidas del dominio `societadicalcio.onrender.com` → `societadicalcio.com`. | `index.html` | Completado |
| P0-3 | `/api/enviar-recibo` endurecido: ya no confía en el carrito/localStorage del navegador; valida que la orden exista y esté `pagado` en la BD, construye el recibo con los precios/productos reales del pedido y evita dobles envíos con la bandera `recibo_enviado`. | `server.js`, `thank-you.html` | Completado |
| P1-5 | Checkout idempotente: nueva columna `idempotency_key` (índice único) para que los reintentos del navegador no creen órdenes duplicadas ni descuenten stock dos veces. La reserva de inventario (`decrementarStock`) y la restauración (`restaurarStock`) ahora corren en transacción (`BEGIN IMMEDIATE`). El webhook de Mercado Pago restaura el stock cuando un pago se rechaza/cancela y solo si la orden estaba `pendiente` (guard de transición de estado). | `server.js`, `checkout.html`, `tienda.sqlite` (migración) | Completado |
| P1-6 | Límites de validación del carrito: máximo 20 artículos por orden, cantidad 1–10 por ítem, talla y stock verificados. `/api/crear-pago` ahora construye la preferencia con los artículos/precios guardados en la BD (no con el carrito del cliente), valida que la orden exista y tiene rate limit propio. | `server.js` | Completado |
| Frontend | `checkout.html` genera y reutiliza una llave de idempotencia entre reintentos y guarda la referencia real de la orden en `localStorage.ordenPendiente`. `thank-you.html` muestra el número de orden real (`externalReference`, no uno aleatorio) y envía esa referencia al recibo. | `checkout.html`, `thank-you.html` | Completado |
| Migración BD | Columnas añadidas a `ordenes`: `idempotency_key` (con índice único `idx_ordenes_idempotencia`) y `recibo_enviado`. La migración es automática e idempotente al arrancar. | `server.js`, `tienda.sqlite` | Completado |
| P1-7 | Escapado XSS en el frontend: se añadió el helper `escaparHTML` a `index-loader.js`, `product.js` y `cart.js` (y se reutilizó `escaparHTMLAdmin` en `admin.html`). Todas las interpolaciones de nombres, fotos, IDs y tallas en `innerHTML`/atributos ahora se escapan. | `index-loader.js`, `product.js`, `cart.js`, `admin.html` | Completado |
| P1-7 | `carrito.html:60` ya no llama a la función inexistente `loadCartItems()`: se implementó esa función en `cart.js` (renderiza los artículos de la página dedicada y actualiza subtotal/envío/total con las constantes reales) y se quitó el script roto. El envío erróneo `$100.00` se corrigió a `$99.00` con id `summary-shipping`. | `cart.js`, `carrito.html` | Completado |
| P1-7 | `index-loader.js` y `product.js` ahora comprueban `respuesta.ok` del fetch antes de consumir la respuesta (antes se procesaba una respuesta fallida como si fuera JSON válido). | `index-loader.js`, `product.js` | Completado |
| Pendientes P1 | Ninguno en la lista original; los 3 ítems de frontend quedaron resueltos. | — | Completado |
| Pendientes P2 | Tests automatizados, CSP (migrar scripts/estilos inline), lazy-load del hero, `preconnect` para Font Awesome/Google Fonts, limpieza de scripts legacy (`setupDB.js`, `poblarDB.js`, `upgradeDB.js`, `crearOrdenes.js`, `migrarDB.js`, `database.js`, `SC2/backend/`). | — | Pendiente |

---

## 2026-08-06

| Fase | Descripción | Archivos | Estatus |
|------|-------------|----------|---------|
| P2-Tests | Tests automatizados con `node:test` (sin dependencias nuevas). `server.js` ahora exporta `app`, `db` y la promesa `cuandoListo`; `app.listen` solo corre con `node server.js` (`require.main === module`). 10 tests cubren: productos, newsletter (validación/duplicado), checkout (validación, descuento de stock e idempotencia), login/logout admin, guardia `requiereAdmin`, rutas de Mercado Pago (firma inválida, referencia desconocida) y envío de recibo (bloqueado sin orden pagada). La BD de pruebas es temporal y se borra al terminar. Script `npm test`. | `server.js`, `package.json`, `test/server.test.js` | Completado |
| P2-CSP | CSP activado en helmet. Migrados todos los `<script>` inline a `newsletter.js`, `checkout.js`, `thank-you.js`, `admin.js` y todos los `<style>` inline a `checkout.css`, `admin.css`. Se eliminaron los atributos `onclick`/`javascript:` (tabs con `data-categoria`, drawer/carrito con `data-accion` + delegación de eventos, admin con `data-id`, `#btn-checkout-drawer` bindeado en `cart.js`). Directivas: `script-src 'self'` (sin `unsafe-inline`); `style-src` conserva `'unsafe-inline'` solo por los atributos `style=""` heredados; `img-src` permite `http2.mlstatic.com` (logo Mercado Pago); `font-src` permite Google Fonts y cdnjs. | `server.js`, `index.html`, `checkout.html`, `thank-you.html`, `admin.html`, `product.html`, `newsletter.js`, `checkout.js`, `thank-you.js`, `admin.js`, `checkout.css`, `admin.css`, `scripts.js`, `cart.js`, `index-loader.js` | Completado |
| P2-Hero | El banner superior (LCP, `.lookbook-banner`) recibió `fetchpriority="high"` y NO se marca como lazy; las imágenes de Novedades/lookbook conservan `loading="lazy"`. | `index.html` | Completado |
| P2-Preconnect | `preconnect` agregado a Google Fonts (`fonts.googleapis.com` + `fonts.gstatic.com` con crossorigin) y a `cdnjs.cloudflare.com` (Font Awesome) en los `<head>` de las páginas que los usan. | `index.html`, `product.html`, `thank-you.html`, `carrito.html`, `checkout.html`, `admin.html`, `faq.html` | Completado |
| P2-Limpieza | Eliminados `setupDB.js`, `poblarDB.js`, `upgradeDB.js`, `crearOrdenes.js`, `migrarDB.js`, `database.js`, `arreglarFoto.js` y el directorio `SC2/backend/`. Se quitó `<script src="database.js">` de `product.html`, el script `migrar` de `package.json` y las entradas correspondientes de `ARCHIVOS_BLOQUEADOS`. | — | Completado |
| Pendientes P2 | Todos los ítems de la lista original quedaron resueltos. | — | Completado |
