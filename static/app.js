// Minimal frontend to load VMs and connect
async function load() {
  const res = await fetch('/api/vms');
  const vms = await res.json();
  const container = document.getElementById('vms');
  container.innerHTML = '';
  // username is rendered server-side into the template
  vms.forEach(vm => {
    const card = document.createElement('div');
    card.className = 'vm card';
    card.innerHTML = `
      <div>
        <div class="vm-name">${vm.name}</div>
        <div class="vm-addr">${vm.address}</div>
      </div>
      <div class="vm-actions">
        <div class="vm-status ${vm.locked? 'locked':'free'}">${vm.locked? 'In use':'Free'}</div>
      </div>
    `;
    const actions = card.querySelector('.vm-actions');
    if (!vm.locked) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.innerText = 'Connect';
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await fetch('/connect', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({vm_id: vm.id}) });
        if (r.ok) {
          btn.innerText = 'Connected';
        } else {
          const j = await r.json();
          alert('Failed: ' + (j.error||'unknown'));
          btn.disabled = false;
        }
        load();
      };
      actions.appendChild(btn);
    } else {
      const who = document.createElement('div');
      who.style.marginTop = '8px';
      who.style.fontSize = '13px';
      who.style.color = '#556075';
      who.innerText = `Used by: ${vm.locked_by}`;
      actions.appendChild(who);
    }
    container.appendChild(card);
  });
}

window.addEventListener('load', load);
