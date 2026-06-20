# Web VRChat-like 3D Chat



Three.js + Socket.IO で作った、ブラウザ上で動く簡易 3D マルチプレイチャットです。



## セットアップ



```bash

git clone https://github.com/<your-name>/web-vrchat-like.git

cd web-vrchat-like

npm install

npm start

ブラウザで http://localhost:3000 を開いてください。

```

複数タブや別デバイスからアクセスすると、他プレイヤーの箱キャラが同期して動き、チャットも共有されます。

---



## GitHub に上げる手順（ざっくり）



1. 新しいリポジトリを GitHub 上で作成（例: `web-vrchat-like`）  

2. ローカルで上記構成のファイルを作成  

3. 以下を実行:



```bash

git init

git add .

git commit -m "Initial web VRChat-like prototype"

git remote add origin https://github.com/<your-name>/web-vrchat-like.git

git push -u origin main

```

