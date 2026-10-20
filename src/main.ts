/**
 * 噪声地形演示页
 * ==============
 * 六种噪声/地形函数，共用一个固定大小的石头世界，方便截同一角度的对比图。
 *
 * 打开方式：
 *   /?mode=normal&seed=42
 *   mode: random | smooth | value | perlin | octaves | normal
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import stoneUrl from './assets/stone.png'
import {
  createGenerator,
  MAX_Y,
  MIN_Y,
  MODES,
  SEA_LEVEL,
  WORLD_SIZE
} from './heights'
import type {
  GeneratorOptions,
  HeightGenerator,
  HeightMode
} from './heights'

// ---------------------------------------------------------------- 参数
const params = new URLSearchParams(window.location.search)
let hudHidden = params.get('hud') === '0'

const parseMode = (value: string | null): HeightMode | null => {
  if (!value) return null

  const name = value.toLowerCase()
  const byName = MODES.find(item => item === name)
  if (byName) return byName

  const index = Number(name)
  if (Number.isInteger(index) && index >= 1 && index <= MODES.length) {
    return MODES[index - 1]
  }

  return null
}

let mode: HeightMode = parseMode(params.get('mode')) ?? 'random'
let seed = Number.parseInt(params.get('seed') ?? '', 10)
if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 100000)

// 文章配图用的隐藏参数，正常访问不用管
const firstOctaveParam = Number.parseInt(params.get('firstOctave') ?? '', 10)
const amplitudesParam = params.get('amplitudes')
const octaveOnlyParam = params.get('octaveOnly')
const componentScaleParam = Number.parseFloat(
  params.get('componentScale') ?? ''
)
const layersParam = params.get('layers')

const generatorOptions: GeneratorOptions = {
  firstOctave: Number.isFinite(firstOctaveParam) ? firstOctaveParam : undefined,
  amplitudes: amplitudesParam
    ? amplitudesParam
        .split(',')
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
    : undefined,
  octaveOnly:
    octaveOnlyParam === 'sum'
      ? 'sum'
      : octaveOnlyParam !== null && Number.isFinite(Number.parseInt(octaveOnlyParam, 10))
        ? Number.parseInt(octaveOnlyParam, 10)
        : undefined,
  componentScale: Number.isFinite(componentScaleParam)
    ? componentScaleParam
    : undefined,
  layers:
    layersParam === '1' ? 1 : layersParam === '2' ? 2 : undefined
}

// ---------------------------------------------------------------- 渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

const HOME_POSITION = new THREE.Vector3(95, 190, 95)
const HOME_TARGET = new THREE.Vector3(0, 60, 0)

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  600
)
camera.position.copy(HOME_POSITION)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.copy(HOME_TARGET)
orbit.enableDamping = true
orbit.dampingFactor = 0.08
orbit.minDistance = 40
orbit.maxDistance = 320
orbit.minPolarAngle = 0.05
orbit.maxPolarAngle = Math.PI * 0.495
orbit.update()

// ---------------------------------------------------------------- 光照
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 0.85)
scene.add(hemiLight)

const sunLight = new THREE.DirectionalLight(0xffffff, 0.55)
sunLight.position.set(90, 140, 60)
scene.add(sunLight)

// ---------------------------------------------------------------- 石头材质
const stoneTexture = new THREE.TextureLoader().load(stoneUrl)
stoneTexture.magFilter = THREE.NearestFilter

const material = new THREE.MeshLambertMaterial({ map: stoneTexture })
const geometry = new THREE.BoxGeometry(1, 1, 1)

// ---------------------------------------------------------------- 地形
let terrain: THREE.InstancedMesh | null = null
const matrix = new THREE.Matrix4()

const hud = document.querySelector<HTMLDivElement>('#hud')!
const title = document.querySelector<HTMLDivElement>('#title')!
const formula = document.querySelector<HTMLDivElement>('#formula')!
const hint = document.querySelector<HTMLDivElement>('#hint')!
const meta = document.querySelector<HTMLDivElement>('#meta')!

const updateHud = (
  generator: HeightGenerator,
  currentSeed: number,
  blocks: number,
  minSurface: number,
  maxSurface: number
) => {
  title.textContent = generator.title
  formula.textContent = generator.formula
  hint.textContent = generator.hint
  meta.textContent = `seed = ${currentSeed} · ${WORLD_SIZE}×${WORLD_SIZE} · Y ${MIN_Y}..${MAX_Y} · 海平面 ${SEA_LEVEL} · 地表 ${minSurface}..${maxSurface} · ${blocks.toLocaleString(
    'en-US'
  )} 个方块`
}

const syncUrl = (currentMode: HeightMode, currentSeed: number) => {
  const query = new URLSearchParams()
  query.set('mode', currentMode)
  query.set('seed', String(currentSeed))
  if (hudHidden) query.set('hud', '0')
  window.history.replaceState(null, '', `?${query.toString()}`)
}

/**
 * 重建整个地形。
 * 高度坐标对齐 MC 1.21.1（Y=-64..320），但渲染时只从“当前地形最低点再往下 4 格”开始填，
 * 而不是从 -64 画起：MC 里下面是实心的，但玩家看不到，没必要画一百多层基座。
 */
