// Datos iniciales de la tienda. Se siembran en la BD solo cuando la tabla
// 'productos' está vacía (primer arranque en un despliegue nuevo).
// Mismo formato que usa server.js: imagenes/related se guardan como JSON de
// arreglo y stock como JSON de objeto.
module.exports = [
    {
        id: 'messi-retro',
        nombre: 'Playera Messi Retro',
        precio: 499,
        oldPrice: null,
        categoria: 'must-have',
        status: 'coming_soon',
        descripcion: 'Un homenaje a los inicios de Lionel Messi, capturando su concentración y pasión juvenil.',
        composicion: 'Mezcla de algodón y poliéster para mayor comodidad.',
        imagenes: ['9.png', 'Playera negra FRENTE.png'],
        related: ['ronaldo-classic', 'ronaldinho-messi', 'zidane-classic'],
        stock: { S: 0, M: 0, L: 0, XL: 0 }
    },
    {
        id: 'playera-ronaldo-black',
        nombre: 'Playera Clásica Ronaldo (Edición Black)',
        precio: 549,
        oldPrice: null,
        categoria: 'novedades-cat',
        status: 'active',
        descripcion: 'La elegancia del negro se une a la pasión de la edición clásica.\nRevive la magia de Cristiano Ronaldo en sus primeros días con esta playera de alta calidad.\n',
        composicion: '100% algodón premium.',
        imagenes: ['playera-ronaldo-negra.png', 'Playera negra FRENTE.png', 'laverkusen-frente-negro.JPG', 'black-subiendo-escaleras.jpg', 'black-espaldas-barandal.jpg', 'cr7-festejo.mp4'],
        related: [],
        stock: { XS: 2, S: 6, M: 11, L: 4, XL: 2 }
    },
    {
        id: 'ronaldinho-messi',
        nombre: 'Playera Dinho & Messi',
        precio: 499,
        oldPrice: 550,
        categoria: 'descuentos',
        status: 'coming_soon',
        descripcion: 'Celebra el paso de la antorcha entre dos leyendas del Barça.',
        composicion: '100% algodón premium. Impresión de alta durabilidad.',
        imagenes: ['26.png', 'Playera negra FRENTE.png'],
        related: ['ronaldo-classic', 'messi-retro', 'zidane-classic'],
        stock: { S: 0, M: 0, L: 0, XL: 0 }
    },
    {
        id: 'ronaldo-classic',
        nombre: 'Playera Clásica Ronaldo',
        precio: 499,
        oldPrice: null,
        categoria: 'novedades-cat',
        status: 'active',
        descripcion: 'Revive la magia de Cristiano Ronaldo en sus primeros días con esta playera de alta calidad.',
        composicion: '100% algodón peinado. Prelavado para minimizar el encogimiento.',
        imagenes: ['Società Di Calcio (7).png', 'Società Di Calcio (9).png', 'Playera Pasto.JPG', 'Playera Espalda Parado.JPG', 'Leo Y Ruben parados espalda.JPG', 'Edson frente playera.JPG', 'cr7-festejo.mp4'],
        related: ['ronaldinho-messi', 'messi-retro', 'zidane-classic'],
        stock: { XS: 1, S: 6, M: 11, L: 4, XL: 2 }
    },
    {
        id: 'zidane-classic',
        nombre: 'Playera Zidane Classic',
        precio: 499,
        oldPrice: null,
        categoria: 'novedades-cat',
        status: 'coming_soon',
        descripcion: 'La elegancia y control de Zinedine Zidane capturada en un diseño icónico.',
        composicion: '100% algodón de alto gramaje. Corte clásico y cómodo.',
        imagenes: ['23.png', 'Playera negra FRENTE.png'],
        related: ['ronaldo-classic', 'ronaldinho-messi', 'messi-retro'],
        stock: { S: 0, M: 0, L: 0, XL: 0 }
    }
];
