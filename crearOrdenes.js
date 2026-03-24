const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tienda.sqlite');

db.serialize(() => {
    // Creamos la tabla de órdenes si no existe
    db.run(`CREATE TABLE IF NOT EXISTS ordenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT,
        direccion TEXT,
        total REAL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        productos TEXT
    )`);
    
    console.log("✅ Libro de registro (Tabla de Órdenes) creado con éxito.");
});

db.close();