// admin.js — Panel de administración (admin.html)
// Movido de un <script> inline para poder activar la CSP (script-src 'self').
// Los botones de las tarjetas de inventario usan data-accion/data-id y se
// manejan por delegación de eventos en lugar de atributos onclick.

const loginScreen = document.getElementById('login-screen');
const adminPanel = document.getElementById('admin-panel');
const loginError = document.getElementById('login-error');

function mostrarLogin() {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (adminPanel) adminPanel.style.display = 'none';
}

function mostrarPanel() {
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'block';
    cargarInventario();
    cargarVentas();
}

// Al cargar la página, preguntamos al servidor si ya hay sesión activa
(async function verificarSesion() {
    try {
        const respuesta = await fetch('/api/admin/verificar');
        const datos = await respuesta.json();
        if (datos.autenticado) mostrarPanel();
        else mostrarLogin();
    } catch (error) {
        mostrarLogin();
    }
})();

// Login
document.getElementById('btn-login').addEventListener('click', async () => {
    const password = document.getElementById('login-password').value;
    loginError.style.display = 'none';
    try {
        const respuesta = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        const datos = await respuesta.json();
        if (datos.success) {
            mostrarPanel();
        } else {
            loginError.style.display = 'block';
            loginError.className = 'mensaje';
            loginError.style.backgroundColor = '#f8d7da';
            loginError.style.color = '#721c24';
            loginError.innerText = '🔒 ' + (datos.error || 'Contraseña incorrecta.');
        }
    } catch (error) {
        loginError.style.display = 'block';
        loginError.style.backgroundColor = '#f8d7da';
        loginError.style.color = '#721c24';
        loginError.innerText = 'Error de conexión con el servidor.';
    }
});

document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
    } catch (error) {}
    mostrarLogin();
});

// 1. LÓGICA PARA AGREGAR PRODUCTO
document.getElementById('form-nuevo-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoProducto = {
        id: document.getElementById('prod-id').value,
        nombre: document.getElementById('prod-nombre').value,
        precio: parseFloat(document.getElementById('prod-precio').value),
        imagen: document.getElementById('prod-imagen').value,
        descripcion: document.getElementById('prod-desc').value,
        stock: {
            'XS': parseInt(document.getElementById('stock-xs').value),
            'S': parseInt(document.getElementById('stock-s').value),
            'M': parseInt(document.getElementById('stock-m').value),
            'L': parseInt(document.getElementById('stock-l').value),
            'XL': parseInt(document.getElementById('stock-xl').value)
        }
    };

    try {
        const respuesta = await fetch('/api/admin/productos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoProducto)
        });
        const resultado = await respuesta.json();
        const mensajeDiv = document.getElementById('mensaje-alerta');
        mensajeDiv.style.display = 'block';

        if (resultado.success) {
            mensajeDiv.className = 'mensaje exito';
            mensajeDiv.innerText = "✅ ¡Producto agregado a la tienda exitosamente!";
            document.getElementById('form-nuevo-producto').reset();
            cargarInventario();
        } else {
            mensajeDiv.style.backgroundColor = '#f8d7da';
            mensajeDiv.style.color = '#721c24';
            mensajeDiv.innerText = "🚨 Error: " + resultado.error;
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
});

// 2. LÓGICA PARA CARGAR EL INVENTARIO
async function cargarInventario() {
    try {
        const respuesta = await fetch('/api/productos');
        const productos = await respuesta.json();
        const contenedor = document.getElementById('lista-inventario');

        if (productos.length === 0) {
            contenedor.innerHTML = '<p class="admin-cargando">Tu bodega está vacía.</p>';
            return;
        }

        let htmlInventario = '';
        productos.forEach(prod => {
            const xsStock = prod.stock['XS'] || 0;
            const sStock = prod.stock['S'] || 0;
            const mStock = prod.stock['M'] || 0;
            const lStock = prod.stock['L'] || 0;
            const xlStock = prod.stock['XL'] || 0;

            const fotosActuales = prod.imagenes ? prod.imagenes.join(', ') : '';

            const nombreSeguro = escaparHTMLAdmin(prod.nombre);
            const idSeguro = escaparHTMLAdmin(prod.id);
            const fotosSeguras = escaparHTMLAdmin(fotosActuales);

            htmlInventario += `
            <div class="inventario-card">
                <div class="inventario-card-header">
                    <div>
                        <strong class="inventario-card-title">${nombreSeguro}</strong> <span class="inventario-card-id">(ID: ${idSeguro})</span><br>
                        <div class="inventario-card-precio">
                            <span>$</span>
                            <input type="number" id="edit-precio-${idSeguro}" value="${prod.precio}" step="0.01" class="edit-precio-input">
                        </div>
                    </div>
                    <div>
                        <button class="btn-actualizar" data-accion="guardar" data-id="${idSeguro}">💾 Guardar Cambios</button>
                        <button class="btn-eliminar" data-accion="eliminar" data-id="${idSeguro}">🗑️ Eliminar</button>
                    </div>
                </div>

                <div class="inventario-card-stock">
                    <div class="inventario-card-stock-row">
                        <strong>Inventario:</strong>
                        <label>XS: <input type="number" id="edit-xs-${idSeguro}" class="talla-input" value="${xsStock}" min="0"></label>
                        <label>S: <input type="number" id="edit-s-${idSeguro}" class="talla-input" value="${sStock}" min="0"></label>
                        <label>M: <input type="number" id="edit-m-${idSeguro}" class="talla-input" value="${mStock}" min="0"></label>
                        <label>L: <input type="number" id="edit-l-${idSeguro}" class="talla-input" value="${lStock}" min="0"></label>
                        <label>XL: <input type="number" id="edit-xl-${idSeguro}" class="talla-input" value="${xlStock}" min="0"></label>
                    </div>
                    
                    <div class="inventario-card-img">
                        <strong>📸 Imágenes (Separadas por comas):</strong>
                        <input type="text" id="edit-img-${idSeguro}" class="img-input" value="${fotosSeguras}" placeholder="ej: foto-frente.png, foto-atras.png">
                    </div>
                </div>

            </div>`;
        });
        contenedor.innerHTML = htmlInventario;
    } catch (error) {
        console.error("Error cargando inventario:", error);
    }
}

