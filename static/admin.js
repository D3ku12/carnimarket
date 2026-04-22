/**
 * CARNIMARKET - Sistema de Gestión Profesional v9.0
 * Control total de Inventario, Ventas, Clientes y Gastos
 */

let chartProductos = null;

// --- 1. NAVEGACIÓN Y CARGA DE DATOS ---

async function showTab(name, btn) {
    // UI: Activar pestañas
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');

    // Cargar datos según la sección
    if (name === 'dashboard') await cargarDashboard();
    if (name === 'inventario') await cargarInventario();
    if (name === 'ventas') { await cargarVentas(); await cargarSelectores(); }
    if (name === 'caja') await cargarCaja();
    if (name === 'clientes') await cargarClientes();
    if (name === 'gastos') await cargarGastos();
    if (name === 'deudas') await cargarDeudas();
}

// --- 2. AYUDANTES DE INTERFAZ (MODALES) ---

function abrirModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('open');
    // Limpiar formulario al abrir para evitar que queden datos de ediciones previas
    const form = modal.querySelector('form');
    if (form) {
        form.reset();
        if(form.querySelector('input[type="hidden"]')) {
            form.querySelector('input[type="hidden"]').value = "";
        }
    }
}

function cerrarModal(id) {
    document.getElementById(id).classList.remove('open');
}

// --- 3. FUNCIONES DE CARGA (FETCH) ---

async function cargarDashboard() {
    const res = await fetch("/admin/dashboard");
    const resCaja = await fetch("/admin/caja");
    const data = await res.json();
    const caja = await resCaja.json();

    // Stats de Caja y Dashboard
    document.getElementById("stats-dashboard").innerHTML = `
        <div class="stat" style="border-left-color: var(--success)">
            <span class="valor">$${caja.saldo_real.toLocaleString()}</span>
            <span class="label">Saldo en Caja (Efectivo)</span>
        </div>
        <div class="stat">
            <span class="valor">$${data.total_hoy.toLocaleString()}</span>
            <span class="label">Ventas de Hoy</span>
        </div>
        <div class="stat" style="border-left-color: var(--danger)">
            <span class="valor">$${caja.egresos.toLocaleString()}</span>
            <span class="label">Gastos Totales</span>
        </div>
    `;

    // Gráfica
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
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Alertas
    document.getElementById("alertas-stock").innerHTML = data.stock_bajo.map(p => `
        <div class="alerta-item">
            <span>${p.nombre}</span>
            <span class="tag-rojo">${p.stock}kg</span>
        </div>
    `).join("") || "<p>✅ Inventario al día</p>";
}

