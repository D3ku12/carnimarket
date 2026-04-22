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
        <td>${v.kilos}kg</td>
        <td>$${v.subtotal.toLocaleString()}</td>
        <td><span class="badge ${v.pagado}">${v.pagado === 'pagado' ? '✅ Pagado' : '⚠️ Debe'}</span></td>
        <td class="hide-mobile" style="font-size:12px;color:#999">${v.fecha_pago || "—"}</td>
        <td class="hide-mobile ${venceClass}" style="font-size:12px">${venceTexto}</td>
        <td>
          <button class="btn-small btn-orange" onclick="abrirEditarVenta(${v.id}, '${v.cliente_nombre}', ${v.kilos}, '${v.pagado}', '${v.notas}', '${v.fecha_venta}', '${v.fecha_vencimiento}')" style="margin-right:4px">✏️</button>
          ${v.pagado === 'debe'
            ? `<button class="btn-small btn-green" onclick="marcarPagado(${v.id})">✅</button>`
            : `<button class="btn-small" style="background:#eee;color:#666" onclick="marcarDebe(${v.id})">↩️</button>`
          }
        </td>
      </tr>`;
  }).join("");
}

function abrirEditarVenta(id, cliente, kilos, pagado, notas, fecha_venta, fecha_vencimiento) {
  document.getElementById("edit-venta-id").value = id;
  document.getElementById("edit-venta-cliente").value = cliente === 'undefined' ? '' : cliente;
  document.getElementById("edit-venta-kilos").value = kilos;
  document.getElementById("edit-venta-pagado").value = pagado;
  document.getElementById("edit-venta-notas").value = notas === 'undefined' ? '' : notas;
  document.getElementById("edit-venta-fecha").value = fecha_venta && fecha_venta !== '—' ? fecha_venta.split(' ')[0] : '';
  document.getElementById("edit-venta-vencimiento").value = fecha_vencimiento && fecha_vencimiento !== '—' ? fecha_vencimiento : '';
  document.getElementById("msg-edit-venta").style.display = "none";
  abrirModal("modal-venta");
}

async function guardarVenta() {
  const id = document.getElementById("edit-venta-id").value;
  const kilos = parseFloat(document.getElementById("edit-venta-kilos").value);
  const pagado = document.getElementById("edit-venta-pagado").value;
  const cliente_nombre = document.getElementById("edit-venta-cliente").value;
  const notas = document.getElementById("edit-venta-notas").value;
  const fecha_venta = document.getElementById("edit-venta-fecha").value;
  const fecha_vencimiento = document.getElementById("edit-venta-vencimiento").value;
  const msg = document.getElementById("msg-edit-venta");
  const res = await fetch(`/admin/venta/${id}`, {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({kilos, pagado, cliente_nombre, notas, fecha_venta, fecha_vencimiento})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) setTimeout(() => { cerrarModal("modal-venta"); cargarVentas(); }, 800);
}

async function marcarPagado(id) {
  await fetch(`/admin/venta/${id}/pago`, {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({pagado: "pagado"})
  });
  cargarVentas(); cargarDeudas();
}

async function marcarDebe(id) {
  await fetch(`/admin/venta/${id}/pago`, {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({pagado: "debe"})
  });
  cargarVentas(); cargarDeudas();
}

// ── Clientes ──
async function cargarClientes() {
  const res = await fetch("/admin/clientes");
  const clientes = await res.json();
  const tbody = document.getElementById("tabla-clientes");
  if (!clientes.length) {
    tbody.innerHTML = "<tr><td colspan='5' style='color:#999;text-align:center'>No hay clientes</td></tr>";
    return;
  }
  tbody.innerHTML = clientes.map(c => `
    <tr>
      <td><strong>${c.nombre}</strong></td>
      <td>${c.telefono || "—"}</td>
      <td class="hide-mobile">${c.direccion || "—"}</td>
      <td class="hide-mobile" style="font-size:12px;color:#999">${c.fecha_registro}</td>
      <td>
        <button class="btn-small btn-orange" onclick="abrirEditarCliente(${c.id}, '${c.nombre}', '${c.telefono}', '${c.direccion}')" style="margin-right:4px">✏️</button>
        <button class="btn-small btn-red" onclick="eliminarCliente(${c.id})">🗑️</button>
      </td>
    </tr>`).join("");
}

function abrirEditarCliente(id, nombre, telefono, direccion) {
  document.getElementById("edit-cli-id").value = id;
  document.getElementById("edit-cli-nombre").value = nombre;
  document.getElementById("edit-cli-telefono").value = telefono === 'undefined' ? '' : telefono;
  document.getElementById("edit-cli-direccion").value = direccion === 'undefined' ? '' : direccion;
  document.getElementById("msg-edit-cli").style.display = "none";
  abrirModal("modal-cliente");
}

async function guardarCliente() {
  const id = document.getElementById("edit-cli-id").value;
  const nombre = document.getElementById("edit-cli-nombre").value.trim();
  const telefono = document.getElementById("edit-cli-telefono").value.trim();
  const direccion = document.getElementById("edit-cli-direccion").value.trim();
  const msg = document.getElementById("msg-edit-cli");
  const res = await fetch(`/admin/cliente/${id}`, {
    method: "PUT", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({nombre, telefono, direccion})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) setTimeout(() => { cerrarModal("modal-cliente"); cargarClientes(); }, 800);
}

async function agregarCliente() {
  const nombre = document.getElementById("cliente-nombre").value.trim();
  const telefono = document.getElementById("cliente-telefono").value.trim();
  const direccion = document.getElementById("cliente-direccion").value.trim();
  const msg = document.getElementById("msg-cliente");
  if (!nombre) {
    msg.className = "mensaje error"; msg.style.display = "block";
    msg.textContent = "❌ El nombre es obligatorio."; return;
  }
  const res = await fetch("/admin/cliente", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({nombre, telefono, direccion})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) {
    ["cliente-nombre","cliente-telefono","cliente-direccion"].forEach(id => document.getElementById(id).value = "");
    cargarClientes();
  }
}

async function eliminarCliente(id) {
  if (!confirm("¿Eliminar este cliente?")) return;
  const res = await fetch(`/admin/cliente/${id}`, { method: "DELETE" });
  const data = await res.json();
  const msg = document.getElementById("msg-cliente");
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) cargarClientes();
}

// ── Deudas ──
// ¡AQUÍ ESTÁ EL CAMBIO PARA LOS BOTONES DE WHATSAPP!
async function cargarDeudas() {
  const res = await fetch("/admin/deudas");
  const data = await res.json(); // Ahora data.deudas es un arreglo/lista
  
  const numDeudores = data.deudas.length;
  
  document.getElementById("stats-deudas").innerHTML = `
    <div class="stat">
      <div class="valor">$${data.total_pendiente.toLocaleString()}</div>
      <div class="label">Total pendiente</div>
    </div>
    <div class="stat">
      <div class="valor">${numDeudores}</div>
      <div class="label">Clientes que deben</div>
    </div>`;
    
  const tbody = document.getElementById("tabla-deudas");
  
  if (!numDeudores) {
    tbody.innerHTML = "<tr><td colspan='3' style='color:#2e7d32;text-align:center'>✅ Sin deudas</td></tr>";
    return;
  }
  
  tbody.innerHTML = data.deudas
    .sort((a,b) => b.total - a.total)
    .map(d => {
      let btnWhatsApp = "";
      if (d.whatsapp_link) {
        btnWhatsApp = `<a href="${d.whatsapp_link}" target="_blank" class="btn-small" style="background-color: #25D366; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; display: inline-block;">💬 Cobrar</a>`;
      } else {
        btnWhatsApp = `<span style="font-size: 12px; color: #999;">Sin teléfono</span>`;
      }
      
      return `
      <tr>
        <td><strong>${d.cliente}</strong></td>
        <td style="color:#c0392b;font-weight:bold">$${d.total.toLocaleString()}</td>
        <td>${btnWhatsApp}</td>
      </tr>`;
    })
    .join("");
}

// ── Gastos ──
async function registrarGasto() {
  const descripcion = document.getElementById("gasto-descripcion").value.trim();
  const categoria = document.getElementById("gasto-categoria").value;
  const monto = parseFloat(document.getElementById("gasto-monto").value);
  const fecha = document.getElementById("gasto-fecha").value;
  const notas = document.getElementById("gasto-notas").value;
  const msg = document.getElementById("msg-gasto");
  if (!descripcion || !monto) {
    msg.className = "mensaje error"; msg.style.display = "block";
    msg.textContent = "❌ Descripción y monto son obligatorios."; return;
  }
  const res = await fetch("/admin/gasto", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({descripcion, categoria, monto, fecha, notas})
  });
  const data = await res.json();
  msg.style.display = "block";
  msg.className = data.error ? "mensaje error" : "mensaje exito";
  msg.textContent = data.error ? "❌ " + data.error : "✅ " + data.mensaje;
  if (!data.error) {
    ["gasto-descripcion","gasto-monto","gasto-notas","gasto-fecha"].forEach(id => document.getElementById(id).value = "");
    cargarGastos(); cargarCaja();
  }
}

async function cargarGastos() {
  const res = await fetch("/admin/gastos");
  const gastos = await res.json();
  const tbody = document.getElementById("tabla-gastos");
  const categoriaLabels = {
    compra_carne: "🥩 Compra carne", servicios: "💡 Servicios",
    transporte: "🚗 Transporte", empaque: "📦 Empaque",
    nomina: "👷 Nómina", mantenimiento: "🔧 Mantenimiento", general: "📋 General"
  };
  if (!gastos.length) {
    tbody.innerHTML = "<tr><td colspan='6' style='color:#999;text-align:center'>No hay gastos</td></tr>";
    return;
  }
  tbody.innerHTML = gastos.map(g => `
    <tr>
      <td>${g.fecha}</td>
      <td><strong>${g.descripcion}</strong></td>
      <td class="hide-mobile">${categoriaLabels[g.categoria] || g.categoria}</td>
      <td style="color:#c0392b;font-weight:bold">$${g.monto.toLocaleString()}</td>
      <td class="hide-mobile" style="font-size:12px;color:#999">${g.notas || "—"}</td>
      <td><button class="btn-small btn-red" onclick="eliminarGasto(${g.id})">🗑️</button></td>
    </tr>`).join("");
}

async function eliminarGasto(id) {
  if (!confirm("¿Eliminar este gasto?")) return;
  await fetch(`/admin/gasto/${id}`, { method: "DELETE" });
  cargarGastos(); cargarCaja();
}

// ── Caja ──
async function cargarCaja() {
  const res = await fetch("/admin/caja");
  const data = await res.json();
  const saldoColor = data.saldo_real >= 0 ? "#2e7d32" : "#c0392b";
  const saldoIcon = data.saldo_real >= 0 ? "✅" : "⚠️";
  document.getElementById("stats-caja").innerHTML = `
    <div class="stat">
      <div class="valor" style="color:#2e7d32">$${data.total_ingresos.toLocaleString()}</div>
      <div class="label">💰 Ingresos cobrados</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:#c0392b">$${data.total_gastos.toLocaleString()}</div>
      <div class="label">💸 Total gastos</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:${saldoColor}">${saldoIcon} $${data.saldo_real.toLocaleString()}</div>
      <div class="label">🏦 Saldo real</div>
    </div>
    <div class="stat">
      <div class="valor" style="color:#e67e22">$${data.total_pendiente.toLocaleString()}</div>
      <div class="label">⏳ Pendiente</div>
    </div>`;
  const categoriaLabels = {
    compra_carne: "🥩 Compra carne", servicios: "💡 Servicios",
    transporte: "🚗 Transporte", empaque: "📦 Empaque",
    nomina: "👷 Nómina", mantenimiento: "🔧 Mantenimiento", general: "📋 General"
  };
  const tbody = document.getElementById("tabla-categorias");
  if (!Object.keys(data.categorias).length) {
    tbody.innerHTML = "<tr><td colspan='2' style='color:#999;text-align:center'>Sin gastos</td></tr>";
  } else {
    tbody.innerHTML = Object.entries(data.categorias)
      .sort((a,b) => b[1]-a[1])
      .map(([cat, total]) => `<tr><td>${categoriaLabels[cat] || cat}</td><td style="color:#c0392b;font-weight:bold">$${total.toLocaleString()}</td></tr>`)
      .join("");
  }
  document.getElementById("resumen-caja").innerHTML = `
    <table>
      <tr><td>💰 Ventas cobradas</td><td style="color:#2e7d32;font-weight:bold;text-align:right">+ $${data.total_ingresos.toLocaleString()}</td></tr>
      <tr><td>💸 Gastos totales</td><td style="color:#c0392b;font-weight:bold;text-align:right">- $${data.total_gastos.toLocaleString()}</td></tr>
      <tr style="border-top:2px solid #f0f0f0">
        <td><strong>🏦 Saldo real</strong></td>
        <td style="color:${saldoColor};font-weight:bold;font-size:16px;text-align:right">$${data.saldo_real.toLocaleString()}</td>
      </tr>
      <tr><td colspan="2" style="height:12px"></td></tr>
      <tr><td>⏳ Por cobrar</td><td style="color:#e67e22;font-weight:bold;text-align:right">$${data.total_pendiente.toLocaleString()}</td></tr>
      <tr>
        <td><strong>💎 Si cobran todo</strong></td>
        <td style="color:#1a5276;font-weight:bold;text-align:right">$${(data.saldo_real + data.total_pendiente).toLocaleString()}</td>
      </tr>
    </table>`;
}

// ── Historial ──
async function cargarHistorial() {
  const res = await fetch("/admin/historial");
  const movimientos = await res.json();
  const producto = document.getElementById("filtro-historial-producto")?.value.toLowerCase() || "";
  const tipo = document.getElementById("filtro-historial-tipo")?.value || "";
  const tbody = document.getElementById("tabla-historial");
  const filtrados = movimientos.filter(m => {
    return (!producto || m.producto.toLowerCase().includes(producto)) &&
           (!tipo || m.tipo === tipo);
  });
  if (!filtrados.length) {
    tbody.innerHTML = "<tr><td colspan='5' style='color:#999;text-align:center'>No hay movimientos</td></tr>";
    return;
  }
  tbody.innerHTML = filtrados.map(m => `
    <tr>
      <td>${m.fecha}</td>
      <td><strong>${m.producto}</strong></td>
      <td><span class="badge ${m.tipo}">${m.tipo === 'entrada' ? '📥 Entrada' : '📤 Salida'}</span></td>
      <td>${m.cantidad}kg</td>
      <td class="hide-mobile" style="font-size:12px;color:#999">${m.motivo || "—"}</td>
    </tr>`).join("");
}

// ── Init ──
cargarDashboard();
cargarProductosSelect();
cargarClientesSelect();