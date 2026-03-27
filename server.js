const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); 
const nodemailer = require('nodemailer'); 

// --- CONFIGURACIÓN DEL CARTERO VIRTUAL (GMAIL) ---
const transporter = nodemailer.createTransport({
    service: 'gmail', // <-- Volvemos al rey de la compatibilidad
    auth: {
        user: 'ventas.societadicalcio@gmail.com', // <-- Tu nuevo Gmail
        pass: 'REVOCADO_GMAIL' 
    }
});
 
const app = express();

// ========================================== //
// ======= CONFIGURACIÓN PRINCIPAL ========== //
// ========================================== //
const PORT = process.env.PORT || 3000;

// Conexión a la base de datos
const db = new sqlite3.Database('./tienda.sqlite', sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error("Error al conectar a la BD:", err.message);
    else console.log("📦 Bóveda de datos conectada con éxito.");
});

// ======= CREAR TABLA DE NEWSLETTER SI NO EXISTE =======
db.run(`CREATE TABLE IF NOT EXISTS suscriptores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Middlewares: Para que el servidor lea los archivos y entienda JSON
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================================== //
// ======= CAJERO DE MERCADO PAGO =========== //
// ========================================== //
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Agrega tu llave maestra de prueba (Access Token)
const client = new MercadoPagoConfig({ accessToken: 'REVOCADO_MP' });

// Ruta para generar el ticket de cobro
app.post('/api/crear-pago', async (req, res) => {
    try {
        const paquete = req.body;
        const carrito = paquete.carrito ? paquete.carrito : paquete;

        const articulosBancarios = carrito.map(item => {
            return {
                title: item.name + " (Talla: " + item.size + ")",
                unit_price: Number(item.price),
                currency_id: "MXN",
                quantity: Number(item.quantity)
            };
        });

        const preference = new Preference(client);
        
        const respuestaBanco = await preference.create({
            body: {
                items: articulosBancarios,
                back_urls: {
                    success: "https://societadicalcio.com/thank-you.html",
                    failure: "https://societadicalcio.com/checkout.html",
                    pending: "https://societadicalcio.com/checkout.html"
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

// ========================================== //
// ======= RUTA PARA EL NEWSLETTER ========== //
// ========================================== //
app.post('/api/newsletter', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, error: "Correo requerido" });
    }

    const sql = "INSERT INTO suscriptores (email) VALUES (?)";
    
    db.run(sql, [email], function(err) {
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
        
        const productosFormateados = rows.map(row => {
            row.imagenes = JSON.parse(row.imagenes);
            row.related = JSON.parse(row.related);
            row.stock = JSON.parse(row.stock);
            row.imagen = row.imagenes[0]; 
            return row;
        });
        res.json(productosFormateados);
    });
});

app.get('/api/productos/:id', (req, res) => {
    const sql = "SELECT * FROM productos WHERE id = ?";
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Producto no encontrado" });

        row.imagenes = JSON.parse(row.imagenes);
        row.related = JSON.parse(row.related);
        row.stock = JSON.parse(row.stock);
        
        res.json(row);
    });
});

// ========================================== //
// ======= RUTA DE CAJA REGISTRADORA (LOCAL)  //
// ========================================== //
app.post('/api/checkout', (req, res) => {
    const paquete = req.body; 
    const carrito = paquete.carrito ? paquete.carrito : paquete; 
    const cliente = paquete.cliente ? paquete.cliente : {
        nombre: "Cliente de Mostrador",
        email: "sin-correo@test.com",
        direccion: "Recogida en Tienda"
    };

    if (!carrito || !Array.isArray(carrito)) {
        return res.status(400).json({ success: false, error: "El carrito llegó vacío o dañado." });
    }

    let total = 0;
    carrito.forEach(item => total += (item.price * item.quantity));

    const sqlInsert = `INSERT INTO ordenes (nombre, email, direccion, total, productos) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sqlInsert, [cliente.nombre, cliente.email, cliente.direccion, total, JSON.stringify(carrito)], function(err) {
        if (err) {
            console.error("🚨 Error al guardar la orden:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }

        // Restar del inventario
        carrito.forEach(item => {
            const sqlSelect = "SELECT stock FROM productos WHERE id = ?";
            db.get(sqlSelect, [item.id], (err, row) => {
                if (!err && row) {
                    let stockActual = JSON.parse(row.stock);
                    if (stockActual[item.size] !== undefined) {
                        stockActual[item.size] -= item.quantity;
                        if (stockActual[item.size] < 0) stockActual[item.size] = 0;
                        const sqlUpdate = "UPDATE productos SET stock = ? WHERE id = ?";
                        db.run(sqlUpdate, [JSON.stringify(stockActual), item.id]);
                    }
                }
            });
        });

        // 🛑 EL CORREO YA NO SE ENVÍA AQUÍ, SOLO RESPONDEMOS QUE SE GUARDÓ LA ORDEN
        res.json({ success: true, message: "¡Orden registrada con éxito!" });
    });
});