async function cargarInventario() {
    const res = await fetch("/inventario");
    const data = await res.json();
    const tbody = document.getElementById("tabla-admin");
    tbody.innerHTML = Object.entries(data).map(([nombre, info]) => `
        <tr>
            <td><strong>${nombre}</strong></td>
            <td>${info.stock}kg</td>
            <td>$${info.precio_kilo.toLocaleString()}</td>
            <td>
                <button class="btn-primary" onclick="prepararEdicionProd('${nombre.replaceAll("'", "\\'")}', ${JSON.stringify(info).replaceAll('"', '&quot;')})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarProducto(${info.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

async function cargarClientes() {
    const res = await fetch("/admin/clientes");
    const data = await res.json();
    document.getElementById("tabla-clientes").innerHTML = data.map(c => `
        <tr>
            <td><strong>${c.nombre}</strong></td>
            <td>${c.telefono}</td>
            <td>${c.direccion}</td>
            <td>
                <button class="btn-primary" onclick="prepararEdicionCli(${JSON.stringify(c).replaceAll('"', '&quot;')})">
                    <i class="fas fa-user-edit"></i>
                </button>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarCliente(${c.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

async function cargarGastos() {
    const res = await fetch("/admin/gastos");
    const data = await res.json();
    document.getElementById("tabla-gastos").innerHTML = data.map(g => `
        <tr>
            <td>${g.fecha}</td>
            <td>${g.descripcion}</td>
            <td><span class="badge">${g.categoria}</span></td>
            <td style="color:var(--danger)">-$${g.monto.toLocaleString()}</td>
            <td>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarGasto(${g.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

async function cargarCaja() {
    filtrarCaja();
}

async function filtrarCaja() {
    console.log("Cargando caja...");
    const fecha_inicio = document.getElementById("caja-fecha-inicio")?.value || "";
    const fecha_fin = document.getElementById("caja-fecha-fin")?.value || "";
    
    let url = "/admin/caja-detalle";
    const params = new URLSearchParams();
    if (fecha_inicio) params.append("fecha_inicio", fecha_inicio);
    if (fecha_fin) params.append("fecha_fin", fecha_fin);
    if (params.toString()) url += "?" + params.toString();
    
    console.log("URL:", url);
    
    try {
        const res = await fetch(url);
        console.log("Status:", res.status);
        if (!res.ok) throw new Error("Error HTTP: " + res.status);
        const data = await res.json();
        console.log("Data:", data);
        
        if (!data || typeof data.ventas_pagadas === 'undefined') {
            throw new Error("Datos inválidos del servidor");
        }
        
        document.getElementById("stats-caja").innerHTML = `
        <div class="stat" style="border-left-color: var(--success)">
            <span class="valor">$${(data.ventas_pagadas || 0).toLocaleString()}</span>
            <span class="label">Ventas Pagadas</span>
        </div>
        <div class="stat" style="border-left-color: var(--warning)">
            <span class="valor">$${(data.ventas_deben || 0).toLocaleString()}</span>
            <span class="label">Ventas que Deben</span>
        </div>
        <div class="stat">
            <span class="valor">$${(data.total_ventas || 0).toLocaleString()}</span>
            <span class="label">Total Ventas</span>
        </div>
        <div class="stat" style="border-left-color: var(--danger)">
            <span class="valor">$${(data.gastos || 0).toLocaleString()}</span>
            <span class="label">Gastos Totales</span>
        </div>
        <div class="stat" style="border-left-color: var(--info)">
            <span class="valor">$${(data.saldo_real || 0).toLocaleString()}</span>
            <span class="label">Saldo Real en Caja</span>
        </div>
    `;
    } catch (e) {
        console.error("Error caja:", e);
        document.getElementById("stats-caja").innerHTML = `<div style="color:red; padding:20px;">Error cargando datos: ${e.message}</div>`;
    }
}

function limpiarFiltrosCaja() {
    document.getElementById("caja-fecha-inicio").value = "";
    document.getElementById("caja-fecha-fin").value = "";
    filtrarCaja();
}

async function cargarVentas() {
    const res = await fetch("/admin/ventas");
    const data = await res.json();
    document.getElementById("tabla-ventas").innerHTML = data.map(v => `
        <tr>
            <td><small>${v.fecha_venta}</small></td>
            <td>${v.cliente}</td>
            <td>${v.producto} (${v.kilos}kg)</td>
            <td>$${v.subtotal.toLocaleString()}</td>
            <td><span class="badge ${v.pagado}">${v.pagado}</span></td>
            <td>
                <button class="btn-primary" onclick="togglePago(${v.id})"><i class="fas fa-sync"></i></button>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarVenta(${v.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join("");
}

async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    document.getElementById("tabla-deudas").innerHTML = data.deudas.map(d => `
        <tr>
            <td><strong>${d.cliente}</strong></td>
            <td style="color:red">$${d.total.toLocaleString()}</td>
            <td>${d.direccion || 'N/A'}</td>
            <td><span class="badge">${d.fecha_vencimiento}</span></td>
            <td>
                ${d.whatsapp_link ? `<a href="${d.whatsapp_link}" target="_blank" class="btn-wa">COBRAR</a>` : 'N/A'}
            </td>
        </tr>
    `).join("");
}

// --- 4. LÓGICA DE EDICIÓN (PRE-RELLENADO) ---

function prepararEdicionProd(nombre, info) {
    abrirModal('modal-producto');
    document.getElementById("prod-id").value = info.id;
    document.getElementById("prod-nombre").value = nombre;
    document.getElementById("prod-stock").value = info.stock;
    document.getElementById("prod-minimo").value = info.minimo;
    document.getElementById("prod-precio").value = info.precio_kilo;
    document.getElementById("titulo-modal-prod").innerText = "✏️ Editar " + nombre;
}

function prepararEdicionCli(c) {
    abrirModal('modal-cliente');
    document.getElementById("cli-id").value = c.id;
    document.getElementById("cli-nombre").value = c.nombre;
    document.getElementById("cli-tel").value = c.telefono;
    document.getElementById("cli-dir").value = c.direccion;
}

// --- 5. ENVÍO DE FORMULARIOS (POST / PUT) ---

// Manejador genérico para Productos (Crear o Editar)
document.getElementById("form-producto").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("prod-id").value;
    const nombre = document.getElementById("prod-nombre").value;
    const body = {
        nombre: nombre,
        stock: parseFloat(document.getElementById("prod-stock").value),
        minimo: parseFloat(document.getElementById("prod-minimo").value),
        precio_kilo: parseFloat(document.getElementById("prod-precio").value)
    };

    const url = id ? `/admin/producto/${id}` : "/admin/producto";
    const method = id ? "PUT" : "POST";

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if(data.error) {
        alert("Error: " + data.error);
    } else {
        cerrarModal('modal-producto');
        cargarInventario();
    }
};

// Manejador para Clientes
document.getElementById("form-cliente").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("cli-id").value;
    const body = {
        nombre: document.getElementById("cli-nombre").value,
        telefono: document.getElementById("cli-tel").value,
        direccion: document.getElementById("cli-dir").value
    };

    const url = id ? `/admin/cliente/${id}` : "/admin/cliente";
    const method = id ? "PUT" : "POST";

    const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if(data.error) {
        alert("Error: " + data.error);
    } else {
        cerrarModal('modal-cliente');
        cargarClientes();
    }
};

// Manejador para Gastos
document.getElementById("form-gasto").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
        descripcion: document.getElementById("gasto-desc").value,
        categoria: document.getElementById("gasto-cat").value,
        monto: parseFloat(document.getElementById("gasto-monto").value)
    };

    const res = await fetch("/admin/gasto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if(data.error) {
        alert("Error: " + data.error);
    } else {
        cerrarModal('modal-gasto');
        cargarGastos();
        cargarDashboard();
    }
};

// Manejador para Ventas
document.getElementById("form-venta").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
        producto: document.getElementById("venta-producto").value,
        kilos: parseFloat(document.getElementById("venta-kilos").value),
        cliente_nombre: document.getElementById("venta-cliente").value || "Cliente General",
        pagado: document.getElementById("venta-pagado").value,
        fecha_venta: document.getElementById("venta-fecha").value || null,
        fecha_vencimiento: document.getElementById("venta-vencimiento").value || null
    };

    const res = await fetch("/vender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if(data.error) alert(data.error);
    else {
        cerrarModal('modal-venta');
        cargarVentas();
        cargarDashboard();
    }
};

// --- 6. UTILIDADES ADICIONALES ---

async function togglePago(id) {
    const res = await fetch(`/admin/venta/${id}/pago`, { method: "PUT" });
    if(res.ok) {
        cargarVentas();
    } else {
        alert("Error al cambiar estado de pago");
    }
}

async function eliminarCliente(id) {
    if(confirm("¿Eliminar cliente?")) {
        const res = await fetch(`/admin/cliente/${id}`, { method: "DELETE" });
        if(res.ok) {
            cargarClientes();
        } else {
            alert("Error al eliminar cliente");
        }
    }
}

async function eliminarProducto(id) {
    if(confirm("¿Eliminar producto? Se perderá todo el historial asociado.")) {
        const res = await fetch(`/admin/producto/${id}`, { method: "DELETE" });
        if(res.ok) {
            cargarInventario();
        } else {
            alert("Error al eliminar producto");
        }
    }
}

async function eliminarVenta(id) {
    if(confirm("¿Eliminar venta? Se restaurará el stock del producto.")) {
        const res = await fetch(`/admin/venta/${id}`, { method: "DELETE" });
        if(res.ok) {
            cargarVentas();
            cargarDashboard();
        } else {
            alert("Error al eliminar venta");
        }
    }
}

async function eliminarGasto(id) {
    if(confirm("¿Eliminar gasto?")) {
        const res = await fetch(`/admin/gasto/${id}`, { method: "DELETE" });
        if(res.ok) {
            cargarGastos();
            cargarDashboard();
        } else {
            alert("Error al eliminar gasto");
        }
    }
}

async function cargarSelectores() {
    const resP = await fetch("/inventario");
    const prods = await resP.json();
    document.getElementById("venta-producto").innerHTML = Object.keys(prods).map(p => 
        `<option value="${p}">${p} — Stock: ${prods[p].stock}kg</option>`
    ).join("");
    
    const resC = await fetch("/admin/clientes");
    const clis = await resC.json();
    document.getElementById("lista-clientes").innerHTML = clis.map(c => `<option value="${c.nombre}">`).join("");
}

// Inicio automático
window.onload = () => cargarDashboard();