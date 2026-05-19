const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    
    // バックルーム特有の薄暗い空気感（フォグ：霧）
    scene.clearColor = new BABYLON.Color3(0.1, 0.08, 0.05);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    scene.fogDensity = 0.08;
    scene.fogColor = new BABYLON.Color3(0.1, 0.08, 0.05);

    // ==========================================
    // 1. カメラ設定（PC・モバイル自動両対応）
    // ==========================================
    const camera = new BABYLON.UniversalCamera("playerCam", new BABYLON.Vector3(0, 1.5, 0), scene);
    camera.attachControl(canvas, true);
    
    // 移動速度と入力設定（PC用）
    camera.speed = 0.2;
    camera.angularSensibility = 2000; // マウス感度
    camera.keysUp.push(87);    // W
    camera.keysDown.push(83);  // S
    camera.keysLeft.push(65);  // A
    camera.keysRight.push(68); // D

    // モバイル用の簡易画面タッチ視点移動設定
    // （UniversalCameraは標準でスマホのタッチ移動・スワイプ視点移動に対応しています）
    camera.inputs.attached.touch.touchAngularSensibility = 4000;
    camera.inputs.attached.touch.touchMoveSensibility = 500;

    // プレイヤーの当たり判定（壁を突き抜けないようにする）
    scene.collisionsEnabled = true;
    camera.checkCollisions = true;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.4, 0.8, 0.4); // プレイヤーのサイズ

    // PC用のポインターロック（画面クリックでマウスを隠す）
    canvas.addEventListener("click", () => {
        canvas.requestPointerLock();
    });

    // ==========================================
    // 2. ライト（照明）の設定
    // ==========================================
    // ほんのり全体を照らす環境光（Level 0の不気味な黄色）
    const ambientLight = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.2;
    ambientLight.diffuse = new BABYLON.Color3(0.8, 0.7, 0.5);

    // プレイヤーが持つ懐中電灯（または頭上の蛍光灯の代わり）
    const flashlight = new BABYLON.PointLight("flashlight", new BABYLON.Vector3(0, 0, 0), scene);
    flashlight.intensity = 0.8;
    flashlight.range = 15;
    flashlight.diffuse = new BABYLON.Color3(0.9, 0.85, 0.7);
    
    // ライトをカメラ（プレイヤー）に追従させる
    scene.registerBeforeRender(() => {
        flashlight.position.copyFrom(camera.position);
    });

    // ==========================================
    // 3. マテリアル（見た目・質感）の設定
    // ==========================================
    // 壁の見た目（Level 0の黄色い壁紙っぽさ）
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.75, 0.7, 0.45); // テクスチャがない場合の仮の黄色
    wallMat.specularColor = new BABYLON.Color3(0, 0, 0); // テカテカさせない

    // 床の見た目（湿ったカーペット）
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.25);

    // 天井の見た目
    const ceilingMat = new BABYLON.StandardMaterial("ceilingMat", scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.55);

    // ==========================================
    // 4. 超軽量・無限生成の土台（インスタンス化システム）
    // ==========================================
    // マスター（原型）となる壁を作る（これは非表示にして、コピーだけを使う）
    const masterWall = BABYLON.MeshBuilder.CreateBox("masterWall", {width: 2, height: 3, depth: 0.2}, scene);
    masterWall.material = wallMat;
    masterWall.checkCollisions = true;
    masterWall.isVisible = false; // 原型は隠す

    // 床と天井（今回はプレイヤーの周りに付いてくる無限風の床）
    const ground = BABYLON.MeshBuilder.CreatePlane("ground", {size: 100}, scene);
    ground.rotation.x = Math.PI / 2;
    ground.material = groundMat;
    ground.checkCollisions = true;

    const ceiling = BABYLON.MeshBuilder.CreatePlane("ceiling", {size: 100}, scene);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = 3;
    ceiling.material = ceilingMat;

    // 配置したインスタンスを管理する配列
    let wallInstances = [];
    const chunkSize = 20; // プレイヤーの周囲どれくらいの広さに壁を作るか
    const wallSpacing = 2; // 壁を置く間隔

    // 簡易的なノイズ関数（数式で迷路を作る）
    function checkWallData(x, z) {
        // 数学的なサイン波を組み合わせて、無限に続くランダムな壁の配置を決める
        // 本格化するときはここを「パーリンノイズ」や「txtファイル解析」に置き換えます
        const noise = Math.sin(x * 0.4) * Math.cos(z * 0.4) + Math.sin(x * 0.1);
        return noise > 0.3; // 0.3より大きければそこに壁を置く
    }

    // プレイヤーの周りの壁をリアルタイムに生成・削除する関数
    function updateWorld() {
        // プレイヤーの現在の立ち位置を基準にする
        const playerX = Math.floor(camera.position.x / wallSpacing) * wallSpacing;
        const playerZ = Math.floor(camera.position.z / wallSpacing) * wallSpacing;

        // 一旦古いインスタンスをすべて削除（超軽量化のキモ：画面外の壁は消す）
        wallInstances.forEach(w => w.dispose());
        wallInstances = [];

        // プレイヤーの周囲（chunkSizeの範囲）をループして壁を配置
        for (let x = playerX - chunkSize; x <= playerX + chunkSize; x += wallSpacing) {
            for (let z = playerZ - chunkSize; z <= playerZ + chunkSize; z += wallSpacing) {
                
                if (checkWallData(x, z)) {
                    // インスタンス（超軽量コピー）を作成
                    const instance = masterWall.createInstance(`wall_${x}_${z}`);
                    instance.position.set(x, 1.5, z);
                    instance.checkCollisions = true; // コピーにも当たり判定を引き継ぐ
                    wallInstances.push(instance);
                }
            }
        }

        // 床と天井もプレイヤーの足元に常に移動させる（無限の錯覚）
        ground.position.x = camera.position.x;
        ground.position.z = camera.position.z;
        ceiling.position.x = camera.position.x;
        ceiling.position.z = camera.position.z;
    }

    // ゲームが始まる時に最初のマップを作る
    updateWorld();

    // プレイヤーが一定距離動くたびに、周りのマップを再計算（無限生成）
    let lastParamX = camera.position.x;
    let lastParamZ = camera.position.z;
    
    scene.registerBeforeRender(() => {
        const dist = BABYLON.Vector3.Distance(
            new BABYLON.Vector3(lastParamX, 0, lastParamZ), 
            new BABYLON.Vector3(camera.position.x, 0, camera.position.z)
        );
        // 2ユニット（壁1枚分）歩いたら世界を更新
        if (dist > 2) {
            updateWorld();
            lastParamX = camera.position.x;
            lastParamZ = camera.position.z;
        }
    });

    return scene;
};

const scene = createScene();

// 毎フレーム描画を実行
engine.runRenderLoop(function () {
    scene.render();
});

// 画面サイズが変わったら自動調整（スマホの縦横切り替えにも対応）
window.addEventListener("resize", function () {
    engine.resize();
});
