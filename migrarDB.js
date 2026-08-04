// ==================================================== //
// ===== MIGRACIÓN DE LA BASE DE DATOS (una vez) ===== //
// ==================================================== //
// Agrega las columnas que el webhook de Mercado Pago
// necesita a la tabla 'ordenes'. Ejecutar: npm run migrar
// Es seguro volver a ejecutarlo (no rompe nada).

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./tienda.sqlite', (err) => {
    if (err) {
        console.error("No se pudo abrir la base de datos:", err.message);
        process.exit(1);
    }
});

const COLUMNAS_NUEVAS = [
    { nombre: 'estado', definicion: "TEXT DEFAULT 'pendiente'" },
    { nombre: 'mp_payment_id', definicion: 'TEXT' },
    { nombre: 'external_reference', definicion: 'TEXT' },
    { nombre: 'envio', definicion: 'REAL DEFAULT 0' }
];

db.all("PRAGMA table_info(ordenes)", (err, filas) => {
    if (err) {
        console.error("Error al leer el esquema de 'ordenes':", err.message);
        db.close();
        process.exit(1);
    }

    const existentes = new Set(filas.map(fila => fila.name));
    const pendientes = COLUMNAS_NUEVAS.filter(col => !existentes.has(col.nombre));

    if (pendientes.length === 0) {
        console.log("La tabla 'ordenes' ya está actualizada. Nada que hacer.");
        db.close();
        return;
    }

    let indice = 0;
    const aplicar = () => {
        if (indice >= pendientes.length) {
            console.log("Migración completada.");
            db.close();
            return;
        }
        const col = pendientes[indice++];
        db.run(`ALTER TABLE ordenes ADD COLUMN ${col.nombre} ${col.definicion}`, (e) => {
            if (e) console.error("Error al agregar '" + col.nombre + "':", e.message);
            else console.log("Columna '" + col.nombre + "' agregada a 'ordenes'.");
            aplicar();
        });
    };

    aplicar();
});
