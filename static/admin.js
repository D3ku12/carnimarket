/**
 * CARNIMARKET - Sistema de Gestión Profesional v9.0
 * Control total de Inventario, Ventas, Clientes y Gastos
 */

let chartProductos = null;

// --- 1. NAVEGACIÓN Y CARGA DE DATOS ---

async function showTab(name, btn) {
    if (name === "usuarios" && window.currentRol !== "admin") {
        return;
    }
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');

    if (name === 'dashboard') await cargarDashboard();
    if (name === 'inventario') await cargarInventario();
    if (name === 'ventas') { await cargarVentas(); await cargarSelectores(); }
    if (name === 'encargados') await cargarEncargados();
    if (name === 'caja') await cargarCaja();
    if (name === 'clientes') await cargarClientes();
    if (name === 'gastos') await cargarGastos();
    if (name === 'deudas') await cargarDeudas();
    if (name === 'usuarios' && window.currentRol === "admin") await cargarUsuarios();
}

// --- 2. AYUDANTES DE INTERFAZ (MODALES) ---

function abrirModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('open');
    const form = modal.querySelector('form');
    if (form) {
        form.reset();
        if(form.querySelector('input[type="hidden"]')) {
            form.querySelector('input[type="hidden"]').value = "";
        }
    }
    if (id === 'modal-venta') {
        initModalVenta();
    }
    if (id === 'modal-producto') {
        document.getElementById("prod-tipo").value = "kilo";
        cambiarTipoProducto();
    }
}

function cerrarModal(id) {
    document.getElementById(id).classList.remove('open');
}

// --- 3. FUNCIONES DE CARGA (FETCH) ---

