import './config/loadEnv.js';
import { jobPollingLoop } from './services/jobPollingLoop.js';
import http from "http";

const PORT = process.env.PORT || 3000;

// Minimal health endpoint so external pingers can keep Render awake
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Health server listening on ${PORT}`);
});

// Start polling loop without awaiting so the HTTP server becomes immediately available
jobPollingLoop().catch((err) => {
  console.error("jobPollingLoop failed to start", err);
});
