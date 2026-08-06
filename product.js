// Escapa texto antes de inyectarlo en el HTML para evitar XSS.
function escaparHTML(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
        if (!respuesta.ok) {
            mostrarError();
            return;
        }
        const productoBD = await respuesta.json();

        if (productoBD.error) {
            mostrarError();
            return;
        }

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

        const resRelacionados = await fetch('/api/productos');
        const catalogoCompleto = await resRelacionados.json();
        const products = {}; 
        catalogoCompleto.forEach(p => {
            products[p.id] = { ...p, name: p.nombre, price: p.precio, images: p.imagenes };
        });

        // ======================================================= //
        // 2. LÓGICA VISUAL Y TEXTOS                               //
        // ======================================================= //
        
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

        // ======================================================= //
        // 3. GALERÍA EDITORIAL LADO IZQUIERDO                     //
        // ======================================================= //
        const galleryContainer = document.getElementById('editorial-gallery-container');
        galleryContainer.innerHTML = ''; 

        if (product.images && product.images.length > 0) {
            const primerImagen = product.images.find(media => !/\.mp4$/i.test(media)) || 'logo SC sin fondo.png';

            product.images.forEach(mediaSrc => {
                const esVideo = mediaSrc.toLowerCase().endsWith('.mp4');
                let elementoMultimedia;

                if (esVideo) {
                    elementoMultimedia = document.createElement('video');
                    elementoMultimedia.src = mediaSrc;
                    elementoMultimedia.poster = primerImagen;
                    elementoMultimedia.preload = 'metadata';
                    elementoMultimedia.loop = true;
                    elementoMultimedia.muted = true;
                    elementoMultimedia.playsInline = true;
                    // Solo se reproduce cuando es visible; pausa al salir de pantalla.
                    if ('IntersectionObserver' in window) {
                        new IntersectionObserver(([entrada]) => {
                            if (entrada.isIntersecting) {
                                elementoMultimedia.play().catch(() => {});
                            } else {
                                elementoMultimedia.pause();
                            }
                        }, { threshold: 0.4 }).observe(elementoMultimedia);
                    }
                } else {
                    elementoMultimedia = document.createElement('img');
                    elementoMultimedia.src = mediaSrc;
                    elementoMultimedia.alt = product.name;
                    elementoMultimedia.loading = "lazy"; 
                }
                galleryContainer.appendChild(elementoMultimedia);
            });
        }

        // ======================================================= //
        // 4. LÓGICA DE CARRITO Y TALLAS                           //
        // ======================================================= //
        const tallasBtns = document.querySelectorAll('.tallas button');
        const urgencyMsg = document.getElementById('urgency-message');
        const addToCartButton = document.querySelector('.btn-comprar');
        const selectorTallasDiv = document.querySelector('.selector-tallas');
        const selectorCantidadDiv = document.querySelector('.selector-cantidad');

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
            // Deshabilitamos visualmente las tallas que no tienen stock
            tallasBtns.forEach(btn => {
                const talla = btn.innerText.trim();
                const stockDisponible = product.stock ? (product.stock[talla] || 0) : 0;
                if (stockDisponible === 0) {
                    btn.disabled = true;
                    btn.classList.add('agotado');
                    btn.title = 'Agotado en esta talla';
                }
            });

            tallasBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    tallasBtns.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');

                    const selectedSize = btn.innerText;
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
                    
                   const imagenCarrito = product.images.find(img => !img.toLowerCase().endsWith('.mp4')) || 'logo SC sin fondo.png';
                    addToCart(productId, product.name, product.price, imagenCarrito, quantity, selectedSize);
                });
            }
        } 

        // ======================================================= //
        // 5. PRODUCTOS RELACIONADOS (CON INTELIGENCIA AUTOMÁTICA) //
        // ======================================================= //
        const relatedContainer = document.querySelector('#related-products .product-grid');
        
        if (relatedContainer) {
            // 1. Revisamos si tienes productos relacionados guardados
            let listaSugerencias = product.related || [];

            // 2. LA MAGIA: Si la lista está vacía, agarramos 4 al azar del catálogo
            if (listaSugerencias.length === 0) {
                // Sacamos todas las playeras MENOS la que el cliente ya está viendo
                const otrasPlayeras = catalogoCompleto.filter(p => p.id !== product.id);
                
                // Revolvemos las playeras al azar (como barajar cartas)
                otrasPlayeras.sort(() => 0.5 - Math.random());
                
                // Tomamos las primeras 4 que salieron
                listaSugerencias = otrasPlayeras.slice(0, 4).map(p => p.id);
            }

            // 3. Pintamos las tarjetas en la pantalla
            listaSugerencias.forEach(relatedId => {
                const relatedProduct = products[relatedId];
                if(relatedProduct){
                    let relatedPriceDisplay = `$${relatedProduct.price.toFixed(2)}`;
                    if (relatedProduct.oldPrice && relatedProduct.oldPrice > relatedProduct.price) {
                        relatedPriceDisplay = `<span class="old-price">$${relatedProduct.oldPrice.toFixed(2)}</span> $${relatedProduct.price.toFixed(2)}`;
                    }

                    let relatedBadgeHTML = '';
                    if (relatedProduct.status === 'coming_soon') {
                        relatedPriceDisplay = '<span class="coming-soon-text">Lanzamiento Oficial</span>';
                        relatedBadgeHTML = '<span class="product-badge product-badge--proximamente">Próximamente</span>';
                    } else if (relatedProduct.oldPrice && relatedProduct.oldPrice > relatedProduct.price) {
                        const descuento = Math.round((1 - relatedProduct.price / relatedProduct.oldPrice) * 100);
                        relatedBadgeHTML = `<span class="product-badge product-badge--descuento">-${descuento}%</span>`;
                    } else if (relatedProduct.categoria === 'novedades-cat') {
                        relatedBadgeHTML = '<span class="product-badge product-badge--nuevo">Nuevo</span>';
                    }

                    const imgPrincipal = relatedProduct.images[0].toLowerCase().endsWith('.mp4') ? 'logo SC sin fondo.png' : relatedProduct.images[0];
                    const imgHover = relatedProduct.images.length > 1 && !relatedProduct.images[1].toLowerCase().endsWith('.mp4') ? relatedProduct.images[1] : imgPrincipal;

                    const nombreSeguro = escaparHTML(relatedProduct.name);
                    const idSeguro = escaparHTML(relatedId);
                    const imgPrincipalSegura = escaparHTML(imgPrincipal);
                    const imgHoverSegura = escaparHTML(imgHover);

                    const card = `
                        <a href="product.html?product=${idSeguro}" class="product-card-link">
                            <div class="product-card">
                                <div class="product-image-container">
                                    ${relatedBadgeHTML}
                                    <img src="${imgPrincipalSegura}" alt="${nombreSeguro}" class="main-img" loading="lazy">
                                    <img src="${imgHoverSegura}" alt="${nombreSeguro}" class="hover-img" loading="lazy">
                                </div>
                                <div class="product-info">
                                    <h3>${nombreSeguro}</h3>
                                    <p class="price">${relatedPriceDisplay}</p>
                                </div>
                            </div>
                        </a>`;
                    relatedContainer.innerHTML += card;
                }
            });
        }

    } catch (error) {
        console.error("🚨 Error cargando el producto:", error);
        mostrarError();
    }

    // Panel de Guía de Tallas
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
        mainContent.innerHTML = '<h1 class="product-error">Producto no encontrado</h1>';
    }
}
