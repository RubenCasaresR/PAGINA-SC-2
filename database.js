// database.js

const products = {
    'ronaldo-classic': {
        name: 'Playera Clásica Ronaldo',
        price: 499.00,
        oldPrice: null,
        category: 'novedades-cat',
        status: 'active', // <--- ESTA ESTÁ A LA VENTA
        description: 'Revive la magia de Cristiano Ronaldo en sus primeros días con esta playera de alta calidad, inspirada en momentos icónicos.',
        composition: '100% algodón peinado. Prelavado para minimizar el encogimiento. Lavar a máquina con agua fría.',
        images: [
            'Società Di Calcio (7).png',
            'Società Di Calcio (9).png',
            'Playera Pasto.JPG',
            'Playera Espalda Parado.JPG',
            'Leo Y Ruben parados espalda.JPG',
            'Edson frente playera.JPG',
            // Añade todas las fotos que quieras aquí abajo separadas por comas (asegúrate de tenerlas en tu carpeta):
            // 'foto-espalda-ronaldo.png',
            // 'foto-detalle-tela.png' 
        ],
        related: ['ronaldinho-messi', 'messi-retro', 'zidane-classic'],
        stock: { 'S': 5, 'M': 2, 'L': 15, 'XL': 0 } 
    },
    'ronaldinho-messi': {
        name: 'Playera Dinho & Messi',
        price: 499.00,
        oldPrice: 550.00,
        category: 'descuentos',
        status: 'coming_soon', // <--- BLOQUEADA
        description: 'Celebra el paso de la antorcha entre dos leyendas del Barça. Un diseño que captura la amistad y el talento de Ronaldinho y un joven Messi.',
        composition: '100% algodón premium. Impresión de alta durabilidad. No planchar sobre el estampado.',
        images: [
            '26.png',
            'Playera negra FRENTE.png'
        ],
        related: ['ronaldo-classic', 'messi-retro', 'zidane-classic'],
        stock: { 'S': 10, 'M': 12, 'L': 3, 'XL': 5 } 
    },
    'messi-retro': {
        name: 'Playera Messi Retro',
        price: 499.00,
        oldPrice: null,
        category: 'must-have',
        status: 'coming_soon', // <--- BLOQUEADA
        description: 'Un homenaje a los inicios de Lionel Messi, capturando su concentración y pasión juvenil. Perfecta para los verdaderos aficionados.',
        composition: 'Mezcla de algodón y poliéster para mayor comodidad y durabilidad. Corte atlético.',
        images: [
            '9.png',
            'Playera negra FRENTE.png'
        ],
        related: ['ronaldo-classic', 'ronaldinho-messi', 'zidane-classic'],
        stock: { 'S': 0, 'M': 0, 'L': 0, 'XL': 2 }
    },
    'zidane-classic': {
        name: 'Playera Zidane Classic',
        price: 499.00,
        oldPrice: null,
        category: 'novedades-cat',
        status: 'coming_soon', // <--- BLOQUEADA
        description: 'La elegancia y control de Zinedine Zidane capturada en un diseño icónico. Una pieza esencial para cualquier coleccionista.',
        composition: '100% algodón de alto gramaje. Corte clásico y cómodo.',
        images: [
            '23.png',
            'Playera negra FRENTE.png'
        ],
        related: ['ronaldo-classic', 'ronaldinho-messi', 'messi-retro'],
        stock: { 'S': 20, 'M': 15, 'L': 10, 'XL': 8 } 
    }
};