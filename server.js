const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const players = {}; // socket.id -> { id, name, color, x, y, z, room }

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  // 仮プレイヤー作成（部屋に入るまでは room 未設定）
  players[socket.id] = {
    id: socket.id,
    name: "Player_" + socket.id.slice(0, 4),
    color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
    x: 0,
    y: 1,
    z: 0,
    room: null
  };

  // 部屋に入る
  socket.on("join-room", (roomName) => {
    const p = players[socket.id];
    if (!p) return;

    // すでに別の部屋にいたら抜ける
    if (p.room) {
      socket.leave(p.room);
    }

    p.room = roomName;
    socket.join(roomName);

    // その部屋のプレイヤー一覧を返す
    const roomPlayers = Object.values(players).filter(pl => pl.room === roomName);
    socket.emit("room-init", {
      me: p,
      players: roomPlayers
    });

    // 他の参加者に通知
    socket.to(roomName).emit("player-joined", p);
  });

  // 位置更新（同じ部屋の人にだけ送る）
  socket.on("move", (data) => {
    const p = players[socket.id];
    if (!p || !p.room) return;

    p.x = data.x;
    p.y = data.y;
    p.z = data.z;

    socket.to(p.room).emit("player-moved", p);
  });

  // テキストチャット（部屋内）
  socket.on("chat", (msg) => {
    const p = players[socket.id];
    if (!p || !p.room) return;

    io.to(p.room).emit("chat", {
      from: p.name,
      message: msg
    });
  });

  // WebRTC シグナリング（部屋内の相手にだけ）
  socket.on("webrtc-offer", ({ to, offer }) => {
    if (!players[to]) return;
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    if (!players[to]) return;
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice", ({ to, candidate }) => {
    if (!players[to]) return;
    io.to(to).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    const p = players[socket.id];
    if (p && p.room) {
      io.to(p.room).emit("player-left", { id: socket.id });
    }
    delete players[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