// ========================================== //
// ======= ENVIAR RECIBO (PAGO EXITOSO) ===== //
// ========================================== //
app.post('/api/enviar-recibo', (req, res) => {
    const { carrito, cliente } = req.body;
    
    if (!carrito || !cliente) return res.status(400).json({ error: "Datos incompletos" });

    let total = 0;
    let listaHTML = '';
    
    carrito.forEach(item => {
        total += (item.price * item.quantity);
        listaHTML += `
            <li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <strong>${item.quantity}x</strong> ${item.name} (Talla: <strong>${item.size}</strong>) <br>
                <span style="color: #555;">$${(item.price * item.quantity).toFixed(2)} MXN</span>
            </li>`;
    });

    const mailOptions = {
        from: '"Società Di Calcio" <ventas.societadicalcio@gmail.com>',
        to: cliente.email,
        subject: 'Confirmación de tu pedido ⚽ - Società Di Calcio',
        html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #000; padding: 20px; text-align: center;">
                    <img src="https://societadicalcio.onrender.com/logo-fondo-verde.png" alt="Società Di Calcio" style="max-width: 120px; border-radius: 50%;">
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #000; text-transform: uppercase; letter-spacing: 1px;">¡Pago Aprobado, ${cliente.nombre}!</h2>
                    <p style="color: #555; font-size: 16px;">Tu pago se procesó correctamente y ya estamos preparando tus prendas. Aquí está tu recibo oficial:</p>
                    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; margin: 25px 0;">
                        <h3 style="margin-top: 0; border-bottom: 2px solid #000; padding-bottom: 10px; text-transform: uppercase; font-size: 14px;">Resumen de tu Orden</h3>
                        <ul style="list-style: none; padding: 0; margin: 0;">${listaHTML}</ul>
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #000; font-size: 18px; font-weight: bold; text-align: right;">Total: $${total.toFixed(2)} MXN</div>
                    </div>
                    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px;">
                        <h3 style="margin-top: 0; border-bottom: 2px solid #000; padding-bottom: 10px; text-transform: uppercase; font-size: 14px;">Dirección de Envío 📍</h3>
                        <p style="color: #333; margin: 0; font-size: 15px;">${cliente.direccion}</p>
                    </div>
                </div>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.error("🚨 Error al enviar el correo:", error);
        else console.log("✅ Recibo enviado a:", cliente.email);
    });

    res.json({ success: true });
});

// ========================================== //
// ======= PANEL DE ADMINISTRACIÓN ========== //
// ========================================== //

app.get('/api/admin/descargar-csv', (req, res) => {
    db.all("SELECT * FROM suscriptores ORDER BY fecha DESC", [], (err, rows) => {
        if (err) {
            console.error("🚨 Error al obtener suscriptores:", err.message);
            return res.status(500).send("Error del servidor");
        }
        
        if (rows.length === 0) {
            return res.send("<script>alert('Aún no tienes suscriptores en tu lista.'); window.history.back();</script>");
        }

        let csv = "ID,Correo Electronico,Fecha de Registro\n";
        rows.forEach(fila => {
            csv += `${fila.id},${fila.email},${fila.fecha}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('Lista_Correos_SocietaDiCalcio.csv');
        return res.send(csv);
    });
});

app.post('/api/admin/productos', (req, res) => {
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

app.delete('/api/admin/productos/:id', (req, res) => {
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

app.get('/api/admin/ordenes', (req, res) => {
    db.all("SELECT * FROM ordenes ORDER BY fecha DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const ordenesFormateadas = rows.map(row => {
            row.productos = JSON.parse(row.productos);
            return row;
        });
        res.json(ordenesFormateadas);
    });
});

app.put('/api/admin/productos/:id/actualizar', (req, res) => {
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

// Encender el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Societa Di Calcio corriendo en el puerto ${PORT}`);
});