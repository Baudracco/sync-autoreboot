const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config(); // Load environment variables from .env file

const PORT = process.env.PORT || 51823;
const DOMAIN = process.env.DOMAIN || "localhost";
const API_URL = `http://${DOMAIN}:${PORT}/api/timestamp`;
const env = process.env.NODE_ENV || "production"; //  By default, production

/**
 * Function to log messages with a timestamp.
 * @param {string} msg - The message to log.
 */
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[sync-autoreboot] [${ts}] ${msg}`);
}

/**
 * Function to check if the system is running in development mode.
 * @returns {boolean} True if the system is in development mode, false otherwise.
 */
function isDevelopmentMode() {
  return env === "development";
}

/**
 * Function to check if the system is running in production mode.
 * @returns {boolean} True if the system is in production mode, false otherwise.
 */
function isProductionMode() {
  return env === "production";
}

// Client Part >
const CHECK_INTERVAL = safeNumber(process.env.CHECK_INTERVAL, 60) * 1000; // 1 minute default
const ALLOWED_DIFFERENCE =
  safeNumber(process.env.ALLOWED_DIFFERENCE, 300) * 1000; // 5 minutes default
const TIMEOUT_DURATION = safeNumber(process.env.TIMEOUT_DURATION, 180) * 1000; // 3 minutes default
const MIN_REBOOT_INTERVAL =
  safeNumber(process.env.MIN_REBOOT_INTERVAL, 1800) * 1000; // 30 minutes default
const RESTART_GUARD_FILE = path.resolve(__dirname, "last_reboot.txt");

let alarm = false; // Alarm state
let timestamp_alarm = 0; // Timestamp for alarm timeout

/**
 * Function to safely parse environment variables as numbers, with a default value if not valid.
 * @param {any} envVar - The environment variable to parse.
 * @param {number} defaultValue - The default value to return if the environment variable is not valid.
 * @return {number} The parsed number or the default value.
 */
function safeNumber(envVar, defaultValue) {
  const num = Number(envVar);
  return Number.isFinite(num) && num >= 0 ? num : defaultValue;
}

/**
 * Function to check the timestamp from the server and compare it with the local timestamp.
 * If the difference is greater than the allowed difference, it sets the alarm.
 */
async function checkTimestamp() {
  try {
    const response = await axios.get(API_URL);
    const apiTimestamp = new Date(response.data.timestamp).getTime();
    const localTimestamp = Date.now();

    // redondear a tres decimales
    const diff = Math.abs(localTimestamp - apiTimestamp);
    if (diff > ALLOWED_DIFFERENCE) {
      log(`Timestamp out of sync (${diff} ms), setting alarm.`);
      setAlarm(true);
    } else {
      log(`Timestamp OK (${diff} ms)`);
      setAlarm(false);
    }
  } catch (error) {
    log(`Error getting timestamp from server: ${error.message}`);
    setAlarm(true);
  }
}

/**
 * Function to set the alarm state and manage the timeout.
 * @param {boolean} state - The state to set the alarm to (true or false).
 */
function setAlarm(state) {
  if (state && !alarm) {
    alarm = true;
    timestamp_alarm = Date.now() + TIMEOUT_DURATION;
    log(`Alarm timer activated`);
  } else if (!state && alarm) {
    alarm = false;
    timestamp_alarm = 0;
    log(`Alarm deactivated.`);
  }
}

/**
 * Function to get the last reboot timestamp from a file.
 * @returns {number} The last reboot timestamp in milliseconds.
 */
function getLastRebootTimestamp() {
  try {
    const data = fs.readFileSync(RESTART_GUARD_FILE, "utf-8");
    return parseInt(data.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/***
 * Function to set the last reboot timestamp in a file.
 */
function setLastRebootTimestamp() {
  try {
    fs.writeFileSync(RESTART_GUARD_FILE, Date.now().toString());
  } catch (err) {
    log(`Error writing reboot file: ${err.message}`);
  }
}

/**
 * Function to restart the system if the minimum reboot interval has passed.
 * It uses the platform-specific command to restart the system.
 */
function restartSystem() {
  const now = Date.now();
  const last = getLastRebootTimestamp();

  if (now - last < MIN_REBOOT_INTERVAL) {
    // If the last reboot was less than the minimum reboot interval, do not restart
    log("Restart skipped: protection interval not met.");
    return;
  }

  setLastRebootTimestamp();
  log("Restarting system...");

  const platform = process.platform;
  let cmd = "";
  // If the environment is development, we simulate the restart command
  if (isDevelopmentMode()) {
    cmd =
      platform === "win32" ? "cmd /c echo Win Shutdown" : "echo Unix Shutdown"; // Simulación de reinicio
  } else {
    cmd = platform === "win32" ? "shutdown /r /t 60" : "sudo shutdown -r +1"; // En linux tambien se puede usar "sudo reboot", pero es mejor usar shutdown por compatibilidad con sistemas que no tengan reboot
  }

  exec(cmd, (error, stdout, stderr) => {
    if (error || stderr) {
      if (error) {
        //ingles
        log(`Error restarting: ${error.message}`);
      }
      if (stderr) {
        log(`Error executing restart: ${stderr}`);
      }
    } else {
      log(`Restart command executed.`);
      if (stdout) {
        log(`${stdout}`);
      }
    }
  });
}

/**
 * Function to start the client mode.
 */
function startClient() {
  log(`Client mode activated.`);

  log(`Client settings:
    CHECK_INTERVAL: ${CHECK_INTERVAL / 1000} second(s)
    ALLOWED_DIFFERENCE: ${ALLOWED_DIFFERENCE / 1000} second(s)
    TIMEOUT_DURATION: ${TIMEOUT_DURATION / 1000} second(s)
    MIN_REBOOT_INTERVAL: ${MIN_REBOOT_INTERVAL / 1000} second(s)`);

  checkTimestamp(); // check the timestamp immediately after starting the client
  setInterval(() => {
    checkTimestamp();
    if (alarm && Date.now() >= timestamp_alarm) {
      restartSystem();
    }
  }, CHECK_INTERVAL); // check every CHECK_INTERVAL seconds
}

/**
 * Function to start the server mode.
 */
function startServer() {
  log(`Server mode activated.`);

  log(`Server settings:
    PORT: ${PORT}
    DOMAIN: ${DOMAIN}
    API_URL: ${API_URL}`);

  const app = express();

  // Endpoint for the timestamp API
  app.get("/api/timestamp", (req, res) => {
    const now = new Date().toISOString();
    // Get the IP address of the client
    const ip =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

    // Log the request with the IP address and timestamp
    log(`Timestamp requested from ${ip}: ${now}`);
    // Return the current timestamp in ISO format
    res.json({ timestamp: now });
  });

  // start the server
  app.listen(PORT, () => {
    log(`Timestamp server listening on port ${PORT}`);
  });
}

// Program Startup

// flags to start the server and/or client
// Executed with: node app.js --server --client
const args = process.argv.slice(2);
const isClient = args.includes("--client");
const isServer = args.includes("--server");

if (isDevelopmentMode()) {
  // Executed with: NODE_ENV=development node app.js --server --client
  //ingles
  log("Development mode activated.");
  log(`API URL: ${API_URL}`);
} else if (isProductionMode()) {
  // Executed with: NODE_ENV=production node app.js --server --client
  log("Production mode activated.");
  log(`API URL: ${API_URL}`);
} else {
  log("Unknown mode, assuming production mode.");
  // Executed with: node app.js --server --client
  // NODE_ENV is different from development and production, so we set it to production
  env = "production";
  log(`API URL: ${API_URL}`);
}

// Start server and client based on flags
if (isServer) startServer();

if (isClient) startClient();

// If no flags are provided, show usage instructions
if (!isServer && !isClient) {
  console.log("Uso: node app.js [--server] [--client]");
  console.log(
    "Ejemplos:\n  node app.js --server\n  node app.js --client\n  node app.js --server --client"
  );
}
