# ⏱️ sync-autoreboot

`sync-autoreboot` is a lightweight utility written in javascript (using Node.js) that acts as a system watchdog. It monitors whether the local clock is synchronized with a reference server. If it detects significant time drift or a connection failure, it can automatically reboot the system.

---

## 🚀 Purpose

- 👉 Automatically reboot the system if the local time drifts too much.
- 👉 Detect loss of connectivity or time service failure.
- 👉 Avoid accumulated errors in systems that rely on accurate time.
- 👉 Easily configurable via `.env` file.

---

## ⚙️ Execution Modes

You can run it as a client, server, or both:

```bash
node app.js --server         # Server only
node app.js --client         # Client watchdog only
node app.js --server --client # Both at the same time
```

---

## 🌐 Server Mode

Exposes an HTTP endpoint that returns the current UTC timestamp:

- **Endpoint:** `GET /api/timestamp`
- **JSON Response:** `{ "timestamp": "2025-05-04T13:00:00.000Z" }`

---

## 💻 Client Mode

Periodically checks if the local system time matches the server.

If the time difference exceeds the defined threshold (`ALLOWED_DIFFERENCE`), or the server is unreachable for too long (`TIMEOUT_DURATION`), it triggers an alarm and reboots the system (with protection against rapid consecutive reboots).

---

## 🧪 Environment Variables

Create a `.env` file to configure your settings:

```ini
# Client
CHECK_INTERVAL=60              # Time between checks (seconds)
ALLOWED_DIFFERENCE=3600        # Allowed time drift (seconds)
TIMEOUT_DURATION=180           # Grace period before reboot (seconds)
MIN_REBOOT_INTERVAL=3600       # Minimum interval between reboots (seconds)

# Server
PORT=51823
DOMAIN=localhost

# Environment
NODE_ENV=production
```

### 🧰 Development mode

When `NODE_ENV=development` is set, the system **does not actually reboot**.  
Instead, it runs a harmless `echo` command to simulate the reboot:

- On Windows: `cmd /c echo Win Shutdown`
- On Linux/macOS: `echo Unix Shutdown`

This allows you to safely test the watchdog behavior without restarting your machine during development.

---

## 📦 Useful Scripts (`package.json`)

```json
"scripts": {
  "start:client": "node app.js --client",
  "start:server": "node app.js --server",
  "start:both": "node app.js --server --client",
  "start:dev": "NODE_ENV=development node app.js --server --client"
}
```

---

## 🛠️ Requirements

- Node.js v14 or newer
- Access to reboot/shutdown commands
- Admin privileges to execute system reboots

---

## 🧠 License

MIT – Free to use, modify, and adapt.
