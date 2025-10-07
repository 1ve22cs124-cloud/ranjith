from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import json
import os
import subprocess
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
VMS_PATH = os.path.join(BASE_DIR, 'vms.json')
LOCKS_PATH = os.path.join(BASE_DIR, 'locks.json')

app = Flask(__name__)
app.secret_key = 'replace-this-with-a-secure-random-key'

# Simple user store for demo purposes. Replace with real auth in production.
USERS = {
    'alice': 'password1',
    'bob': 'password2'
}

# Simple admin list - users listed here can access the admin UI.
ADMINS = {'alice'}


def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


config = load_json(CONFIG_PATH, {
    'viewer_paths': [
        r"C:\\Program Files\\RealVNC\\VNC Viewer\\vncviewer.exe",
        r"C:\\Program Files (x86)\\RealVNC\\VNC Viewer\\vncviewer.exe",
        r"C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\RealVNC\\RealVNC Viewer.lnk"
    ]
})

vms = load_json(VMS_PATH, [
    { 'id': 'vm1', 'name': '10.58.211.33', 'address': '10.58.211.33', 'username': '', 'password': '' },
    { 'id': 'vm2', 'name': '10.58.211.106', 'address': '10.58.211.106', 'username': '', 'password': '' },
    { 'id': 'vm3', 'name': '10.58.211.107', 'address': '10.58.211.107', 'username': '', 'password': '' }
])

locks = load_json(LOCKS_PATH, {})
# locks format: { vm_id: { 'user': username, 'pid': 1234 } }

processes = {}  # vm_id -> subprocess.Popen


def find_viewer_executable():
    for p in config.get('viewer_paths', []):
        if os.path.exists(p):
            return p
    return None


def monitor_process(vm_id, proc):
    try:
        proc.wait()
    finally:
        # free lock when process exits
        locks.pop(vm_id, None)
        processes.pop(vm_id, None)
        save_json(LOCKS_PATH, locks)


@app.route('/')
def index():
    # If not logged in show the attractive landing page with login options.
    if 'user' not in session:
        return render_template('home.html')
    return render_template('index.html', user=session.get('user'), is_admin=is_admin(), is_admin_func=is_admin)


@app.route('/api/vms')
def api_vms():
    # return vm list with lock info
    data = []
    for vm in vms:
        vm_copy = vm.copy()
        lock = locks.get(vm['id'])
        vm_copy['locked'] = bool(lock)
        vm_copy['locked_by'] = lock.get('user') if lock else None
        data.append(vm_copy)
    return jsonify(data)


def is_admin():
    return 'user' in session and session['user'] in ADMINS


@app.route('/admin')
def admin_page():
    if not is_admin():
        return redirect(url_for('login'))
    return render_template('admin.html')


@app.route('/api/admin/vms', methods=['GET', 'POST', 'DELETE'])
def api_admin_vms():
    if not is_admin():
        return jsonify({'error': 'forbidden'}), 403
    if request.method == 'GET':
        return jsonify(vms)
    if request.method == 'POST':
        data = request.get_json() or {}
        name = data.get('name')
        address = data.get('address')
        username = data.get('username')
        password = data.get('password')
        if not name or not address:
            return jsonify({'error': 'missing fields'}), 400
        new_id = 'vm' + str(int(time.time()))
        vm = {'id': new_id, 'name': name, 'address': address, 'username': username or '', 'password': password or ''}
        vms.append(vm)
        save_json(VMS_PATH, vms)
        app.logger.info('admin %s added vm %s (%s)', session.get('user'), vm['id'], vm['address'])
        return jsonify(vm)
    if request.method == 'DELETE':
        data = request.get_json() or {}
        vm_id = data.get('vm_id')
        if not vm_id:
            return jsonify({'error': 'missing vm_id'}), 400
        idx = next((i for i, x in enumerate(vms) if x['id'] == vm_id), None)
        if idx is None:
            return jsonify({'error': 'not found'}), 404
        vms.pop(idx)
        # also remove any lock
        locks.pop(vm_id, None)
        save_json(VMS_PATH, vms)
        save_json(LOCKS_PATH, locks)
        app.logger.info('admin %s deleted vm %s', session.get('user'), vm_id)
        return jsonify({'ok': True})


@app.route('/login', methods=['GET', 'POST'])
def login():
    login_type = request.args.get('type', 'user')
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if USERS.get(username) == password:
            session['user'] = username
            app.logger.info('login success: %s', username)
            return redirect(url_for('index'))
        app.logger.info('login failed: %s', username)
        return render_template('login.html', error='Invalid credentials', login_type=login_type)
    return render_template('login.html', login_type=login_type)


@app.route('/logout')
def logout():
    user = session.pop('user', None)
    # free any locks owned by this user
    to_free = [vm for vm, info in locks.items() if info.get('user') == user]
    for vm in to_free:
        locks.pop(vm, None)
        proc = processes.pop(vm, None)
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
    save_json(LOCKS_PATH, locks)
    return redirect(url_for('login'))


@app.route('/connect', methods=['POST'])
def connect_vm():
    if 'user' not in session:
        return jsonify({'error': 'not authenticated'}), 401
    data = request.get_json() or {}
    vm_id = data.get('vm_id')
    if not vm_id:
        return jsonify({'error': 'missing vm_id'}), 400
    vm = next((v for v in vms if v['id'] == vm_id), None)
    if not vm:
        return jsonify({'error': 'unknown vm'}), 404
    if locks.get(vm_id):
        return jsonify({'error': 'vm in use'}), 409

    viewer = find_viewer_executable()
    address = vm.get('address')
    try:
        if viewer and viewer.lower().endswith('.exe'):
            proc = subprocess.Popen([viewer, address], shell=False)
        else:
            # fallback: use start to open lnk (Windows)
            cmd = ['cmd', '/c', 'start', '""', config.get('viewer_paths', [])[0], address]
            proc = subprocess.Popen(cmd, shell=False)
    except Exception as e:
        return jsonify({'error': 'failed to launch viewer', 'detail': str(e)}), 500

    locks[vm_id] = { 'user': session['user'], 'pid': getattr(proc, 'pid', None) }
    processes[vm_id] = proc
    save_json(LOCKS_PATH, locks)
    app.logger.info('vm %s locked by %s (pid=%s)', vm_id, session['user'], getattr(proc, 'pid', None))

    # monitor the process in a background thread; when it exits free the lock
    t = threading.Thread(target=monitor_process, args=(vm_id, proc), daemon=True)
    t.start()

    return jsonify({'ok': True})


if __name__ == '__main__':
    # write initial files if missing
    save_json(VMS_PATH, vms)
    save_json(LOCKS_PATH, locks)
    print('Starting app on http://127.0.0.1:5000')
    app.run(debug=True)
