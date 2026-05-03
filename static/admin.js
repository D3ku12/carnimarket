/**
 * CARNIMARKET - Sistema de Gestión Profesional v11.0
 * UX Premium — Toasts, Dark Mode, Bottom Bar, Card Tables
 */

let chartProductos = null;

// === TOAST SYSTEM ===
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }
    const icons = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i><span>${message}</span><div class="toast-progress"></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// === CUSTOM CONFIRM ===
function showConfirm(title, msg, onYes) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box">
        <div class="confirm-icon">⚠️</div><h4>${title}</h4><p>${msg}</p>
        <div class="confirm-actions">
            <button class="btn-secondary" id="confirm-no">Cancelar</button>
            <button class="btn-primary" style="background:var(--danger)" id="confirm-yes">Eliminar</button>
        </div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-no').onclick = () => overlay.remove();
    overlay.querySelector('#confirm-yes').onclick = () => { overlay.remove(); onYes(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// === DARK MODE ===
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('cm-theme', isDark ? 'light' : 'dark');
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}
(function() {
    const saved = localStorage.getItem('cm-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        setTimeout(() => { const i = document.querySelector('#theme-toggle i'); if(i) i.className='fas fa-sun'; }, 0);
    }
})();

// === LOGOUT ===
function logout() {
    document.cookie = 'access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
}

// === MORE MENU (MOBILE) ===
function toggleMoreMenu() {
    const menu = document.getElementById('more-menu');
    menu.classList.toggle('open');
}
document.addEventListener('click', e => {
    const menu = document.getElementById('more-menu');
    const btn = document.getElementById('btn-more');
    if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
        menu.classList.remove('open');
    }
});

// === NAVIGATION ===
async function showTab(name, btn) {
    if (name === "usuarios" && window.currentRol !== "admin") return;
    
    // Show loading skeleton for tables
    const tbody = document.getElementById('tabla-' + (name === 'dashboard' ? '' : name));
    if (tbody && name !== 'dashboard' && name !== 'caja') {
        tbody.innerHTML = Array(5).fill('<tr><td colspan="10"><div class="skeleton skeleton-row"></div></td></tr>').join('');
    }

    // Close more menu
    const moreMenu = document.getElementById('more-menu');
    if (moreMenu) moreMenu.classList.remove('open');

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + name);
    if (tabEl) tabEl.classList.add('active');

    // Sync both navs
    document.querySelectorAll('.nav-top button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.bottom-bar button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.more-menu button').forEach(b => b.classList.remove('active'));

    // Activate matching buttons
    if (btn) btn.classList.add('active');
    document.querySelectorAll(`[data-tab="${name}"]`).forEach(b => b.classList.add('active'));
    document.querySelectorAll('.nav-top button').forEach(b => {
        if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + name + "'")) b.classList.add('active');
    });

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

// === MODALS ===
function abrirModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('open');
    const form = modal.querySelector('form');
    if (form) form.querySelectorAll('input:not([type="hidden"])').forEach(input => input.value = "");
    if (id === 'modal-venta') initModalVenta();
    if (id === 'modal-producto') { document.getElementById("prod-tipo").value = "kilo"; cambiarTipoProducto(); }
}
function cerrarModal(id) {
    document.getElementById(id).classList.remove('open');
}
// Close modal on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
        e.target.classList.remove('open');
    }
});

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        if (btn) btn.innerHTML = input.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    }
}

// --- FUNCIONES DE CARGA (FETCH) ---

function getEmptyState(message, icon = 'fa-folder-open') {
    return `<tr><td colspan="10"><div class="empty-state"><i class="fas ${icon}"></i><p>${message}</p></div></td></tr>`;
}

