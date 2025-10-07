async function api(path, opts={}){
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  if (res.status === 401) throw new Error('unauth');
  return res.json();
}

const loginDiv = document.getElementById('login');
const appDiv = document.getElementById('app');
const vmlist = document.getElementById('vmlist');

document.getElementById('btnLogin').addEventListener('click', async ()=>{
  try{
    const user = document.getElementById('user').value;
    const pass = document.getElementById('pass').value;
    await api('/api/login', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
    loginDiv.style.display = 'none'; appDiv.style.display = 'block';
    loadVMs();
    window.poll = setInterval(loadVMs, 5000);
  }catch(e){ alert('login failed'); }
});

document.getElementById('btnLogout').addEventListener('click', async ()=>{
  await api('/api/logout', { method: 'POST' });
  clearInterval(window.poll);
  appDiv.style.display = 'none'; loginDiv.style.display = 'block';
});

async function loadVMs(){
  try{
    const vms = await api('/api/vms');
    vmlist.innerHTML = '';
    vms.forEach(vm => {
      const el = document.createElement('div');
      el.className = 'vm' + (vm.reserved ? ' reserved' : '');
      el.innerHTML = `<strong>${vm.display_name}</strong><br/>${vm.ip}<br/>`;
      if (!vm.reserved){
        const btn = document.createElement('button'); btn.textContent = 'Reserve & Open';
        btn.addEventListener('click', async ()=>{
          // reserve then open vnc:// link
          const r = await api(`/api/vms/${vm.id}/reserve`, { method: 'POST' });
          // open vnc link - this will launch RealVNC Viewer if the protocol is registered
          window.location = `vnc://${vm.ip}`;
          loadVMs();
        });
        el.appendChild(btn);
      } else {
        el.innerHTML += `<div>Reserved by: ${vm.reserved_by}</div>`;
        const btn = document.createElement('button'); btn.textContent = 'Release';
        btn.addEventListener('click', async ()=>{
          await api(`/api/vms/${vm.id}/release`, { method: 'POST' });
          loadVMs();
        });
        el.appendChild(btn);
      }
      vmlist.appendChild(el);
    });
  }catch(e){
    console.error(e);
  }
}
