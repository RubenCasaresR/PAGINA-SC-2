// newsletter.js — Lógica del formulario de suscripción (index.html)
// Movido de un <script> inline para poder activar la CSP (script-src 'self').
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('newsletter-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('newsletter-email');
        const messageEl = document.getElementById('newsletter-message');
        const btn = document.querySelector('.btn-newsletter');

        btn.innerText = "Enviando...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value })
            });

            const data = await response.json();

            messageEl.innerText = data.message || data.error;
            messageEl.className = data.success ? "newsletter-message success" : "newsletter-message error";

            if (data.success) emailInput.value = ''; // Limpia la cajita si tuvo éxito

        } catch (error) {
            messageEl.innerText = "Hubo un error de conexión.";
            messageEl.className = "newsletter-message error";
        } finally {
            btn.innerText = "Suscribirme";
            btn.disabled = false;
        }
    });
});