async function filtrarDashboard() {
    const periodo = document.getElementById("dashboard-periodo")?.value || "7dias";
    document.getElementById("stats-dashboard").innerHTML = Array(5).fill('<div class="skeleton skeleton-stat"></div>').join('');
    
    try {
        const res = await fetch(`/admin/dashboard?periodo=${periodo}`);
        const resCaja = await fetch("/admin/caja");
        const data = await res.json();
        const caja = await resCaja.json();

        const labels = {"hoy": "Hoy", "7dias": "Últimos 7 días", "30dias": "Último mes", "todo": "Todo el tiempo"};
        document.getElementById("stats-dashboard").innerHTML = `
            <div class="stat green">
                <i class="fas fa-wallet stat-icon"></i>
                <span class="valor">$${caja.saldo_real.toLocaleString()}</span>
                <span class="label">Caja Actual</span>
            </div>
            <div class="stat">
                <i class="fas fa-chart-line stat-icon"></i>
                <span class="valor">$${(data.total_periodo || data.total_hoy).toLocaleString()}</span>
                <span class="label">${labels[periodo] || periodo}</span>
            </div>
            <div class="stat">
                <i class="fas fa-calendar-day stat-icon"></i>
                <span class="valor">$${data.total_hoy.toLocaleString()}</span>
                <span class="label">Hoy</span>
            </div>
            <div class="stat amber">
                <i class="fas fa-hand-holding-dollar stat-icon"></i>
                <span class="valor">$${caja.pendiente?.toLocaleString() || 0}</span>
                <span class="label">Por Cobrar</span>
            </div>
            <div class="stat red">
                <i class="fas fa-file-invoice-dollar stat-icon"></i>
                <span class="valor">$${caja.egresos.toLocaleString()}</span>
                <span class="label">Gastos</span>
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
                    backgroundColor: 'rgba(196, 69, 54, 0.8)',
                    hoverBackgroundColor: '#c44536',
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        document.getElementById("alertas-stock").innerHTML = data.stock_bajo.map(p => `
            <div class="alerta-item">
                <span><i class="fas fa-box" style="color:var(--text-muted); margin-right:8px;"></i> ${p.nombre}</span>
                <span class="tag-rojo">${p.stock}kg</span>
            </div>
        `).join("") || `<div class="empty-state" style="padding:20px;"><i class="fas fa-check-circle" style="color:var(--success); opacity:1;"></i><p>Inventario al día</p></div>`;
    } catch(e) {
        showToast("Error cargando dashboard", "error");
    }
}

async function cargarDashboard() {
    filtrarDashboard();
}

async function cargarInventario() {
    try {
        const res = await fetch("/inventario");
        const data = await res.json();
        const tbody = document.getElementById("tabla-admin");
        
        if (Object.keys(data).length === 0) {
            tbody.innerHTML = getEmptyState("No hay productos en el inventario", "fa-box-open");
            return;
        }

        tbody.innerHTML = Object.entries(data).map(([nombre, info]) => {
            const stock = info.tipo === "plato" ? `${info.stock} platos` : `${info.stock}kg`;
            const precio = info.tipo === "plato" ? `$${info.precio_kilo.toLocaleString()}/plato` : `$${info.precio_kilo.toLocaleString()}/kg`;
            const tipoLabel = info.tipo === "plato" ? "🥩 Plato" : "🥩 Kilo";
            return `
            <tr>
                <td data-label="Corte"><strong>${nombre}</strong><br><small style="color:var(--text-muted)">${tipoLabel}</small></td>
                <td data-label="Stock"><span class="${info.stock <= info.minimo ? 'tag-rojo' : ''}">${stock}</span></td>
                <td data-label="Precio/Kg">${precio}</td>
                <td data-label="Acciones">
                    <button class="btn-primary" onclick="prepararEdicionProd('${nombre.replaceAll("'", "\\'")}', ${JSON.stringify(info).replaceAll('"', '&quot;')})"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn-primary" style="background:var(--danger)" onclick="eliminarProducto(${info.id})"><i class="fas fa-trash"></i> Borrar</button>
                </td>
            </tr>
        `}).join("");
    } catch(e) { showToast("Error cargando inventario", "error"); }
}

async function cargarClientes() {
    try {
        const res = await fetch("/admin/clientes");
        const data = await res.json();
        if (data.length === 0) {
            document.getElementById("tabla-clientes").innerHTML = getEmptyState("No hay clientes registrados", "fa-users");
            return;
        }
        document.getElementById("tabla-clientes").innerHTML = data.map(c => `
            <tr>
                <td data-label="Nombre"><strong>${c.nombre}</strong></td>
                <td data-label="Teléfono">${c.telefono || '-'}</td>
                <td data-label="Dirección">${c.direccion || '-'}</td>
                <td data-label="Acciones">
                    <button class="btn-primary" onclick="prepararEdicionCli(${JSON.stringify(c).replaceAll('"', '&quot;')})"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn-primary" style="background:var(--danger)" onclick="eliminarCliente(${c.id})"><i class="fas fa-trash"></i> Borrar</button>
                </td>
            </tr>
        `).join("");
    } catch(e) { showToast("Error cargando clientes", "error"); }
}

async function cargarGastos() {
    try {
        const res = await fetch("/admin/gastos");
        const data = await res.json();
        if (data.length === 0) {
            document.getElementById("tabla-gastos").innerHTML = getEmptyState("No hay gastos registrados", "fa-receipt");
            return;
        }
        document.getElementById("tabla-gastos").innerHTML = data.map(g => `
            <tr>
                <td data-label="Fecha">${g.fecha}</td>
                <td data-label="Descripción">${g.descripcion}</td>
                <td data-label="Categoría"><span class="badge info">${g.categoria}</span></td>
                <td data-label="Monto" style="color:var(--danger); font-weight:600;">-$${g.monto.toLocaleString()}</td>
                <td data-label="Acciones">
                    <button class="btn-primary" style="background:var(--danger)" onclick="eliminarGasto(${g.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join("");
    } catch(e) { showToast("Error cargando gastos", "error"); }
}

