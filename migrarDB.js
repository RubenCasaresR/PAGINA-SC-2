// ==================================================== //
// ===== MIGRACIÓN DE LA BASE DE DATOS (una vez) ===== //
// ==================================================== //
// Crea las tablas base y agrega las columnas que el
// webhook de Mercado Pago necesita a la tabla 'ordenes'.
// Ejecutar: npm run migrar
// Es seguro volver a ejecutarlo (no rompe nada).
//
// NOTA: server.js ya ejecuta esta misma lógica al arrancar
// (asegurarEsquema), así que este script es opcional.

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./tienda.sqlite', (err) => {
    if (err) {
        console.error("No se pudo abrir la base de datos:", err.message);
        process.exit(1);
    }
});

const TABLAS_BASE = [
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

const COLUMNAS_NUEVAS = [
    { nombre: 'estado', definicion: "TEXT DEFAULT 'pendiente'" },
    { nombre: 'mp_payment_id', definicion: 'TEXT' },
    { nombre: 'external_reference', definicion: 'TEXT' },
    { nombre: 'envio', definicion: 'REAL DEFAULT 0' }
];

function migrarColumnas() {
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
}

let indiceTablas = 0;
const crearSiguiente = () => {
    if (indiceTablas >= TABLAS_BASE.length) {
        console.log("Tablas base listas.");
        return migrarColumnas();
    }
    db.run(TABLAS_BASE[indiceTablas++], (e) => {
        if (e) {
            console.error("Error al crear una tabla:", e.message);
            db.close();
            process.exit(1);
        }
        crearSiguiente();
    });
};

crearSiguiente();