const build = (nextMode: HeightMode, nextSeed: number) => {
  const generator = createGenerator(nextMode, nextSeed, generatorOptions)

  if (terrain) {
    scene.remove(terrain)
    terrain.dispose()
    terrain = null
  }

  const half = WORLD_SIZE / 2
  const columns = WORLD_SIZE * WORLD_SIZE
  const surfaces = new Int16Array(columns)
  const indexOf = (x: number, z: number) =>
    (x + half) * WORLD_SIZE + (z + half)

  let minSurface = MAX_Y
  let maxSurface = MIN_Y
  let column = 0

  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      const surface = Math.max(
        MIN_Y,
        Math.min(MAX_Y, generator.height(x, z))
      )
      surfaces[column++] = surface
      if (surface < minSurface) minSurface = surface
      if (surface > maxSurface) maxSurface = surface
    }
  }

  const base = Math.max(MIN_Y, minSurface - 4)
  let total = 0
  for (const surface of surfaces) total += surface - base + 1

  const mesh = new THREE.InstancedMesh(geometry, material, total)
  mesh.frustumCulled = false

  let index = 0
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      const surface = surfaces[indexOf(x, z)]
      for (let y = base; y <= surface; y++) {
        matrix.setPosition(x, y, z)
        mesh.setMatrixAt(index++, matrix)
      }
    }
  }

  mesh.count = index
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)
  terrain = mesh

  updateHud(generator, nextSeed, index, minSurface, maxSurface)
  syncUrl(nextMode, nextSeed)
}

// ---------------------------------------------------------------- 交互
window.addEventListener('keydown', event => {
  const modeIndex = ['1', '2', '3', '4', '5', '6'].indexOf(event.key)
  if (modeIndex !== -1) {
    mode = MODES[modeIndex]
    build(mode, seed)
    return
  }

  if (event.key === 'r' || event.key === 'R') {
    seed = Math.floor(Math.random() * 100000)
    build(mode, seed)
    return
  }

  if (event.key === 'h' || event.key === 'H') {
    hudHidden = !hudHidden
    hud.classList.toggle('hidden', hudHidden)
    syncUrl(mode, seed)
    return
  }

  if (event.key === 'v' || event.key === 'V') {
    camera.position.copy(HOME_POSITION)
    orbit.target.copy(HOME_TARGET)
    orbit.update()
  }
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

window.addEventListener('contextmenu', event => event.preventDefault())

// ---------------------------------------------------------------- 启动
if (hudHidden) hud.classList.add('hidden')

build(mode, seed)

const animate = () => {
  requestAnimationFrame(animate)
  orbit.update()
  renderer.render(scene, camera)
}
animate()
