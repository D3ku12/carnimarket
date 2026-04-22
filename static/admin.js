/**
 * CARNIMARKET - Sistema de Gestión Profesional
 * Lógica del Panel de Administración (v7.0)
 */

// variables globales para las gráficas
let chartProductos = null;

// --- 1. GESTIÓN DE NAVEGACIÓN Y PESTAÑAS ---

/**
 * Cambia entre pestañas y dispara la carga de datos correspondiente
 */
async function showTab(name, btn) {
    // UI: Cambiar clases activas
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + name);
    if (targetTab) {
        targetTab.classList.add('active');
        btn.classList.add('active');
    }

    // Cargar datos según la pestaña activa
    switch (name) {
        case 'dashboard':
            await cargarDashboard();
            break;
        case 'inventario':
            await cargarInventario();
            break;
        case 'ventas':
            await cargarVentas();
            await cargarSelectoresVenta(); // Para llenar el modal de ventas
            break;
        case 'clientes':
            await cargarClientes();
            break;
        case 'deudas':
            await cargarDeudas();
            break;
        case 'historial':
            await cargarHistorial();
            break;
    }
}

// --- 2. AYUDANTES DE INTERFAZ (MODALES) ---

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

// --- 3. CARGA DE DATOS DESDE EL SERVIDOR (FETCH) ---

/**
 * Carga métricas principales y gráfica del Dashboard
 */
async function cargarDashboard() {
    try {
        const res = await fetch("/admin/dashboard");
        const data = await res.json();
        
        // Renderizar Tarjetas de Estadísticas
        const statsDiv = document.getElementById("stats-dashboard");
        statsDiv.innerHTML = `
            <div class="stat">
                <span class="valor">$${data.total_hoy.toLocaleString('es-CO')}</span>
                <span class="label"><i class="fas fa-calendar-day"></i> Ventas Hoy</span>
            </div>
            <div class="stat" style="border-left-color: var(--success)">
                <span class="valor">$${data.total_mes.toLocaleString('es-CO')}</span>
                <span class="label"><i class="fas fa-calendar-alt"></i> Ventas del Mes</span>
            </div>
            <div class="stat" style="border-left-color: var(--warning)">
                <span class="valor">${data.stock_bajo.length}</span>
                <span class="label"><i class="fas fa-box-open"></i> Alertas de Stock</span>
            </div>
            <div class="stat" style="border-left-color: #3498db">
                <span class="valor">${data.ventas_hoy_conteo}</span>
                <span class="label"><i class="fas fa-receipt"></i> Facturas Hoy</span>
            </div>
        `;

        // Renderizar Gráfica de Barras (Chart.js)
        const ctx = document.getElementById('chart-productos').getContext('2d');
        if (chartProductos) chartProductos.destroy();
        
        chartProductos = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data.productos_ventas),
                datasets: [{
                    label: 'Kilos Vendidos',
                    data: Object.values(data.productos_ventas),
                    backgroundColor: 'rgba(192, 57, 43, 0.8)',
                    borderColor: '#c0392b',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' } } }
            }
        });

        // Alertas de Stock Bajo
        const alertasDiv = document.getElementById("alertas-stock");
        if (data.stock_bajo.length === 0) {
            alertasDiv.innerHTML = '<div class="alerta-ok">✅ Todo el stock está al día.</div>';
        } else {
            alertasDiv.innerHTML = data.stock_bajo.map(p => `
                <div class="alerta-item">
                    <span><strong>${p.nombre}</strong></span>
                    <span class="tag-rojo">${p.stock}kg</span>
                </div>
            `).join("");
        }
    } catch (e) { console.error("Error al cargar dashboard:", e); }
}

/**
 * Carga la tabla de Inventario
 */
