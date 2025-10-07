# VM Launcher (Flask + RealVNC integration)

This small demo app lets employees login to a website, see a list of VMs, and open the RealVNC Viewer on the Windows machine where the site runs. It tracks which VM is "in use" while the viewer process is running.

Important: This demo launches the RealVNC Viewer on the server where Flask runs (your Windows desktop). That means it's intended for running on a local admin machine, not a public server.

How it works
- Users login via a simple username/password form (demo users in `app.py`).
- The app stores VM metadata in `vms.json` and locks in `locks.json`.
- When a user clicks Connect the server launches the RealVNC viewer (using common install paths or the Start Menu .lnk) and creates a lock record. When the viewer process exits or the user logs out the lock is freed.

Run (PowerShell)

1. Install dependencies (use a virtualenv if you want):

```powershell
pip install flask
```

2. Run the app:

```powershell
python .\app.py
```

3. Open http://127.0.0.1:5000 in a browser.

Demo users:
- alice / password1
- bob / password2

Notes & next steps
- Replace the toy user store with a real authentication system (LDAP, OAuth, etc.).
- Add TLS and host binding if exposing beyond localhost.
- Improve reliability for launching .lnk files and handling viewer exits.
- Consider a client-side approach (browser extension/protocol handler) to open VNC from the user's machine instead of launching from the server.