async function cargarEncargados() {
    try {
        const res = await fetch("/admin/encargados");
        const data = await res.json();
        if (data.length === 0) {
            document.getElementById("tabla-encargados").innerHTML = getEmptyState("No hay encargos pendientes", "fa-clock");
            return;
        }
        document.getElementById("tabla-encargados").innerHTML = data.map(v => `
            <tr>
                <td data-label="Fecha">${v.fecha_venta}</td>
                <td data-label="Cliente">${v.cliente}</td>
                <td data-label="Dirección">${v.direccion || '-'}</td>
                <td data-label="Detalle">${v.producto}</td>
                <td data-label="Total" style="font-weight:600;">$${v.subtotal.toLocaleString()}</td>
                <td data-label="Acción">
                    <select onchange="if(this.value)confirmarEncargo(${v.id}, this.value)">
                        <option value="">Confirmar como:</option>
                        <option value="pagado">Pagado ✅</option>
                        <option value="debe">Debe ❌</option>
                    </select>
                    <button class="btn-primary" style="background:var(--danger)" onclick="eliminarVenta(${v.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join("");
    } catch(e) { showToast("Error cargando encargos", "error"); }
}

async function confirmarEncargo(id, estado) {
    const res = await fetch("/api/cambiar-estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, estado: estado })
    });
    const data = await res.json();
    if (res.ok) {
        showToast("Encargo confirmado exitosamente", "success");
        cargarEncargados();
        cargarDashboard();
    } else {
        showToast(data.error || "Error al confirmar", "error");
    }
}

document.getElementById("form-cambiar-estado").onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById("cambio-id").value;
    const estado = document.getElementById("cambio-estado").value;
    
    const res = await fetch(`/admin/venta/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagado: estado })
    });
    
    if (res.ok) {
        showToast("Estado actualizado", "success");
        cerrarModal("modal-cambiar-estado");
        cargarEncargados();
        cargarDashboard();
    } else {
        showToast("Error al actualizar estado", "error");
    }
};

async function cargarCaja() {
    filtrarCaja();
}

