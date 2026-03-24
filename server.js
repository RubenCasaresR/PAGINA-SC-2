const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); 

const app = express();
// Le decimos: "Usa el puerto de internet, o si estás en mi compu, usa el 3000"
const PORT = process.env.PORT || 3000;

// Conexión a la base de datos
const db = new sqlite3.Database('./tienda.sqlite', sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error("Error al conectar:", err.message);
    else console.log("📦 Bóveda de datos conectada con éxito.");
});

// Carpeta de archivos web
app.use(express.static(path.join(__dirname)));
// IMPORTANTE: Esto le permite al servidor entender los datos que le mande el carrito
app.use(express.json());

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================================== //
// ======= LAS RUTAS DE TU INVENTARIO ======= //
// ========================================== //

// 1. Ruta para TODOS los productos (La vitrina principal)
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

// 2. Ruta para UN SOLO producto (El Probador)
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
// 3. Ruta de Caja Registradora (Checkout) - ¡VERSIÓN BLINDADA! 🛡️
app.post('/api/checkout', (req, res) => {
    const paquete = req.body; 

    // SISTEMA ANTIBALAS: Detectamos si la página web mandó el formato nuevo o el viejo
    // Si viene la etiqueta "carrito", la usamos. Si no, asumimos que todo el paquete es el carrito.
    const carrito = paquete.carrito ? paquete.carrito : paquete; 
    
    // Si viene el cliente, lo usamos. Si no, inventamos uno por defecto.
    const cliente = paquete.cliente ? paquete.cliente : {
        nombre: "Cliente de Mostrador (Por Caché)",
        email: "sin-correo@test.com",
        direccion: "Recogida en Tienda"
    };

    // Verificación extra para que no explote el servidor
    if (!carrito || !Array.isArray(carrito)) {
        return res.status(400).json({ success: false, error: "El carrito llegó vacío o dañado." });
    }

    // 1. Calculamos el total de la venta
    let total = 0;
    carrito.forEach(item => total += (item.price * item.quantity));

    // 2. Anotamos al cliente y su compra en el Libro de Registro (Tabla ordenes)
    const sqlInsert = `INSERT INTO ordenes (nombre, email, direccion, total, productos) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sqlInsert, [
        cliente.nombre, 
        cliente.email, 
        cliente.direccion, 
        total, 
        JSON.stringify(carrito) 
    ], function(err) {
        if (err) {
            console.error("🚨 Error al guardar la orden:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }

        // 3. Descontamos el inventario de la bodega
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

        // 4. Éxito
        res.json({ success: true, message: "¡Orden registrada con éxito!" });
    });
});
// ========================================== //
// ======= PANEL DE ADMINISTRACIÓN ========== //
// ========================================== //

// 4. Ruta para Guardar un Nuevo Producto en la Bodega
app.post('/api/admin/productos', (req, res) => {
    // 1. Recibimos la caja con los datos que mandó el formulario HTML
    const nuevo = req.body;

    // 2. Preparamos la instrucción SQL para insertar una nueva fila
    const sql = `INSERT INTO productos 
        (id, nombre, precio, oldPrice, categoria, status, descripcion, composicion, imagenes, related, stock) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    // 3. Damos formato a los datos (convertimos listas de fotos y tallas a texto JSON)
    const imagenesJson = JSON.stringify([nuevo.imagen]); // El formulario manda 1 foto, la guardamos como lista
    const stockJson = JSON.stringify(nuevo.stock); // Las tallas que escribiste en las cajitas
    const relatedJson = JSON.stringify([]); // Por ahora lo dejamos sin productos relacionados

    // 4. Ejecutamos la orden en la bóveda SQLite
    db.run(sql, [
        nuevo.id, 
        nuevo.nombre, 
        nuevo.precio, 
        null,                  // oldPrice (sin descuento inicial)
        'novedades-cat',       // categoria por defecto
        'active',              // status: activo para que se venda ya
        nuevo.descripcion, 
        '100% algodón premium.', // composicion por defecto
        imagenesJson, 
        relatedJson, 
        stockJson
    ], function(err) {
        // Si la base de datos se queja (por ejemplo, si el ID ya existe)
        if (err) {
            console.error("🚨 Error al guardar en BD:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        // Si todo sale bien, le avisamos a la página
        res.json({ success: true, message: "Producto guardado en bodega correctamente" });
    });
});
// 5. Ruta para ver el Libro de Registro (Ventas) en el Panel Admin
app.get('/api/admin/ordenes', (req, res) => {
    // Pedimos todas las órdenes ordenadas de la más nueva a la más vieja
    db.all("SELECT * FROM ordenes ORDER BY fecha DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Convertimos la lista de productos de texto JSON a formato real
        const ordenesFormateadas = rows.map(row => {
            row.productos = JSON.parse(row.productos);
            return row;
        });
        
        res.json(ordenesFormateadas);
    });
});
// Encender el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Societa Di Calcio corriendo en el puerto ${PORT}`);
});