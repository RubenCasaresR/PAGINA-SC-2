const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose(); 
const nodemailer = require('nodemailer'); 
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const PRODUCTOS_SIEMBRA = require('./datos-siembra.js');

// ========================================== //
// ======= CONFIGURACIÓN PRINCIPAL ========== //
// ========================================== //
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// --- VALIDACIÓN DE CONFIGURACIÓN AL ARRANQUE ---
// Detecta secretos faltantes o que aún tienen el valor de ejemplo.
const VALORES_PLACEHOLDER = ['CAMBIA_ESTA_CLAVE', 'CAMBIA_ESTE_TOKEN', 'CAMBIA_ESTE_CLIENT_SECRET', 'CAMBIA_ESTA_CONTRASENA_ADMIN'];

function verificarConfiguracion() {
    const claves = [
        { nombre: 'ADMIN_PASSWORD', variable: process.env.ADMIN_PASSWORD, importancia: 'ALTA' },
        { nombre: 'MERCADOPAGO_ACCESS_TOKEN', variable: process.env.MERCADOPAGO_ACCESS_TOKEN, importancia: 'ALTA' },
        { nombre: 'MERCADOPAGO_CLIENT_SECRET', variable: process.env.MERCADOPAGO_CLIENT_SECRET, importancia: 'ALTA' },
        { nombre: 'GMAIL_USER', variable: process.env.GMAIL_USER, importancia: 'MEDIA' },
        { nombre: 'GMAIL_APP_PASSWORD', variable: process.env.GMAIL_APP_PASSWORD, importancia: 'MEDIA' },
        { nombre: 'SITE_URL', variable: process.env.SITE_URL, importancia: 'MEDIA' }
    ];
    let ok = true;
    claves.forEach(c => {
        const valor = String(c.variable || '').trim();
        if (!valor) {
            console.error(`⚠️  ${c.nombre} no está configurada (importancia ${c.importancia}).`);
            ok = false;
        } else if (VALORES_PLACEHOLDER.includes(valor)) {
            console.error(`⚠️  ${c.nombre} tiene el valor de ejemplo (importancia ${c.importancia}). ¡Cámbialo antes de producción!`);
            ok = false;
        }
    });
    return ok;
}

// --- CONFIGURACIÓN DE ENVÍO (misma regla que muestra el frontend) ---
const FREE_SHIPPING_THRESHOLD = 1500.00;
const STANDARD_SHIPPING_COST = 99.00;

function calcularEnvio(subtotal) {
    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_COST;
}

// --- CONFIGURACIÓN DEL CARTERO VIRTUAL (GMAIL) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

const app = express();

// Cabeceras de seguridad (X-Frame-Options, HSTS, nosniff, CSP, etc.)
// CSP activo: script-src 'self' (sin inline scripts ni onclick). Se mantiene
// 'unsafe-inline' solo en estilos por los atributos style="" heredados.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https://http2.mlstatic.com'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Conexión a la base de datos
// En Render, la ruta viene del disco persistente (DB_PATH).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tienda.sqlite');
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error("Error al conectar a la BD:", err.message);
    else {
        console.log("📦 Bóveda de datos conectada con éxito:", DB_PATH);
        db.run('PRAGMA busy_timeout = 5000');
    }
});