async function filtrarCaja() {
    document.getElementById("stats-caja").innerHTML = Array(6).fill('<div class="skeleton skeleton-stat"></div>').join('');
    const fecha_inicio = document.getElementById("caja-fecha-inicio")?.value || "";
    const fecha_fin = document.getElementById("caja-fecha-fin")?.value || "";
    
    let url = "/admin/caja-detalle";
    const params = new URLSearchParams();
    if (fecha_inicio) params.append("fecha_inicio", fecha_inicio);
    if (fecha_fin) params.append("fecha_fin", fecha_fin);
    if (params.toString()) url += "?" + params.toString();
    
    document.getElementById("btn-exportar-caja").href = "/admin/exportar/caja" + (params.toString() ? "?" + params.toString() : "");
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Error HTTP: " + res.status);
        const data = await res.json();
        
        document.getElementById("stats-caja").innerHTML = `
        <div class="stat green">
            <i class="fas fa-check-circle stat-icon"></i>
            <span class="valor">$${(data.ventas_pagadas || 0).toLocaleString()}</span>
            <span class="label">Pagadas</span>
        </div>
        <div class="stat amber">
            <i class="fas fa-clock stat-icon"></i>
            <span class="valor">$${(data.ventas_deben || 0).toLocaleString()}</span>
            <span class="label">Deben</span>
        </div>
        <div class="stat cyan">
            <i class="fas fa-hourglass-half stat-icon"></i>
            <span class="valor">$${(data.pendiente || 0).toLocaleString()}</span>
            <span class="label">Pendiente</span>
        </div>
        <div class="stat">
            <i class="fas fa-sigma stat-icon"></i>
            <span class="valor">$${(data.total_ventas || 0).toLocaleString()}</span>
            <span class="label">Total</span>
        </div>
        <div class="stat red">
            <i class="fas fa-minus-circle stat-icon"></i>
            <span class="valor">$${(data.gastos || 0).toLocaleString()}</span>
            <span class="label">Gastos</span>
        </div>
        <div class="stat green" style="border: 2px solid var(--success)">
            <i class="fas fa-vault stat-icon"></i>
            <span class="valor">$${(data.saldo_real || 0).toLocaleString()}</span>
            <span class="label">Caja Real</span>
        </div>
    `;
    } catch (e) {
        showToast("Error cargando caja", "error");
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
    const tbody = document.getElementById("tabla-ventas");
    
    let url = "/admin/ventas";
    const params = new URLSearchParams();
    if (fecha_inicio) params.append("fecha_inicio", fecha_inicio);
    if (fecha_fin) params.append("fecha_fin", fecha_fin);
    if (params.toString()) url += "?" + params.toString();
    
    document.getElementById("btn-exportar-ventas").href = "/admin/exportar/ventas" + (params.toString() ? "?" + params.toString() : "");
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.length === 0) {
            tbody.innerHTML = getEmptyState("No hay ventas en este período", "fa-cash-register");
            return;
        }

        tbody.innerHTML = data.map(v => {
            const vid = Number(v.id);
            const estadoActual = v.pagado || "encargado";
            const montoPagado = v.monto_pagado || 0;
            const saldo = v.subtotal - montoPagado;
            const cantidadMostrar = v.kilos ? `${v.kilos}kg` : `${v.cantidad || 0}kg`;
            const badgeClass = estadoActual === 'pagado' ? 'pagado' : (estadoActual === 'debe' ? 'debe' : 'encargado');
            
            return `<tr>
                <td data-label="Fecha">${v.fecha_venta}</td>
                <td data-label="Cliente"><strong>${v.cliente}</strong></td>
                <td data-label="Detalle">${v.producto} <small style="color:var(--text-muted)">(${cantidadMostrar})</small></td>
                <td data-label="Total">$${v.subtotal.toLocaleString()}</td>
                <td data-label="Abono">$${montoPagado.toLocaleString()}</td>
                <td data-label="Saldo" style="color:${saldo > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:bold;">$${saldo.toLocaleString()}</td>
                <td data-label="Estado"><span class="badge ${badgeClass}">${estadoActual}</span></td>
                <td data-label="Vencimiento">${v.fecha_vencimiento || "-"}</td>
                <td data-label="Acción">
                    <select onchange="if(this.value)cambiarEstadoVenta(${vid}, this.value, ${saldo})">
                        <option value="">Cambiar a:</option>
                        <option value="encargado" ${estadoActual === 'encargado' ? 'selected' : ''}>En Cargo</option>
                        <option value="pagado" ${estadoActual === 'pagado' ? 'selected' : ''}>Pagado</option>
                        <option value="debe" ${estadoActual === 'debe' ? 'selected' : ''}>Debe</option>
                    </select>
                    ${(saldo > 0 && estadoActual === 'debe') ? `<button type="button" class="btn-primary" style="background:var(--success)" onclick="abrirAbonoModal(${vid}, ${saldo}, ${v.subtotal})"><i class="fas fa-hand-holding-dollar"></i> Abonar</button>` : ''}
                    <button type="button" class="btn-primary" onclick="prepararEdicionVenta(${vid}, '${v.cliente}', '${v.producto}', ${v.kilos}, ${montoPagado}, '${estadoActual}')"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-primary" style="background:var(--danger)" onclick="eliminarVenta(${vid})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join("");
    } catch(e) { showToast("Error cargando ventas", "error"); }
}

function prepararEdicionVenta(id, cliente, producto, kilos, montoPagado, pagado) {
    abrirModal('modal-editar-venta');
    document.getElementById("edit-venta-id").value = id;
    document.getElementById("edit-venta-cliente").value = cliente;
    document.getElementById("edit-venta-producto").value = producto;
    document.getElementById("edit-venta-gramos").value = Math.round(kilos * 1000);
    document.getElementById("edit-venta-abono").value = montoPagado;
    document.getElementById("edit-venta-pagado").value = pagado;
}

document.getElementById("form-editar-venta").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const id = document.getElementById("edit-venta-id").value;
        const gramos = parseFloat(document.getElementById("edit-venta-gramos").value);
        const kilos = gramos / 1000;
        const montoPagado = Number(document.getElementById("edit-venta-abono").value);
        const body = { kilos: kilos, monto_pagado: montoPagado, pagado: document.getElementById("edit-venta-pagado").value };
        
        const res = await fetch(`/admin/venta/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        if (res.ok) {
            showToast("Venta actualizada correctamente", "success");
            cerrarModal('modal-editar-venta');
            cargarVentas();
            cargarDashboard();
        } else throw new Error();
    } catch(err) {
        showToast("Error al editar venta", "error");
    } finally {
        btn.innerHTML = 'Guardar Cambios';
        btn.disabled = false;
    }
};

