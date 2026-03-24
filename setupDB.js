const sqlite3 = require('sqlite3').verbose();

// 1. Conectar y crear el archivo de la base de datos
const db = new sqlite3.Database('./tienda.sqlite');

db.serialize(() => {
    // 2. Crear tabla productos
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        descripcion TEXT,
        imagen TEXT
    )`);

    // 3. Insertar un producto de prueba (usando SQL básico)
    const stmt = db.prepare("INSERT OR IGNORE INTO productos (id, nombre, precio, imagen) VALUES (?, ?, ?, ?)");
    stmt.run('ronaldo-classic', 'Playera Ronaldo Nazario', 499.00, 'playera1.jpg');
    stmt.finalize();

    console.log("✅ Base de datos 'tienda.sqlite' y tabla de productos creadas con éxito.");
});

db.close();