// optimizar-imagenes.js
// Optimiza las imágenes del sitio (redimensiona + re-comprime) manteniendo
// los mismos nombres de archivo para que ninguna referencia cambie.
// Ejecutar una sola vez en local:  npm run imagenes
// Los originales se respaldan en _origen-imagenes/ (ignorado por git).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const BACKUP_DIR = path.join(DIR, '_origen-imagenes');
const EXT_RE = /\.(jpe?g|png)$/i;

// Ancho máximo según el uso de cada imagen en la página.
const POR_USO = {
    'playera-horizontal-societa-portugal.JPG': 1600, // banner LCP
    'esquina-de-porteria.JPG': 1000,                 // lookbook
    'tipografia-societa-playera.JPG': 1000,          // lookbook
    'Playera Espalda Agachado.JPG': 1000,            // lookbook + collage
    'Bolsas SC.JPG': 1000,                           // lookbook
    '23.png': 700,                                   // carrusel hero
    '24.png': 700,                                   // carrusel hero
    '42.png': 700,                                   // carrusel hero
    '9.png': 1000,                                   // collage + galería
    'Società Di Calcio (7).png': 1000,               // collage + galería
    'playera-ronaldo-negra.png': 1000,               // collage + galería
    'Playera Pasto.JPG': 1000,                       // collage + galería
    'laverkusen-frente-negro.JPG': 1000,             // collage + galería
    'black-subiendo-escaleras.jpg': 1000,            // collage + galería
    'logo SC sin fondo.png': 300,                    // nav (40px de alto)
    'LOGO.png': 400,                                 // sección nosotros
    'Logo Societa.png': 300,
    'logo-fondo-beige.png': 1200,                    // imagen Open Graph
    'logo-fondo-verde.png': 512,                     // favicon
};
const ANCHO_DEFECTO = 1000; // galerías de producto y resto

async function optimizarTodo() {
    const archivos = fs.readdirSync(DIR).filter((f) => EXT_RE.test(f));
    if (archivos.length === 0) {
        console.log('No hay imágenes que optimizar.');
        return;
    }

    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        for (const f of archivos) {
            fs.copyFileSync(path.join(DIR, f), path.join(BACKUP_DIR, f));
        }
        console.log(`📦 Originales respaldados en _origen-imagenes/ (${archivos.length}).`);
    } else {
        console.log('📦 El respaldo ya existe, no se sobrescribe.');
    }

    let totalAntes = 0;
    let totalDespues = 0;
    const reporte = [];

    for (const f of archivos) {
        const ruta = path.join(DIR, f);
        const ancho = POR_USO[f] || ANCHO_DEFECTO;
        const antes = fs.statSync(ruta).size;
        totalAntes += antes;

        try {
            let pipeline = sharp(ruta).rotate().resize({ width: ancho, withoutEnlargement: true });
            if (/\.jpe?g$/i.test(f)) {
                pipeline = pipeline.jpeg({ quality: 78, mozjpeg: true, progressive: true });
            } else {
                pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 });
            }
            const tmp = ruta + '.tmp';
            await pipeline.toFile(tmp);
            fs.renameSync(tmp, ruta);

            const despues = fs.statSync(ruta).size;
            totalDespues += despues;
            reporte.push({ f, antes, despues });
        } catch (e) {
            console.error(`✖ ${f}: ${e.message}`);
        }
    }

    reporte.sort((a, b) => b.antes - a.antes);
    for (const r of reporte) {
        const pct = (1 - r.despues / r.antes) * 100;
        console.log(
            `✔ ${r.f.padEnd(42)} ${(r.antes / 1024).toFixed(0).padStart(5)} KB → ${(r.despues / 1024).toFixed(0).padStart(4)} KB  (-${pct.toFixed(0)}%)`
        );
    }
    console.log(
        `\nTOTAL: ${(totalAntes / 1024 / 1024).toFixed(2)} MB → ${(totalDespues / 1024 / 1024).toFixed(2)} MB  (-${(100 - (totalDespues / totalAntes) * 100).toFixed(0)}%)`
    );
}

optimizarTodo();
