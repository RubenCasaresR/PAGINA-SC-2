// index-loader.js

document.addEventListener('DOMContentLoaded', () => {
    // Iniciamos la conexión con la bodega en cuanto carga la página
    cargarVitrinaDesdeServidor();
});

// Escapa texto antes de inyectarlo en el HTML para evitar XSS.
function escaparHTML(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ======================================================= //
// ======= CONEXIÓN A LA BASE DE DATOS (EL FETCH) ======== //
// ======================================================= //
async function cargarVitrinaDesdeServidor() {
    try {
        // 1. Le pedimos los datos al servidor Node.js
        const respuesta = await fetch('/api/productos');
        if (!respuesta.ok) {
            throw new Error("El servidor respondió HTTP " + respuesta.status);
        }
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
        let priceDisplay = `$${producto.precio.toFixed(2)}`;
        if (esProximamente) {
            priceDisplay = `<span class="coming-soon-text">Lanzamiento Oficial</span>`;
        } else if (producto.oldPrice && producto.oldPrice > producto.precio) {
            priceDisplay = `<span class="old-price">$${producto.oldPrice.toFixed(2)}</span> $${producto.precio.toFixed(2)}`;
        }

        // 3b. Badge sobre la foto (siempre visible, también en móvil)
        let badgeHTML = '';
        if (esProximamente) {
            badgeHTML = '<span class="product-badge product-badge--proximamente">Próximamente</span>';
        } else if (producto.oldPrice && producto.oldPrice > producto.precio) {
            const descuento = Math.round((1 - producto.precio / producto.oldPrice) * 100);
            badgeHTML = `<span class="product-badge product-badge--descuento">-${descuento}%</span>`;
        } else if (producto.categoria === 'novedades-cat') {
            badgeHTML = '<span class="product-badge product-badge--nuevo">Nuevo</span>';
        }

        // 4. Link bloqueado si no hay stock
        const linkDestino = esProximamente ? '#' : `product.html?product=${escaparHTML(producto.id)}`;

        // 5. MAGIA PARA LAS DOS FOTOS (Principal y la que aparece al pasar el mouse)
        // Revisamos si el producto tiene la nueva lista de imágenes, si no, usamos la vieja
        const arrayFotos = producto.imagenes || [producto.imagen];
        const foto1 = arrayFotos[0] || 'logo SC sin fondo.png'; // Foto principal
        const foto2 = arrayFotos.length > 1 ? arrayFotos[1] : foto1; // Segunda foto (o repite la 1 si solo hay una)

        // 6. Clase de filtro según la categoría real del producto
        const categoriasValidas = ['novedades-cat', 'descuentos', 'must-have'];
        const claseFiltro = categoriasValidas.includes(producto.categoria) ? producto.categoria : 'novedades-cat';

        // Nombre y fotos escapados para que un dato malicioso no rompa el HTML
        const nombreSeguro = escaparHTML(producto.nombre);
        const foto1Segura = escaparHTML(foto1);
        const foto2Segura = escaparHTML(foto2);

        // Creamos la tarjeta HTML
        const cardHTML = `
            <a href="${linkDestino}" class="product-card-link ${esProximamente ? 'proximamente-link' : ''}">
                <div class="product-card filterDiv ${claseFiltro} ${esProximamente ? 'is-coming-soon' : ''}">
                    <div class="product-image-container">
                        ${badgeHTML}
                        <img src="${foto1Segura}" alt="${nombreSeguro}" class="main-img" loading="lazy">
                        <img src="${foto2Segura}" alt="${nombreSeguro}" class="hover-img" loading="lazy">
                        
                        ${esProximamente ? '<div class="coming-soon-overlay"><span>Próximamente</span></div>' : ''}
                    </div>
                    <div class="product-info">
                        <h3>${nombreSeguro}</h3>
                        <p class="price">${priceDisplay}</p>
                    </div>
                </div>
            </a>`;
        productGrid.innerHTML += cardHTML;
    });

    // Refresca el filtro activo para que las tarjetas nuevas sean visibles
    if (typeof filterSelection === 'function') {
        const activo = document.querySelector('.tabs .tab-button.active');
        const categoria = activo ? (activo.getAttribute('data-categoria') || 'all') : 'all';
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
                    linkElements[i].href = `product.html?product=${escaparHTML(product.id)}`;
                    imgElements[i].src = escaparHTML(product.imagen);
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
