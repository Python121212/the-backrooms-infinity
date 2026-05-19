const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    
    // 1. カメラと基本設定（PC/モバイル対応）
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

    // 2. ライティング
    const ambientLight = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.2;
    const flashlight = new BABYLON.PointLight("flashlight", new BABYLON.Vector3(0, 0, 0), scene);
    flashlight.intensity = 0.8;
    flashlight.range = 15;
    scene.registerBeforeRender(() => { flashlight.position.copyFrom(camera.position); });

    // 3. 共通アセットの作成（デフォルトはLevel 0の黄色）
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.75, 0.7, 0.45);
    wallMat.specularColor = new BABYLON.Color3(0, 0, 0);

    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.25);

    const ceilingMat = new BABYLON.StandardMaterial("ceilingMat", scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.55);

    const doorMat = new BABYLON.StandardMaterial("doorMat", scene);
    doorMat.diffuseColor = new BABYLON.Color3(0.5, 0.1, 0.1);

    const masterWall = BABYLON.MeshBuilder.CreateBox("masterWall", {width: 2, height: 3, depth: 0.2}, scene);
    masterWall.material = wallMat;
    masterWall.isVisible = false;

    const ground = BABYLON.MeshBuilder.CreatePlane("ground", {size: 100}, scene);
    ground.rotation.x = Math.PI / 2;
    ground.material = groundMat;
    ground.checkCollisions = true;

    const ceiling = BABYLON.MeshBuilder.CreatePlane("ceiling", {size: 100}, scene);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = 3;
    ceiling.material = ceilingMat;

    // 4. 無限生成エンジン
    let wallInstances = [];
    const chunkSize = 20;
    const wallSpacing = 2;
    
    // デフォルトのノイズ（Level 0用）
    let currentNoiseAlgorithm = (x, z) => {
        if (Math.abs(x - 10) < 3 && Math.abs(z - 10) < 3) return false; // ドア周辺は空ける
        const noise = Math.sin(x * 0.4) * Math.cos(z * 0.4) + Math.sin(x * 0.1);
        return noise > 0.3;
    };

    function updateWorld() {
        const playerX = Math.floor(camera.position.x / wallSpacing) * wallSpacing;
        const playerZ = Math.floor(camera.position.z / wallSpacing) * wallSpacing;

        wallInstances.forEach(w => w.dispose());
        wallInstances = [];

        for (let x = playerX - chunkSize; x <= playerX + chunkSize; x += wallSpacing) {
            for (let z = playerZ - chunkSize; z <= playerZ + chunkSize; z += wallSpacing) {
                if (currentNoiseAlgorithm(x, z)) {
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

    // 他のレベルJSファイルからシステムを操作できるように公開するオブジェクト
    const systems = {
        masterWall: masterWall,
        ground: ground,
        ceiling: ceiling,
        updateWorld: updateWorld,
        setNoiseAlgorithm: (newAlgo) => { currentNoiseAlgorithm = newAlgo; }
    };

    // 5. 【究極の拡張】動的レベルマネージャー機能
    let activeExits = [];

    async function switchLevel(levelName) {
        // 現在ある古い出口のドアを画面から全消去
        activeExits.forEach(exit => exit.mesh.dispose());
        activeExits = [];

        try {
            // 1. .txt ファイルから新しい出口データを読み込む
            const response = await fetch(`./levels/${levelName}.txt`);
            const text = await response.text();
            const lines = text.split("\n");
            
            lines.forEach(line => {
                if (line.startsWith("#") || line.trim() === "" || line.startsWith("[")) return;
                const data = line.split(",");
                if (data[0].trim() === "door") {
                    const name = data[1].replace(/"/g, "").trim();
                    const posX = parseFloat(data[2]);
                    const posY = parseFloat(data[3]);
                    const posZ = parseFloat(data[4]);
                    const targetLevel = data[5].trim();

                    const door = BABYLON.MeshBuilder.CreateBox("exitDoor", {width: 1.5, height: 2.5, depth: 0.1}, scene);
                    door.position.set(posX, posY + 1.25, posZ);
                    door.material = doorMat;
                    door.checkCollisions = true;

                    activeExits.push({ mesh: door, name: name, target: targetLevel });
                }
            });

            // 2. 【ここがキモ】対応する .js ファイルを「動的インポート」して、そのレベルのルールを実行
            // プレイヤーがドアに触れた瞬間に初めて、そのレベルのファイルをネット経由で読み込みます（超軽量）
            const levelModule = await import(`./levels/${levelName}.js`);
            levelModule.init(scene, camera, systems);

        } catch (error) {
            console.error(`${levelName} の読み込みに失敗しました。ファイルが存在するか確認してください。`, error);
        }
    }

    // ゲーム起動時はまず「level0」を読み込む
    // ※ 起動用に便宜上、最初はLevel0のtxt情報を手動適用するか、level0.jsも同様に作っておくと綺麗です。
    switchLevel("level0");

    // 6. ループ処理とワープ判定
    let lastParamX = camera.position.x;
    let lastParamZ = camera.position.z;
    
    scene.registerBeforeRender(() => {
        // プレイヤー移動時の無限生成
        const dist = BABYLON.Vector3.Distance(
            new BABYLON.Vector3(lastParamX, 0, lastParamZ), 
            new BABYLON.Vector3(camera.position.x, 0, camera.position.z)
        );
        if (dist > 2) {
            updateWorld();
            lastParamX = camera.position.x;
            lastParamZ = camera.position.z;
        }

        // ドアへの接近（レベル遷移）チェック
        activeExits.forEach(exit => {
            const distanceToPlayer = BABYLON.Vector3.Distance(camera.position, exit.mesh.position);
            if (distanceToPlayer < 1.2) {
                console.log(`${exit.target} へシームレスに移動します...`);
                switchLevel(exit.target); // 次のレベルへスイッチ！
            }
        });
    });

    return scene;
};

const scene = createScene();
engine.runRenderLoop(function () { scene.render(); });
window.addEventListener("resize", function () { engine.resize(); });
