const sqlite3 = require('sqlite3').verbose();

// 1. Abrimos la bóveda
const db = new sqlite3.Database('./tienda.sqlite');

db.serialize(() => {
    // 2. Preparamos el formato de registro (INSERT)
    const stmt = db.prepare("INSERT OR IGNORE INTO productos (id, nombre, precio, imagen) VALUES (?, ?, ?, ?)");
    
    // 3. Registramos los productos faltantes
    stmt.run('ronaldinho-messi', 'Playera Dinho & Messi', 499.00, '26.png');
    stmt.run('messi-retro', 'Playera Messi Retro', 499.00, '9.png');
    stmt.run('zidane-classic', 'Playera Zidane Classic', 499.00, '23.png');
    
    stmt.finalize();
    console.log("✅ Catálogo completo ingresado a la base de datos con éxito.");
});

// 4. Cerramos la bóveda
db.close();