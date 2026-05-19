// level1.js - レベル1の固有データ
export function init(scene, camera, systems) {
    console.log("Level 1 'Habitable Zone' が起動しました。");

    // 1. プレイヤーの位置を設定
    camera.position.set(0, 1.5, 0);

    // 2. Level 1 専用の見た目（コンクリートのような灰色の壁）に変える
    const wallMat = new BABYLON.StandardMaterial("level1WallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35); // 灰色
    wallMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    systems.masterWall.material = wallMat;

    // 床と天井の色もインダストリアルな雰囲気に
    systems.ground.material.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    systems.ceiling.material.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);

    // 3. 霧（フォグ）をさらに濃くして、視界を悪くする不気味な演出
    scene.fogDensity = 0.12;
    scene.fogColor = new BABYLON.Color3(0.05, 0.05, 0.07);

    // 4. 無限生成のノイズパターンを「Level 1専用」に上書きする
    systems.setNoiseAlgorithm((x, z) => {
        // Level 0とは違う、細長く続く廊下のような構造を作る数式
        const noise = Math.sin(x * 0.1) * Math.cos(z * 0.8);
        return noise > 0.4;
    });

    // 世界を再描画
    systems.updateWorld();
}
