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
        // 2. A PARTIR DE AQUÍ ES TU CÓDIGO VISUAL INTACTO         //
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
        document.getElementById('main-product-image').src = product.images[0];
        document.title = `${product.name} - Societa Di Calcio`;

        // Galería de miniaturas
        const thumbnailContainer = document.querySelector('.thumbnail-container');
        product.images.forEach((imgSrc, index) => {
            const thumb = document.createElement('img');
            thumb.src = imgSrc;
            thumb.classList.add('thumbnail');
            if (index === 0) thumb.classList.add('active');
            thumb.addEventListener('click', () => {
                document.getElementById('main-product-image').src = imgSrc;
                document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
            thumbnailContainer.appendChild(thumb);
        });
        
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
                    const stockAvailable = product.stock[selectedSize];

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
                    
                    // Asegúrate de que la función addToCart global esté disponible
                    addToCart(productId, product.name, product.price, product.images[0], quantity, selectedSize);
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

                    const card = `
                        <a href="product.html?product=${relatedId}" class="product-card-link">
                            <div class="product-card">
                                <div class="product-image-container">
                                    <img src="${relatedProduct.images[0]}" alt="${relatedProduct.name}" class="main-img">
                                    <img src="${relatedProduct.images.length > 1 ? relatedProduct.images[1] : relatedProduct.images[0]}" alt="${relatedProduct.name}" class="hover-img">
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

        // LÓGICA DE ZOOM MANUAL
        const zoomContainer = document.querySelector('.main-image-container');
        const mainImage = document.getElementById('main-product-image');

        if (zoomContainer && mainImage) {
            let isZoomed = false;
            const panImage = (e) => {
                if (!isZoomed) return; 
                const rect = zoomContainer.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                mainImage.style.transformOrigin = `${x}% ${y}%`;
            };

            zoomContainer.addEventListener('click', (e) => {
                isZoomed = !isZoomed;
                if (isZoomed) {
                    mainImage.style.transform = 'scale(2)';
                    mainImage.style.cursor = 'zoom-out';
                    panImage(e); 
                } else {
                    mainImage.style.transform = 'scale(1)';
                    mainImage.style.transformOrigin = 'center center';
                    mainImage.style.cursor = 'zoom-in';
                }
            });

            zoomContainer.addEventListener('mousemove', panImage);

            zoomContainer.addEventListener('mouseleave', () => {
                isZoomed = false;
                mainImage.style.transform = 'scale(1)';
                mainImage.style.transformOrigin = 'center center';
                mainImage.style.cursor = 'zoom-in';
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
