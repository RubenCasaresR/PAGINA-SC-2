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
        // Formateamos el precio
        const priceDisplay = `$${producto.precio.toFixed(2)}`;

        // Creamos la tarjeta HTML (Nota cómo usamos producto.nombre, producto.precio, etc.)
        const cardHTML = `
            <a href="product.html?product=${producto.id}" class="product-card-link">
                <div class="product-card filterDiv novedades-cat">
                    <div class="product-image-container">
                        <img src="${producto.imagen}" alt="${producto.nombre}" class="main-img">
                        <img src="${producto.imagen}" alt="${producto.nombre}" class="hover-img">
                    </div>
                    <div class="product-info">
                        <h3>${producto.nombre}</h3>
                        <p class="price">${priceDisplay}</p>
                    </div>
                </div>
            </a>`;
        productGrid.innerHTML += cardHTML;
    });
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