function limpiarFiltrosVentas() {
    document.getElementById("ventas-fecha-inicio").value = "";
    document.getElementById("ventas-fecha-fin").value = "";
    filtrarVentas();
}

async function cargarDeudas() {
    try {
        const res = await fetch("/admin/deudas");
        const data = await res.json();
        if (data.deudas.length === 0) {
            document.getElementById("tabla-deudas").innerHTML = getEmptyState("No hay deudas pendientes", "fa-check-circle");
            return;
        }
        document.getElementById("tabla-deudas").innerHTML = data.deudas.map(d => `
            <tr>
                <td data-label="Cliente"><strong>${d.cliente}</strong></td>
                <td data-label="Total" style="color:var(--danger); font-weight:bold;">$${d.total.toLocaleString()}</td>
                <td data-label="Dirección">${d.direccion || 'N/A'}</td>
                <td data-label="Vencimiento"><span class="badge ${d.fecha_vencimiento==='Sin vencimiento'?'':'debe'}">${d.fecha_vencimiento}</span></td>
                <td data-label="WhatsApp">
                    ${d.whatsapp_link ? `<a href="${d.whatsapp_link}" target="_blank" class="btn-wa"><i class="fab fa-whatsapp"></i> COBRAR</a>` : ''}
                </td>
                <td data-label="Calendario">
                    ${d.fecha_vencimiento && d.fecha_vencimiento !== 'Sin vencimiento' ? 
                        `<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cobro%20a%20${encodeURIComponent(d.cliente)}&dates=${formatFechaGCal(d.fecha_vencimiento)}/${formatFechaGCal(d.fecha_vencimiento)}&details=Recordatorio%20de%20cobro%20por%20$${d.total.toLocaleString()}" target="_blank" class="btn-cal"><i class="fas fa-calendar-plus"></i></a>`
                        : ''}
                </td>
            </tr>
        `).join("");
    } catch(e) { showToast("Error cargando deudas", "error"); }
}

function formatFechaGCal(fecha) {
    if (!fecha || fecha === 'Sin vencimiento') return '';
    const partes = fecha.split('-');
    if (partes.length !== 3) return '';
    return `${partes[0]}${partes[1]}${partes[2]}T000000Z`;
}

// --- LÓGICA DE EDICIÓN ---

function prepararEdicionProd(nombre, info) {
    abrirModal('modal-producto');
    initModalProd();
    document.getElementById("prod-id").value = info.id;
    document.getElementById("prod-nombre").value = nombre;
    const stockKilos = Math.floor(info.stock);
    const stockGramos = Math.round((info.stock - stockKilos) * 1000);
    document.getElementById("prod-stock").value = stockKilos;
    document.getElementById("prod-gramos").value = stockGramos;
    document.getElementById("prod-minimo").value = info.minimo;
    document.getElementById("prod-precio").value = info.precio_kilo;
    document.getElementById("prod-tipo-original").value = info.tipo || "kilo";
    document.getElementById("prod-tipo").value = info.tipo || "kilo";
    document.getElementById("titulo-modal-prod").innerHTML = "<i class='fas fa-edit'></i> Editar " + nombre;
    
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

// --- ENVÍO DE FORMULARIOS ---

document.getElementById("form-producto").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const id = document.getElementById("prod-id").value;
        const nombre = document.getElementById("prod-nombre").value;
        const tipo = document.getElementById("prod-tipo").value;
        
        const kilos = parseFloat(document.getElementById("prod-stock").value || 0);
        const gramos = parseFloat(document.getElementById("prod-gramos").value || 0);
        const stockTotal = kilos + (gramos / 1000);
        
        const body = {
            nombre: nombre, stock: stockTotal,
            minimo: tipo === "plato" ? parseInt(document.getElementById("prod-minimo").value) : parseFloat(document.getElementById("prod-minimo").value),
            precio_kilo: parseFloat(document.getElementById("prod-precio").value),
            tipo: tipo
        };

        const url = id ? `/admin/producto/${id}` : "/admin/producto";
        const res = await fetch(url, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        showToast(id ? "Producto actualizado" : "Producto creado", "success");
        cerrarModal('modal-producto');
        cargarInventario();
    } catch(err) {
        showToast(err.message || "Error al guardar producto", "error");
    } finally {
        btn.innerHTML = 'Guardar Cambios';
        btn.disabled = false;
    }
};

document.getElementById("form-cliente").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
        const id = document.getElementById("cli-id").value;
        const body = {
            nombre: document.getElementById("cli-nombre").value,
            telefono: document.getElementById("cli-tel").value,
            direccion: document.getElementById("cli-dir").value
        };

        const res = await fetch(id ? `/admin/cliente/${id}` : "/admin/cliente", {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        showToast(id ? "Cliente actualizado" : "Cliente registrado", "success");
        cerrarModal('modal-cliente');
        cargarClientes();
    } catch(err) {
        showToast(err.message, "error");
    } finally { btn.disabled = false; }
};

document.getElementById("form-gasto").onsubmit = async (e) => {
    e.preventDefault();
    try {
        const body = {
            descripcion: document.getElementById("gasto-desc").value,
            categoria: document.getElementById("gasto-cat").value,
            monto: parseFloat(document.getElementById("gasto-monto").value)
        };
        const res = await fetch("/admin/gasto", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        showToast("Gasto registrado", "success");
        cerrarModal('modal-gasto');
        cargarGastos();
        cargarDashboard();
    } catch(err) { showToast(err.message, "error"); }
};

document.getElementById("form-venta").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;
    
    try {
        const select = document.getElementById("venta-producto");
        const tipoProducto = select.options[select.selectedIndex]?.dataset?.tipo || "kilo";
        let cantidad = 0; let unidad = "kilo";
        
        if (tipoProducto === "plato") {
            cantidad = parseInt(document.getElementById("venta-platos")?.value || 0);
            if (cantidad <= 0) throw new Error("Ingresa la cantidad de platos");
            unidad = "plato";
        } else {
            const kilos = parseFloat(document.getElementById("venta-kilos")?.value || 0);
            const gramos = parseFloat(document.getElementById("venta-gramos")?.value || 0);
            const totalKilos = kilos + (gramos / 1000);
            if (totalKilos <= 0) throw new Error("Ingresa la cantidad en KILOS o GRAMOS");
            cantidad = totalKilos;
            unidad = "kilo";
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
            notas: ""
        };

        const res = await fetch("/vender", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        
        showToast("Venta registrada exitosamente", "success");
        cerrarModal('modal-venta');
        cargarVentas();
        cargarDashboard();
    } catch(err) {
        showToast(err.message, "error");
    } finally {
        btn.innerHTML = 'Guardar Venta';
        btn.disabled = false;
    }
};

// --- UTILIDADES ---

async function cambiarEstadoVenta(id, nuevoEstado, saldo) {
    if (!nuevoEstado || !id) return;
    if (saldo <= 0 && nuevoEstado !== "pagado") {
        showToast("Esta venta ya está pagada. Solo puede cambiar a pagado.", "warning");
        cargarVentas();
        return;
    }
    const res = await fetch("/api/cambiar-estado", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, estado: nuevoEstado })
    });
    if (res.ok) {
        showToast("Estado de venta actualizado", "success");
        cargarVentas(); cargarDashboard();
    } else showToast("Error al actualizar estado", "error");
}

function eliminarCliente(id) {
    showConfirm("Eliminar Cliente", "¿Estás seguro de eliminar este cliente?", async () => {
        const res = await fetch(`/admin/cliente/${id}`, { method: "DELETE" });
        if(res.ok) { showToast("Cliente eliminado", "success"); cargarClientes(); }
        else showToast("Error al eliminar", "error");
    });
}

function eliminarProducto(id) {
    showConfirm("Eliminar Producto", "Se perderá todo el historial asociado. ¿Continuar?", async () => {
        const res = await fetch(`/admin/producto/${id}`, { method: "DELETE" });
        if(res.ok) { showToast("Producto eliminado", "success"); cargarInventario(); }
        else showToast("Error al eliminar", "error");
    });
}

function eliminarVenta(id) {
    showConfirm("Eliminar Venta", "Se restaurará el stock del producto. ¿Continuar?", async () => {
        const res = await fetch(`/admin/venta/${id}`, { method: "DELETE" });
        if(res.ok) { showToast("Venta eliminada", "success"); cargarVentas(); cargarDashboard(); }
        else showToast("Error al eliminar", "error");
    });
}

function eliminarGasto(id) {
    showConfirm("Eliminar Gasto", "¿Estás seguro de eliminar este gasto?", async () => {
        const res = await fetch(`/admin/gasto/${id}`, { method: "DELETE" });
        if(res.ok) { showToast("Gasto eliminado", "success"); cargarGastos(); cargarDashboard(); }
        else showToast("Error al eliminar", "error");
    });
}

function abrirAbonoModal(id, saldo, total) {
    document.getElementById("abono-id").value = id;
    document.getElementById("abono-saldo").textContent = "Saldo: $" + saldo.toLocaleString() + " | Total: $" + total.toLocaleString();
    document.getElementById("abono-id").dataset.saldo = saldo;
    document.getElementById("abono-id").dataset.total = total;
    abrirModal("modal-abono");
}

async function registrarAbono() {
    const id = document.getElementById("abono-id").value;
    const saldo = Number(document.getElementById("abono-id").dataset.saldo);
    const monto = Number(document.getElementById("abono-monto").value);
    
    if (!id || isNaN(monto) || monto <= 0) { showToast("Ingrese un monto válido", "error"); return; }
    if (monto > saldo) { showToast("No puede abonar más del saldo: $" + saldo, "warning"); return; }
    
    const res = await fetch("/api/registrar-abono", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: Number(id), monto: monto })
    });
    
    if (res.ok) {
        showToast("Abono registrado", "success");
        cerrarModal("modal-abono");
        cargarVentas(); cargarDashboard();
    } else showToast("Error al registrar abono", "error");
}

async function cargarSelectores() {
    const resP = await fetch("/inventario");
    const prods = await resP.json();
    window.productosData = prods;
    document.getElementById("venta-producto").innerHTML = '<option value="">Selecciona un corte...</option>' + Object.keys(prods).map(p => {
        const prod = prods[p];
        const stock = prod.tipo === "plato" ? `${prod.stock} platos` : `${prod.stock}kg`;
        const precio = prod.tipo === "plato" ? `$${prod.precio_kilo.toLocaleString()}/plato` : `$${prod.precio_kilo.toLocaleString()}/kg`;
        return `<option value="${p}" data-tipo="${prod.tipo}">${p} — Stock: ${stock} — ${precio}</option>`;
    }).join("");
    
    const resC = await fetch("/admin/clientes");
    const clis = await resC.json();
    window.clientesData = clis;
    document.getElementById("lista-clientes").innerHTML = clis.map(c => `<option value="${c.nombre}">`).join("");
    document.getElementById("venta-cliente").innerHTML = `<option value="">Cliente General</option>` + clis.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
}

function cargarDireccionCliente() {
    const nombre = document.getElementById("venta-cliente").value;
    const cliente = window.clientesData?.find(c => c.nombre === nombre);
    if (cliente && cliente.direccion) document.getElementById("venta-direccion").value = cliente.direccion;
}

function actualizarCamposVenta() {
    const select = document.getElementById("venta-producto");
    if (!select || select.selectedIndex <= 0) return;
    const tipo = select.options[select.selectedIndex]?.dataset?.tipo || "kilo";
    
    document.getElementById("campo-kilos").style.display = tipo === "plato" ? "none" : "block";
    document.getElementById("campo-gramos").style.display = tipo === "plato" ? "none" : "block";
    document.getElementById("campo-platos").style.display = tipo === "plato" ? "block" : "none";
}

function initModalVenta() {
    cargarSelectores();
    setTimeout(actualizarCamposVenta, 100);
}

function cambiarTipoProducto() {
    const tipo = document.getElementById("prod-tipo").value;
    document.getElementById("label-stock").textContent = tipo === "plato" ? "(platos)" : "(kg)";
    document.getElementById("label-precio").textContent = tipo === "plato" ? "por Plato" : "por Kilo";
    const campoGramos = document.getElementById("prod-gramos");
    if (campoGramos && campoGramos.parentElement) campoGramos.parentElement.style.display = tipo === "plato" ? "none" : "";
}

function initModalProd() { cambiarTipoProducto(); }

window.currentRol = null;
window.onload = async () => {
    try {
        const res = await fetch("/auth/verificar");
        const data = await res.json();
        window.currentRol = data.rol || "empleado";
        
        // Update user badge in header
        const userNameEl = document.getElementById('user-name-display');
        if (userNameEl) {
            userNameEl.innerHTML = `<strong>${data.sub ? data.sub.split('@')[0] : 'Usuario'}</strong> <span class="badge ${data.rol}" style="font-size:0.55rem; padding:2px 6px;">${data.rol.toUpperCase()}</span>`;
        }
        
        if (data.rol !== "admin") {
            document.querySelectorAll('button[onclick*="usuarios"], [data-tab="usuarios"]').forEach(b => b.style.display = "none");
            const tabUsuarios = document.getElementById("tab-usuarios");
            if (tabUsuarios) tabUsuarios.style.display = "none";
        }
        await cargarDashboard();
    } catch (e) {
        window.currentRol = "empleado";
        await cargarDashboard();
    }
};

async function cargarUsuarios() {
    try {
        const res = await fetch("/admin/usuarios");
        const data = await res.json();
        
        if (!res.ok || !Array.isArray(data)) {
            document.getElementById("tabla-usuarios").innerHTML = getEmptyState(data.error || "Error cargando usuarios", "fa-user-times");
            return;
        }
        if (data.length === 0) {
            document.getElementById("tabla-usuarios").innerHTML = getEmptyState("No hay usuarios", "fa-users");
            return;
        }
        
        document.getElementById("tabla-usuarios").innerHTML = data.map(u => `
            <tr>
                <td data-label="Email">${u.email || ''}</td>
                <td data-label="Nombre"><strong>${u.nombre || ''}</strong></td>
                <td data-label="Rol"><span class="badge ${u.rol || 'empleado'}">${u.rol || 'empleado'}</span></td>
                <td data-label="Estado">${u.activo ? '<span class="badge pagado">Activo</span>' : '<span class="badge debe">Inactivo</span>'}</td>
                <td data-label="Último Login">${u.ultimo_login || '-'}</td>
                <td data-label="Acciones">
                    <button class="btn-primary" onclick="prepararEdicionUsuario(${u.id}, '${u.email}', '${u.nombre}', '${u.rol}', ${u.activo})"><i class="fas fa-edit"></i></button>
                    <button class="btn-primary" style="background:var(--danger)" onclick="eliminarUsuario(${u.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join("");
    } catch(e) { showToast("Error", "error"); }
}