async function cargarInventario() {
    const res = await fetch("/inventario");
    const data = await res.json();
    const tbody = document.getElementById("tabla-admin");
    
    tbody.innerHTML = Object.entries(data).map(([nombre, info]) => `
        <tr>
            <td><div class="prod-info"><strong>${nombre}</strong></div></td>
            <td>${info.stock} kg</td>
            <td>${info.minimo} kg</td>
            <td><strong>$${info.precio_kilo.toLocaleString('es-CO')}</strong></td>
            <td><span class="badge ${info.stock <= info.minimo ? 'debe' : 'pagado'}">
                ${info.stock <= info.minimo ? 'Stock Bajo' : 'Disponible'}
            </span></td>
            <td>
                <button class="btn-small" onclick="prepararEdicionProd('${nombre}', ${info.stock}, ${info.minimo}, ${info.precio_kilo})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga la tabla de Ventas
 */
async function cargarVentas() {
    const res = await fetch("/admin/ventas");
    const ventas = await res.json();
    const tbody = document.getElementById("tabla-ventas");
    
    tbody.innerHTML = ventas.map(v => `
        <tr>
            <td class="text-muted">${v.fecha_venta}</td>
            <td><strong>${v.cliente}</strong></td>
            <td>${v.producto} <small>(${v.kilos}kg)</small></td>
            <td><strong>$${v.subtotal.toLocaleString('es-CO')}</strong></td>
            <td><span class="badge ${v.pagado}">${v.pagado.toUpperCase()}</span></td>
            <td>
                <button class="btn-small" onclick="actualizarEstadoPago(${v.id}, '${v.pagado}')">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga la tabla de Clientes
 */
async function cargarClientes() {
    const res = await fetch("/admin/clientes");
    const clientes = await res.json();
    const tbody = document.getElementById("tabla-clientes");
    
    tbody.innerHTML = clientes.map(c => `
        <tr>
            <td><strong>${c.nombre}</strong></td>
            <td>${c.telefono || '—'}</td>
            <td>${c.direccion || '—'}</td>
            <td>${c.fecha_registro}</td>
            <td>
                <button class="btn-small" onclick="editarClientePrompt(${c.id}, '${c.nombre}', '${c.telefono}')">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="btn-small btn-danger" onclick="eliminarCliente(${c.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga la tabla de Deudas con links de WhatsApp
 */
async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    const tbody = document.getElementById("tabla-deudas");
    
    tbody.innerHTML = data.deudas.map(d => `
        <tr>
            <td><strong>${d.cliente}</strong></td>
            <td class="text-rojo"><strong>$${d.total.toLocaleString('es-CO')}</strong></td>
            <td>
                ${d.whatsapp_link ? `
                    <a href="${d.whatsapp_link}" target="_blank" class="btn-wa">
                        <i class="fab fa-whatsapp"></i> COBRAR
                    </a>` : '<span class="text-muted">Sin Teléfono</span>'}
            </td>
            <td>
                <button class="btn-small" onclick="showTab('ventas', document.querySelector('.nav button:nth-child(3)'))">
                    Ver Detalle
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga el Historial de movimientos
 */
async function cargarHistorial() {
    const res = await fetch("/admin/historial");
    const logs = await res.json();
    const tbody = document.getElementById("tabla-historial");
    
    tbody.innerHTML = logs.map(l => `
        <tr>
            <td>${l.fecha}</td>
            <td><strong>${l.producto}</strong></td>
            <td><span class="tipo-${l.tipo}">${l.tipo.toUpperCase()}</span></td>
            <td>${l.cantidad} kg</td>
            <td class="text-muted"><em>${l.motivo}</em></td>
        </tr>
    `).join("");
}

// --- 4. GESTIÓN DE FORMULARIOS Y ACCIONES (POST/PUT/DELETE) ---

/**
 * Llena los selectores del modal de venta con datos de la DB
 */
async function cargarSelectoresVenta() {
    const resP = await fetch("/inventario");
    const prods = await resP.json();
    const selectP = document.getElementById("venta-producto");
    selectP.innerHTML = Object.keys(prods).map(p => `<option value="${p}">${p}</option>`).join("");

    const resC = await fetch("/admin/clientes");
    const clis = await resC.json();
    const listC = document.getElementById("lista-clientes");
    listC.innerHTML = clis.map(c => `<option value="${c.nombre}">`).join("");
}

// Registro de Producto
document.getElementById("form-producto")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById("prod-nombre").value,
        stock: parseFloat(document.getElementById("prod-stock").value),
        minimo: parseFloat(document.getElementById("prod-minimo").value),
        precio_kilo: parseFloat(document.getElementById("prod-precio").value)
    };

    const res = await fetch("/admin/producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.mensaje) {
        cerrarModal('modal-producto');
        cargarInventario();
        e.target.reset();
    } else { alert(data.error); }
});

// Registro de Venta
document.getElementById("form-venta")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        producto: document.getElementById("venta-producto").value,
        kilos: parseFloat(document.getElementById("venta-kilos").value),
        cliente_nombre: document.getElementById("venta-cliente").value || "Cliente General",
        pagado: document.getElementById("venta-pagado").value
    };

    const res = await fetch("/vender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.mensaje) {
        cerrarModal('modal-venta');
        cargarVentas();
        cargarDashboard(); // Actualizar gráfica
        e.target.reset();
    } else { alert(data.error); }
});

// Acciones de Edición Rápidas
async function actualizarEstadoPago(id, actual) {
    const nuevo = actual === 'pagado' ? 'debe' : 'pagado';
    await fetch(`/admin/venta/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagado: nuevo })
    });
    cargarVentas();
}

async function eliminarCliente(id) {
    if (confirm("¿Seguro que deseas eliminar este cliente?")) {
        await fetch(`/admin/cliente/${id}`, { method: "DELETE" });
        cargarClientes();
    }
}

// Al cargar la página por primera vez
window.onload = () => {
    cargarDashboard();
};