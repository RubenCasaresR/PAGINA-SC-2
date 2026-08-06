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

---

## 2026-08-06 — Fase 3: Rediseño visual y estructura del frontend

| Área | Descripción | Archivos | Estatus |
|------|-------------|----------|---------|
| Sistema de diseño | Tokens CSS ampliados (`--verde-oscuro #012a12`, `--beige-claro #f7f6f2`, `--gris`, sombras, radios), tipografía fluida con `clamp()`, `.eyebrow`, `:focus-visible`, base `.btn`/`.btn-blanco` refinada y estados hover de cards (transform + sombra + zoom de imagen). | `styles.css` | Completado |
| Badges de producto | Badges Nuevo / -X% / Próximamente con clases (`.product-badge--nuevo/descuento/proximamente`) y `oldPrice` tachado en grid principal y relacionados; se reemplazaron los inline `style="color:#ff8c00"` y los del `mostrarError()` por clases. | `index-loader.js`, `product.js`, `styles.css` | Completado |
| Estados vacíos | Drawer y carrito vacíos con clases (`.empty-cart-state`) en lugar de inline styles; ítems del checkout con clases (`.checkout-item-details/price`). | `cart.js`, `checkout.css` | Completado |
| Menú móvil reparado | Botón hamburguesa + `#main-nav` + `#close-menu-btn` en `product.html` (repara el toggle móvil, que ya tenía CSS). Header y footer completos con logo, nav, carrito y drawer en `faq.html`, `terms.html`, `returns.html`. | `product.html`, `faq.html`, `terms.html`, `returns.html` | Completado |
| Páginas informativas | `faq.html` con sección nueva "¿Cuánto cuesta el envío?" (99 MXN, gratis +$1,500); `terms.html` y `returns.html` reescritos completos (`<!DOCTYPE html>`, head con fonts/preconnect, header/footer, drawer y `cart.js`). | `faq.html`, `terms.html`, `returns.html` | Completado |
| Home | Eyebrows agregados (banner lookbook, hero, nosotros, colecciones, newsletter); Google Fonts uniformes `Montserrat 400;500;600;700` + `Playfair 400;600;700` en todos los HTML. | `index.html` | Completado |
| Checkout | Google Fonts + Playfair + nota de seguridad `.secure-note` bajo el botón; estilos de ítems con tokens. | `checkout.html`, `checkout.css` | Completado |
| Admin | Limpieza total de inline `style=` (login/panel, lista inventario/ventas, botones, topbar) movidos a clases (`.admin-topbar`, `.admin-lista`, `.admin-cargando`, `.inventario-card*`, `.venta-card*`, `.etiqueta-estado*`); `etiquetaEstado()` genera clases en vez de colores inline; botón guardar verde pino y radios unificados. | `admin.html`, `admin.css`, `admin.js` | Completado |
| Verificación | `npm test` 10/10; smoke test: las 9 páginas + 3 CSS responden 200 con CSP. Únicos `style=` restantes: template de email de `server.js` (correcto para clientes de correo). Sin `onclick=`/`javascript:`/scripts inline. | — | Completado |

---

## 2026-08-06 — Optimización de rendimiento (imágenes, caché, carrusel, video, íconos)

| Fase | Descripción | Archivos | Estatus |
|------|-------------|----------|---------|
| F1 Imágenes | `sharp` (devDependency) + script `npm run imagenes` (`optimizar-imagenes.js`). Respaldó 28 originales a `_origen-imagenes/` (gitignored) y las redimensionó por uso (banner 1600px, lookbook/collage/galería 1000px, carrusel 700px, logos ≤400px), JPEG q78 mozjpeg progressive, PNG con palette. Se sobreescribieron los mismos nombres (ninguna referencia cambia). Resultado: **41.34 MB → 4.15 MB (−90%)**. Se restauró `Playera negra FRENTE.png` desde el respaldo (la optimización lo agrandaba). | `optimizar-imagenes.js`, `package.json`, `_origen-imagenes/` | Completado |
| F2 Servidor | `compression` (1.8.1) con `app.use(compression())`; `express.static` con `maxAge: '30d'`, ETag y Last-Modified; los HTML se sirven `no-cache` (middleware + ruta `/` registrada ANTES del estático para que no herede la caché de 30 días). | `server.js` | Completado |
| F3 Carrusel | `activarCarrusel()` reescrita: precarga las imágenes del hero con `new Image()` (se descargan una sola vez, no cada ciclo), transición con clase `.img-oculta` (nada de `style.opacity` inline), pausa cuando la pestaña no está visible o el hero sale de pantalla (`visibilitychange` + IntersectionObserver), alterna cada 4s. | `index-loader.js`, `styles.css` | Completado |
| F4 Video | El video de producto usa `preload="metadata"`, `poster` con la primera imagen y ya NO arranca en autoplay: se reproduce en silencio solo cuando es visible y pausa al salir de pantalla (IntersectionObserver). | `product.js` | Completado |
| F5 Íconos | Eliminada Font Awesome de los 9 HTML (CDN ~96 KB por página) y sustituida por sprite local `icons.svg` con los 10 íconos usados (trazos oficiales de FA 6.5.2): hamburguesa, Excel, check, candado, Instagram, TikTok, Facebook, Visa, Mastercard, Amex. Reemplazo `<i class="fa-…">` → `<svg class="icon"><use href="icons.svg#i-…">`. Base `.icon` (1em, fill currentColor) en `styles.css` y `admin.css`. | `icons.svg`, 9 HTML, `styles.css`, `admin.css` | Completado |
| F6 Verificación | `npm test` 10/10; smoke test: 10 páginas/recursos + `/api/productos` responden 200; `styles.css` e `/` servidos con gzip; estáticos con `Cache-Control: public, max-age=30d`; HTML con `no-cache`. Servidor Node reiniciado con los cambios. | — | Completado |
