const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const players = {}; // socket.id -> { x, y, z, name, color }

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // 新規プレイヤー生成
  players[socket.id] = {
    id: socket.id,
    x: 0,
    y: 1,
    z: 0,
    name: "Player_" + socket.id.slice(0, 4),
    color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")
  };

  // 既存プレイヤー一覧と自分を送る
  socket.emit("init", {
    id: socket.id,
    players
  });

  // 他クライアントに新規参加を通知
  socket.broadcast.emit("player-joined", players[socket.id]);

  // 位置更新
  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;
    socket.broadcast.emit("player-moved", players[socket.id]);
  });

  // チャット
  socket.on("chat", (msg) => {
    if (!players[socket.id]) return;
    io.emit("chat", {
      from: players[socket.id].name,
      message: msg
    });
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    if (players[socket.id]) {
      io.emit("player-left", { id: socket.id });
      delete players[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
