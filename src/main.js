const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    
    // 薄暗いフォグ効果
    scene.clearColor = new BABYLON.Color3(0.1, 0.08, 0.05);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    scene.fogDensity = 0.08;
    scene.fogColor = new BABYLON.Color3(0.1, 0.08, 0.05);

    // 1. カメラ設定（PC・モバイル対応）
    const camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.5, 0), scene);
    camera.attachControl(canvas, true);
    camera.speed = 0.2;
    camera.angularSensibility = 2000;
    camera.keysUp.push(87); camera.keysDown.push(83); camera.keysLeft.push(65); camera.keysRight.push(68);
    camera.inputs.attached.touch.touchAngularSensibility = 4000;
    camera.inputs.attached.touch.touchMoveSensibility = 500;
    scene.collisionsEnabled = true;
    camera.checkCollisions = true;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.4, 0.8, 0.4);

    canvas.addEventListener("click", () => { canvas.requestPointerLock(); });

    // 2. ライト設定
    const ambientLight = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.2;
    
    const flashlight = new BABYLON.PointLight("flashlight", new BABYLON.Vector3(0, 0, 0), scene);
    flashlight.intensity = 0.8;
    flashlight.range = 15;
    scene.registerBeforeRender(() => { flashlight.position.copyFrom(camera.position); });

    // 3. マテリアル設定
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.75, 0.7, 0.45);
    wallMat.specularColor = new BABYLON.Color3(0, 0, 0);

    const doorMat = new BABYLON.StandardMaterial("doorMat", scene);
    doorMat.diffuseColor = new BABYLON.Color3(0.5, 0.1, 0.1); // 不気味な赤い非常口のドア

    // 4. 無限ステージの土台
    const masterWall = BABYLON.MeshBuilder.CreateBox("masterWall", {width: 2, height: 3, depth: 0.2}, scene);
    masterWall.material = wallMat;
    masterWall.isVisible = false;

    const ground = BABYLON.MeshBuilder.CreatePlane("ground", {size: 100}, scene);
    ground.rotation.x = Math.PI / 2;
    ground.checkCollisions = true;

    const ceiling = BABYLON.MeshBuilder.CreatePlane("ceiling", {size: 100}, scene);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = 3;

    let wallInstances = [];
    const chunkSize = 20;
    const wallSpacing = 2;

    // 無限の壁配置をきめるノイズ関数
    function checkWallData(x, z) {
        // 出口のドアがある座標（X:10, Z:10）の周囲には壁を作らないようにする（バグ防止）
        if (Math.abs(x - 10) < 3 && Math.abs(z - 10) < 3) return false;
        
        const noise = Math.sin(x * 0.4) * Math.cos(z * 0.4) + Math.sin(x * 0.1);
        return noise > 0.3;
    }

    function updateWorld() {
        const playerX = Math.floor(camera.position.x / wallSpacing) * wallSpacing;
        const playerZ = Math.floor(camera.position.z / wallSpacing) * wallSpacing;

        wallInstances.forEach(w => w.dispose());
        wallInstances = [];

        for (let x = playerX - chunkSize; x <= playerX + chunkSize; x += wallSpacing) {
            for (let z = playerZ - chunkSize; z <= playerZ + chunkSize; z += wallSpacing) {
                if (checkWallData(x, z)) {
                    const instance = masterWall.createInstance(`wall_${x}_${z}`);
                    instance.position.set(x, 1.5, z);
                    instance.checkCollisions = true;
                    wallInstances.push(instance);
                }
            }
        }
        ground.position.x = camera.position.x; ground.position.z = camera.position.z;
        ceiling.position.x = camera.position.x; ceiling.position.z = camera.position.z;
    }

    updateWorld();

    // ==========================================
    // 【新機能】5. 出口（ドア）の読み込みと管理システム
    // ==========================================
    let activeExits = []; // 現在配置されている出口のリスト

    async function loadLevelConfig(levelName) {
        try {
            // level0.txt を読み込む
            const response = await fetch(`./levels/${levelName}.txt`);
            const text = await response.text();
            
            // 行ごとに分解して解析
            const lines = text.split("\n");
            lines.forEach(line => {
                // コメント行や空行を無視
                if (line.startsWith("#") || line.trim() === "" || line.startsWith("[")) return;

                // カンマでデータを分割
                const data = line.split(",");
                if (data[0].trim() === "door") {
                    const type = data[0].trim();
                    const name = data[1].replace(/"/g, "").trim();
                    const posX = parseFloat(data[2]);
                    const posY = parseFloat(data[3]);
                    const posZ = parseFloat(data[4]);
                    const targetLevel = data[5].trim();

                    // 出口ドアの3Dモデルを作成
                    const door = BABYLON.MeshBuilder.CreateBox("exitDoor", {width: 1.5, height: 2.5, depth: 0.1}, scene);
                    door.position.set(posX, posY + 1.25, posZ);
                    door.material = doorMat;
                    door.checkCollisions = true;

                    // 出口のデータを保存
                    activeExits.push({
                        mesh: door,
                        name: name,
                        target: targetLevel
                    });
                }
            });
        } catch (error) {
            console.error("レベルファイルの読み込みに失敗しました:", error);
        }
    }

    // Level 0 の設定を読み込む
    loadLevelConfig("level0");


    // ==========================================
    // 6. 毎フレームのループ処理（移動・当たり判定）
    // ==========================================
    let lastParamX = camera.position.x;
    let lastParamZ = camera.position.z;
    
    scene.registerBeforeRender(() => {
        // プレイヤーが動いたら無限迷路を更新
        const dist = BABYLON.Vector3.Distance(
            new BABYLON.Vector3(lastParamX, 0, lastParamZ), 
            new BABYLON.Vector3(camera.position.x, 0, camera.position.z)
        );
        if (dist > 2) {
            updateWorld();
            lastParamX = camera.position.x;
            lastParamZ = camera.position.z;
        }

        // 出口のドアへの接近判定
        activeExits.forEach(exit => {
            const distanceToPlayer = BABYLON.Vector3.Distance(camera.position, exit.mesh.position);
            
            // ドアに1.5メートルまで近づいたら次のレベルへワープ
            if (distanceToPlayer < 1.5) {
                alert(`${exit.name} に到達！ ${exit.target} へ移動します...`);
                
                // 本来はここで次のレベルのjs/txtを読み直します
                // 今回はデモとしてプレイヤーの座標をリセット
                camera.position.set(0, 1.5, 0); 
            }
        });
    });

    return scene;
};

const scene = createScene();
engine.runRenderLoop(function () { scene.render(); });
window.addEventListener("resize", function () { engine.resize(); });
