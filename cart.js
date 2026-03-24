// cart.js

// CONFIGURACIÓN DE ENVÍO GRATIS
const FREE_SHIPPING_THRESHOLD = 1500.00;
const STANDARD_SHIPPING_COST = 100.00;

document.addEventListener('DOMContentLoaded', () => {
    updateCartIcon();
    setupCartDrawer();
    setupHamburgerMenu();
    renderCheckoutSummary(); // <--- AGREGAMOS ESTA LÍNEA
});

// ================================================= //
// ===== LÓGICA DEL CARRITO LATERAL (DRAWER) ======= //
// ================================================= //

function setupCartDrawer() {
    const cartIcons = document.querySelectorAll('.cart-icon a');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartDrawer = document.getElementById('cart-drawer');
    const closeBtn = document.getElementById('close-cart-btn');

    // Al hacer clic en el carrito del menú, abrir el Drawer
    cartIcons.forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault(); // Evita que navegue a carrito.html
            openCartDrawer();
        });
    });

    // Cerrar el Drawer al hacer clic en la X o en el fondo oscuro
    if (closeBtn) closeBtn.addEventListener('click', closeCartDrawer);
    if (cartOverlay) cartOverlay.addEventListener('click', closeCartDrawer);
}

function openCartDrawer() {
    const cartOverlay = document.getElementById('cart-overlay');
    const cartDrawer = document.getElementById('cart-drawer');
    if (cartOverlay && cartDrawer) {
        cartOverlay.classList.add('active');
        cartDrawer.classList.add('active');
        
        // CONGELA EL FONDO
        document.body.classList.add('no-scroll'); 
        
        renderCartDrawer(); 
    }
}

function closeCartDrawer() {
    const cartOverlay = document.getElementById('cart-overlay');
    const cartDrawer = document.getElementById('cart-drawer');
    if (cartOverlay && cartDrawer) {
        cartOverlay.classList.remove('active');
        cartDrawer.classList.remove('active');
        
        // DESCONGELA EL FONDO
        document.body.classList.remove('no-scroll'); 
    }
}

// ================================================= //
// ============= FUNCIONES PRINCIPALES ============= //
// ================================================= //

function addToCart(productId, productName, productPrice, productImage, quantity, size = 'Única') {
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const existingProductIndex = cart.findIndex(item => item.id === productId && item.size === size);
    const quantityToAdd = parseInt(quantity);

    if (existingProductIndex > -1) {
        cart[existingProductIndex].quantity += quantityToAdd;
    } else {
        cart.push({ id: productId, name: productName, price: productPrice, image: productImage, quantity: quantityToAdd, size: size });
    }

    localStorage.setItem('shoppingCart', JSON.stringify(cart));
    updateCartIcon();
    
    // En lugar de una alerta, abrimos el Drawer mágicamente para que el cliente vea su compra
    openCartDrawer(); 
}

function updateCartIcon() {
    const cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartIcons = document.querySelectorAll('.cart-icon a');
    cartIcons.forEach(icon => {
        icon.innerText = `🛒 Carrito (${totalItems})`;
    });
}