function prepararEdicionUsuario(id, email, nombre, rol, activo) {
    abrirModal("modal-usuario");
    document.getElementById("user-id").value = id;
    document.getElementById("user-email").value = email;
    document.getElementById("user-email").readOnly = true; // No permitimos cambiar email
    document.getElementById("user-nombre").value = nombre;
    document.getElementById("user-password").required = false;
    document.getElementById("pwd-help").style.display = "inline";
    document.getElementById("user-rol").value = rol;
    document.getElementById("user-activo").value = activo ? "true" : "false";
    document.getElementById("group-activo").style.display = "block";
    document.getElementById("titulo-modal-usuario").innerHTML = '<i class="fas fa-user-edit"></i> Editar Usuario';
    document.getElementById("btn-submit-usuario").textContent = "Guardar Cambios";
}

// Override abrirModal para limpiar estado de edición al crear nuevo
const originalAbrirModal = abrirModal;
abrirModal = function(id) {
    originalAbrirModal(id);
    if (id === "modal-usuario") {
        document.getElementById("user-id").value = "";
        document.getElementById("user-email").readOnly = false;
        document.getElementById("user-password").required = true;
        document.getElementById("pwd-help").style.display = "none";
        document.getElementById("group-activo").style.display = "none";
        document.getElementById("titulo-modal-usuario").innerHTML = '<i class="fas fa-user-gear"></i> Nuevo Usuario';
        document.getElementById("btn-submit-usuario").textContent = "Crear Usuario";
    }
};

