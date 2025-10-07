async function loadVMs() {
  const res = await fetch('/api/admin/vms');
  if (!res.ok) {
    alert('failed to load vms');
    return;
  }
  const vms = await res.json();
  const container = document.getElementById('vmList');
  container.innerHTML = '';
  vms.forEach(vm => {
    const el = document.createElement('div');
    el.className = 'vm card';
    el.innerHTML = `
      <div>
        <div class="vm-name">${vm.name}</div>
        <div class="vm-addr">${vm.address}</div>
        <div style="margin-top:8px; font-size:13px; color:#6b7280">${vm.username? 'User: ' + vm.username : ''} ${vm.password? ' • Password set' : ''}</div>
      </div>
      <div class="vm-actions">
        <div class="vm-status ${vm.locked? 'locked':'free'}">${vm.locked? 'In use':'Free'}</div>
      </div>
    `;
    const actions = el.querySelector('.vm-actions');
    const del = document.createElement('button');
    del.className = 'btn danger small';
    del.innerText = 'Delete';
    del.onclick = async () => {
      if (!confirm('Delete ' + vm.name + '?')) return;
      const r = await fetch('/api/admin/vms', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({vm_id: vm.id}) });
      if (r.ok) loadVMs(); else alert('delete failed');
    };
    actions.appendChild(del);
    container.appendChild(el);
  });
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = { name: f.name.value, address: f.address.value, username: f.username.value, password: f.password.value };
  const r = await fetch('/api/admin/vms', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (r.ok) {
    f.reset();
    loadVMs();
  } else {
    const j = await r.json();
    alert('Add failed: ' + (j.error||'unknown'));
  }
});

window.addEventListener('load', loadVMs);
