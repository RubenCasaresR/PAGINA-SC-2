// ========================================== //
// ===== TESTS AUTOMATIZADOS DEL BACKEND ===== //
// ========================================== //
// Se ejecutan con `npm test` (node --test).
// Usan una base de datos temporal en el directorio temporal del sistema,
// así que NUNCA tocan la tienda.sqlite real de producción.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

// --- Configuración del entorno ANTES de cargar el servidor ---
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(os.tmpdir(), `sdc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
process.env.ADMIN_PASSWORD = 'clave-de-prueba-segura';
process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-ACCESS-TOKEN-PRUEBA';
process.env.MERCADOPAGO_CLIENT_SECRET = 'cliente-secreto-de-prueba';
process.env.GMAIL_USER = 'prueba@example.com';
process.env.GMAIL_APP_PASSWORD = 'contrasena-de-app-prueba';
process.env.SITE_URL = 'http://localhost';

const { app, db, cuandoListo } = require('../server.js');

let servidor;
let baseUrl;

function peticion(ruta, opciones = {}) {
    return fetch(baseUrl + ruta, opciones);
}

function json(respuesta) {
    return respuesta.json();
}

before(async () => {
    await cuandoListo;
    servidor = app.listen(0);
    await new Promise((resolver) => servidor.once('listening', resolver));
    const { port } = servidor.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
    if (servidor) await new Promise((resolver) => servidor.close(resolver));
    if (db) db.close();
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) { /* ya se limpió */ }
});

// Algunos tests modifican el inventario; dejamos cada test con la BD recién
// sembrada es demasiado costoso, así que usamos productos con stock suficiente.
const PRODUCTO_ACTIVO = { id: 'ronaldo-classic', size: 'M' };
const CLIENTE_VALIDO = {
    nombre: 'Cliente de Prueba',
    email: 'cliente@prueba.com',
    direccion: 'Av. Patria 123, Col. Centro, Zapopan, Jalisco, CP: 45116'
};

// ========================================== //
// ========== PRODUCTOS ===================== //
// ========================================== //
test('GET /api/productos devuelve el catálogo con los JSON parseados', async () => {
    const respuesta = await peticion('/api/productos');
    assert.equal(respuesta.status, 200);
    const productos = await json(respuesta);
    assert.ok(Array.isArray(productos));
    assert.ok(productos.length > 0);
    productos.forEach(p => {
        assert.ok(Array.isArray(p.imagenes));
        assert.ok(Array.isArray(p.related));
        assert.equal(typeof p.stock, 'object');
        assert.ok(p.imagen, 'cada producto debe exponer su imagen principal');
    });
});

test('GET /api/productos/:id devuelve el producto y 404 para ids inexistentes', async () => {
    const ok = await peticion('/api/productos/ronaldo-classic');
    assert.equal(ok.status, 200);
    const producto = await json(ok);
    assert.equal(producto.id, 'ronaldo-classic');

    const fallo = await peticion('/api/productos/no-existe-este-producto');
    assert.equal(fallo.status, 404);
});

// ========================================== //
// ========== NEWSLETTER ==================== //
// ========================================== //
test('POST /api/newsletter valida el correo, registra y detecta duplicados', async () => {
    const invalido = await peticion('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'esto-no-es-un-correo' })
    });
    assert.equal(invalido.status, 400);

    const nuevo = await peticion('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fan@correo.com' })
    });
    const datosNuevo = await json(nuevo);
    assert.equal(datosNuevo.success, true);

    const duplicado = await peticion('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'FAN@correo.com' })
    });
    const datosDuplicado = await json(duplicado);
    assert.equal(datosDuplicado.success, false);
});

// ========================================== //
// ========== CHECKOUT (idempotente) ======== //
// ========================================== //
test('POST /api/checkout rechaza carritos/clientes/llaves inválidos', async () => {
    const sinLlave = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrito: [{ id: PRODUCTO_ACTIVO.id, size: PRODUCTO_ACTIVO.size, quantity: 1 }], cliente: CLIENTE_VALIDO })
    });
    assert.equal(sinLlave.status, 400);

    const carritoVacio = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrito: [], cliente: CLIENTE_VALIDO, idempotencyKey: 'llave-a' })
    });
    assert.equal(carritoVacio.status, 400);

    const clienteInvalido = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrito: [{ id: PRODUCTO_ACTIVO.id, size: PRODUCTO_ACTIVO.size, quantity: 1 }], cliente: { nombre: 'x', email: 'malo', direccion: '' }, idempotencyKey: 'llave-b' })
    });
    assert.equal(clienteInvalido.status, 400);
});

test('POST /api/checkout crea la orden, descuenta stock y es idempotente', async () => {
    const stockAntes = await peticion(`/api/productos/${PRODUCTO_ACTIVO.id}`).then(json);
    const stockInicial = stockAntes.stock[PRODUCTO_ACTIVO.size];

    const llave = 'CHK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const primera = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            carrito: [{ id: PRODUCTO_ACTIVO.id, size: PRODUCTO_ACTIVO.size, quantity: 2 }],
            cliente: CLIENTE_VALIDO,
            idempotencyKey: llave
        })
    });
    assert.equal(primera.status, 200);
    const datosPrimera = await json(primera);
    assert.equal(datosPrimera.success, true);
    assert.ok(datosPrimera.orderId);
    assert.ok(/^SC-/.test(datosPrimera.externalReference));

    const stockDespues = await peticion(`/api/productos/${PRODUCTO_ACTIVO.id}`).then(json);
    assert.equal(stockDespues.stock[PRODUCTO_ACTIVO.size], stockInicial - 2, 'el stock debe bajar en 2');

    // Reintento del navegador con la misma llave: no debe crear otra orden ni descontar de nuevo.
    const reintento = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            carrito: [{ id: PRODUCTO_ACTIVO.id, size: PRODUCTO_ACTIVO.size, quantity: 2 }],
            cliente: CLIENTE_VALIDO,
            idempotencyKey: llave
        })
    });
    assert.equal(reintento.status, 200);
    const datosReintento = await json(reintento);
    assert.equal(datosReintento.orderId, datosPrimera.orderId, 'debe devolver la misma orden');
    assert.equal(datosReintento.externalReference, datosPrimera.externalReference);

    const stockFinal = await peticion(`/api/productos/${PRODUCTO_ACTIVO.id}`).then(json);
    assert.equal(stockFinal.stock[PRODUCTO_ACTIVO.size], stockInicial - 2, 'el reintento no debe descontar stock de nuevo');
});

// ========================================== //
// ========== ADMINISTRADOR ================= //
// ========================================== //
test('POST /api/admin/login rechaza la contraseña equivocada y acepta la correcta', async () => {
    const mala = await peticion('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'contrasena-equivocada' })
    });
    assert.equal(mala.status, 401);

    const buena = await peticion('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'clave-de-prueba-segura' })
    });
    assert.equal(buena.status, 200);
    assert.ok(buena.headers.get('set-cookie').includes('sdc_admin='));
});

test('GET /api/admin/ordenes exige sesión de administrador', async () => {
    const sinSesion = await peticion('/api/admin/ordenes');
    assert.equal(sinSesion.status, 401);
});

// ========================================== //
// ========== MERCADO PAGO (rutas) ========== //
// ========================================== //
test('POST /api/crear-pago rechaza referencias de orden desconocidas', async () => {
    const respuesta = await peticion('/api/crear-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalReference: 'SC-ORDEN-FANTASMA' })
    });
    assert.equal(respuesta.status, 400);
});

test('POST /api/pagos/webhook rechaza firmas inválidas', async () => {
    const respuesta = await peticion('/api/pagos/webhook', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-signature': 'ts=123,v1=firma-falsa',
            'x-request-id': 'req-prueba'
        },
        body: JSON.stringify({ type: 'payment', data: { id: 999999 } })
    });
    assert.equal(respuesta.status, 401);
});

// ========================================== //
// ========== ENVÍO DE RECIBO =============== //
// ========================================== //
test('POST /api/enviar-recibo exige referencia y orden pagada', async () => {
    const sinReferencia = await peticion('/api/enviar-recibo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.equal(sinReferencia.status, 400);

    // Creamos una orden pendiente (aún no pagada) y verificamos que el recibo se bloquea.
    const llave = 'REC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const orden = await peticion('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            carrito: [{ id: PRODUCTO_ACTIVO.id, size: PRODUCTO_ACTIVO.size, quantity: 1 }],
            cliente: CLIENTE_VALIDO,
            idempotencyKey: llave
        })
    }).then(json);

    const noPagada = await peticion('/api/enviar-recibo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalReference: orden.externalReference })
    });
    assert.equal(noPagada.status, 400);
    const detalle = await json(noPagada);
    assert.match(detalle.error, /pago/i);
});