async function filtrarDashboard() {
    const periodo = document.getElementById("dashboard-periodo")?.value || "7dias";
    const res = await fetch(`/admin/dashboard?periodo=${periodo}`);
    const resCaja = await fetch("/admin/caja");
    const data = await res.json();
    const caja = await resCaja.json();

    const labels = {"hoy": "Hoy", "7dias": "Últimos 7 días", "30dias": "Último mes"};
    document.getElementById("stats-dashboard").innerHTML = `
        <div class="stat" style="border-left-color: var(--success)">
            <span class="valor">$${caja.saldo_real.toLocaleString()}</span>
            <span class="label">Saldo en Caja</span>
        </div>
        <div class="stat">
            <span class="valor">$${(data.total_periodo || data.total_hoy).toLocaleString()}</span>
            <span class="label">Ventas (${labels[periodo] || periodo})</span>
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

    document.getElementById("alertas-stock").innerHTML = data.stock_bajo.map(p => `
        <div class="alerta-item">
            <span>${p.nombre}</span>
            <span class="tag-rojo">${p.stock}kg</span>
        </div>
    `).join("") || "<p>✅ Inventario al día</p>";
}

async function cargarDashboard() {
    filtrarDashboard();
}

async function cargarInventario() {
    const res = await fetch("/inventario");
    const data = await res.json();
    const tbody = document.getElementById("tabla-admin");
    tbody.innerHTML = Object.entries(data).map(([nombre, info]) => {
        const stock = info.tipo === "plato" ? `${info.stock} platos` : `${info.stock}kg`;
        const precio = info.tipo === "plato" ? `$${info.precio_kilo.toLocaleString()}/plato` : `$${info.precio_kilo.toLocaleString()}/kg`;
        const tipoLabel = info.tipo === "plato" ? "🥩 Plato" : "🥩 Kilo";
        return `
        <tr>
            <td><strong>${nombre}</strong><br><small style="color:var(--gray-500)">${tipoLabel}</small></td>
            <td>${stock}</td>
            <td>${precio}</td>
            <td>
                <button class="btn-primary" onclick="prepararEdicionProd('${nombre.replaceAll("'", "\\'")}', ${JSON.stringify(info).replaceAll('"', '&quot;')})">Editar</button>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarProducto(${info.id})">Borrar</button>
            </td>
        </tr>
    `}).join("");
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
                <button class="btn-primary" onclick="prepararEdicionCli(${JSON.stringify(c).replaceAll('"', '&quot;')})">Editar</button>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarCliente(${c.id})">Borrar</button>
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
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarGasto(${g.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join("");
}

async function cargarEncargados() {
    const res = await fetch("/admin/encargados");
    const data = await res.json();
    document.getElementById("tabla-encargados").innerHTML = data.map(v => `
        <tr>
            <td>${v.fecha_venta}</td>
            <td>${v.cliente}</td>
            <td>${v.direccion || '-'}</td>
            <td>${v.producto}</td>
            <td>$${v.subtotal}</td>
            <td>
                <select onchange="if(this.value)confirmarEncargo(${v.id}, this.value)">
                    <option value="">Confirmar como:</option>
                    <option value="pagado">Pagado ✅</option>
                    <option value="debe">Debe ❌</option>
                </select>
                <button type="button" onclick="eliminarVenta(${v.id})">Borrar</button>
            </td>
        </tr>
    `).join("");
}

async function confirmarEncargo(id, estado) {
    console.log("Confirmando:", id, "estado:", estado);
    const res = await fetch("/api/cambiar-estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, estado: estado })
    });
    const data = await res.json();
    console.log("Resultado:", data);
    if (res.ok) {
        cargarEncargados();
        cargarVentas();
        cargarDashboard();
    } else {
        alert("Error: " + (data.error || "Unknown"));
    }
}

async function confirmarEncargo(id) {
    console.log("Confirmando encargo:", id);
    const res = await fetch("/api/cambiar-estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, estado: "pagado" })
    });
    const data = await res.json();
    console.log("Resultado:", data);
    if (res.ok) {
        cargarEncargados();
        cargarVentas();
        cargarDashboard();
    } else {
        alert("Error: " + (data.error || "Unknown"));
    }
}

function abrirCambiarEstado(id) {
    document.getElementById("cambio-id").value = id;
    abrirModal("modal-cambiar-estado");
}

document.getElementById("form-cambiar-estado").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("cambio-id").value;
    const estado = document.getElementById("cambio-estado").value;
    
    // Usar el mismo PUT /admin/venta/{id}
    const res = await fetch(`/admin/venta/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagado: estado })
    });
    
    const data = await res.json();
    if (res.ok) {
        cerrarModal("modal-cambiar-estado");
        cargarEncargados();
        cargarVentas();
        cargarDashboard();
    } else {
        alert("Error: " + (data.error || "Unknown"));
    }
};

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
    
    document.getElementById("btn-exportar-caja").href = "/admin/exportar/caja" + (params.toString() ? "?" + params.toString() : "");
    
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
    filtrarVentas();
}

async function filtrarVentas() {
    const fecha_inicio = document.getElementById("ventas-fecha-inicio")?.value || "";
    const fecha_fin = document.getElementById("ventas-fecha-fin")?.value || "";
    
    let url = "/admin/ventas";
    const params = new URLSearchParams();
    if (fecha_inicio) params.append("fecha_inicio", fecha_inicio);
    if (fecha_fin) params.append("fecha_fin", fecha_fin);
    if (params.toString()) url += "?" + params.toString();
    
    document.getElementById("btn-exportar-ventas").href = "/admin/exportar/ventas" + (params.toString() ? "?" + params.toString() : "");
    
    const res = await fetch(url);
    const data = await res.json();
document.getElementById("tabla-ventas").innerHTML = data.map(v => {
        const vid = Number(v.id);
        const estadoActual = v.pagado || "encargado";
        return `<tr>
            <td>${v.fecha_venta}</td>
            <td>${v.cliente}</td>
            <td>${v.producto}</td>
            <td>$${v.subtotal}</td>
            <td>${estadoActual}</td>
            <td>${v.fecha_vencimiento || "-"}</td>
            <td>
                <select onchange="if(this.value)cambiarEstadoVenta(${vid}, this.value)">
                    <option value="">Cambiar a:</option>
                    <option value="encargado" ${estadoActual === 'encargado' ? 'selected' : ''}>En Cargo</option>
                    <option value="pagado" ${estadoActual === 'pagado' ? 'selected' : ''}>Pagado</option>
                    <option value="debe" ${estadoActual === 'debe' ? 'selected' : ''}>Debe</option>
                </select>
                <button type="button" onclick="prepararEdicionVenta(${vid}, '${v.cliente}', '${v.producto}', ${v.kilos}, '${estadoActual}')">Editar</button>
                <button type="button" onclick="eliminarVenta(${vid})">Borrar</button>
            </td>
        </tr>`;
    }).join("");
}

