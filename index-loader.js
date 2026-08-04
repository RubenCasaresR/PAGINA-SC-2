// index-loader.js

document.addEventListener('DOMContentLoaded', () => {
    // Iniciamos la conexión con la bodega en cuanto carga la página
    cargarVitrinaDesdeServidor();
});

// ======================================================= //
// ======= CONEXIÓN A LA BASE DE DATOS (EL FETCH) ======== //
// ======================================================= //
async function cargarVitrinaDesdeServidor() {
    try {
        // 1. Le pedimos los datos al servidor Node.js
        const respuesta = await fetch('/api/productos');
        const productosBackend = await respuesta.json();
        
        console.log("📦 Inventario recibido del servidor:", productosBackend);

        // 2. Dibujamos la cuadrícula de productos
        renderizarCuadricula(productosBackend);

        // 3. Activamos el carrusel
        activarCarrusel(productosBackend);

    } catch (error) {
        console.error("🚨 Error al conectar con la base de datos:", error);
    }
}

// ======================================================= //
// ======= DIBUJAR LAS TARJETAS EN LA PÁGINA ============= //
// ======================================================= //
function renderizarCuadricula(productos) {
    const productGrid = document.querySelector('#colecciones .product-grid');
    if (!productGrid) return;

    productGrid.innerHTML = ''; // Limpiamos lo que haya

    productos.forEach(producto => {
        // 1. Calculamos si hay inventario en la bodega
        let totalStock = 0;
        if (producto.stock) {
            totalStock = Object.values(producto.stock).reduce((a, b) => a + b, 0);
        }
        
        // 2. Si el stock es 0, activamos el modo "Próximamente"
        const esProximamente = (totalStock === 0 || producto.status === 'coming_soon');

        // 3. Formateamos el precio
        const priceDisplay = esProximamente ? `<span class="coming-soon-text">Lanzamiento Oficial</span>` : `$${producto.precio.toFixed(2)}`;

        // 4. Link bloqueado si no hay stock
        const linkDestino = esProximamente ? 'javascript:void(0)' : `product.html?product=${producto.id}`;

        // 5. MAGIA PARA LAS DOS FOTOS (Principal y la que aparece al pasar el mouse)
        // Revisamos si el producto tiene la nueva lista de imágenes, si no, usamos la vieja
        const arrayFotos = producto.imagenes || [producto.imagen];
        const foto1 = arrayFotos[0] || 'logo SC sin fondo.png'; // Foto principal
        const foto2 = arrayFotos.length > 1 ? arrayFotos[1] : foto1; // Segunda foto (o repite la 1 si solo hay una)

        // 6. Clase de filtro según la categoría real del producto
        const categoriasValidas = ['novedades-cat', 'descuentos', 'must-have'];
        const claseFiltro = categoriasValidas.includes(producto.categoria) ? producto.categoria : 'novedades-cat';

        // Creamos la tarjeta HTML
        const cardHTML = `
            <a href="${linkDestino}" class="product-card-link ${esProximamente ? 'proximamente-link' : ''}">
                <div class="product-card filterDiv ${claseFiltro} ${esProximamente ? 'is-coming-soon' : ''}">
                    <div class="product-image-container">
                        <img src="${foto1}" alt="${producto.nombre}" class="main-img" loading="lazy">
                        <img src="${foto2}" alt="${producto.nombre}" class="hover-img" loading="lazy">
                        
                        ${esProximamente ? '<div class="coming-soon-overlay"><span>Próximamente</span></div>' : ''}
                    </div>
                    <div class="product-info">
                        <h3>${producto.nombre}</h3>
                        <p class="price">${priceDisplay}</p>
                    </div>
                </div>
            </a>`;
        productGrid.innerHTML += cardHTML;
    });

    // Refresca el filtro activo para que las tarjetas nuevas sean visibles
    if (typeof filterSelection === 'function') {
        const activo = document.querySelector('.tabs .tab-button.active');
        const categoria = activo ? activo.getAttribute('onclick').match(/'([^']+)'/)[1] : 'all';
        filterSelection(categoria);
    }
}

// ======================================================= //
// ======= LÓGICA DEL CARRUSEL DINÁMICO ================== //
// ======================================================= //
function activarCarrusel(productos) {
    if (!document.querySelector('.hero-images') || productos.length === 0) return;

    // Para el carrusel usamos los productos que llegaron del servidor
    const featuredProducts = productos; 

    // Solo activamos si hay al menos 1 producto (repetimos la foto si hay menos de 3 para que no se rompa)
    const linkElements = [
        document.getElementById('hero-link-1'),
        document.getElementById('hero-link-2'),
        document.getElementById('hero-link-3')
    ];
    const imgElements = [
        document.getElementById('hero-img-1'),
        document.getElementById('hero-img-2'),
        document.getElementById('hero-img-3')
    ];

    let currentIndex = 0;

    function changeImages() {
        imgElements.forEach(img => {
            img.style.opacity = '0';
            img.classList.remove("img-destacada");
        });
        
        setTimeout(() => {
            for (let i = 0; i < linkElements.length; i++) {
                const productIndex = (currentIndex + i) % featuredProducts.length;
                const product = featuredProducts[productIndex];
                
                if(linkElements[i] && imgElements[i]) {
                    linkElements[i].href = `product.html?product=${product.id}`;
                    imgElements[i].src = product.imagen;
                }
            }
            if(imgElements[1]) imgElements[1].classList.add("img-destacada");
            imgElements.forEach(img => { if(img) img.style.opacity = '1' });
            currentIndex = (currentIndex + 1) % featuredProducts.length;
        }, 800);
    }
    
    changeImages();
    setInterval(changeImages, 4000);
}
