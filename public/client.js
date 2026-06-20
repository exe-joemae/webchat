const socket = io();

// ===== Three.js 基本セットアップ =====
let scene, camera, renderer;
let myId = null;
const players = {}; // id -> { info, mesh }

initThree();
animate();

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202030);

  const width = window.innerWidth;
  const height = window.innerHeight;

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(light);

  const floorGeo = new THREE.PlaneGeometry(50, 50);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== プレイヤー生成・更新 =====
function createPlayerMesh(player) {
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: player.color || 0xffffff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(player.x, player.y, player.z);
  scene.add(mesh);
  return mesh;
}

// ===== 入力処理 =====
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

let yaw = 0;
let pitch = 0;
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener("mousedown", (e) => {
  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener("mouseup", () => (isMouseDown = false));

window.addEventListener("mousemove", (e) => {
  if (!isMouseDown) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  yaw -= dx * 0.005;
  pitch -= dy * 0.005;
  pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
});

// 自キャラの位置
const myPos = { x: 0, y: 1, z: 0 };
const speed = 0.1;

// ===== Room UI =====
const roomForm = document.getElementById("room-form");
const roomInput = document.getElementById("room-input");
const roomStatus = document.getElementById("room-status");

let currentRoom = null;

roomForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = roomInput.value.trim();
  if (!roomName) return;
  socket.emit("join-room", roomName);
});

// ===== Voice Chat =====
let localStream = null;
const peers = {}; // peerId -> RTCPeerConnection
const voiceToggle = document.getElementById("voice-toggle");
const voiceStatus = document.getElementById("voice-status");
let micEnabled = false;

voiceToggle.addEventListener("click", async () => {
  if (!micEnabled) {
    await startMic();
  } else {
    stopMic();
  }
});

async function startMic() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micEnabled = true;
    voiceToggle.textContent = "マイクON";
    voiceStatus.textContent = "マイク使用中";

    // 既存のピアにトラックを追加
    Object.values(peers).forEach(pc => {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    });
  } catch (err) {
    console.log("マイクが許可されませんでした", err);
    voiceStatus.textContent = "マイク許可されず";
  }
}

function stopMic() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  micEnabled = false;
  voiceToggle.textContent = "マイクOFF";
  voiceStatus.textContent = "マイク未使用";
}

// WebRTC ピア接続作成
function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = (event) => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice", { to: peerId, candidate: event.candidate });
    }
  };

  return pc;
}

// ===== Socket.IO イベント =====

// 部屋初期化
socket.on("room-init", (data) => {
  const { me, players: roomPlayers } = data;
  myId = me.id;
  currentRoom = me.room;
  roomStatus.textContent = `Room: ${currentRoom}`;

  // 既存メッシュ削除
  for (const id in players) {
    scene.remove(players[id].mesh);
    delete players[id];
  }

  // 部屋内プレイヤー再生成
  roomPlayers.forEach((p) => {
    const mesh = createPlayerMesh(p);
    players[p.id] = { info: p, mesh };
    if (p.id === myId) {
      myPos.x = p.x;
      myPos.y = p.y;
      myPos.z = p.z;
    }
  });
});

// 新規参加者
socket.on("player-joined", async (p) => {
  if (players[p.id]) return;
  const mesh = createPlayerMesh(p);
  players[p.id] = { info: p, mesh };

  // WebRTC 接続開始（自分側から Offer）
  const pc = createPeerConnection(p.id);
  peers[p.id] = pc;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("webrtc-offer", { to: p.id, offer });
});

// 位置更新
socket.on("player-moved", (p) => {
  const entry = players[p.id];
  if (!entry) return;
  entry.info = p;
  entry.mesh.position.set(p.x, p.y, p.z);
});

// 退出
socket.on("player-left", ({ id }) => {
  const entry = players[id];
  if (entry) {
    scene.remove(entry.mesh);
    delete players[id];
  }
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
});

// チャット
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentRoom) return;
  socket.emit("chat", text);
  chatInput.value = "";
});

socket.on("chat", (data) => {
  addChatLine(`${data.from}: ${data.message}`);
});

function addChatLine(text) {
  const div = document.createElement("div");
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// WebRTC シグナリング
socket.on("webrtc-offer", async ({ from, offer }) => {
  const pc = createPeerConnection(from);
  peers[from] = pc;

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("webrtc-answer", { to: from, answer });
});

socket.on("webrtc-answer", async ({ from, answer }) => {
  const pc = peers[from];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("webrtc-ice", async ({ from, candidate }) => {
  const pc = peers[from];
  if (!pc) return;
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

// ===== メインループ =====
function animate() {
  requestAnimationFrame(animate);

  const forward = (keys["w"] || keys["arrowup"]) ? 1 : (keys["s"] || keys["arrowdown"]) ? -1 : 0;
  const right = (keys["d"] || keys["arrowright"]) ? 1 : (keys["a"] || keys["arrowleft"]) ? -1 : 0;

  if (forward !== 0 || right !== 0) {
    const angle = yaw;
    const dx = Math.sin(angle) * forward + Math.cos(angle) * right;
    const dz = Math.cos(angle) * forward - Math.sin(angle) * right;
    myPos.x += dx * speed;
    myPos.z += dz * speed;

    if (currentRoom) {
      socket.emit("move", { x: myPos.x, y: myPos.y, z: myPos.z });
    }

    if (players[myId]) {
      players[myId].mesh.position.set(myPos.x, myPos.y, myPos.z);
    }
  }

  const camDist = 6;
  const camHeight = 3;
  const cx = myPos.x - Math.sin(yaw) * camDist;
  const cz = myPos.z - Math.cos(yaw) * camDist;
  const cy = myPos.y + camHeight;

  camera.position.set(cx, cy, cz);
  const target = new THREE.Vector3(myPos.x, myPos.y + 1.0, myPos.z);
  camera.lookAt(target);

  renderer.render(scene, camera);
}