function eliminarUsuario(id) {
    showConfirm("Eliminar Usuario", "¿Estás seguro de eliminar este usuario?", async () => {
        const res = await fetch(`/admin/usuario/${id}`, { method: "DELETE" });
        if (res.ok) { showToast("Usuario eliminado", "success"); cargarUsuarios(); }
        else showToast("Error al eliminar", "error");
    });
}

document.getElementById("form-usuario").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-usuario");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const id = document.getElementById("user-id").value;
        const body = {
            email: document.getElementById("user-email").value,
            nombre: document.getElementById("user-nombre").value,
            rol: document.getElementById("user-rol").value
        };
        
        const pwd = document.getElementById("user-password").value;
        if (pwd) body.password = pwd;
        
        if (id) {
            body.activo = document.getElementById("user-activo").value === "true";
        }

        const url = id ? `/admin/usuario/${id}` : "/admin/usuario";
        const method = id ? "PUT" : "POST";

        const res = await fetch(url, {
            method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        showToast(id ? "Usuario actualizado" : "Usuario creado", "success");
        cerrarModal("modal-usuario");
        cargarUsuarios();
    } catch(err) { 
        showToast(err.message, "error"); 
    } finally {
        btn.innerHTML = document.getElementById("user-id").value ? "Guardar Cambios" : "Crear Usuario";
        btn.disabled = false;
    }
};