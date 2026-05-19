// level0.js - すべての始まり「The Lobby」の固有データ
export function init(scene, camera, systems) {
    console.log("Level 0 'The Lobby' が起動しました。");

    // 1. プレイヤーの初期位置（迷路のスタート地点）
    camera.position.set(0, 1.5, 0);

    // 2. Level 0 専用の見た目（あの不気味な黄色い壁）
    const wallMat = new BABYLON.StandardMaterial("level0WallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.75, 0.7, 0.45); // くすんだ黄色
    wallMat.specularColor = new BABYLON.Color3(0, 0, 0);       // テカテカさせない（マットな質感）
    systems.masterWall.material = wallMat;

    // 床（濡れたような湿ったカーペット）
    systems.ground.material.diffuseColor = new BABYLON.Color3(0.4, 0.35, 0.25); // 暗いベージュ

    // 天井（オフィスのような無機質なパネル）
    systems.ceiling.material.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.55); // 薄いグレー

    // 3. Level 0 専用の空気感（うっすら先が見えなくなる霧）
    scene.fogDensity = 0.08;
    scene.fogColor = new BABYLON.Color3(0.1, 0.08, 0.05); // 黄色みがかった闇

    // 4. Level 0 専用の「無限迷路」を生成する数式（アルゴリズム）を設定
    systems.setNoiseAlgorithm((x, z) => {
        // 出口のドアがある座標（X:10, Z:10）の周囲には壁を作らない（埋まり防止）
        if (Math.abs(x - 10) < 3 && Math.abs(z - 10) < 3) return false;
        
        // 三角関数（サイン・コサイン）を組み合わせて、無限に続くランダムな壁の配置を作る
        const noise = Math.sin(x * 0.4) * Math.cos(z * 0.4) + Math.sin(x * 0.1);
        
        // 計算結果が 0.3 より大きい場所に壁（インスタンス）を配置する
        return noise > 0.3;
    });

    // 5. 設定したアルゴリズムで、プレイヤーの周りに最初の世界を描画する
    systems.updateWorld();
}
