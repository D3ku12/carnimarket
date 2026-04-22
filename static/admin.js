let chartProductos = null;
let chartVentas = null;

// ── Navegación ──
function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'dashboard') cargarDashboard();
  if (name === 'inventario') cargarAdmin();
  if (name === 'ventas') { cargarVentas(); cargarProductosSelect(); cargarClientesSelect(); }
  if (name === 'clientes') cargarClientes();
  if (name === 'deudas') cargarDeudas();
  if (name === 'gastos') cargarGastos();
  if (name === 'caja') cargarCaja();
  if (name === 'historial') cargarHistorial();
}

// ── Modales ──
function abrirModal(id) { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Dashboard ──
async function cargarDashboard() {
  const res = await fetch("/admin/dashboard");
  const data = await res.json();

  const saldoColor = data.saldo_real >= 0 ? "#2e7d32" : "#c0392b";
  const ahora = new Date();
  const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
  const ventasHoy = data.ventas_7dias[fechaHoy] || 0;

  document.getElementById("stats-dashboard").innerHTML = `
    <div class="stat">
      <div class="valor" style="color:#1a5276">$${ventasHoy.toLocaleString()}</div>
      <div class="label">💰 Ventas hoy</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:#2e7d32">$${data.total_mes.toLocaleString()}</div>
      <div class="label">📅 Este mes (${data.ventas_mes})</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:${saldoColor}">$${data.saldo_real.toLocaleString()}</div>
      <div class="label">🏦 Saldo real</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:#e67e22">$${data.total_pendiente.toLocaleString()}</div>
      <div class="label">⏳ Por cobrar</div>
    </div>`;

  if (chartProductos) chartProductos.destroy();
  const ctxP = document.getElementById("chart-productos").getContext("2d");
  chartProductos = new Chart(ctxP, {
    type: "bar",
    data: {
      labels: Object.keys(data.productos_ventas),
      datasets: [{
        label: "Kilos vendidos",
        data: Object.values(data.productos_ventas),
        backgroundColor: ["#c0392b","#e74c3c","#e67e22","#f39c12","#d35400"],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  if (chartVentas) chartVentas.destroy();
  const ctxV = document.getElementById("chart-ventas").getContext("2d");
  chartVentas = new Chart(ctxV, {
    type: "line",
    data: {
      labels: Object.keys(data.ventas_7dias).map(d => d.slice(5)),
      datasets: [{
        label: "Ventas ($)",
        data: Object.values(data.ventas_7dias),
        borderColor: "#c0392b",
        backgroundColor: "rgba(192,57,43,0.1)",
        tension: 0.4,
        fill: true,
        pointBackgroundColor: "#c0392b"
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const alertasStock = document.getElementById("alertas-stock");
  if (!data.stock_bajo.length) {
    alertasStock.innerHTML = "<p style='color:#2e7d32;font-size:13px'>✅ Todo el inventario está bien</p>";
  } else {
    alertasStock.innerHTML = data.stock_bajo.map(p => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0">
        <span><strong>${p.nombre}</strong></span>
        <span style="color:#c0392b;font-size:13px">⚠️ ${p.stock}kg (mín: ${p.minimo}kg)</span>
      </div>`).join("");
  }

  const alertasDeudas = document.getElementById("alertas-deudas");
  if (!data.deudas_vencidas.length) {
    alertasDeudas.innerHTML = "<p style='color:#2e7d32;font-size:13px'>✅ Sin deudas vencidas</p>";
  } else {
    alertasDeudas.innerHTML = data.deudas_vencidas.map(d => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0">
        <span><strong>${d.cliente}</strong><br><small style="color:#999">Venció: ${d.fecha_vencimiento}</small></span>
        <span style="color:#c0392b;font-weight:bold">$${d.subtotal.toLocaleString()}</span>
      </div>`).join("");
  }
}

// ── Inventario ──
async function cargarAdmin() {
  const res = await fetch("/inventario");
  const data = await res.json();
  const tbody = document.getElementById("tabla-admin");
  tbody.innerHTML = "";
  for (const [nombre, info] of Object.entries(data)) {
    let estado = info.stock === 0 ? "Agotado" : info.stock <= info.minimo ? "Stock bajo" : "OK";
    let clase = estado === "OK" ? "ok" : "bajo";
    tbody.innerHTML += `
      <tr>
        <td><strong>${nombre}</strong><br><small style="color:#999">$${info.precio_kilo.toLocaleString()}/kg</small></td>
        <td>${info.stock}kg</td>
        <td class="hide-mobile">${info.minimo}kg</td>
        <td><span class="badge ${clase}">${estado}</span></td>
        <td><div class="edit-stock">
          <input type="number" id="stock-${nombre}" value="${info.stock}" step="0.1" min="0">
          <button class="btn-small btn-blue" onclick="actualizarStock('${nombre}')">💾</button>
        </div></td>
        <td>
          <button class="btn-small btn-orange" onclick="abrirEditarProducto('${nombre}', ${info.stock}, ${info.minimo}, ${info.precio_kilo})" style="margin-right:4px">✏️</button>
          <button class="btn-small btn-red" onclick="eliminarProducto('${nombre}')">🗑️</button>
        </td>
      </tr>`;
  }
}

function abrirEditarProducto(nombre, stock, minimo, precio_kilo) {
  document.getElementById("edit-prod-original").value = nombre;
  document.getElementById("edit-prod-nombre").value = nombre;
  document.getElementById("edit-prod-stock").value = stock;
  document.getElementById("edit-prod-minimo").value = minimo;
  document.getElementById("edit-prod-precio").value = precio_kilo;
  document.getElementById("msg-edit-prod").style.display = "none";
  abrirModal("modal-producto");
}

async function guardarProducto() {
  const original = document.getElementById("edit-prod-original").value;
  const nombre_nuevo = document.getElementById("edit-prod-nombre").value.trim();
  const stock = parseFloat(document.getElementById("edit-prod-stock").value);
  const minimo = parseFloat(document.getElementById("edit-prod-minimo").value);
  const precio_kilo = parseFloat(document.getElementById("edit-prod-precio").value);
  const msg = document.getElementById("msg-edit-prod");
  const body = { stock, minimo, precio_kilo };
  if (nombre_nuevo !== original) body.nombre_nuevo = nombre_nuevo;
  const res = await fetch(`/admin/producto/${original}`, {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) setTimeout(() => { cerrarModal("modal-producto"); cargarAdmin(); }, 800);
}

async function actualizarStock(nombre) {
  const stock = parseFloat(document.getElementById(`stock-${nombre}`).value);
  const msg = document.getElementById("msg-stock");
  const res = await fetch("/admin/stock", {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({nombre, stock})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) cargarAdmin();
}

async function eliminarProducto(nombre) {
  if (!confirm(`¿Eliminar ${nombre}?`)) return;
  const res = await fetch(`/admin/producto/${nombre}`, { method: "DELETE" });
  const data = await res.json();
  const msg = document.getElementById("msg-stock");
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) cargarAdmin();
}

async function agregarProducto() {
  const nombre = document.getElementById("nuevo-nombre").value.trim();
  const stock = parseFloat(document.getElementById("nuevo-stock").value);
  const minimo = parseFloat(document.getElementById("nuevo-minimo").value);
  const precio_kilo = parseFloat(document.getElementById("nuevo-precio").value);
  const msg = document.getElementById("msg-nuevo");
  if (!nombre || !stock || !minimo || !precio_kilo) {
    msg.className = "mensaje error"; msg.style.display = "block";
    msg.textContent = "❌ Completa todos los campos."; return;
  }
  const res = await fetch("/admin/producto", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({nombre, stock, minimo, precio_kilo})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) {
    ["nuevo-nombre","nuevo-stock","nuevo-minimo","nuevo-precio"].forEach(id => document.getElementById(id).value = "");
    cargarAdmin();
  }
}

// ── Ventas ──
async function cargarProductosSelect() {
  const res = await fetch("/inventario");
  const data = await res.json();
  const select = document.getElementById("venta-producto");
  select.innerHTML = '<option value="">Selecciona producto...</option>';
  for (const [nombre, info] of Object.entries(data)) {
    if (info.stock > 0) select.innerHTML += `<option value="${nombre}">${nombre} — ${info.stock}kg</option>`;
  }
}

async function cargarClientesSelect() {
  const res = await fetch("/admin/clientes");
  const clientes = await res.json();
  const select = document.getElementById("venta-cliente-select");
  select.innerHTML = '<option value="">Selecciona cliente existente...</option>';
  clientes.forEach(c => {
    select.innerHTML += `<option value="${c.id}" data-nombre="${c.nombre}">${c.nombre}</option>`;
  });
}

function seleccionarCliente() {
  const select = document.getElementById("venta-cliente-select");
  const opt = select.options[select.selectedIndex];
  if (opt.dataset.nombre) document.getElementById("venta-cliente-nombre").value = opt.dataset.nombre;
}

async function registrarVenta() {
  const producto = document.getElementById("venta-producto").value;
  const kilos = parseFloat(document.getElementById("venta-kilos").value);
  const cliente_nombre = document.getElementById("venta-cliente-nombre").value || "Cliente general";
  const pagado = document.getElementById("venta-pagado").value;
  const notas = document.getElementById("venta-notas").value;
  const fecha_venta = document.getElementById("venta-fecha").value;
  const fecha_vencimiento = document.getElementById("venta-fecha-vencimiento").value;
  const select = document.getElementById("venta-cliente-select");
  const cliente_id = select.value ? parseInt(select.value) : null;
  const msg = document.getElementById("msg-venta");
  if (!producto || !kilos) {
    msg.className = "mensaje error"; msg.style.display = "block";
    msg.textContent = "❌ Selecciona producto y kilos."; return;
  }
  const res = await fetch("/vender", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({producto, kilos, cliente_nombre, cliente_id, pagado, notas, fecha_venta, fecha_vencimiento})
  });
  const data = await res.json();
  msg.style.display = "block";
  if (data.error) {
    msg.className = "mensaje error"; msg.textContent = "❌ " + data.error;
  } else {
    msg.className = "mensaje exito";
    msg.textContent = `✅ ${data.producto} ${data.kilos}kg = $${data.subtotal.toLocaleString()}`;
    ["venta-kilos","venta-cliente-nombre","venta-notas","venta-fecha","venta-fecha-vencimiento"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("venta-cliente-select").value = "";
    cargarVentas(); cargarProductosSelect();
  }
}

async function cargarVentas() {
  const fecha = document.getElementById("filtro-fecha")?.value || "";
  const cliente = document.getElementById("filtro-cliente")?.value || "";
  const pagado = document.getElementById("filtro-pagado")?.value || "";
  let url = "/admin/ventas?";
  if (fecha) url += `fecha=${fecha}&`;
  if (cliente) url += `cliente=${cliente}&`;
  if (pagado) url += `pagado=${pagado}&`;
  const res = await fetch(url);
  const ventas = await res.json();
  const tbody = document.getElementById("tabla-ventas");
  if (!ventas.length) {
    tbody.innerHTML = "<tr><td colspan='9' style='color:#999;text-align:center'>No hay ventas</td></tr>";
    return;
  }
  const hoy = new Date();
  tbody.innerHTML = ventas.map(v => {
    let venceClass = "";
    let venceTexto = v.fecha_vencimiento || "—";
    if (v.fecha_vencimiento && v.fecha_vencimiento !== "—" && v.pagado === "debe") {
      const fv = new Date(v.fecha_vencimiento);
      const diff = (fv - hoy) / (1000 * 60 * 60 * 24);
      if (diff < 0) { venceClass = "vencido"; venceTexto = "⛔ " + v.fecha_vencimiento; }
      else if (diff <= 3) { venceClass = "vence-pronto"; venceTexto = "⚠️ " + v.fecha_vencimiento; }
    }
    return `
      <tr>
        <td>${v.fecha_venta || "—"}</td>
        <td>${v.cliente_nombre || "—"}</td>
        <td>${v.producto}</td>
        <td>${v.kilos}kg