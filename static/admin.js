async function cargarDeudas() {
    const res = await fetch("/admin/deudas");
    const data = await res.json();
    const tbody = document.getElementById("tabla-deudas");
    tbody.innerHTML = "";

    data.deudas.forEach(d => {
        let btnWA = d.whatsapp_link 
            ? `<a href="${d.whatsapp_link}" target="_blank" style="background:#25D366; color:white; padding:5px 10px; border-radius:3px; text-decoration:none;">Cobrar WhatsApp</a>`
            : `<span style="color:#999">Sin teléfono</span>`;

        tbody.innerHTML += `
            <tr>
                <td>${d.cliente}</td>
                <td style="color:red; font-weight:bold">$${d.total.toLocaleString()}</td>
                <td>${btnWA}</td>
            </tr>`;
    });
}

function showTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.getElementById('tab-' + name).style.display = 'block';
    if(name === 'deudas') cargarDeudas();
}