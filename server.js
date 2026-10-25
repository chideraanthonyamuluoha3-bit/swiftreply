
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

app.use(express.static(path.join(__dirname)));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "SwiftReply",
    message: "SwiftReply server is running."
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SwiftReply server running on port ${PORT}`);
});