// ========================================== //
// ======= ESQUEMA Y MIGRACIONES ============ //
// ========================================== //
// Idempotente: se ejecuta en cada arranque y solo agrega lo que falta.
function asegurarEsquema(callback) {
    // Tablas base (no se tocan si ya existen)
    const crearTablas = [
        `CREATE TABLE IF NOT EXISTS suscriptores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS productos (
            id TEXT PRIMARY KEY,
            nombre TEXT,
            precio REAL,
            oldPrice REAL,
            categoria TEXT,
            status TEXT,
            descripcion TEXT,
            composicion TEXT,
            imagenes TEXT,
            related TEXT,
            stock TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ordenes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            email TEXT,
            direccion TEXT,
            total REAL,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            productos TEXT
        )`
    ];

    let indiceTablas = 0;
    const crearSiguiente = () => {
        if (indiceTablas >= crearTablas.length) return migrarColumnas();
        const sql = crearTablas[indiceTablas++];
        db.run(sql, (err) => {
            if (err) {
                console.error("🚨 Error creando tabla:", err.message);
                return callback(err);
            }
            crearSiguiente();
        });
    };

    const migrarColumnas = () => {
        db.all("PRAGMA table_info(ordenes)", (err2, filas) => {
            if (err2) {
                console.error("🚨 Error leyendo el esquema de 'ordenes':", err2.message);
                return callback(err2);
            }

            const columnas = [
                { nombre: 'estado', definicion: "TEXT DEFAULT 'pendiente'" },
                { nombre: 'mp_payment_id', definicion: 'TEXT' },
                { nombre: 'external_reference', definicion: 'TEXT' },
                { nombre: 'envio', definicion: 'REAL DEFAULT 0' },
                { nombre: 'idempotency_key', definicion: 'TEXT' },
                { nombre: 'recibo_enviado', definicion: 'INTEGER DEFAULT 0' }
            ];
            const existentes = new Set(filas.map(fila => fila.name));
            const pendientes = columnas.filter(col => !existentes.has(col.nombre));

            if (pendientes.length === 0) return crearIndiceIdempotencia();

            let indice = 0;
            const aplicar = () => {
                if (indice >= pendientes.length) return crearIndiceIdempotencia();
                const col = pendientes[indice++];
                db.run(`ALTER TABLE ordenes ADD COLUMN ${col.nombre} ${col.definicion}`, (e) => {
                    if (e) {
                        console.error("🚨 Error migrando la columna '" + col.nombre + "':", e.message);
                        return callback(e);
                    }
                    console.log("📦 Migración: columna '" + col.nombre + "' agregada a 'ordenes'.");
                    aplicar();
                });
            };
            aplicar();
        });
    };

    // Índice único para evitar órdenes duplicadas cuando el cliente reintenta el checkout.
    const crearIndiceIdempotencia = () => {
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_idempotencia ON ordenes(idempotency_key)', (e) => {
            if (e) {
                console.error("🚨 Error creando índice de idempotencia:", e.message);
                return callback(e);
            }
            sembrarProductos();
        });
    };

    // Siembra el catálogo inicial solo cuando la tabla 'productos' está vacía.
    const sembrarProductos = () => {
        db.get("SELECT COUNT(*) AS total FROM productos", (err, fila) => {
            if (err) {
                console.error("🚨 Error contando productos:", err.message);
                return callback(err);
            }
            if (fila.total > 0) return callback(null);

            const sql = `INSERT INTO productos
                (id, nombre, precio, oldPrice, categoria, status, descripcion, composicion, imagenes, related, stock)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            let indice = 0;
            const insertarSiguiente = () => {
                if (indice >= PRODUCTOS_SIEMBRA.length) {
                    console.log(`🌱 Catálogo inicial sembrado (${PRODUCTOS_SIEMBRA.length} productos).`);
                    return callback(null);
                }
                const p = PRODUCTOS_SIEMBRA[indice++];
                db.run(sql, [
                    p.id, p.nombre, p.precio, p.oldPrice, p.categoria, p.status,
                    p.descripcion, p.composicion,
                    JSON.stringify(p.imagenes), JSON.stringify(p.related), JSON.stringify(p.stock)
                ], (e) => {
                    if (e) {
                        console.error("🚨 Error sembrando producto '" + p.id + "':", e.message);
                        return callback(e);
                    }
                    insertarSiguiente();
                });
            };
            insertarSiguiente();
        });
    };

    crearSiguiente();
}

// ========================================== //
// ====== SEGURIDAD: ARCHIVOS BLOQUEADOS ==== //
// ========================================== //
// Bloqueamos la descarga de archivos sensibles del servidor.
const ARCHIVOS_BLOQUEADOS = [
    '/tienda.sqlite',
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/.env'
];

app.use((req, res, next) => {
    const ruta = req.path.split('?')[0];
    if (ARCHIVOS_BLOQUEADOS.includes(ruta)) {
        return res.status(403).send('Acceso denegado.');
    }
    next();
});

// El servidor debe entender JSON desde el principio para las rutas de auth
app.use(express.json());

// Compresión gzip/brotli de respuestas de texto (CSS, JS, HTML).
app.use(compression());

// ========================================== //
// ====== SEGURIDAD: LÍMITE DE PETICIONES === //
// ========================================== //
const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos. Espera unos minutos.' }
});

// ========================================== //
// ====== AUTENTICACIÓN DEL ADMINISTRADOR === //
// ========================================== //
if (!process.env.ADMIN_PASSWORD) {
    console.error('⚠️  ADMIN_PASSWORD no está configurada. El panel de administración no podrá ser usado.');
}

const sesionesAdmin = new Map();
const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // 12 horas

function coincidenPasswords(candidata, real) {
    const a = Buffer.from(String(candidata), 'utf8');
    const b = Buffer.from(String(real), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function crearSesionAdmin() {
    const token = crypto.randomBytes(32).toString('hex');
    sesionesAdmin.set(token, { creada: Date.now() });
    return token;
}

function sesionValida(token) {
    if (!token) return false;
    const sesion = sesionesAdmin.get(token);
    if (!sesion) return false;
    if (Date.now() - sesion.creada > DURACION_SESION_MS) {
        sesionesAdmin.delete(token);
        return false;
    }
    return true;
}

function leerCookie(req, nombre) {
    const raw = req.headers.cookie || '';
    for (const parte of raw.split(';')) {
        const idx = parte.indexOf('=');
        if (idx === -1) continue;
        const clave = parte.slice(0, idx).trim();
        if (clave === nombre) {
            try { return decodeURIComponent(parte.slice(idx + 1).trim()); }
            catch (e) { return parte.slice(idx + 1).trim(); }
        }
    }
    return null;
}

function fijarCookieSesion(res, token) {
    const secure = process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie',
        `sdc_admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.round(DURACION_SESION_MS / 1000)}${secure ? '; Secure' : ''}`);
}

function borrarCookieSesion(res) {
    res.setHeader('Set-Cookie', 'sdc_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

// Guardia para las rutas privadas del panel
function requiereAdmin(req, res, next) {
    const token = leerCookie(req, 'sdc_admin');
    if (!sesionValida(token)) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    next();
}

app.post('/api/admin/login', limitadorLogin, (req, res) => {
    const { password } = req.body || {};
    const real = process.env.ADMIN_PASSWORD;
    if (!real) {
        return res.status(500).json({ success: false, error: 'Servidor mal configurado.' });
    }
    if (!password || !coincidenPasswords(password, real)) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
    }
    const token = crearSesionAdmin();
    fijarCookieSesion(res, token);
    res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
    const token = leerCookie(req, 'sdc_admin');
    if (token) sesionesAdmin.delete(token);
    borrarCookieSesion(res);
    res.json({ success: true });
});

app.get('/api/admin/verificar', (req, res) => {
    const token = leerCookie(req, 'sdc_admin');
    res.json({ autenticado: sesionValida(token) });
});

// Middlewares: Para que el servidor lea los archivos del sitio
// Los HTML no se cachean (siempre frescos en desarrollo); el resto de
// estáticos (imágenes, CSS, JS) se cachea 30 días con ETag.
app.use((req, res, next) => {
    if (/\.html?$/i.test(req.path)) {
        res.setHeader('Cache-Control', 'no-cache');
    }
    next();
});
// Página principal (registrada ANTES de express.static para que el HTML
// no reciba la caché de 30 días de los estáticos)
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(path.join(__dirname), {
    maxAge: '30d',
    etag: true,
    lastModified: true
}));

// ========================================== //
// ===== VALIDACIÓN SERVIDA DEL CARRITO ===== //
// ========================================== //
// NUNCA confiamos en el precio o la cantidad que llega del navegador:
// el precio real se lee de la base de datos.
function validarCarrito(carrito, callback) {
    if (!Array.isArray(carrito) || carrito.length === 0) {
        return callback({ error: "El carrito llegó vacío o dañado." }, null);
    }
    if (carrito.length > 20) {
        return callback({ error: "El carrito tiene demasiados artículos." }, null);
    }

    const itemsValidados = [];
    let indice = 0;

    const procesar = () => {
        if (indice >= carrito.length) return callback(null, itemsValidados);

        const item = carrito[indice++];
        if (!item || typeof item.id !== 'string' || !item.size) {
            return callback({ error: "Artículo inválido en el carrito." }, null);
        }

        db.get("SELECT * FROM productos WHERE id = ?", [item.id], (err, row) => {
            if (err) return callback({ error: err.message }, null);
            if (!row) return callback({ error: `El producto "${item.id}" no existe.` }, null);

            let stock, imagenes;
            try {
                stock = JSON.parse(row.stock);
                imagenes = JSON.parse(row.imagenes);
            } catch (e) {
                return callback({ error: `El inventario de "${row.nombre}" está dañado.` }, null);
            }

            const cantidad = Number(item.quantity);
            if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) {
                return callback({ error: `Cantidad inválida para "${row.nombre}".` }, null);
            }
            if (stock[item.size] === undefined) {
                return callback({ error: `La talla ${item.size} de "${row.nombre}" no está disponible.` }, null);
            }
            if (cantidad > stock[item.size]) {
                return callback({ error: `Solo quedan ${stock[item.size]} piezas de "${row.nombre}" en talla ${item.size}.` }, null);
            }

            itemsValidados.push({
                id: row.id,
                name: row.nombre,
                price: row.precio,
                image: Array.isArray(imagenes) && imagenes[0] ? imagenes[0] : 'logo SC sin fondo.png',
                quantity: cantidad,
                size: item.size
            });

            procesar();
        });
    };

    procesar();
}

// ========================================== //
// ====== INVENTARIO TRANSACCIONAL ========== //
// ========================================== //
// Las actualizaciones de stock se hacen dentro de una transacción para que
// dos compradores simultáneos no puedan quedarse con la misma última pieza.
function enTransaccion(trabajo, callback) {
    db.run('BEGIN IMMEDIATE', (err) => {
        if (err) return callback(err);
        trabajo((error) => {
            if (error) return db.run('ROLLBACK', () => callback(error));
            db.run('COMMIT', (ce) => callback(ce));
        });
    });
}

function ajustarStock(items, factor, callback) {
    enTransaccion((fin) => {
        let indice = 0;
        const siguiente = () => {
            if (indice >= items.length) return fin(null);
            const item = items[indice++];
            db.get("SELECT stock FROM productos WHERE id = ?", [item.id], (err, row) => {
                if (err) return fin(err);
                if (!row) return fin(new Error("Producto no encontrado: " + item.id));
                let stock;
                try { stock = JSON.parse(row.stock); } catch (e) { return fin(new Error("Inventario corrupto.")); }
                if (stock[item.size] === undefined) return fin(new Error("Talla " + item.size + " no disponible."));
                if (factor < 0 && stock[item.size] < item.quantity) return fin(new Error("Stock insuficiente."));
                stock[item.size] += factor * item.quantity;
                if (stock[item.size] < 0) stock[item.size] = 0;
                db.run("UPDATE productos SET stock = ? WHERE id = ?", [JSON.stringify(stock), item.id], (ue) => {
                    if (ue) return fin(ue);
                    siguiente();
                });
            });
        };
        siguiente();
    }, callback);
}

function decrementarStock(items, callback) { ajustarStock(items, -1, callback); }
function restaurarStock(items, callback) { ajustarStock(items, +1, callback); }

function buscarOrdenPorReferencia(ref, callback) {
    db.get("SELECT * FROM ordenes WHERE external_reference = ?", [ref], (err, row) => callback(err, row));
}

// ========================================== //
// ======= CAJERO DE MERCADO PAGO =========== //
// ========================================== //
// Tu llave maestra vive en las variables de entorno (.env)
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

// Ruta para generar el ticket de cobro
// Solo se puede pagar una orden que ya pasó por /api/checkout: la preferencia
// se construye con los artículos y precios guardados en la base de datos,
// nunca con el carrito que manda el navegador.
const limitadorCrearPago = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes. Inténtalo más tarde.' }
});

app.post('/api/crear-pago', limitadorCrearPago, (req, res) => {
    const paquete = req.body;

    const externalReference = typeof paquete.externalReference === 'string' ? paquete.externalReference.trim() : '';
    if (!externalReference) {
        return res.status(400).json({ success: false, error: "Falta la referencia de la orden." });
    }

    buscarOrdenPorReferencia(externalReference, (err, orden) => {
        if (err) {
            console.error("🚨 Error consultando la orden:", err.message);
            return res.status(500).json({ success: false, error: "Error del servidor." });
        }
        if (!orden) {
            return res.status(400).json({ success: false, error: "La orden no existe. Vuelve a intentar el pago." });
        }

        let items;
        try { items = JSON.parse(orden.productos); } catch (e) {
            return res.status(500).json({ success: false, error: "Los datos de la orden están dañados." });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: "La orden no tiene artículos." });
        }

        const articulosBancarios = items.map(item => ({
            title: item.name + " (Talla: " + item.size + ")",
            unit_price: Number(item.price),
            currency_id: "MXN",
            quantity: Number(item.quantity)
        }));

        // El envío se cobra como una línea más, igual que lo que ve el cliente
        const envio = Number(orden.envio) || 0;
        if (envio > 0) {
            articulosBancarios.push({
                title: "Envío Nacional",
                unit_price: envio,
                currency_id: "MXN",
                quantity: 1
            });
        }

        const preference = new Preference(client);

        preference.create({
            body: {
                items: articulosBancarios,
                external_reference: externalReference,
                notification_url: `${SITE_URL}/api/pagos/webhook`,
                back_urls: {
                    success: `${SITE_URL}/thank-you.html`,
                    failure: `${SITE_URL}/checkout.html`,
                    pending: `${SITE_URL}/checkout.html`
                },
                shipments: {
                    mode: "not_specified",
                    local_pickup: false,
                    cost: 0
                }
            }
        }).then((respuestaBanco) => {
            res.json({ success: true, link_de_pago: respuestaBanco.init_point });
        }).catch((error) => {
            console.error("🚨 Error en el cajero virtual:", error);
            res.status(500).json({ success: false, error: "El banco no respondió." });
        });
    });
});

// ========================================== //
// ===== WEBHOOK DE MERCADO PAGO ============ //
// ========================================== //
// Mercado Pago nos avisa aquí cuando cambia el estado de un pago.
// La firma X-Signature se verifica con HMAC para que nadie pueda
// fingir un pago aprobado.

function obtenerDataId(req) {
    if (req.query['data.id']) return req.query['data.id'];
    if (req.query.data && req.query.data.id) return req.query.data.id;
    if (req.query.id) return req.query.id;
    return '';
}

function verificarFirmaMercadoPago(req) {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    const secreto = process.env.MERCADOPAGO_CLIENT_SECRET;
    if (!xSignature || !xRequestId || !secreto) return false;

    let ts = null;
    let v1 = null;
    xSignature.split(',').forEach(parte => {
        const idx = parte.indexOf('=');
        if (idx === -1) return;
        const clave = parte.slice(0, idx).trim();
        const valor = parte.slice(idx + 1).trim();
        if (clave === 'ts') ts = valor;
        else if (clave === 'v1') v1 = valor;
    });
    if (!ts || !v1) return false;

    const dataId = obtenerDataId(req);
    const manifiesto = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const esperado = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
    return esperado === v1;
}

async function consultarPago(pagoId) {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const respuesta = await fetch(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!respuesta.ok) throw new Error(`Mercado Pago respondió HTTP ${respuesta.status}`);
    return respuesta.json();
}

app.get('/api/pagos/webhook', (req, res) => {
    res.status(200).send('ok');
});

app.post('/api/pagos/webhook', async (req, res) => {
    if (!verificarFirmaMercadoPago(req)) {
        return res.status(401).send('Firma inválida');
    }

    if ((req.body.type || '') !== 'payment') {
        return res.status(200).send('ok');
    }

    const pagoId = String(req.body.data && req.body.data.id ? req.body.data.id : obtenerDataId(req));
    if (!pagoId) return res.status(200).send('ok');

    try {
        const pago = await consultarPago(pagoId);
        const ext = pago.external_reference;
        if (!ext) return res.status(200).send('ok');

        let estado;
        if (pago.status === 'approved') estado = 'pagado';
        else if (pago.status === 'rejected' || pago.status === 'cancelled') estado = 'rechazado';
        else estado = 'pendiente';

        buscarOrdenPorReferencia(ext, (err, orden) => {
            if (err) {
                console.error("🚨 Error consultando orden por webhook:", err.message);
                return res.status(500).send('error');
            }
            if (!orden) {
                console.warn("⚠️ Webhook recibido para una orden desconocida:", ext);
                return res.status(200).send('ok');
            }

            const estadoAnterior = orden.estado;
            if (estadoAnterior === estado) return res.status(200).send('ok');

            db.run("UPDATE ordenes SET estado = ?, mp_payment_id = ? WHERE id = ?",
                [estado, pagoId, orden.id],
                function (errUpd) {
                    if (errUpd) {
                        console.error("🚨 Error al actualizar la orden por webhook:", errUpd.message);
                        return res.status(500).send('error');
                    }
                    console.log("✅ Pago actualizado en BD:", ext, "→", estado);

                    // Si el pago fue rechazado/cancelado y el inventario seguía reservado,
                    // lo devolvemos a la tienda. Solo se hace una vez (guarda por estadoAnterior).
                    if (estado === 'rechazado' && estadoAnterior === 'pendiente') {
                        let items;
                        try { items = JSON.parse(orden.productos); } catch (e) { items = null; }
                        if (Array.isArray(items) && items.length > 0) {
                            return restaurarStock(items, (errRest) => {
                                if (errRest) console.error("🚨 Error restaurando inventario:", errRest.message);
                                else console.log("✅ Inventario restaurado por pago rechazado:", ext);
                                res.status(200).send('ok');
                            });
                        }
                    }
                    res.status(200).send('ok');
                });
        });
    } catch (error) {
        console.error("🚨 Error consultando el pago en Mercado Pago:", error.message);
        res.status(500).send('error');
    }
});

// ========================================== //
// ======= RUTA PARA EL NEWSLETTER ========== //
// ========================================== //
const limitadorNewsletter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes. Inténtalo más tarde.' }
});

app.post('/api/newsletter', limitadorNewsletter, (req, res) => {
    const { email } = req.body;
    const emailLimpio = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!emailLimpio || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpio)) {
        return res.status(400).json({ success: false, error: "Ingresa un correo válido." });
    }

    const sql = "INSERT INTO suscriptores (email) VALUES (?)";
    
    db.run(sql, [emailLimpio], function(err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.json({ success: false, error: "¡Este correo ya está en el club!" });
            }
            console.error("🚨 Error al guardar correo:", err.message);
            return res.status(500).json({ success: false, error: "Error del servidor." });
        }
        return res.json({ success: true, message: "¡Bienvenido a la Società Di Calcio!" });
    });
});

// ========================================== //
// ======= LAS RUTAS DE TU INVENTARIO ======= //
// ========================================== //

app.get('/api/productos', (req, res) => {
    db.all("SELECT * FROM productos", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        try {
            const productosFormateados = rows.map(row => {
                row.imagenes = JSON.parse(row.imagenes);
                row.related = JSON.parse(row.related);
                row.stock = JSON.parse(row.stock);
                row.imagen = row.imagenes[0]; 
                return row;
            });
            res.json(productosFormateados);
        } catch (e) {
            return res.status(500).json({ error: "Datos de inventario corruptos." });
        }
    });
});

app.get('/api/productos/:id', (req, res) => {
    const sql = "SELECT * FROM productos WHERE id = ?";
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Producto no encontrado" });

        try {
            row.imagenes = JSON.parse(row.imagenes);
            row.related = JSON.parse(row.related);
            row.stock = JSON.parse(row.stock);
        } catch (e) {
            return res.status(500).json({ error: "Datos de inventario corruptos." });
        }
        
        res.json(row);
    });
});

// ========================================== //
// ======= RUTA DE CAJA REGISTRADORA (LOCAL)  //
// ========================================== //
function validarDatosCliente(cliente) {
    if (!cliente || typeof cliente !== 'object') return "Faltan los datos del cliente.";
    const nombre = typeof cliente.nombre === 'string' ? cliente.nombre.trim() : '';
    const email = typeof cliente.email === 'string' ? cliente.email.trim().toLowerCase() : '';
    const direccion = typeof cliente.direccion === 'string' ? cliente.direccion.trim() : '';
    if (!nombre) return "El nombre es obligatorio.";
    if (nombre.length < 2 || nombre.length > 120) return "El nombre no tiene un largo válido.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "El correo del cliente no es válido.";
    if (!direccion) return "La dirección de envío es obligatoria.";
    if (direccion.length > 500) return "La dirección es demasiado larga.";
    return { nombre, email, direccion };
}

app.post('/api/checkout', (req, res) => {
    const paquete = req.body;
    const carrito = paquete.carrito ? paquete.carrito : paquete;
    const clienteValido = validarDatosCliente(paquete.cliente);

    if (typeof clienteValido !== 'object') {
        return res.status(400).json({ success: false, error: clienteValido });
    }

    // Llave de idempotencia: si el navegador reintenta el checkout, no se crea
    // una segunda orden ni se descuenta el stock dos veces.
    const idempotencyKey = typeof paquete.idempotencyKey === 'string' ? paquete.idempotencyKey.trim().slice(0, 64) : '';
    if (!idempotencyKey) {
        return res.status(400).json({ success: false, error: "Falta la llave de seguridad de la orden." });
    }

    // Si esta llave ya generó una orden (reintento del navegador), devolvemos la existente
    // sin volver a validar el inventario ni descontar stock.
    db.get("SELECT id, external_reference FROM ordenes WHERE idempotency_key = ?", [idempotencyKey], (errKey, ordenExistente) => {
        if (errKey) {
            console.error("🚨 Error consultando la llave de idempotencia:", errKey.message);
            return res.status(500).json({ success: false, error: "Error del servidor." });
        }
        if (ordenExistente) {
            return res.json({ success: true, message: "Orden ya registrada.", orderId: ordenExistente.id, externalReference: ordenExistente.external_reference });
        }
        procesarCheckoutNuevo();
    });

    function procesarCheckoutNuevo() {
    validarCarrito(carrito, (error, items) => {
        if (error) return res.status(400).json({ success: false, error: error.error });

        let totalProductos = 0;
        items.forEach(item => totalProductos += (item.price * item.quantity));
        const envio = calcularEnvio(totalProductos);
        const total = totalProductos + envio;

        const externalReference = 'SC-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');

        const sqlInsert = `INSERT INTO ordenes (nombre, email, direccion, total, productos, estado, external_reference, envio, idempotency_key) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`;

        db.run(sqlInsert, [clienteValido.nombre, clienteValido.email, clienteValido.direccion, total, JSON.stringify(items), externalReference, envio, idempotencyKey], function(err) {
            if (err) {
                // El cliente reintentó con la misma llave: devolver la orden ya creada.
                if (String(err.message).includes('UNIQUE')) {
                    return db.get("SELECT id, external_reference FROM ordenes WHERE idempotency_key = ?", [idempotencyKey], (e2, ordenRepetida) => {
                        if (e2 || !ordenRepetida) {
                            console.error("🚨 Error recuperando la orden repetida:", err.message);
                            return res.status(500).json({ success: false, error: "Error al guardar la orden." });
                        }
                        return res.json({ success: true, message: "Orden ya registrada.", orderId: ordenRepetida.id, externalReference: ordenRepetida.external_reference });
                    });
                }
                console.error("🚨 Error al guardar la orden:", err.message);
                return res.status(500).json({ success: false, error: "Error al guardar la orden." });
            }

            // Reservar inventario dentro de una transacción.
            decrementarStock(items, (errStock) => {
                if (errStock) {
                    console.error("🚨 Error reservando inventario:", errStock.message);
                    return res.status(500).json({ success: false, error: "No hay stock suficiente para completar la orden." });
                }

                res.json({
                    success: true,
                    message: "¡Orden registrada con éxito!",
                    orderId: this.lastID,
                    externalReference
                });
            });
        });
    });
    }
});

// ========================================== //
// ======= ENVIAR RECIBO (PAGO EXITOSO) ===== //
// ========================================== //
function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const limitadorRecibo = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes. Inténtalo más tarde.' }
});

app.post('/api/enviar-recibo', limitadorRecibo, (req, res) => {
    // El recibo se construye siempre con lo que está guardado en la base de
    // datos, nunca con el carrito que manda el navegador.
    const externalReference = typeof req.body.externalReference === 'string' ? req.body.externalReference.trim() : '';
    if (!externalReference) {
        return res.status(400).json({ error: "Falta la referencia de la orden." });
    }

    buscarOrdenPorReferencia(externalReference, (err, orden) => {
        if (err) {
            console.error("🚨 Error consultando la orden:", err.message);
            return res.status(500).json({ error: "Error del servidor." });
        }
        if (!orden) return res.status(404).json({ error: "La orden no existe." });

        if (orden.estado !== 'pagado') {
            return res.status(400).json({ error: "El pago de esta orden aún no está confirmado." });
        }

        if (orden.recibo_enviado) {
            return res.json({ success: true, yaEnviado: true });
        }

        let items;
        try { items = JSON.parse(orden.productos); } catch (e) {
            return res.status(500).json({ error: "Los datos de la orden están dañados." });
        }

        const envio = Number(orden.envio) || 0;
        let listaHTML = '';

        items.forEach(item => {
            const precio = Number(item.price) || 0;
            const cantidad = Number(item.quantity) || 0;
            listaHTML += `
                <li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <strong>${cantidad}x</strong> ${escaparHTML(item.name)} (Talla: <strong>${escaparHTML(item.size)}</strong>) <br>
                    <span style="color: #555;">$${(precio * cantidad).toFixed(2)} MXN</span>
                </li>`;
        });

        const total = Number(orden.total) || 0;

        const mailOptions = {
            from: '"Società Di Calcio" <ventas.societadicalcio@gmail.com>',
            to: orden.email,
            subject: 'Confirmación de tu pedido ⚽ - Società Di Calcio',
            html: `
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #000; padding: 20px; text-align: center;">
                        <img src="${SITE_URL}/logo-fondo-verde.png" alt="Società Di Calcio" style="max-width: 120px; border-radius: 50%;">
                    </div>
                    <div style="padding: 30px;">
                        <h2 style="color: #000; text-transform: uppercase; letter-spacing: 1px;">¡Pago Aprobado, ${escaparHTML(orden.nombre)}!</h2>
                        <p style="color: #555; font-size: 16px;">Tu pago se procesó correctamente y ya estamos preparando tus prendas. Aquí está tu recibo oficial:</p>
                        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; margin: 25px 0;">
                            <h3 style="margin-top: 0; border-bottom: 2px solid #000; padding-bottom: 10px; text-transform: uppercase; font-size: 14px;">Resumen de tu Orden</h3>
                            <ul style="list-style: none; padding: 0; margin: 0;">${listaHTML}</ul>
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #000; font-size: 16px; text-align: right;">
                                ${envio > 0 ? `<div style="color: #555;">Envío Nacional: $${envio.toFixed(2)} MXN</div>` : '<div style="color: #28a745;">Envío Gratis 🎉</div>'}
                                <div style="font-size: 18px; font-weight: bold;">Total: $${total.toFixed(2)} MXN</div>
                            </div>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px;">
                            <h3 style="margin-top: 0; border-bottom: 2px solid #000; padding-bottom: 10px; text-transform: uppercase; font-size: 14px;">Dirección de Envío 📍</h3>
                            <p style="color: #333; margin: 0; font-size: 15px;">${escaparHTML(orden.direccion)}</p>
                        </div>
                    </div>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) {
                console.error("🚨 Error al enviar el correo:", error);
                return res.status(500).json({ error: "No se pudo enviar el correo." });
            }
            console.log("✅ Recibo enviado a:", orden.email);
            db.run("UPDATE ordenes SET recibo_enviado = 1 WHERE id = ?", [orden.id], (errMarcar) => {
                if (errMarcar) console.error("🚨 Error marcando recibo como enviado:", errMarcar.message);
                res.json({ success: true });
            });
        });
    });
});

