/**
 * CARNIMARKET - Sistema de Gestión de Carnicería
 * Lógica del Panel de Administración v8.0
 */

// Variable global para controlar la instancia de la gráfica y evitar duplicados
let chartProductos = null;

// --- 1. SISTEMA DE NAVEGACIÓN ---

/**
 * Controla el cambio de pestañas y carga los datos respectivos
 */
async function showTab(name, btn) {
    // UI: Gestionar clases activas en botones y secciones
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + name);
    if (targetTab) {
        targetTab.classList.add('active');
        btn.classList.add('active');
    }

    // Ejecutar la función de carga según la pestaña seleccionada
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

// --- 2. CONTROL DE MODALES (VENTANAS EMERGENTES) ---

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

// --- 3. FUNCIONES DE CARGA DE DATOS (BACKEND -> UI) ---

/**
 * Carga las métricas del Dashboard y genera la gráfica de Chart.js
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
                <span class="label">Ventas Hoy</span>
            </div>
            <div class="stat" style="border-left-color: var(--success)">
                <span class="valor">$${data.total_mes.toLocaleString('es-CO')}</span>
                <span class="label">Este Mes</span>
            </div>
            <div class="stat" style="border-left-color: var(--warning)">
                <span class="valor">${data.stock_bajo.length}</span>
                <span class="label">Alertas de Stock</span>
            </div>
        `;

        // Lógica de la Gráfica de Barras
        const ctx = document.getElementById('chart-productos').getContext('2d');
        if (chartProductos) chartProductos.destroy();
        
        chartProductos = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data.productos_ventas),
                datasets: [{
                    label: 'Kilos Vendidos',
                    data: Object.values(data.productos_ventas),
                    backgroundColor: '#c0392b',
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // Alertas de Stock Bajo
        const alertasDiv = document.getElementById("alertas-stock");
        if (data.stock_bajo.length === 0) {
            alertasDiv.innerHTML = '<p style="color:var(--success); font-weight:600; padding:10px;">✅ Todo bien en bodega</p>';
        } else {
            alertasDiv.innerHTML = data.stock_bajo.map(p => `
                <div class="alerta-item">
                    <span>${p.nombre}</span>
                    <span class="tag-rojo">${p.stock} kg</span>
                </div>
            `).join("");
        }
    } catch (error) { console.error("Error Dashboard:", error); }
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
            <td><strong>${nombre}</strong></td>
            <td>${info.stock} kg</td>
            <td>$${info.precio_kilo.toLocaleString('es-CO')}</td>
            <td>
                <button class="btn-primary" style="padding: 5px 10px;" onclick="editarStockPrompt('${nombre}', ${info.stock})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga la tabla de Clientes
 */
async function cargarClientes() {
    try {
        const res = await fetch("/admin/clientes");
        const clis = await res.json();
        const tbody = document.getElementById("tabla-clientes");
        
        if (clis.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay clientes registrados</td></tr>';
            return;
        }

        tbody.innerHTML = clis.map(c => `
            <tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.telefono || '—'}</td>
                <td>${c.direccion || '—'}</td>
                <td style="color:#7f8c8d;">${c.fecha_registro}</td>
                <td>
                    <button class="btn-primary" style="background:#3498db; padding:5px 10px;" onclick="editarClientePrompt(${c.id}, '${c.nombre}')">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-primary" style="background:var(--danger); padding:5px 10px;" onclick="eliminarCliente(${c.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join("");
    } catch (e) { console.error("Error Clientes:", e); }
}

/**
 * Carga el historial de Ventas
 */
async function cargarVentas() {
    const res = await fetch("/admin/ventas");
    const ventas = await res.json();
    const tbody = document.getElementById("tabla-ventas");
    
    tbody.innerHTML = ventas.map(v => `
        <tr>
            <td style="font-size:0.8rem; color:#7f8c8d;">${v.fecha_venta}</td>
            <td><strong>${v.cliente}</strong></td>
            <td>${v.producto} <small>(${v.kilos}kg)</small></td>
            <td><strong>$${v.subtotal.toLocaleString('es-CO')}</strong></td>
            <td><span class="badge ${v.pagado}">${v.pagado.toUpperCase()}</span></td>
            <td>
                <button class="btn-primary" style="background:var(--dark); padding:5px 10px;" onclick="cambiarEstadoPago(${v.id})">
                    <i class="fas fa-sync"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

/**
 * Carga las deudas y los links de WhatsApp
 */
async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    const tbody = document.getElementById("tabla-deudas");
    
    tbody.innerHTML = data.deudas.map(d => `
        <tr>
            <td><strong>${d.cliente}</strong></td>
            <td style="color:var(--primary); font-weight:800;">$${d.total.toLocaleString('es-CO')}</td>
            <td>
                ${d.whatsapp_link ? `
                    <a href="${d.whatsapp_link}" target="_blank" class="btn-wa">
                        <i class="fab fa-whatsapp"></i> NOTIFICAR
                    </a>` : '<span style="color:#999;">Sin Teléfono</span>'}
            </td>
            <td><button class="btn-primary" style="padding:5px 10px;" onclick="showTab('ventas', document.querySelector('.nav button:nth-child(3)'))">VER</button></td>
        </tr>
    `).join("");
}

async function cargarHistorial() {
    const res = await fetch("/admin/historial");
    const logs = await res.json();
    const tbody = document.getElementById("tabla-historial");
    
    tbody.innerHTML = logs.map(l => `
        <tr>
            <td>${l.fecha}</td>
            <td><strong>${l.producto}</strong></td>
            <td><span class="badge ${l.tipo === 'entrada' ? 'pagado' : 'debe'}">${l.tipo}</span></td>
            <td>${l.cantidad} kg</td>
            <td style="font-style:italic; color:#666;">${l.motivo}</td>
        </tr>
    `).join("");
}

// --- 4. ACCIONES Y FORMULARIOS (POST/PUT/DELETE) ---

/**
 * Prepara los selectores en el modal de ventas
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

// Registro de Nuevo Producto
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

// Registro de Nueva Venta
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
        cargarDashboard();
        e.target.reset();
    } else { alert(data.error); }
});

// Registro de Nuevo Cliente
document.getElementById("form-cliente")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById("cli-nombre").value,
        telefono: document.getElementById("cli-tel").value,
        direccion: document.getElementById("cli-dir").value
    };

    const res = await fetch("/admin/cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.mensaje) {
        cerrarModal('modal-cliente');
        cargarClientes();
        e.target.reset();
    } else { alert(data.error); }
});

// Funciones de Actualización Rápida
async function cambiarEstadoPago(id) {
    await fetch(`/admin/venta/${id}/pago`, { method: "PUT" });
    cargarVentas();
}

async function editarStockPrompt(nombre, actual) {
    const nuevo = prompt(`Actualizar stock para ${nombre}:`, actual);
    if (nuevo !== null) {
        await fetch("/admin/stock", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre: nombre, stock: parseFloat(nuevo) })
        });
        cargarInventario();
    }
}

async function eliminarCliente(id) {
    if (confirm("¿Eliminar este cliente definitivamente?")) {
        await fetch(`/admin/cliente/${id}`, { method: "DELETE" });
        cargarClientes();
    }
}

// ARRANQUE INICIAL
window.onload = () => {
    cargarDashboard();
};