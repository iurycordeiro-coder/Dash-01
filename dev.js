#!/usr/bin/env node
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🚀 Starting development servers...\n");

// Start Vite server
const vite = spawn("npm", ["run", "dev:vite"], {
  cwd: __dirname,
  stdio: "inherit",
  shell: true,
});

// Start Node server
const server = spawn("npm", ["run", "dev:server"], {
  cwd: __dirname,
  stdio: "inherit",
  shell: true,
});

// Handle termination
process.on("SIGINT", () => {
  console.log("\n\nShutting down servers...");
  vite.kill();
  server.kill();
  process.exit(0);
});

vite.on("error", (error) => {
  console.error("Vite error:", error);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});
