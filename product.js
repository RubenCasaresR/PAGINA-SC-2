// product.js

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('product');

    if (!productId) {
        mostrarError();
        return;
    }

    try {
        // ======================================================= //
        // 1. CONEXIÓN AL SERVIDOR (EL PROBADOR)                   //
        // ======================================================= //
        const respuesta = await fetch(`/api/productos/${productId}`);
        const productoBD = await respuesta.json();

        if (productoBD.error) {
            mostrarError();
            return;
        }

        // Traducimos las columnas de SQL a las variables que tu diseño ya usa
        const product = {
            id: productoBD.id,
            name: productoBD.nombre,
            price: productoBD.precio,
            oldPrice: productoBD.oldPrice,
            category: productoBD.categoria,
            status: productoBD.status,
            description: productoBD.descripcion,
            composition: productoBD.composicion,
            images: productoBD.imagenes,
            related: productoBD.related,
            stock: productoBD.stock
        };

        // Descargamos el catálogo para la sección de "Productos Relacionados"
        const resRelacionados = await fetch('/api/productos');
        const catalogoCompleto = await resRelacionados.json();
        const products = {}; 
        catalogoCompleto.forEach(p => {
            products[p.id] = { ...p, name: p.nombre, price: p.precio, images: p.imagenes };
        });

        // ======================================================= //
        // 2. LÓGICA VISUAL Y MULTIMEDIA (FOTOS Y VIDEOS)          //
        // ======================================================= //
        
        // Llenar la información básica
        document.getElementById('product-name').innerText = product.name;
        
        let priceDisplay = `$${product.price.toFixed(2)}`;
        if (product.oldPrice) {
            priceDisplay = `<span class="old-price">$${product.oldPrice.toFixed(2)}</span> $${product.price.toFixed(2)}`;
        }
        
        if (product.status === 'coming_soon') {
            priceDisplay = ''; 
        }
        document.getElementById('product-price').innerHTML = priceDisplay;
        
        document.getElementById('product-description').innerText = product.description;
        document.getElementById('product-composition').innerText = product.composition;
        document.title = `${product.name} - Societa Di Calcio`;

        // Lógica de Galería (Fotos y Videos)
        const mainImageContainer = document.querySelector('.main-image-container');
        const thumbnailContainer = document.querySelector('.thumbnail-container');
        thumbnailContainer.innerHTML = ''; // Limpiar por si acaso

        // Función para cambiar la imagen/video principal
        const actualizarMedioPrincipal = (src) => {
            mainImageContainer.innerHTML = ''; // Limpiar el contenedor principal
            const esVideo = src.toLowerCase().endsWith('.mp4');

            if (esVideo) {
                const videoEl = document.createElement('video');
                videoEl.src = src;
                videoEl.id = 'main-product-image';
                videoEl.autoplay = true;
                videoEl.loop = true;
                videoEl.muted = true;
                videoEl.playsInline = true;
                videoEl.style.width = '100%';
                videoEl.style.height = 'auto';
                videoEl.style.objectFit = 'cover';
                mainImageContainer.appendChild(videoEl);
            } else {
                const imgEl = document.createElement('img');
                imgEl.src = src;
                imgEl.id = 'main-product-image';
                imgEl.alt = product.name;
                imgEl.style.width = '100%';
                imgEl.style.height = 'auto';
                imgEl.style.objectFit = 'cover';
                imgEl.style.transition = 'transform 0.2s ease-out';
                mainImageContainer.appendChild(imgEl);
            }
        };

        // Pintar el primer elemento al cargar la página
        if (product.images && product.images.length > 0) {
            actualizarMedioPrincipal(product.images[0]);
        }

        // Crear las miniaturas (Thumbnails)
        if (product.images) {
            product.images.forEach((mediaSrc, index) => {
                const esVideo = mediaSrc.toLowerCase().endsWith('.mp4');
                let thumb;

                if (esVideo) {
                    thumb = document.createElement('video');
                    thumb.src = mediaSrc;
                    thumb.muted = true; // El thumbnail de video debe estar mudo
                } else {
                    thumb = document.createElement('img');
                    thumb.src = mediaSrc;
                }

                thumb.classList.add('thumbnail');
                if (index === 0) thumb.classList.add('active');

                thumb.addEventListener('click', () => {
                    actualizarMedioPrincipal(mediaSrc);
                    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });

                thumbnailContainer.appendChild(thumb);
            });
        }

        // ======================================================= //
        // 3. LÓGICA DE CARRITO, TALLAS Y ZOOM                     //
        // ======================================================= //

        // REFERENCIAS A LOS BOTONES
        const tallasBtns = document.querySelectorAll('.tallas button');
        const urgencyMsg = document.getElementById('urgency-message');
        const addToCartButton = document.querySelector('.btn-comprar');
        const selectorTallasDiv = document.querySelector('.selector-tallas');
        const selectorCantidadDiv = document.querySelector('.selector-cantidad');

        // LÓGICA DE BLOQUEO "PRÓXIMAMENTE"
        if (product.status === 'coming_soon') {
            if(selectorTallasDiv) selectorTallasDiv.style.display = 'none';
            if(selectorCantidadDiv) selectorCantidadDiv.style.display = 'none';
            if(urgencyMsg) urgencyMsg.style.display = 'none';

            if (addToCartButton) {
                addToCartButton.disabled = true;
                addToCartButton.innerText = "PRÓXIMAMENTE";
                addToCartButton.style.backgroundColor = "#e0e0e0";
                addToCartButton.style.color = "#888";
                addToCartButton.style.cursor = "not-allowed";
                addToCartButton.style.border = "none";
            }
        } else {
            // Selección de talla y Lógica de Escasez
            tallasBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    tallasBtns.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');

                    const selectedSize = btn.innerText;
                    // Proteger por si la talla no existe en el registro
                    const stockAvailable = product.stock[selectedSize] || 0; 

                    if (urgencyMsg && addToCartButton) {
                        urgencyMsg.classList.remove('hidden');

                        if (stockAvailable === 0) {
                            urgencyMsg.innerHTML = '<i class="fas fa-times-circle"></i> Agotado en esta talla';
                            urgencyMsg.style.color = "#d9534f"; 
                            addToCartButton.disabled = true;
                            addToCartButton.innerText = "Agotado";
                            addToCartButton.style.opacity = "0.5";
                            addToCartButton.style.cursor = "not-allowed";
                        } else if (stockAvailable <= 3) {
                            urgencyMsg.innerHTML = `<i class="fas fa-fire"></i> ¡Date prisa! Solo quedan ${stockAvailable} piezas`;
                            urgencyMsg.style.color = "#ff8c00"; 
                            addToCartButton.disabled = false;
                            addToCartButton.innerText = "Añadir al Carrito";
                            addToCartButton.style.opacity = "1";
                            addToCartButton.style.cursor = "pointer";
                        } else {
                            urgencyMsg.innerHTML = '<i class="fas fa-check-circle"></i> En stock';
                            urgencyMsg.style.color = "#28a745"; 
                            addToCartButton.disabled = false;
                            addToCartButton.innerText = "Añadir al Carrito";
                            addToCartButton.style.opacity = "1";
                            addToCartButton.style.cursor = "pointer";
                        }
                    }
                });
            });

            // Selector de cantidad
            const decreaseBtn = document.getElementById('decrease-quantity');
            const increaseBtn = document.getElementById('increase-quantity');
            const quantityValue = document.getElementById('quantity-value');

            if (decreaseBtn && increaseBtn && quantityValue) {
                decreaseBtn.addEventListener('click', () => {
                    let currentQuantity = parseInt(quantityValue.innerText);
                    if (currentQuantity > 1) { 
                        quantityValue.innerText = currentQuantity - 1;
                    }
                });
                increaseBtn.addEventListener('click', () => {
                    let currentQuantity = parseInt(quantityValue.innerText);
                    quantityValue.innerText = currentQuantity + 1;
                });
            }

            // Botón Añadir al Carrito
            if (addToCartButton) {
                addToCartButton.addEventListener('click', () => {
                    if(addToCartButton.disabled) return; 

                    const selectedSizeBtn = document.querySelector('.tallas button.selected');
                    if (!selectedSizeBtn) {
                        alert("Por favor, selecciona una talla antes de añadir al carrito.");
                        return; 
                    }
                    const selectedSize = selectedSizeBtn.innerText;
                    const quantity = parseInt(quantityValue.innerText);
                    
                    // Al carrito siempre mandamos la foto 1, aunque sea video para que no se rompa la vista del cajero
                    const imagenCarrito = product.images[0].toLowerCase().endsWith('.mp4') && product.images.length > 1 ? product.images[1] : product.images[0];

                    addToCart(productId, product.name, product.price, imagenCarrito, quantity, selectedSize);
                });
            }
        } 

        // Cargar Productos Relacionados
        const relatedContainer = document.querySelector('#related-products .product-grid');
        if (relatedContainer && product.related) {
            product.related.forEach(relatedId => {
                const relatedProduct = products[relatedId];
                if(relatedProduct){
                    let relatedPriceDisplay = `$${relatedProduct.price.toFixed(2)}`;
                    if (relatedProduct.oldPrice) {
                        relatedPriceDisplay = `<span class="old-price">$${relatedProduct.oldPrice.toFixed(2)}</span> $${relatedProduct.price.toFixed(2)}`;
                    }
                    
                    if(relatedProduct.status === 'coming_soon') {
                        relatedPriceDisplay = `<span style="color: #ff8c00; font-weight: 700; font-size: 0.9rem; text-transform: uppercase;">Próximamente</span>`;
                    }

                    // Prevenir que un video rompa los productos relacionados
                    const imgPrincipal = relatedProduct.images[0].toLowerCase().endsWith('.mp4') ? 'logo SC sin fondo.png' : relatedProduct.images[0];
                    const imgHover = relatedProduct.images.length > 1 && !relatedProduct.images[1].toLowerCase().endsWith('.mp4') ? relatedProduct.images[1] : imgPrincipal;

                    const card = `
                        <a href="product.html?product=${relatedId}" class="product-card-link">
                            <div class="product-card">
                                <div class="product-image-container">
                                    <img src="${imgPrincipal}" alt="${relatedProduct.name}" class="main-img" loading="lazy">
                                    <img src="${imgHover}" alt="${relatedProduct.name}" class="hover-img" loading="lazy">
                                </div>
                                <div class="product-info">
                                    <h3>${relatedProduct.name}</h3>
                                    <p class="price">${relatedPriceDisplay}</p>
                                </div>
                            </div>
                        </a>`;
                    relatedContainer.innerHTML += card;
                }
            });
        }

        // LÓGICA DE ZOOM MANUAL (Modificada para ignorar videos)
        const zoomContainer = document.querySelector('.main-image-container');

        if (zoomContainer) {
            let isZoomed = false;

            const panImage = (e, mainMedia) => {
                if (!isZoomed || mainMedia.tagName !== 'IMG') return; 
                const rect = zoomContainer.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                mainMedia.style.transformOrigin = `${x}% ${y}%`;
            };

            zoomContainer.addEventListener('click', (e) => {
                const mainMedia = document.getElementById('main-product-image');
                if (!mainMedia || mainMedia.tagName !== 'IMG') return; // Si es video, cancelamos el zoom

                isZoomed = !isZoomed;
                if (isZoomed) {
                    mainMedia.style.transform = 'scale(2)';
                    mainMedia.style.cursor = 'zoom-out';
                    panImage(e, mainMedia); 
                } else {
                    mainMedia.style.transform = 'scale(1)';
                    mainMedia.style.transformOrigin = 'center center';
                    mainMedia.style.cursor = 'zoom-in';
                }
            });

            zoomContainer.addEventListener('mousemove', (e) => {
                const mainMedia = document.getElementById('main-product-image');
                if (mainMedia) panImage(e, mainMedia);
            });

            zoomContainer.addEventListener('mouseleave', () => {
                const mainMedia = document.getElementById('main-product-image');
                if (!mainMedia || mainMedia.tagName !== 'IMG') return;
                
                isZoomed = false;
                mainMedia.style.transform = 'scale(1)';
                mainMedia.style.transformOrigin = 'center center';
                mainMedia.style.cursor = 'zoom-in';
            });
        }

    } catch (error) {
        console.error("🚨 Error cargando el producto:", error);
        mostrarError();
    }

    // Panel Desplegable de Guía de Tallas
    const guiaTallasBtn = document.getElementById('guia-tallas-btn');
    const guiaTallasPanel = document.getElementById('guia-tallas-panel');
    const closePanelBtn = document.querySelector('.close-panel-btn');

    if (guiaTallasBtn && guiaTallasPanel) {
        guiaTallasBtn.addEventListener('click', () => {
            guiaTallasPanel.classList.toggle('visible');
        });
    }

    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', () => {
            guiaTallasPanel.classList.remove('visible');
        });
    }
});

function mostrarError() {
    const mainContent = document.querySelector('.product-page-main');
    if (mainContent) {
        mainContent.innerHTML = '<h1 style="text-align:center; padding: 50px;">Producto no encontrado</h1>';
    }
}