// Delegación de eventos para los botones de cada tarjeta de inventario.
document.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const idProducto = boton.getAttribute('data-id');
    if (boton.getAttribute('data-accion') === 'guardar') guardarCambiosProducto(idProducto);
    else if (boton.getAttribute('data-accion') === 'eliminar') eliminarProducto(idProducto);
});

// 3. LÓGICA: GUARDAR STOCK, IMÁGENES Y PRECIO
async function guardarCambiosProducto(idProducto) {
    const nuevoPrecio = parseFloat(document.getElementById(`edit-precio-${idProducto}`).value);

    const nuevoStock = {
        'XS': parseInt(document.getElementById(`edit-xs-${idProducto}`).value) || 0,
        'S': parseInt(document.getElementById(`edit-s-${idProducto}`).value) || 0,
        'M': parseInt(document.getElementById(`edit-m-${idProducto}`).value) || 0,
        'L': parseInt(document.getElementById(`edit-l-${idProducto}`).value) || 0,
        'XL': parseInt(document.getElementById(`edit-xl-${idProducto}`).value) || 0
    };

    const nuevasFotos = document.getElementById(`edit-img-${idProducto}`).value;

    try {
        const respuesta = await fetch(`/api/admin/productos/${idProducto}/actualizar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ precio: nuevoPrecio, stock: nuevoStock, imagenes: nuevasFotos })
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            alert("✅ " + resultado.message);
        } else {
            alert("❌ Error: " + resultado.error);
        }
    } catch (error) {
        console.error("🚨 Error de conexión:", error);
        alert("Hubo un problema al contactar con la bodega.");
    }
}

// 4. LÓGICA PARA ELIMINAR
async function eliminarProducto(idDelProducto) {
    const confirmacion = confirm("¿Estás seguro de que quieres eliminar este producto?");
    if (confirmacion) {
        try {
            const respuesta = await fetch(`/api/admin/productos/${idDelProducto}`, { method: 'DELETE' });
            const resultado = await respuesta.json();
            if (resultado.success) {
                alert("✅ " + resultado.message);
                cargarInventario();
            } else {
                alert("❌ Error: " + resultado.error);
            }
        } catch (error) {
            console.error("🚨 Error de conexión:", error);
        }
    }
}

// 5. LÓGICA PARA VER LAS VENTAS
function escaparHTMLAdmin(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function etiquetaEstado(estado) {
    const clases = {
        pagado: 'etiqueta-pagado',
        pendiente: 'etiqueta-pendiente',
        rechazado: 'etiqueta-rechazado'
    };
    const texto = ['pagado', 'pendiente', 'rechazado'].includes(estado) ? estado : 'sin pago';
    const clase = clases[texto] || 'etiqueta-default';
    return `<span class="etiqueta-estado ${clase}">${texto}</span>`;
}

async function cargarVentas() {
    try {
        const respuesta = await fetch('/api/admin/ordenes');
        const ventas = await respuesta.json();
        const contenedor = document.getElementById('lista-ordenes');

        if (ventas.length === 0) {
            contenedor.innerHTML = '<p class="admin-cargando">Aún no hay ventas registradas.</p>';
            return;
        }

        let htmlVentas = '';
        ventas.forEach(venta => {
            let listaArticulos = '';
            venta.productos.forEach(item => {
                listaArticulos += `<li><strong>${item.quantity}x</strong> ${escaparHTMLAdmin(item.name)} (Talla: ${escaparHTMLAdmin(item.size)}) - $${(item.price * item.quantity).toFixed(2)}</li>`;
            });

            htmlVentas += `
            <div class="venta-card">
                <div class="venta-card-header">
                    <strong class="venta-card-titulo">Orden #${venta.id}</strong>
                    <div class="venta-card-meta">
                        ${etiquetaEstado(venta.estado)}
                        <span>${new Date(venta.fecha).toLocaleString()}</span>
                    </div>
                </div>
                <p class="venta-linea"><strong>👤 Cliente:</strong> ${escaparHTMLAdmin(venta.nombre)} (${escaparHTMLAdmin(venta.email)})</p>
                <p class="venta-linea"><strong>📍 Dirección:</strong> ${escaparHTMLAdmin(venta.direccion)}</p>
                <p class="venta-total"><strong>💰 Total: $${venta.total.toFixed(2)}</strong></p>
                <div class="venta-articulos">
                    <ul>${listaArticulos}</ul>
                </div>
            </div>`;
        });
        contenedor.innerHTML = htmlVentas;
    } catch (error) {
        console.error("Error cargando ventas:", error);
    }
}

// ========================================== //
// ====== DESCARGAR EXCEL DE CORREOS ======== //
// ========================================== //
const btnDescargarCorreos = document.getElementById('btn-descargar-correos');

if (btnDescargarCorreos) {
    btnDescargarCorreos.addEventListener('click', () => {
        // Redirigimos al servidor para que nos entregue el archivo (evita cualquier bloqueo)
        window.location.href = '/api/admin/descargar-csv?hora=' + Date.now();
    });
}
