import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT || "8080", 10);
const server = createServer((_req, res) => {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end("EVERYTHING_WORKER_SMOKE_OK\n");
});

server.listen(port, "0.0.0.0");
