let chartProductos = null;
let chartVentas = null;

function showTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    btn.classList.add('active');

    if (name === 'dashboard') cargarDashboard();
    if (name === 'inventario') cargarInventario();
    if (name === 'ventas') { cargarVentas(); cargarSelectProductos(); }
    if (name === 'clientes') cargarClientes();
    if (name === 'deudas') cargarDeudas();
    if (name === 'gastos') cargarGastos();
    if (name === 'caja') cargarCaja();
    if (name === 'historial') cargarHistorial();
}

async function cargarDashboard() {
    const res = await fetch("/admin/dashboard");
    const d = await res.json();
    
    document.getElementById("stats-dashboard").innerHTML = `
        <div class="stat"><div class="valor">$${d.total_hoy.toLocaleString()}</div><div class="label">Ventas Hoy</div></div>
        <div class="stat"><div class="valor">$${d.saldo_real.toLocaleString()}</div><div class="label">Caja Real</div></div>
        <div class="stat" style="color:red"><div class="valor">$${d.total_pendiente.toLocaleString()}</div><div class="label">Por Cobrar</div></div>
    `;

    if (chartProductos) chartProductos.destroy();
    chartProductos = new Chart(document.getElementById('chart-productos'), {
        type: 'bar',
        data: { labels: Object.keys(d.productos_ventas), datasets: [{ label: 'Kilos', data: Object.values(d.productos_ventas), backgroundColor: '#c0392b' }] }
    });

    if (chartVentas) chartVentas.destroy();
    chartVentas = new Chart(document.getElementById('chart-ventas'), {
        type: 'line',
        data: { labels: Object.keys(d.ventas_7dias), datasets: [{ label: 'Ventas $', data: Object.values(d.ventas_7dias), borderColor: '#c0392b', fill: false }] }
    });

    document.getElementById("alertas-stock").innerHTML = d.stock_bajo.map(p => `
        <p style="color:red">⚠️ <strong>${p.nombre}</strong> está bajo: ${p.stock}kg (Mín: ${p.minimo}kg)</p>
    `).join("");
}

async function cargarInventario() {
    const res = await fetch("/inventario");
    const data = await res.json();
    const tbody = document.getElementById("tabla-admin");
    tbody.innerHTML = Object.entries(data).map(([n, i]) => `
        <tr>
            <td>${n}</td>
            <td><input type="number" id="s-${n}" value="${i.stock}" style="width:60px"></td>
            <td>${i.minimo}kg</td>
            <td>$${i.precio_kilo}</td>
            <td><button onclick="updStock('${n}')">💾</button></td>
            <td><button onclick="delProd('${n}')">🗑️</button></td>
        </tr>`).join("");
}

async function updStock(nombre) {
    const stock = parseFloat(document.getElementById(`s-${nombre}`).value);
    await fetch("/admin/stock", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({nombre, stock}) });
    cargarInventario();
}

async function delProd(nombre) {
    if(confirm("¿Eliminar?")) await fetch(`/admin/producto/${nombre}`, { method: "DELETE" });
    cargarInventario();
}

async function cargarVentas() {
    const res = await fetch("/admin/ventas");
    const data = await res.json();
    document.getElementById("tabla-ventas").innerHTML = data.map(v => `
        <tr>
            <td>${v.fecha_venta}</td>
            <td>${v.cliente_nombre}</td>
            <td>${v.producto}</td>
            <td>${v.kilos}kg</td>
            <td>$${v.subtotal.toLocaleString()}</td>
            <td><span class="badge ${v.pagado}">${v.pagado}</span></td>
            <td><button onclick="togglePago(${v.id}, '${v.pagado === 'pagado' ? 'debe' : 'pagado'}')">🔄</button></td>
        </tr>`).join("");
}

async function togglePago(id, pagado) {
    await fetch(`/admin/venta/${id}/pago`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({pagado}) });
    cargarVentas();
}

async function registrarVenta() {
    const body = {
        producto: document.getElementById("v-producto").value,
        kilos: parseFloat(document.getElementById("v-kilos").value),
        cliente_nombre: document.getElementById("v-cliente").value,
        pagado: document.getElementById("v-pagado").value
    };
    const res = await fetch("/vender", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const data = await res.json();
    if(data.error) alert(data.error);
    else { alert("Venta exitosa"); cargarVentas(); }
}

async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    document.getElementById("tabla-deudas").innerHTML = data.deudas.map(d => `
        <tr>
            <td>${d.cliente}</td>
            <td style="color:red">$${d.total.toLocaleString()}</td>
            <td>${d.whatsapp_link ? `<a href="${d.whatsapp_link}" target="_blank" class="btn-wa">Cobrar</a>` : 'N/A'}</td>
        </tr>`).join("");
}

async function cargarCaja() {
    const res = await fetch("/admin/caja");
    const d = await res.json();
    document.getElementById("stats-caja").innerHTML = `
        <div class="stat"><div class="valor">$${d.total_ingresos.toLocaleString()}</div><div class="label">Ingresos</div></div>
        <div class="stat" style="color:red"><div class="valor">$${d.total_gastos.toLocaleString()}</div><div class="label">Gastos</div></div>
        <div class="stat"><div class="valor">$${d.saldo_real.toLocaleString()}</div><div class="label">Saldo Final</div></div>
    `;
    document.getElementById("caja-categorias").innerHTML = Object.entries(d.categorias).map(([c, v]) => `
        <p><strong>${c}:</strong> $${v.toLocaleString()}</p>
    `).join("");
}

async function cargarGastos() {
    const res = await fetch("/admin/gastos");
    const data = await res.json();
    document.getElementById("tabla-gastos").innerHTML = data.map(g => `
        <tr><td>${g.fecha}</td><td>${g.descripcion}</td><td>$${g.monto.toLocaleString()}</td></tr>
    `).join("");
}

async function registrarGasto() {
    const body = { descripcion: document.getElementById("g-desc").value, categoria: document.getElementById("g-cat").value, monto: parseFloat(document.getElementById("g-monto").value) };
    await fetch("/admin/gasto", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    cargarGastos();
}

async function cargarHistorial() {
    const res = await fetch("/admin/historial");
    const data = await res.json();
    document.getElementById("tabla-historial").innerHTML = data.map(h => `
        <tr><td>${h.fecha}</td><td>${h.producto}</td><td>${h.tipo}</td><td>${h.cantidad}kg</td><td>${h.motivo}</td></tr>
    `).join("");
}

async function cargarSelectProductos() {
    const res = await fetch("/inventario");
    const data = await res.json();
    document.getElementById("v-producto").innerHTML = Object.keys(data).map(n => `<option value="${n}">${n}</option>`).join("");
}

async function cargarClientes() {
    const res = await fetch("/admin/clientes");
    const data = await res.json();
    document.getElementById("tabla-clientes").innerHTML = data.map(c => `
        <tr><td>${c.nombre}</td><td>${c.telefono}</td><td>${c.direccion}</td><td><button onclick="delCli(${c.id})">🗑️</button></td></tr>
    `).join("");
}

async function crearCliente() {
    const body = { nombre: document.getElementById("c-nombre").value, telefono: document.getElementById("c-tel").value, direccion: document.getElementById("c-dir").value };
    await fetch("/admin/cliente", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    cargarClientes();
}

async function crearProducto() {
    const body = { nombre: document.getElementById("p-nombre").value, stock: parseFloat(document.getElementById("p-stock").value), minimo: parseFloat(document.getElementById("p-minimo").value), precio_kilo: parseFloat(document.getElementById("p-precio").value) };
    await fetch("/admin/producto", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    cargarInventario();
}

window.onload = () => cargarDashboard();