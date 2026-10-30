export const CFG = {
  // Town: N x N city blocks, streets on a (N+1) x (N+1) grid of intersections.
  blocks: 10,
  spacing: 14, // distance between neighbouring intersections
  streetW: 4.4,
  sidewalk: 1.0,

  baseSpeed: 11,
  maxSpeed: 19,
  speedPerApple: 0.35,
  jumpDur: 0.65,
  jumpH: 2.6,

  startLength: 5, // metres of body behind the head model
  growPerApple: 3,
  bodyRadius: 0.32,
  segSpacing: 0.6, // spacing of tail collision points

  carSpeed: 9,
  maxCars: 7,
  carSpawnEvery: 2.2,
  obstacleCount: 12,
  appleCount: 3,
};

// Grid helpers shared by the town, snake and traffic.
export const N = CFG.blocks;
export const HALF = (N * CFG.spacing) / 2;
export const DIRS = [
  { dx: 0, dz: -1 }, // 0: north (-z)
  { dx: 1, dz: 0 }, // 1: east
  { dx: 0, dz: 1 }, // 2: south
  { dx: -1, dz: 0 }, // 3: west
];
export const nodeX = (i) => i * CFG.spacing - HALF;
export const nodeZ = (j) => j * CFG.spacing - HALF;
export const inGrid = (i, j) => i >= 0 && j >= 0 && i <= N && j <= N;
export const yawFor = (dir) => Math.atan2(DIRS[dir].dx, DIRS[dir].dz) + Math.PI; // model front is -z
