const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose(); 
const nodemailer = require('nodemailer'); 
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// ========================================== //
// ======= CONFIGURACIÓN PRINCIPAL ========== //
// ========================================== //
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

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

// Cabeceras de seguridad (X-Frame-Options, HSTS, nosniff, etc.)
// CSP desactivado porque la tienda usa scripts y estilos inline.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Conexión a la base de datos
// En Render, la ruta viene del disco persistente (DB_PATH).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tienda.sqlite');
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error("Error al conectar a la BD:", err.message);
    else console.log("📦 Bóveda de datos conectada con éxito:", DB_PATH);
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
                { nombre: 'envio', definicion: 'REAL DEFAULT 0' }
            ];
            const existentes = new Set(filas.map(fila => fila.name));
            const pendientes = columnas.filter(col => !existentes.has(col.nombre));

            if (pendientes.length === 0) return callback(null);

            let indice = 0;
            const aplicar = () => {
                if (indice >= pendientes.length) return callback(null);
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

    crearSiguiente();
}

// ========================================== //
// ====== SEGURIDAD: ARCHIVOS BLOQUEADOS ==== //
// ========================================== //
// Bloqueamos la descarga de archivos sensibles del servidor.
const ARCHIVOS_BLOQUEADOS = [
    '/tienda.sqlite',
    '/server.js',
    '/database.js',
    '/setupDB.js',
    '/poblarDB.js',
    '/upgradeDB.js',
    '/crearOrdenes.js',
    '/arreglarFoto.js',
    '/migrarDB.js',
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
app.use(express.static(path.join(__dirname)));

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================================== //
// ===== VALIDACIÓN SERVIDA DEL CARRITO ===== //
// ========================================== //
// NUNCA confiamos en el precio o la cantidad que llega del navegador:
// el precio real se lee de la base de datos.
function validarCarrito(carrito, callback) {
    if (!Array.isArray(carrito) || carrito.length === 0) {
        return callback({ error: "El carrito llegó vacío o dañado." }, null);
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
            if (!Number.isInteger(cantidad) || cantidad < 1) {
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
// ======= CAJERO DE MERCADO PAGO =========== //
// ========================================== //
// Tu llave maestra vive en las variables de entorno (.env)
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

// Ruta para generar el ticket de cobro
app.post('/api/crear-pago', (req, res) => {
    const paquete = req.body;
    const carrito = paquete.carrito ? paquete.carrito : paquete;

    // Solo se puede pagar una orden que ya pasó por /api/checkout.
    const externalReference = typeof paquete.externalReference === 'string' ? paquete.externalReference.trim() : '';
    if (!externalReference) {
        return res.status(400).json({ success: false, error: "Falta la referencia de la orden." });
    }

    validarCarrito(carrito, async (error, items) => {
        if (error) return res.status(400).json({ success: false, error: error.error });

        const articulosBancarios = items.map(item => ({
            title: item.name + " (Talla: " + item.size + ")",
            unit_price: Number(item.price),
            currency_id: "MXN",
            quantity: Number(item.quantity)
        }));

        // El envío se cobra como una línea más, igual que lo que ve el cliente
        let totalProductos = 0;
        items.forEach(item => totalProductos += (item.price * item.quantity));
        const envio = calcularEnvio(totalProductos);
        if (envio > 0) {
            articulosBancarios.push({
                title: "Envío Nacional",
                unit_price: envio,
                currency_id: "MXN",
                quantity: 1
            });
        }

        const preference = new Preference(client);

        try {
            const respuestaBanco = await preference.create({
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
            });

            res.json({ success: true, link_de_pago: respuestaBanco.init_point });
        } catch (error) {
            console.error("🚨 Error en el cajero virtual:", error);
            res.status(500).json({ success: false, error: "El banco no respondió." });
        }
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

        db.run("UPDATE ordenes SET estado = ?, mp_payment_id = ? WHERE external_reference = ?",
            [estado, pagoId, ext],
            function (err) {
                if (err) {
                    console.error("🚨 Error al actualizar la orden por webhook:", err.message);
                    return res.status(500).send('error');
                }
                if (this.changes === 0) {
                    console.warn("⚠️ Webhook recibido para una orden desconocida:", ext);
                } else {
                    console.log("✅ Pago actualizado en BD:", ext, "→", estado);
                }
                res.status(200).send('ok');
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

    validarCarrito(carrito, (error, items) => {
        if (error) return res.status(400).json({ success: false, error: error.error });

        let totalProductos = 0;
        items.forEach(item => totalProductos += (item.price * item.quantity));
        const envio = calcularEnvio(totalProductos);
        const total = totalProductos + envio;

        const externalReference = 'SC-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');

        const sqlInsert = `INSERT INTO ordenes (nombre, email, direccion, total, productos, estado, external_reference, envio) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`;
        
        db.run(sqlInsert, [clienteValido.nombre, clienteValido.email, clienteValido.direccion, total, JSON.stringify(items), externalReference, envio], function(err) {
            if (err) {
                console.error("🚨 Error al guardar la orden:", err.message);
                return res.status(500).json({ success: false, error: "Error al guardar la orden." });
            }

            // Restar del inventario
            items.forEach(item => {
                const sqlSelect = "SELECT stock FROM productos WHERE id = ?";
                db.get(sqlSelect, [item.id], (err, row) => {
                    if (!err && row) {
                        let stockActual;
                        try { stockActual = JSON.parse(row.stock); } catch (e) { return; }
                        if (stockActual[item.size] !== undefined) {
                            stockActual[item.size] -= item.quantity;
                            if (stockActual[item.size] < 0) stockActual[item.size] = 0;
                            const sqlUpdate = "UPDATE productos SET stock = ? WHERE id = ?";
                            db.run(sqlUpdate, [JSON.stringify(stockActual), item.id]);
                        }
                    }
                });
            });

            res.json({
                success: true,
                message: "¡Orden registrada con éxito!",
                orderId: this.lastID,
                externalReference
            });
        });
    });
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
    const { carrito, cliente } = req.body;
    
    if (!carrito || !cliente) return res.status(400).json({ error: "Datos incompletos" });

    const emailLimpio = typeof cliente.email === 'string' ? cliente.email.trim().toLowerCase() : '';
    if (!emailLimpio || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpio)) {
        return res.status(400).json({ error: "Correo del cliente inválido." });
    }

    let totalProductos = 0;
    let listaHTML = '';
    
    carrito.forEach(item => {
        const precio = Number(item.price) || 0;
        const cantidad = Number(item.quantity) || 0;
        totalProductos += (precio * cantidad);
        listaHTML += `
            <li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <strong>${cantidad}x</strong> ${escaparHTML(item.name)} (Talla: <strong>${escaparHTML(item.size)}</strong>) <br>
                <span style="color: #555;">$${(precio * cantidad).toFixed(2)} MXN</span>
            </li>`;
    });

    const envio = calcularEnvio(totalProductos);
    const total = totalProductos + envio;

    const mailOptions = {
        from: '"Società Di Calcio" <ventas.societadicalcio@gmail.com>',
        to: emailLimpio,
        subject: 'Confirmación de tu pedido ⚽ - Società Di Calcio',
        html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #000; padding: 20px; text-align: center;">
                    <img src="${SITE_URL}/logo-fondo-verde.png" alt="Società Di Calcio" style="max-width: 120px; border-radius: 50%;">
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #000; text-transform: uppercase; letter-spacing: 1px;">¡Pago Aprobado, ${escaparHTML(cliente.nombre)}!</h2>
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
                        <p style="color: #333; margin: 0; font-size: 15px;">${escaparHTML(cliente.direccion)}</p>
                    </div>
                </div>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.error("🚨 Error al enviar el correo:", error);
        else console.log("✅ Recibo enviado a:", emailLimpio);
    });

    res.json({ success: true });
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
asegurarEsquema((err) => {
    if (err) {
        console.error("🚨 No se pudo preparar la base de datos. El servidor no arrancará:", err.message);
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`🚀 Servidor de Societa Di Calcio corriendo en el puerto ${PORT}`);
    });
});