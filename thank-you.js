// thank-you.js — Pantalla de confirmación de compra (thank-you.html)
// Movido de un <script> inline para poder activar la CSP (script-src 'self').
document.addEventListener('DOMContentLoaded', () => {
    // 1. Muestra el número de orden real de la tienda
    let ordenPendiente = null;
    try { ordenPendiente = JSON.parse(localStorage.getItem('ordenPendiente')); } catch (e) { ordenPendiente = null; }
    const externalReference = ordenPendiente && ordenPendiente.externalReference ? ordenPendiente.externalReference : '';
    if (externalReference) {
        document.getElementById('order-number').innerText = '#' + externalReference;
    }

    // 2. EL MOTOR: Revisar si Mercado Pago nos mandó la señal de "aprobado"
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');

    // Si el pago fue un éxito, enviamos el recibo (el servidor valida la orden en BD)
    if (status === 'approved' && externalReference) {
        fetch('/api/enviar-recibo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ externalReference: externalReference })
        }).then(() => {
            // Limpiamos la memoria para que el carrito vuelva a quedar vacío
            localStorage.removeItem('shoppingCart');
            localStorage.removeItem('clientePendiente');
            localStorage.removeItem('ordenPendiente');

            // Si tienes una función en cart.js que actualiza el número del carrito, la llamamos:
            if (typeof renderCart === 'function') renderCart();
            if (typeof updateCartCount === 'function') updateCartCount();
        }).catch(error => console.error("Error al enviar recibo:", error));
    }
});
