// checkout.js — Envío del formulario de checkout (checkout.html)
// Movido de un <script> inline para poder activar la CSP (script-src 'self').
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('checkout-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('btn-submit');
        btn.innerText = "Procesando de forma segura...";
        btn.disabled = true;

        const direccionFisica = `${document.getElementById('calle').value}, Col. ${document.getElementById('colonia').value}, ${document.getElementById('ciudad').value}, CP: ${document.getElementById('cp').value}`;

        const cliente = {
            nombre: document.getElementById('nombre').value,
            email: document.getElementById('email').value,
            direccion: direccionFisica
        };

        // Guardamos al cliente temporalmente para el recibo final
        localStorage.setItem('clientePendiente', JSON.stringify(cliente));

        const carrito = JSON.parse(localStorage.getItem('shoppingCart')) || [];
        if (carrito.length === 0) {
            alert("Tu carrito está vacío.");
            window.location.href = "index.html";
            return;
        }

        try {
            // Llave de idempotencia: se conserva entre reintentos para que el
            // servidor no cree dos órdenes si el navegador repite la petición.
            const idempotencyKey = localStorage.getItem('checkoutIdempotencyKey') ||
                'CHK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('checkoutIdempotencyKey', idempotencyKey);

            const respuestaOrden = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carrito: carrito, cliente: cliente, idempotencyKey: idempotencyKey })
            });
            const datosOrden = await respuestaOrden.json();

            if (!respuestaOrden.ok || !datosOrden.success) {
                alert(datosOrden.error || "No se pudo registrar tu orden. Revisa tus datos.");
                btn.innerText = "Proceder al Pago";
                btn.disabled = false;
                return;
            }

            // La referencia real de la orden se guarda para el recibo y el número de pedido.
            localStorage.setItem('ordenPendiente', JSON.stringify({
                externalReference: datosOrden.externalReference,
                orderId: datosOrden.orderId
            }));
            localStorage.removeItem('checkoutIdempotencyKey');

            const respuestaMP = await fetch('/api/crear-pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carrito: carrito, externalReference: datosOrden.externalReference })
            });

            const datosMP = await respuestaMP.json();

            if (datosMP.success) {
                window.location.href = datosMP.link_de_pago;
            } else {
                alert(datosMP.error || "Error al conectar con la terminal bancaria.");
                btn.innerText = "Proceder al Pago";
                btn.disabled = false;
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Hubo un problema procesando tu orden.");
            btn.innerText = "Proceder al Pago";
            btn.disabled = false;
        }
    });
});
