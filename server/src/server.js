import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import { connectDatabase } from "./config/db.js";
import { createApp } from "./app.js";

await connectDatabase();
const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
});
app.set("io", io);
server.listen(process.env.PORT || 5000, () =>
  console.log(`Server running on port ${process.env.PORT || 5000}`),
);
