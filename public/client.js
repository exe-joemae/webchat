const socket = io();

// ===== Three.js 基本セットアップ =====
let scene, camera, renderer;
let myId = null;
const players = {}; // id -> mesh

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

// ===== Socket.IO イベント =====
socket.on("init", (data) => {
  myId = data.id;
  for (const id in data.players) {
    const p = data.players[id];
    const mesh = createPlayerMesh(p);
    players[id] = { info: p, mesh };
    if (id === myId) {
      myPos.x = p.x;
      myPos.y = p.y;
      myPos.z = p.z;
    }
  }
});

socket.on("player-joined", (p) => {
  if (players[p.id]) return;
  const mesh = createPlayerMesh(p);
  players[p.id] = { info: p, mesh };
});

socket.on("player-moved", (p) => {
  const entry = players[p.id];
  if (!entry) return;
  entry.info = p;
  entry.mesh.position.set(p.x, p.y, p.z);
});

socket.on("player-left", ({ id }) => {
  const entry = players[id];
  if (!entry) return;
  scene.remove(entry.mesh);
  delete players[id];
});

socket.on("chat", (data) => {
  addChatLine(`${data.from}: ${data.message}`);
});

// ===== チャットUI =====
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat", text);
  chatInput.value = "";
});

function addChatLine(text) {
  const div = document.createElement("div");
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ===== メインループ =====
function animate() {
  requestAnimationFrame(animate);

  // 入力から自キャラ移動
  const forward = (keys["w"] || keys["arrowup"]) ? 1 : (keys["s"] || keys["arrowdown"]) ? -1 : 0;
  const right = (keys["d"] || keys["arrowright"]) ? 1 : (keys["a"] || keys["arrowleft"]) ? -1 : 0;

  if (forward !== 0 || right !== 0) {
    const angle = yaw;
    const dx = Math.sin(angle) * forward + Math.cos(angle) * right;
    const dz = Math.cos(angle) * forward - Math.sin(angle) * right;
    myPos.x += dx * speed;
    myPos.z += dz * speed;

    socket.emit("move", { x: myPos.x, y: myPos.y, z: myPos.z });

    if (players[myId]) {
      players[myId].mesh.position.set(myPos.x, myPos.y, myPos.z);
    }
  }

  // カメラを自キャラの後ろに配置
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