function prepararEdicionVenta(id, cliente, producto, kilos, pagado) {
    abrirModal('modal-editar-venta');
    document.getElementById("edit-venta-id").value = id;
    document.getElementById("edit-venta-cliente").value = cliente;
    document.getElementById("edit-venta-producto").value = producto;
    document.getElementById("edit-venta-gramos").value = Math.round(kilos * 1000);
    document.getElementById("edit-venta-pagado").value = pagado;
}

document.getElementById("form-editar-venta").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-venta-id").value;
    const gramos = parseFloat(document.getElementById("edit-venta-gramos").value);
    const kilos = gramos / 1000;
    const body = {
        kilos: kilos,
        pagado: document.getElementById("edit-venta-pagado").value
    };
    
    const res = await fetch(`/admin/venta/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    if (res.ok) {
        cerrarModal('modal-editar-venta');
        cargarVentas();
        cargarDashboard();
    } else {
        alert("Error al editar venta");
    }
};

function limpiarFiltrosVentas() {
    document.getElementById("ventas-fecha-inicio").value = "";
    document.getElementById("ventas-fecha-fin").value = "";
    filtrarVentas();
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
                ${d.whatsapp_link ? `<a href="${d.whatsapp_link}" target="_blank" class="btn-wa">COBRAR</a>` : ''}
            </td>
            <td>
                ${d.fecha_vencimiento && d.fecha_vencimiento !== 'Sin vencimiento' ? 
                    `<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cobro%20a%20${encodeURIComponent(d.cliente)}&dates=${formatFechaGCal(d.fecha_vencimiento)}/${formatFechaGCal(d.fecha_vencimiento)}&details=Recordatorio%20de%20cobro%20por%20$${d.total.toLocaleString()}" target="_blank" class="btn-cal"><i class="fas fa-bell"></i></a>`
                    : ''}
            </td>
        </tr>
    `).join("");
}

function formatFechaGCal(fecha) {
    if (!fecha || fecha === 'Sin vencimiento') return '';
    const partes = fecha.split('-');
    if (partes.length !== 3) return '';
    return `${partes[0]}${partes[1]}${partes[2]}T000000Z`;
}

// --- 4. LÓGICA DE EDICIÓN (PRE-RELLENADO) ---

function prepararEdicionProd(nombre, info) {
    abrirModal('modal-producto');
    document.getElementById("prod-id").value = info.id;
    document.getElementById("prod-nombre").value = nombre;
    document.getElementById("prod-stock").value = info.stock;
    document.getElementById("prod-minimo").value = info.minimo;
    document.getElementById("prod-precio").value = info.precio_kilo;
    document.getElementById("prod-tipo-original").value = info.tipo || "kilo";
    document.getElementById("prod-tipo").value = info.tipo || "kilo";
    document.getElementById("titulo-modal-prod").innerText = "✏️ Editar " + nombre;
    
    // Actualizar labels
    const tipo = info.tipo || "kilo";
    document.getElementById("label-stock").textContent = tipo === "plato" ? "(platos)" : "(kg)";
    document.getElementById("label-precio").textContent = tipo === "plato" ? "por Plato" : "por Kilo";
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
    const tipo = document.getElementById("prod-tipo").value;
    const stock = tipo === "plato" ? parseInt(document.getElementById("prod-stock").value) : parseFloat(document.getElementById("prod-stock").value);
    const body = {
        nombre: nombre,
        stock: stock,
        minimo: tipo === "plato" ? parseInt(document.getElementById("prod-minimo").value) : parseFloat(document.getElementById("prod-minimo").value),
        precio_kilo: parseFloat(document.getElementById("prod-precio").value),
        tipo: tipo
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

// Manejador para Ventas (soporta kilos, gramos o platos)
document.getElementById("form-venta").onsubmit = async (e) => {
    e.preventDefault();
    
    const select = document.getElementById("venta-producto");
    const tipoProducto = select.options[select.selectedIndex]?.dataset?.tipo || "kilo";
    
    let cantidad = 0;
    let unidad = "kilo";
    
    if (tipoProducto === "plato") {
        const inputPlatos = document.getElementById("venta-platos");
        cantidad = parseInt(inputPlatos?.value || 0);
        if (!cantidad || cantidad <= 0) {
            alert("Ingresa la cantidad de platos");
            return;
        }
        unidad = "plato";
    } else {
        // Productos por kilo: aceptar kilos o gramos
        const inputKilos = document.getElementById("venta-kilos");
        const inputGramos = document.getElementById("venta-gramos");
        
        const kilos = parseFloat(inputKilos?.value || 0);
        const gramos = parseFloat(inputGramos?.value || 0);
        
        if (gramos > 0) {
            cantidad = gramos;
            unidad = "gramos";
        } else if (kilos > 0) {
            cantidad = kilos;
            unidad = "kilo";
        } else {
            alert("Ingresa la cantidad en KILOS o en GRAMOS");
            return;
        }
    }
    
const body = {
        producto: String(select.value),
        cantidad: Number(cantidad),
        unidad: String(unidad),
        cliente_nombre: String(document.getElementById("venta-cliente").value || "Cliente General"),
        direccion: String(document.getElementById("venta-direccion").value || ""),
        pagado: String(document.getElementById("venta-pagado").value || "encargado"),
        fecha_venta: String(document.getElementById("venta-fecha").value || ""),
        fecha_vencimiento: String(document.getElementById("venta-vencimiento").value || ""),
        notas: String("")
    };

    console.log("Enviando a /vender:", JSON.stringify(body));

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

async function cambiarEstadoVenta(id, nuevoEstado) {
    if (!nuevoEstado || !id) return;
    
    const res = await fetch("/api/cambiar-estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, estado: nuevoEstado })
    });
    
    const data = await res.json();
    console.log("Cambiar estado:", data);
    
    if (res.ok) {
        cargarVentas();
        cargarDashboard();
    } else {
        alert("Error: " + (data.error || "Unknown"));
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
    window.productosData = prods;
    document.getElementById("venta-producto").innerHTML = Object.keys(prods).map(p => {
        const prod = prods[p];
        const stock = prod.tipo === "plato" ? `${prod.stock} platos` : `${prod.stock}kg`;
        const precio = prod.tipo === "plato" ? `$${prod.precio_kilo.toLocaleString()}/plato` : `$${prod.precio_kilo.toLocaleString()}/kg`;
        return `<option value="${p}" data-tipo="${prod.tipo}">${p} — Stock: ${stock} — ${precio}</option>`;
    }).join("");
    
    const resC = await fetch("/admin/clientes");
    const clis = await resC.json();
    const opts = clis.map(c => `<option value="${c.nombre}">`).join("");
    document.getElementById("lista-clientes").innerHTML = opts;
    document.getElementById("venta-cliente").innerHTML = `<option value="">Cliente General</option>` + 
        clis.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
}

// Actualizar campos según tipo de producto
function actualizarCamposVenta() {
    const select = document.getElementById("venta-producto");
    if (!select || select.selectedIndex < 0) return;
    
    const tipo = select.options[select.selectedIndex]?.dataset?.tipo || "kilo";
    
    document.getElementById("campo-kilos").style.display = "none";
    document.getElementById("campo-gramos").style.display = "none";
    document.getElementById("campo-platos").style.display = "none";
    
    const campoKilos = document.getElementById("campo-kilos");
    const campoGramos = document.getElementById("campo-gramos");
    const campoPlatos = document.getElementById("campo-platos");
    
    if (tipo === "plato") {
        campoPlatos.style.display = "block";
    } else {
        // Productos por kilo: mostrar ambos campos
        campoKilos.style.display = "block";
        campoGramos.style.display = "block";
    }
}

// Inicializar modal de venta al abrir
function initModalVenta() {
    cargarSelectores();
    // Esperar un momento para que carguen las opciones
    setTimeout(actualizarCamposVenta, 100);
}

// Cambiar labels al crear/editar producto
function cambiarTipoProducto() {
    const tipo = document.getElementById("prod-tipo").value;
    document.getElementById("label-stock").textContent = tipo === "plato" ? "(platos)" : "(kg)";
    document.getElementById("label-precio").textContent = tipo === "plato" ? "por Plato" : "por Kilo";
}

// Verificar rol al cargar
window.currentRol = null;

window.onload = async () => {
    try {
        const res = await fetch("/auth/verificar");
        const data = await res.json();
        window.currentRol = data.rol || "empleado";
        
        if (data.rol !== "admin") {
            const btnUsuarios = document.querySelector('button[onclick*="usuarios"]');
            if (btnUsuarios) btnUsuarios.style.display = "none";
            const tabUsuarios = document.getElementById("tab-usuarios");
            if (tabUsuarios) tabUsuarios.style.display = "none";
            const modalUsuario = document.getElementById("modal-usuario");
            if (modalUsuario) modalUsuario.style.display = "none";
        }
        
        await cargarDashboard();
    } catch (e) {
        window.currentRol = "empleado";
        await cargarDashboard();
    }
};

// Cargar usuarios
async function cargarUsuarios() {
    const res = await fetch("/admin/usuarios");
    if (res.status === 403) {
        document.getElementById("tabla-usuarios").innerHTML = "<tr><td colspan='6'>No tienes permiso para ver usuarios</td></tr>";
        return;
    }
    if (res.status === 401) {
        window.location.href = "/login";
        return;
    }
    if (!res.ok) {
        document.getElementById("tabla-usuarios").innerHTML = "<tr><td colspan='6'>Error cargando usuarios</td></tr>";
        return;
    }
    
    const data = await res.json();
    if (!Array.isArray(data)) {
        document.getElementById("tabla-usuarios").innerHTML = "<tr><td colspan='6'>Error: " + (data.detail || 'Datos invalidos') + "</td></tr>";
        return;
    }
    
    document.getElementById("tabla-usuarios").innerHTML = data.map(u => `
        <tr>
            <td>${u.email || ''}</td>
            <td>${u.nombre || ''}</td>
            <td><span class="badge ${u.rol || 'empleado'}">${u.rol || 'empleado'}</span></td>
            <td>${u.activo ? '<span class="badge ok">Activo</span>' : '<span class="badge">Inactivo</span>'}</td>
            <td>${u.ultimo_login || ''}</td>
            <td>
                <button class="btn-primary" style="background:var(--danger)" onclick="eliminarUsuario(${u.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

async function eliminarUsuario(id) {
    if (!confirm("¿Eliminar usuario?")) return;
    const res = await fetch(`/admin/usuario/${id}`, { method: "DELETE" });
    if (res.ok) cargarUsuarios();
    else alert("Error al eliminar");
}

// Formulario crear usuario
document.getElementById("form-usuario").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
        email: document.getElementById("user-email").value,
        nombre: document.getElementById("user-nombre").value,
        password: document.getElementById("user-password").value,
        rol: document.getElementById("user-rol").value
    };
    const res = await fetch("/admin/usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else {
        cerrarModal("modal-usuario");
        cargarUsuarios();
    }
};