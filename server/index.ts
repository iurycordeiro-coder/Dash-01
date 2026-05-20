import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, type WebSocket } from "ws";
import { initializeDatabase } from "./db.js";
import apiRouter from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Armazenar clientes WebSocket conectados
const connectedClients = new Set<WebSocket>();

// Função para broadcast de atualizações
export function broadcastDataUpdate(data: any) {
  connectedClients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(JSON.stringify({
        type: "data-update",
        payload: data,
        timestamp: new Date().toISOString(),
      }));
    }
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Inicializar banco de dados
  try {
    await initializeDatabase();
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Passar a função de broadcast para o router de API
  app.use((req, res, next) => {
    (req as any).broadcastDataUpdate = broadcastDataUpdate;
    next();
  });

  // API routes DEVEM vir PRIMEIRO, antes de tudo
  app.use(apiRouter);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes (DEVE SER O ÚLTIMO)
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // WebSocket para sincronização em tempo real
  wss.on("connection", (ws) => {
    console.log("✅ New WebSocket connection");
    connectedClients.add(ws);

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "data-update") {
          // Broadcast para todos os clientes
          broadcastDataUpdate(data.payload);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("❌ WebSocket connection closed");
      connectedClients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      connectedClients.delete(ws);
    });
  });

  const port = Number(process.env.PORT) || 3001;

  server.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${port}/`);
    console.log(`📡 WebSocket server ready for connections`);
  });
}

startServer().catch(console.error);