// ========================================== //
// ======= PANEL DE ADMINISTRACIÓN ========== //
// ========================================== //

app.get('/api/admin/descargar-csv', requiereAdmin, (req, res) => {
    db.all("SELECT * FROM suscriptores ORDER BY fecha DESC", [], (err, rows) => {
        if (err) {
            console.error("🚨 Error al obtener suscriptores:", err.message);
            return res.status(500).send("Error del servidor");
        }
        
        if (rows.length === 0) {
            return res.send("<script>alert('Aún no tienes suscriptores en tu lista.'); window.history.back();</script>");
        }

        // Protección contra inyección de fórmulas en Excel/Sheets
        function blindarCSV(valor) {
            let texto = String(valor);
            if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
            return '"' + texto.replace(/"/g, '""') + '"';
        }

        let csv = "ID,Correo Electronico,Fecha de Registro\n";
        rows.forEach(fila => {
            csv += `${fila.id},${blindarCSV(fila.email)},${blindarCSV(fila.fecha)}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('Lista_Correos_SocietaDiCalcio.csv');
        return res.send(csv);
    });
});

app.post('/api/admin/productos', requiereAdmin, (req, res) => {
    const nuevo = req.body;
    const sql = `INSERT INTO productos 
        (id, nombre, precio, oldPrice, categoria, status, descripcion, composicion, imagenes, related, stock) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const imagenesJson = JSON.stringify([nuevo.imagen]); 
    const stockJson = JSON.stringify(nuevo.stock); 
    const relatedJson = JSON.stringify([]); 

    db.run(sql, [
        nuevo.id, nuevo.nombre, nuevo.precio, null, 'novedades-cat', 'active', 
        nuevo.descripcion, '100% algodón premium.', imagenesJson, relatedJson, stockJson
    ], function(err) {
        if (err) {
            console.error("🚨 Error al guardar en BD:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: "Producto guardado en bodega correctamente" });
    });
});

app.delete('/api/admin/productos/:id', requiereAdmin, (req, res) => {
    const idProducto = req.params.id;
    const sql = "DELETE FROM productos WHERE id = ?";

    db.run(sql, [idProducto], function(err) {
        if (err) {
            console.error("🚨 Error al eliminar el producto:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: "Producto no encontrado" });
        }

        res.json({ success: true, message: "Producto eliminado de la bodega correctamente" });
    });
});

app.get('/api/admin/ordenes', requiereAdmin, (req, res) => {
    db.all("SELECT * FROM ordenes ORDER BY fecha DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const ordenesFormateadas = rows.map(row => {
            row.productos = JSON.parse(row.productos);
            return row;
        });
        res.json(ordenesFormateadas);
    });
});

app.put('/api/admin/productos/:id/actualizar', requiereAdmin, (req, res) => {
    const idProducto = req.params.id;
    const nuevoStock = JSON.stringify(req.body.stock);
    const nuevoPrecio = req.body.precio; 
    
    const textoImagenes = req.body.imagenes || "";
    const arrayImagenes = textoImagenes.split(',').map(img => img.trim()).filter(img => img !== "");
    const nuevasImagenesJson = JSON.stringify(arrayImagenes);

    const sql = "UPDATE productos SET precio = ?, stock = ?, imagenes = ? WHERE id = ?";
    
    db.run(sql, [nuevoPrecio, nuevoStock, nuevasImagenesJson, idProducto], function(err) {
        if (err) {
            console.error("🚨 Error al actualizar el producto:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: "¡Precio, inventario y fotos guardados con éxito!" });
    });
});

// Encender el servidor (solo cuando el esquema está listo)
// La promesa 'cuandoListo' permite a los tests esperar a que la base de datos
// esté preparada antes de hacer peticiones HTTP.
const cuandoListo = new Promise((resolver, rechazar) => {
    asegurarEsquema((err) => {
        if (err) {
            console.error("🚨 No se pudo preparar la base de datos. El servidor no arrancará:", err.message);
            return rechazar(err);
        }
        resolver(app);
    });
});

function arrancar() {
    cuandoListo.then(() => {
        // Avisar (o bloquear en producción) si faltan secretos o siguen con el valor de ejemplo.
        const configuracionOk = verificarConfiguracion();
        if (process.env.NODE_ENV === 'production' && !configuracionOk) {
            console.error("🚨 Configuración inválida. El servidor no arrancará en modo producción.");
            process.exit(1);
        }

        app.listen(PORT, () => {
            console.log(`🚀 Servidor de Societa Di Calcio corriendo en el puerto ${PORT}`);
        });
    }).catch((err) => {
        console.error("🚨 No se pudo preparar la base de datos. El servidor no arrancará:", err.message);
        process.exit(1);
    });
}

// Solo arranca si se ejecuta directamente (node server.js). Los tests requieren
// el módulo y arrancan su propio servidor en un puerto aleatorio.
if (require.main === module) {
    arrancar();
}

module.exports = { app, db, cuandoListo, arrancar };