function renderCartDrawer() {
    const cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const container = document.getElementById('cart-drawer-items');
    
    if (!container) return; // Por si no existe el HTML

    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; margin-top: 20px;">Tu carrito está vacío.</p>';
        updateDrawerSummary(0);
        return;
    }

    container.innerHTML = ''; 
    let subtotal = 0;

    cart.forEach(item => {
        subtotal += (item.price * item.quantity);
        
        const itemElement = document.createElement('div');
        itemElement.classList.add('drawer-item');
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}" class="drawer-item-img">
            <div class="drawer-item-details">
                <h4>${item.name}</h4>
                <span class="drawer-item-size">Talla: ${item.size || 'Única'}</span>
                <p class="drawer-item-price">$${item.price.toFixed(2)}</p>
                
                <div class="drawer-controls-row">
                    <div class="drawer-quantity-controls">
                        <button onclick="changeQuantityDrawer('${item.id}', '${item.size}', -1)">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="changeQuantityDrawer('${item.id}', '${item.size}', 1)">+</button>
                    </div>
                    <button class="drawer-item-remove" onclick="removeItemDrawer('${item.id}', '${item.size}')">Quitar</button>
                </div>
            </div>
        `;
        container.appendChild(itemElement);
    });

    updateDrawerSummary(subtotal);
}

function changeQuantityDrawer(productId, size, amount) {
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const productIndex = cart.findIndex(item => item.id === productId && item.size === size);

    if (productIndex > -1) {
        cart[productIndex].quantity += amount;
        if (cart[productIndex].quantity <= 0) {
            cart.splice(productIndex, 1);
        }
    }
    
    localStorage.setItem('shoppingCart', JSON.stringify(cart));
    updateCartIcon();
    renderCartDrawer(); // Refrescar el drawer sin cerrarlo
    renderCheckoutSummary(); // <--- ¡NUEVO! Actualiza el checkout por detrás
}

function removeItemDrawer(productId, size) {
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const updatedCart = cart.filter(item => !(item.id === productId && item.size === size));
    
    localStorage.setItem('shoppingCart', JSON.stringify(updatedCart));
    updateCartIcon();
    renderCartDrawer();
    renderCheckoutSummary(); // <--- ¡NUEVO! Actualiza el checkout por detrás
}

function updateDrawerSummary(subtotal) {
    const subtotalElement = document.getElementById('drawer-subtotal');
    if (subtotalElement) subtotalElement.innerText = `$${subtotal.toFixed(2)}`;

    // Lógica de la barra de Envío Gratis
    const messageElement = document.getElementById('shipping-message');
    const progressFill = document.getElementById('shipping-progress-fill');
    
    if (messageElement && progressFill) {
        if (subtotal === 0) {
            messageElement.innerText = `¡Gasta $${FREE_SHIPPING_THRESHOLD.toFixed(2)} para envío gratis!`;
            progressFill.style.width = '0%';
        } else if (subtotal >= FREE_SHIPPING_THRESHOLD) {
            messageElement.innerText = '🎉 ¡Felicidades! Tienes envío gratis.';
            progressFill.style.width = '100%';
            progressFill.style.background = '#28a745'; // Verde
        } else {
            const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
            messageElement.innerText = `¡Te faltan $${remaining.toFixed(2)} para envío gratis!`;
            const percentage = (subtotal / FREE_SHIPPING_THRESHOLD) * 100;
            progressFill.style.width = `${percentage}%`;
            progressFill.style.background = '#000'; // Negro mientras se llena
        }
    }
}
// ================================================= //
// ===== LÓGICA DEL MENÚ HAMBURGUESA (MÓVIL) ======= //
// ================================================= //

function setupHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const mainNav = document.getElementById('main-nav');
    const navLinks = mainNav ? mainNav.querySelectorAll('a') : [];

    if (hamburgerBtn && closeMenuBtn && mainNav) {
        // Abrir menú
        hamburgerBtn.addEventListener('click', () => {
            mainNav.classList.add('active');
            document.body.classList.add('no-scroll'); // Congela el fondo
        });

        // Cerrar menú con la X
        closeMenuBtn.addEventListener('click', () => {
            mainNav.classList.remove('active');
            document.body.classList.remove('no-scroll');
        });

        // Cerrar menú automáticamente cuando tocan un enlace (Ej. "Nosotros")
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('active');
                document.body.classList.remove('no-scroll');
            });
        });
    }
}
// ================================================= //
// ========= LÓGICA DE LA PÁGINA DE CHECKOUT ======= //
// ================================================= //

function renderCheckoutSummary() {
    const container = document.getElementById('checkout-items-container');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const shippingEl = document.getElementById('checkout-shipping');
    const totalEl = document.getElementById('checkout-total');

    // Si no estamos en la página de checkout, detenemos la función
    if (!container) return; 

    const cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    
    if (cart.length === 0) {
        container.innerHTML = '<p>Tu carrito está vacío.</p>';
        if(subtotalEl) subtotalEl.innerText = '$0.00';
        if(shippingEl) shippingEl.innerText = '$0.00';
        if(totalEl) totalEl.innerText = '$0.00';
        return;
    }

    container.innerHTML = '';
    let subtotal = 0;

    // Pintar los productos en la lista
    cart.forEach(item => {
        subtotal += (item.price * item.quantity);
        
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('summary-item');
        itemDiv.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div style="flex-grow: 1;">
                <h4 style="margin: 0; font-size: 0.95rem;">${item.name}</h4>
                <p style="margin: 0; font-size: 0.8rem; color: #666;">Talla: ${item.size} | Cantidad: ${item.quantity}</p>
            </div>
            <span style="font-weight: bold;">$${(item.price * item.quantity).toFixed(2)}</span>
        `;
        container.appendChild(itemDiv);
    });

    if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;

    // Calcular Envío
    let shippingCost = 0;
    if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        shippingCost = 0;
        if (shippingEl) {
            shippingEl.innerText = '¡Envío Gratis!';
            shippingEl.style.color = '#28a745'; // Letras verdes para celebrar
            shippingEl.style.fontWeight = 'bold';
        }
    } else {
        shippingCost = STANDARD_SHIPPING_COST; 
        if (shippingEl) {
            shippingEl.innerText = `$${shippingCost.toFixed(2)}`;
            shippingEl.style.color = 'var(--negro)'; // Letras normales
            shippingEl.style.fontWeight = 'normal';
        }
    }

    // Calcular y mostrar el Total Final
    const total = subtotal + shippingCost;
    if (totalEl) totalEl.innerText = `$${total.toFixed(2)}`;
}
// ========================================== //
// ====== BOTÓN FINAL DE PAGO (MERCADO PAGO)  //
// ========================================== //
async function procesarPago(event) {
    event.preventDefault(); 

    const cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    
    if (cart.length === 0) {
        alert("Tu carrito está vacío. Agrega productos antes de pagar.");
        return;
    }

    // 1. Buscamos las cajas de texto en tu HTML
    const nombreInput = document.getElementById('cliente-nombre');
    const emailInput = document.getElementById('cliente-email');
    const dirInput = document.getElementById('cliente-direccion');

    // Obligamos al cliente a llenar sus datos
    if (nombreInput && emailInput && dirInput) {
        if (!nombreInput.value || !emailInput.value || !dirInput.value) {
            alert("Por favor, llena tus datos de envío antes de pagar.");
            return;
        }
    }

    // 2. Empacamos quién compra y qué compra (¡Aquí definimos ordenCompleta!)
    const ordenCompleta = {
        cliente: {
            nombre: nombreInput ? nombreInput.value : "Cliente de Mostrador",
            email: emailInput ? emailInput.value : "sin-correo@test.com",
            direccion: dirInput ? dirInput.value : "Recogida en Tienda"
        },
        carrito: cart
    };

    try {
        // 3. Le tocamos la puerta al nuevo Cajero Virtual (Mercado Pago)
        const respuesta = await fetch('/api/crear-pago', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ordenCompleta) // Ahora sí sabe qué mandar
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            console.log("✅ El banco autorizó el ticket. Redirigiendo a Mercado Pago...");
            // Vaciamos el carrito local
            localStorage.removeItem('shoppingCart'); 
            
            // 🚀 ¡MAGIA! Mandamos al cliente a la pantalla azul de cobro
            window.location.href = resultado.link_de_pago; 
        } else {
            alert("Error al contactar con el banco: " + (resultado.error || "Desconocido"));
        }
        
    } catch (error) {
        console.error("🚨 Error al procesar el pago:", error);
        alert("Hubo un problema de conexión con la caja. Por favor, intenta de nuevo.");
    }
}