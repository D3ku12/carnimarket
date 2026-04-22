let chartProductos = null;

async function showTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');

    if (name === 'dashboard') cargarDashboard();
    if (name === 'inventario') cargarInventario();
    if (name === 'ventas') cargarVentas();
    if (name === 'deudas') cargarDeudas();
    if (name === 'historial') cargarHistorial();
}

async function cargarDashboard() {
    const res = await fetch("/admin/dashboard");
    const data = await res.json();
    
    document.getElementById("stats-dashboard").innerHTML = `
        <div class="stat">
            <span class="valor">$${data.total_hoy.toLocaleString()}</span>
            <span class="label">Ventas Hoy (COL)</span>
        </div>
        <div class="stat" style="border-left-color: var(--success)">
            <span class="valor">$${data.total_mes.toLocaleString()}</span>
            <span class="label">Total Mes</span>
        </div>
        <div class="stat" style="border-left-color: var(--warning)">
            <span class="valor">${data.stock_bajo.length}</span>
            <span class="label">Alertas de Stock</span>
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
                hoverBackgroundColor: '#e74c3c',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    const alertasDiv = document.getElementById("alertas-stock");
    alertasDiv.innerHTML = data.stock_bajo.length ? data.stock_bajo.map(p => `
        <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
            <span>${p.nombre}</span>
            <b style="color: var(--danger)">${p.stock} kg</b>
        </div>
    `).join("") : "<p>✅ Stock bajo control</p>";
}

async function cargarInventario() {
    const res = await fetch("/inventario");
    const data = await res.json();
    const tbody = document.getElementById("tabla-admin");
    tbody.innerHTML = Object.entries(data).map(([nombre, info]) => `
        <tr>
            <td><b>${nombre}</b></td>
            <td>${info.stock} kg</td>
            <td>$${info.precio_kilo.toLocaleString()}</td>
            <td><span class="badge ${info.stock <= info.minimo ? 'debe' : 'pagado'}">${info.stock <= info.minimo ? 'CRÍTICO' : 'DISPONIBLE'}</span></td>
            <td><button onclick="actualizarStockPrompt('${nombre}')" style="cursor:pointer; border:none; background:none; font-size:1.2rem;">🔄</button></td>
        </tr>
    `).join("");
}

async function cargarVentas() {
    const res = await fetch("/admin/ventas");
    const ventas = await res.json();
    const tbody = document.getElementById("tabla-ventas");
    tbody.innerHTML = ventas.map(v => `
        <tr>
            <td style="color: #7f8c8d; font-size: 0.8rem;">${v.fecha_venta}</td>
            <td>${v.cliente_nombre}</td>
            <td>${v.producto} (${v.kilos}kg)</td>
            <td><b>$${v.subtotal.toLocaleString()}</b></td>
            <td><span class="badge ${v.pagado}">${v.pagado.toUpperCase()}</span></td>
        </tr>
    `).join("");
}

async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    const tbody = document.getElementById("tabla-deudas");
    tbody.innerHTML = data.deudas.map(d => `
        <tr>
            <td><b>${d.cliente}</b></td>
            <td style="color: var(--danger); font-weight: bold;">$${d.total.toLocaleString()}</td>
            <td>
                ${d.whatsapp_link ? `<a href="${d.whatsapp_link}" target="_blank" class="btn-wa">ENVIAR COBRO</a>` : '<em>Sin teléfono</em>'}
            </td>
        </tr>
    `).join("");
}

async function cargarHistorial() {
    const res = await fetch("/admin/historial");
    const movs = await res.json();
    document.getElementById("tabla-historial").innerHTML = movs.map(m => `
        <tr>
            <td style="font-size: 0.8rem;">${m.fecha}</td>
            <td>${m.producto}</td>
            <td><small>${m.tipo.toUpperCase()}</small></td>
            <td>${m.cantidad}kg</td>
            <td style="color: #999 italic;">${m.motivo}</td>
        </tr>
    `).join("");
}

window.onload = () => cargarDashboard();