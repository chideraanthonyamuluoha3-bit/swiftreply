
const express = require("express");
const path = require("path");
const fs = require("fs");
const pino = require("pino");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DIR = path.join(__dirname, ".sessions");

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

let socket = null;
let pairingInProgress = false;
let lastPairingRequest = 0;
let connectionStatus = "disconnected";
let lastError = null;

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "SwiftReply",
    message: "SwiftReply server is running."
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    connected: connectionStatus === "connected",
    status: connectionStatus,
    error: lastError
  });
});

app.post("/api/pairing-code", async (req, res) => {
  if (pairingInProgress) {
    return res.status(409).json({
      error: "A pairing request is already in progress. Please wait."
    });
  }

  const now = Date.now();
  if (now - lastPairingRequest < 60000) {
    return res.status(429).json({
      error: "Please wait one minute before requesting another code."
    });
  }

  const phoneNumber = String(req.body.phoneNumber || "").replace(/\D/g, "");

  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({
      error: "Enter your phone number with country code, using digits only."
    });
  }

  if (socket && connectionStatus === "connected") {
    return res.status(409).json({
      error: "A WhatsApp account is already connected."
    });
  }

  pairingInProgress = true;
  lastPairingRequest = now;

  try {
    const baileys = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.default;
    const useMultiFileAuthState = baileys.useMultiFileAuthState;

    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const authDir = path.join(SESSION_DIR, "owner");
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } =
      await useMultiFileAuthState(authDir);

    socket = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        connectionStatus = "connected";
        lastError = null;
      }

      if (connection === "close") {
        connectionStatus = "disconnected";
        const error = lastDisconnect?.error;
        lastError = error?.message || "WhatsApp connection closed.";
        socket = null;
      }

      if (connection === "connecting") {
        connectionStatus = "connecting";
      }
    });

    if (state.creds.registered) {
      return res.status(409).json({
        error: "A saved WhatsApp session already exists. Check connection status."
      });
    }

    const code = await socket.requestPairingCode(phoneNumber);

    return res.json({
      ok: true,
      pairingCode: code,
      message: "Enter this code in WhatsApp on your phone. Pairing codes expire quickly."
    });
  } catch (error) {
    lastError = error?.message || "Pairing request failed.";
    connectionStatus = "disconnected";

    if (socket) {
      try {
        socket.end(undefined);
      } catch (_) {}
      socket = null;
    }

    console.error("SwiftReply pairing error:", error);
    return res.status(500).json({
      error: "Could not generate a pairing code.",
      details: lastError
    });
  } finally {
    pairingInProgress = false;
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SwiftReply server running on port ${PORT}`);
});
      
