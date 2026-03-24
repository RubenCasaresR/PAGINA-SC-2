// checkout.js

document.addEventListener('DOMContentLoaded', () => {
    loadOrderSummary();

    const form = document.getElementById('payment-form');
    if(form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault(); 
            
            alert('Procesando pago...');

            localStorage.removeItem('shoppingCart');
            
            window.location.href = 'gracias.html';
        });
    }
});

function loadOrderSummary() {
    const cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    const container = document.getElementById('summary-items-container');
    const totalElement = document.getElementById('summary-total');
    
    if (!container) return;

    container.innerHTML = '';
    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('summary-item');
        // Pintamos el subtotal de ese artículo multiplicando precio x cantidad
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <span>${item.name} (Talla: ${item.size || 'Única'}) x${item.quantity}</span>
            <span class="price">$${(item.price * item.quantity).toFixed(2)}</span>
        `;
        container.appendChild(itemElement);
    });

    // AQUÍ ESTÁ LA CORRECCIÓN: Matemática directa
    const subtotal = cart.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);

    const shipping = 100.00;
    const total = cart.length > 0 ? subtotal + shipping : 0;
    
    if (totalElement) {
        totalElement.innerText = `$${total.toFixed(2)}`;
    }
}