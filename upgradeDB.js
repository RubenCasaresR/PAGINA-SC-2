const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tienda.sqlite');

db.serialize(() => {
    // 1. Borramos la tabla sencilla para crear la profesional
    db.run("DROP TABLE IF EXISTS productos");

    // 2. Creamos la tabla con todas las columnas necesarias
    db.run(`CREATE TABLE productos (
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
    )`);

    // 3. Insertamos todo tu catálogo real
    const stmt = db.prepare("INSERT INTO productos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    // Playera Ronaldo
    stmt.run(
        'ronaldo-classic', 'Playera Clásica Ronaldo', 499.00, null, 'novedades-cat', 'active',
        'Revive la magia de Cristiano Ronaldo en sus primeros días con esta playera de alta calidad.', 
        '100% algodón peinado. Prelavado para minimizar el encogimiento.',
        JSON.stringify(['Società Di Calcio (7).png', 'Società Di Calcio (9).png', 'Playera Pasto.JPG', 'Playera Espalda Parado.JPG', 'Leo Y Ruben parados espalda.JPG', 'Edson frente playera.JPG']),
        JSON.stringify(['ronaldinho-messi', 'messi-retro', 'zidane-classic']),
        JSON.stringify({ 'S': 5, 'M': 2, 'L': 15, 'XL': 0 })
    );

    // Playera Ronaldinho & Messi
    stmt.run(
        'ronaldinho-messi', 'Playera Dinho & Messi', 499.00, 550.00, 'descuentos', 'coming_soon',
        'Celebra el paso de la antorcha entre dos leyendas del Barça.', 
        '100% algodón premium. Impresión de alta durabilidad.',
        JSON.stringify(['26.png', 'Playera negra FRENTE.png']),
        JSON.stringify(['ronaldo-classic', 'messi-retro', 'zidane-classic']),
        JSON.stringify({ 'S': 10, 'M': 12, 'L': 3, 'XL': 5 })
    );

    // Playera Messi Retro
    stmt.run(
        'messi-retro', 'Playera Messi Retro', 499.00, null, 'must-have', 'coming_soon',
        'Un homenaje a los inicios de Lionel Messi, capturando su concentración y pasión juvenil.', 
        'Mezcla de algodón y poliéster para mayor comodidad.',
        JSON.stringify(['9.png', 'Playera negra FRENTE.png']),
        JSON.stringify(['ronaldo-classic', 'ronaldinho-messi', 'zidane-classic']),
        JSON.stringify({ 'S': 0, 'M': 0, 'L': 0, 'XL': 2 })
    );

    // Playera Zidane
    stmt.run(
        'zidane-classic', 'Playera Zidane Classic', 499.00, null, 'novedades-cat', 'coming_soon',
        'La elegancia y control de Zinedine Zidane capturada en un diseño icónico.', 
        '100% algodón de alto gramaje. Corte clásico y cómodo.',
        JSON.stringify(['23.png', 'Playera negra FRENTE.png']),
        JSON.stringify(['ronaldo-classic', 'ronaldinho-messi', 'messi-retro']),
        JSON.stringify({ 'S': 20, 'M': 15, 'L': 10, 'XL': 8 })
    );

    stmt.finalize();
    console.log("🚀 Base de datos actualizada con toda la información detallada (galerías y tallas).");
});

db.close();