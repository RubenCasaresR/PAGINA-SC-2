const sqlite3 = require('sqlite3').verbose();

// 1. Abrimos la bóveda
const db = new sqlite3.Database('./tienda.sqlite');

db.serialize(() => {
    // 2. Ejecutamos tu consulta SQL UPDATE
    const sql = "UPDATE productos SET imagen = 'Società Di Calcio (7).png' WHERE id = 'ronaldo-classic'";
    
    db.run(sql, function(err) {
        if (err) {
            console.error("Hubo un error:", err.message);
        } else {
            console.log(`✅ Foto de Ronaldo actualizada. Filas modificadas: ${this.changes}`);
        }
    });
});

// 3. Cerramos la bóveda
db.close();