import * as THREE from 'three';

const WARM_LIGHT = 0xfff5e0;

export class Lighting {
  constructor(scene) {
    const ambient = new THREE.AmbientLight(WARM_LIGHT, 0.8);
    scene.add(ambient);

    const target = new THREE.Object3D();
    target.position.set(0, 0.76, 0);
    scene.add(target);

    const ceilingKey = new THREE.DirectionalLight(WARM_LIGHT, 1.2);
    ceilingKey.name = 'WarmCeilingDirectionalLight';
    ceilingKey.position.set(0, 5, 0);
    ceilingKey.target = target;
    ceilingKey.castShadow = true;
    ceilingKey.shadow.mapSize.set(2048, 2048);
    ceilingKey.shadow.camera.near = 0.1;
    ceilingKey.shadow.camera.far = 12;
    ceilingKey.shadow.camera.left = -4;
    ceilingKey.shadow.camera.right = 4;
    ceilingKey.shadow.camera.top = 4;
    ceilingKey.shadow.camera.bottom = -4;
    scene.add(ceilingKey);

    const tableLights = [
      { name: 'LeftTablePointLight', position: [-1, 3, 0] },
      { name: 'RightTablePointLight', position: [1, 3, 0] },
    ];

    for (const lightSpec of tableLights) {
      const light = new THREE.PointLight(0xffffff, 0.8, 5.5, 1.65);
      light.name = lightSpec.name;
      light.position.set(...lightSpec.position);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      scene.add(light);

      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.08, 32),
        new THREE.MeshStandardMaterial({
          color: 0x202020,
          roughness: 0.42,
          metalness: 0.35,
        }),
      );
      fixture.name = `${lightSpec.name}Fixture`;
      fixture.position.set(lightSpec.position[0], lightSpec.position[1] + 0.08, lightSpec.position[2]);
      scene.add(fixture);
    }

    const ceilingFillPositions = [[-2, 4, 0], [0, 4, 0], [2, 4, 0]];
    for (const [x, y, z] of ceilingFillPositions) {
      const fillLight = new THREE.PointLight(WARM_LIGHT, 0.6, 8, 1.5);
      fillLight.position.set(x, y, z);
      scene.add(fillLight);
    }
  }
}
