import './style.css'

// ─── Canvas Setup ───
const canvas = document.createElement('canvas')
document.getElementById('app')!.appendChild(canvas)
const ctx = canvas.getContext('2d')!

let isPortrait = true

function resize() {
  canvas.width = innerWidth
  canvas.height = innerHeight
  isPortrait = innerHeight > innerWidth
}
resize()
addEventListener('resize', resize)

// ─── Audio ───
const audioCtx = new AudioContext()

function sfxLaser() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'square'
  o.frequency.setValueAtTime(880, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.15)
  g.gain.setValueAtTime(0.12, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15)
  o.start(); o.stop(audioCtx.currentTime + 0.15)
}

function sfxExplosion(big = false) {
  const t = audioCtx.currentTime
  const duration = big ? 1.2 : 0.6

  // Layer 1: Deep sub-bass rumble (shaped noise through biquad)
  const noiseLen = audioCtx.sampleRate * duration
  const noiseBuf = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < noiseLen; i++) {
    nd[i] = Math.random() * 2 - 1
  }
  const noiseSrc = audioCtx.createBufferSource()
  noiseSrc.buffer = noiseBuf
  const lp = audioCtx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(big ? 120 : 200, t)
  lp.frequency.exponentialRampToValueAtTime(30, t + duration)
  lp.Q.value = 1.5
  const noiseGain = audioCtx.createGain()
  noiseGain.gain.setValueAtTime(big ? 0.5 : 0.3, t)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  noiseSrc.connect(lp)
  lp.connect(noiseGain)
  noiseGain.connect(audioCtx.destination)
  noiseSrc.start(t)
  noiseSrc.stop(t + duration)

  // Layer 2: Mid-freq crunch (bandpass noise for body)
  const crunchSrc = audioCtx.createBufferSource()
  crunchSrc.buffer = noiseBuf
  const bp = audioCtx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(big ? 300 : 400, t)
  bp.frequency.exponentialRampToValueAtTime(80, t + duration * 0.6)
  bp.Q.value = 0.8
  const crunchGain = audioCtx.createGain()
  crunchGain.gain.setValueAtTime(big ? 0.3 : 0.2, t)
  crunchGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.5)
  crunchSrc.connect(bp)
  bp.connect(crunchGain)
  crunchGain.connect(audioCtx.destination)
  crunchSrc.start(t)
  crunchSrc.stop(t + duration)

  // Layer 3: Initial transient click/punch
  const clickOsc = audioCtx.createOscillator()
  const clickGain = audioCtx.createGain()
  clickOsc.type = 'sine'
  clickOsc.frequency.setValueAtTime(big ? 80 : 100, t)
  clickOsc.frequency.exponentialRampToValueAtTime(20, t + 0.15)
  clickGain.gain.setValueAtTime(big ? 0.4 : 0.25, t)
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  clickOsc.connect(clickGain)
  clickGain.connect(audioCtx.destination)
  clickOsc.start(t)
  clickOsc.stop(t + 0.15)

  // Layer 4: Distortion-like overtones via waveshaper on noise
  const distSrc = audioCtx.createBufferSource()
  distSrc.buffer = noiseBuf
  const distLP = audioCtx.createBiquadFilter()
  distLP.type = 'lowpass'
  distLP.frequency.setValueAtTime(big ? 500 : 600, t)
  distLP.frequency.exponentialRampToValueAtTime(40, t + duration * 0.8)
  const waveshaper = audioCtx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1
    curve[i] = Math.tanh(x * 3)
  }
  waveshaper.curve = curve
  const distGain = audioCtx.createGain()
  distGain.gain.setValueAtTime(big ? 0.15 : 0.08, t)
  distGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.7)
  distSrc.connect(distLP)
  distLP.connect(waveshaper)
  waveshaper.connect(distGain)
  distGain.connect(audioCtx.destination)
  distSrc.start(t)
  distSrc.stop(t + duration)
}

function sfxHyperspace() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'sine'
  o.frequency.setValueAtTime(200, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.2)
  o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.4)
  g.gain.setValueAtTime(0.15, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
  o.start(); o.stop(audioCtx.currentTime + 0.4)
}

function sfxThrust() {
  const len = audioCtx.sampleRate * 0.05
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.3
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(0.04, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05)
  s.start()
}

// ─── Types ───
interface Vec2 { x: number; y: number }
type AsteroidSize = 'large' | 'medium' | 'small'
interface Ship { pos: Vec2; vel: Vec2; angle: number; thrust: boolean; radius: number }
interface Bullet { pos: Vec2; vel: Vec2; life: number }
interface Asteroid {
  pos: Vec2; vel: Vec2; radius: number; size: AsteroidSize
  rot: number; rotSpeed: number
  shape: number[] // vertex radii offsets for irregular shape
}
interface Particle { pos: Vec2; vel: Vec2; life: number; maxLife: number; color: string }

const SIZE_RADIUS: Record<AsteroidSize, number> = { large: 40, medium: 20, small: 10 }
const SIZE_SCORE: Record<AsteroidSize, number> = { large: 20, medium: 50, small: 100 }

// ─── Stars ───
const stars = Array.from({ length: 200 }, () => ({
  x: Math.random(), y: Math.random(), brightness: 0.3 + Math.random() * 0.7, size: 0.5 + Math.random() * 1.5
}))

// ─── Control Mode ───
type ControlMode = 'direction' | 'spin'
let controlMode: ControlMode = (localStorage.getItem('asteroids-ctrl') as ControlMode) || 'spin'

// ─── State ───
type GameState = 'menu' | 'playing' | 'gameover'
let state: GameState = 'menu'
let score = 0
let highScore = parseInt(localStorage.getItem('asteroids-hi') || '0')
let lives = 3
let level = 1
let ship: Ship
let bullets: Bullet[] = []
let asteroids: Asteroid[] = []
let particles: Particle[] = []
let respawnTimer = 0
let shipVisible = true
let invulnerableTimer = 0
const INVULNERABLE_DURATION = 180 // 3 seconds at 60fps
let thrustTick = 0
let frameCount = 0

// ─── Input ───
const keys: Record<string, boolean> = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (state === 'menu' && e.code === 'Tab') { e.preventDefault(); toggleControlMode() }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) startGame()
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { state = 'menu' }
})
addEventListener('keyup', e => { keys[e.code] = false })

// ─── Touch Controls ───
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

const dpad = { left: false, right: false, up: false, down: false }
let dpadAngle: number | null = null  // exact angle for direction mode
let dpadTouchId: number | null = null
let fireActive = false
let fireTouchId: number | null = null
let fireAutoTimer: ReturnType<typeof setInterval> | null = null
let firePos_: Vec2 | null = null  // where the fire button currently is (follows thumb)
let fireOpacity = 0.1  // 0.1 = idle, 1 = active; fades to 10% after release
let dpadOpacity = 0.1  // 0.1 = idle, 1 = active; fades to 10%
let hyperspaceActive = false
let hyperspaceTouchId: number | null = null

const DPAD_R = 55
const DPAD_DEAD = 14
const BTN_R = 38
const HYPER_R = Math.round(BTN_R * 0.6)

// Floating joystick state
let joystickCenter: Vec2 | null = null  // null when not touching
let joystickThumb: Vec2 = { x: 0, y: 0 }
const JOYSTICK_ZONE_X = 0.5  // left half of screen is joystick zone

function dpadPos() { return joystickCenter || { x: 90, y: canvas.height - 280 } }
function firePos() { return firePos_ || { x: canvas.width - 85, y: canvas.height - 280 } }
function hyperspacePos() {
  const fp = firePos()
  const gap = 6  // small gap — almost attached
  const offset = BTN_R + HYPER_R + gap
  const rightEdge = canvas.width - HYPER_R - 10
  // Above-right of fire, unless too close to right edge then above-left
  if (fp.x + offset > rightEdge) {
    return { x: fp.x - offset, y: fp.y - offset * 0.6 }
  }
  return { x: fp.x + offset, y: fp.y - offset * 0.6 }
}

function hitTest(tx: number, ty: number, cx: number, cy: number, r: number) {
  return Math.hypot(tx - cx, ty - cy) < r + 20
}

function updateDpad(tx: number, ty: number) {
  if (!joystickCenter) return
  const dx = tx - joystickCenter.x, dy = ty - joystickCenter.y
  const d = Math.hypot(dx, dy)

  // If thumb exceeds radius, drag the center so thumb stays on the edge
  if (d > DPAD_R) {
    const nx = dx / d, ny = dy / d
    joystickCenter.x = tx - nx * DPAD_R
    joystickCenter.y = ty - ny * DPAD_R
  }

  // Update thumb position (clamped to radius for visual)
  joystickThumb.x = tx
  joystickThumb.y = ty

  // Recalculate direction from (possibly moved) center
  const fdx = tx - joystickCenter.x, fdy = ty - joystickCenter.y
  const fd = Math.hypot(fdx, fdy)
  dpad.left = false; dpad.right = false; dpad.up = false; dpad.down = false
  dpadAngle = null
  if (fd > DPAD_DEAD) {
    const a = Math.atan2(fdy, fdx)
    dpadAngle = a
    if (controlMode === 'direction') {
      // All directions active — handled in update via dpadAngle
      dpad.up = true  // signal that stick is active
    } else {
      if (a < -0.3 && a > -2.8) dpad.up = true
      if (a > 2.2 || a < -2.2) dpad.left = true
      if (a > -0.9 && a < 0.9) dpad.right = true
    }
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  if (state === 'menu') {
    const t0 = e.changedTouches[0]
    const b = ctrlToggleBounds
    if (t0.clientX >= b.x && t0.clientX <= b.x + b.w && t0.clientY >= b.y && t0.clientY <= b.y + b.h) {
      toggleControlMode(); return
    }
    startGame(); return
  }
  if (state === 'gameover') { state = 'menu'; return }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const dp = dpadPos(), fp = firePos(), hp = hyperspacePos()
    if (dpadTouchId === null && t.clientX < canvas.width * JOYSTICK_ZONE_X) {
      dpadTouchId = t.identifier
      joystickCenter = { x: t.clientX, y: t.clientY }
      joystickThumb = { x: t.clientX, y: t.clientY }
      // No direction yet — finger just landed on center
      dpad.left = false; dpad.right = false; dpad.up = false
    } else if (hitTest(t.clientX, t.clientY, hp.x, hp.y, HYPER_R)) {
      hyperspaceTouchId = t.identifier; hyperspaceActive = true; activateHyperspace()
    } else if (fireTouchId === null && t.clientX > canvas.width * JOYSTICK_ZONE_X) {
      fireTouchId = t.identifier; fireActive = true; fireOpacity = 1
      firePos_ = { x: t.clientX, y: t.clientY }
      shootBullet()
      if (!fireAutoTimer) fireAutoTimer = setInterval(() => { if (fireActive) shootBullet() }, 180)
    }
  }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === dpadTouchId) updateDpad(t.clientX, t.clientY)
    if (t.identifier === fireTouchId) { firePos_ = { x: t.clientX, y: t.clientY } }
  }
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === dpadTouchId) { dpadTouchId = null; joystickCenter = null; dpad.left = false; dpad.right = false; dpad.up = false; dpad.down = false; dpadAngle = null }
    if (t.identifier === fireTouchId) { fireTouchId = null; fireActive = false; if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null } /* firePos_ kept for fade */ }
    if (t.identifier === hyperspaceTouchId) { hyperspaceTouchId = null; hyperspaceActive = false }
  }
}, { passive: false })

canvas.addEventListener('touchcancel', e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === dpadTouchId) { dpadTouchId = null; joystickCenter = null; dpad.left = false; dpad.right = false; dpad.up = false; dpad.down = false; dpadAngle = null }
    if (e.changedTouches[i].identifier === fireTouchId) { fireTouchId = null; fireActive = false; if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null } }
    if (e.changedTouches[i].identifier === hyperspaceTouchId) { hyperspaceTouchId = null; hyperspaceActive = false }
  }
})

function toggleControlMode() {
  controlMode = controlMode === 'spin' ? 'direction' : 'spin'
  localStorage.setItem('asteroids-ctrl', controlMode)
}

// Control mode toggle button bounds (set during drawMenu)
let ctrlToggleBounds = { x: 0, y: 0, w: 0, h: 0 }

// ─── Actions ───
function shootBullet() {
  if (state !== 'playing' || !shipVisible || bullets.length >= 8) return
  if (audioCtx.state === 'suspended') audioCtx.resume()
  sfxLaser()
  const bSpeed = 8
  bullets.push({
    pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
    vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
    life: 60
  })
}

function activateHyperspace() {
  if (state !== 'playing' || !shipVisible) return
  if (audioCtx.state === 'suspended') audioCtx.resume()
  sfxHyperspace()
  spawnDestructionParticles(ship.pos.x, ship.pos.y, 8)
  ship.pos.x = Math.random() * canvas.width
  ship.pos.y = Math.random() * canvas.height
  ship.vel.x = 0; ship.vel.y = 0
  spawnDestructionParticles(ship.pos.x, ship.pos.y, 8)
  // Small chance of death on hyperspace (classic!)
  if (Math.random() < 0.1) {
    spawnDestructionParticles(ship.pos.x, ship.pos.y, 20)
    sfxExplosion(true)
    shipVisible = false
    lives--
    if (lives <= 0) {
      state = 'gameover'
      if (score > highScore) { highScore = score; localStorage.setItem('asteroids-hi', String(highScore)) }
    } else { respawnTimer = 120 }
  }
}

// ─── Menu animation asteroids ───
let menuAsteroids: Asteroid[] = []
function initMenuAsteroids() {
  menuAsteroids = []
  for (let i = 0; i < 8; i++) {
    menuAsteroids.push(makeAsteroid(
      Math.random() * canvas.width, Math.random() * canvas.height, 'large'
    ))
  }
}
initMenuAsteroids()

// ─── Game Init ───
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume()
  state = 'playing'
  score = 0; lives = 3; level = 1
  bullets = []; asteroids = []; particles = []
  respawnTimer = 0; shipVisible = true
  invulnerableTimer = INVULNERABLE_DURATION
  resetShip()
  spawnAsteroids(5)
}

function resetShip() {
  ship = {
    pos: { x: canvas.width / 2, y: canvas.height / 2 },
    vel: { x: 0, y: 0 }, angle: -Math.PI / 2, thrust: false, radius: 15
  }
}

function makeAsteroid(x: number, y: number, size: AsteroidSize): Asteroid {
  const radius = SIZE_RADIUS[size]
  const speed = size === 'large' ? 1 + Math.random() * 0.5 : size === 'medium' ? 1.5 + Math.random() * 1 : 2 + Math.random() * 1.5
  const angle = Math.random() * Math.PI * 2
  const verts = 8 + Math.floor(Math.random() * 5)
  const shape = Array.from({ length: verts }, () => 0.7 + Math.random() * 0.6)
  return {
    pos: { x, y },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    radius, size, rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    shape
  }
}

function spawnAsteroids(count: number) {
  for (let i = 0; i < count; i++) {
    let x: number, y: number
    do { x = Math.random() * canvas.width; y = Math.random() * canvas.height }
    while (dist(x, y, ship.pos.x, ship.pos.y) < 150)
    asteroids.push(makeAsteroid(x, y, 'large'))
  }
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function wrap(pos: Vec2) {
  if (pos.x < -50) pos.x = canvas.width + 50
  if (pos.x > canvas.width + 50) pos.x = -50
  if (pos.y < -50) pos.y = canvas.height + 50
  if (pos.y > canvas.height + 50) pos.y = -50
}

function spawnDestructionParticles(x: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = Math.random() * 3
    const colors = ['#ffffff', '#ffaa44', '#ff8800', '#ffcc66', '#eeeeee']
    particles.push({
      pos: { x, y }, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 20 + Math.random() * 30, maxLife: 50,
      color: colors[Math.floor(Math.random() * colors.length)]
    })
  }
}

// ─── Update ───
function update() {
  frameCount++

  if (state === 'menu') {
    for (const ast of menuAsteroids) {
      ast.pos.x += ast.vel.x; ast.pos.y += ast.vel.y
      ast.rot += ast.rotSpeed
      wrap(ast.pos)
    }
    return
  }
  if (state === 'gameover') return

  if (respawnTimer > 0) {
    respawnTimer--
    if (respawnTimer === 0) { resetShip(); shipVisible = true; invulnerableTimer = INVULNERABLE_DURATION }
    for (const ast of asteroids) {
      ast.pos.x += ast.vel.x; ast.pos.y += ast.vel.y
      ast.rot += ast.rotSpeed
      wrap(ast.pos)
    }
    updateParticles()
    return
  }

  // Ship controls
  if (controlMode === 'direction') {
    // Direction mode: joystick angle steers ship toward that direction and thrusts
    let dirActive = false
    let targetAngle = ship.angle

    // Keyboard: compose direction from WASD/arrows
    let kx = 0, ky = 0
    if (keys['ArrowLeft'] || keys['KeyA']) kx -= 1
    if (keys['ArrowRight'] || keys['KeyD']) kx += 1
    if (keys['ArrowUp'] || keys['KeyW']) ky -= 1
    if (keys['ArrowDown'] || keys['KeyS']) ky += 1
    if (kx !== 0 || ky !== 0) {
      targetAngle = Math.atan2(ky, kx)
      dirActive = true
    }

    // Touch joystick overrides
    if (dpadAngle !== null) {
      targetAngle = dpadAngle
      dirActive = true
    }

    if (dirActive) {
      // Smoothly rotate toward target
      let diff = targetAngle - ship.angle
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      const turnSpeed = 0.1
      if (Math.abs(diff) < turnSpeed) ship.angle = targetAngle
      else ship.angle += Math.sign(diff) * turnSpeed
    }
    ship.thrust = dirActive
  } else {
    // Classic spin & throttle
    if (keys['ArrowLeft'] || keys['KeyA'] || dpad.left) ship.angle -= 0.05
    if (keys['ArrowRight'] || keys['KeyD'] || dpad.right) ship.angle += 0.05
    ship.thrust = !!(keys['ArrowUp'] || keys['KeyW'] || dpad.up)
  }

  if (ship.thrust) {
    thrustTick++
    if (thrustTick % 4 === 0) sfxThrust()
    ship.vel.x += Math.cos(ship.angle) * 0.1
    ship.vel.y += Math.sin(ship.angle) * 0.1
  } else { thrustTick = 0 }

  ship.vel.x *= 0.99; ship.vel.y *= 0.99
  const spd = Math.hypot(ship.vel.x, ship.vel.y)
  if (spd > 6) { ship.vel.x *= 6 / spd; ship.vel.y *= 6 / spd }
  ship.pos.x += ship.vel.x; ship.pos.y += ship.vel.y
  wrap(ship.pos)

  if (keys['Space']) { keys['Space'] = false; shootBullet() }
  if (keys['ShiftLeft'] || keys['ShiftRight']) { keys['ShiftLeft'] = false; keys['ShiftRight'] = false; activateHyperspace() }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--
    if (b.life <= 0 || b.pos.x < -10 || b.pos.x > canvas.width + 10 || b.pos.y < -10 || b.pos.y > canvas.height + 10)
      bullets.splice(i, 1)
  }

  // Asteroids move
  for (const ast of asteroids) {
    ast.pos.x += ast.vel.x; ast.pos.y += ast.vel.y
    ast.rot += ast.rotSpeed
    wrap(ast.pos)
  }

  // Bullet-Asteroid collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const b = bullets[bi], ast = asteroids[ai]
      if (!b || !ast) continue
      if (dist(b.pos.x, b.pos.y, ast.pos.x, ast.pos.y) < ast.radius) {
        bullets.splice(bi, 1)
        score += SIZE_SCORE[ast.size]
        spawnDestructionParticles(ast.pos.x, ast.pos.y, 10)
        sfxExplosion(ast.size === 'large')

        if (ast.size === 'large') {
          for (let k = 0; k < 2; k++) {
            const child = makeAsteroid(ast.pos.x, ast.pos.y, 'medium')
            child.vel.x = (Math.random() - 0.5) * 4
            child.vel.y = (Math.random() - 0.5) * 4
            asteroids.push(child)
          }
        } else if (ast.size === 'medium') {
          for (let k = 0; k < 2; k++) {
            const child = makeAsteroid(ast.pos.x, ast.pos.y, 'small')
            child.vel.x = (Math.random() - 0.5) * 5
            child.vel.y = (Math.random() - 0.5) * 5
            asteroids.push(child)
          }
        }
        asteroids.splice(ai, 1)
        break
      }
    }
  }

  // Invulnerability countdown
  if (invulnerableTimer > 0) invulnerableTimer--

  // Ship-Asteroid collision
  if (shipVisible && invulnerableTimer <= 0) {
    for (const ast of asteroids) {
      if (dist(ship.pos.x, ship.pos.y, ast.pos.x, ast.pos.y) < ast.radius + ship.radius - 5) {
        spawnDestructionParticles(ship.pos.x, ship.pos.y, 20)
        sfxExplosion(true)
        shipVisible = false
        lives--
        if (lives <= 0) {
          state = 'gameover'
          if (score > highScore) { highScore = score; localStorage.setItem('asteroids-hi', String(highScore)) }
        } else { respawnTimer = 120 }
        break
      }
    }
  }

  if (asteroids.length === 0) { level++; spawnAsteroids(4 + level) }

  // Fire button opacity fade
  // D-pad opacity fade
  if (dpadTouchId !== null) { dpadOpacity = 1 }
  else if (dpadOpacity > 0.1) {
    dpadOpacity -= 0.02
    if (dpadOpacity <= 0.1) { dpadOpacity = 0.1 }
  }

  if (fireActive) { fireOpacity = 1 }
  else if (fireOpacity > 0.1) {
    fireOpacity -= 0.02  // fade over ~45 frames (~0.75s)
    if (fireOpacity <= 0.1) { fireOpacity = 0.1 }
  }

  updateParticles()
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.life--
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ─── Draw ───
function drawBackground() {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Stars
  for (const s of stars) {
    const twinkle = 0.7 + Math.sin(frameCount * 0.02 + s.x * 100) * 0.3
    ctx.fillStyle = `rgba(255,255,255,${s.brightness * twinkle})`
    ctx.fillRect(s.x * canvas.width, s.y * canvas.height, s.size, s.size)
  }
}

function drawAsteroid(ast: Asteroid) {
  ctx.save()
  ctx.translate(ast.pos.x, ast.pos.y)
  ctx.rotate(ast.rot)

  const verts = ast.shape.length
  ctx.beginPath()
  for (let i = 0; i <= verts; i++) {
    const angle = (i % verts) / verts * Math.PI * 2
    const r = ast.radius * ast.shape[i % verts]
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()

  ctx.fillStyle = ast.size === 'large' ? '#665544' : ast.size === 'medium' ? '#887766' : '#998877'
  ctx.fill()
  ctx.strokeStyle = '#aaa'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.restore()
}

function drawShip() {
  if (!shipVisible) return
  // Flash when invulnerable (toggle every 4 frames)
  if (invulnerableTimer > 0 && Math.floor(frameCount / 4) % 2 === 0) return
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle)

  // Classic triangular ship
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(-12, -10)
  ctx.lineTo(-8, 0)
  ctx.lineTo(-12, 10)
  ctx.closePath()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()

  // Thrust flame
  if (ship.thrust) {
    ctx.beginPath()
    ctx.moveTo(-10, -5)
    ctx.lineTo(-18 - Math.random() * 10, 0)
    ctx.lineTo(-10, 5)
    ctx.closePath()
    ctx.fillStyle = Math.random() > 0.5 ? '#ff4400' : '#ffaa00'
    ctx.fill()
  }

  ctx.restore()
}

function drawBullets() {
  for (const b of bullets) {
    ctx.fillStyle = '#ffff88'
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,200,0.3)'
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife
    ctx.fillStyle = p.color + Math.floor(a * 200).toString(16).padStart(2, '0')
    ctx.fillRect(p.pos.x - 1, p.pos.y - 1, 3, 3)
  }
}

function drawHUD() {
  const fontSize = isPortrait ? 16 : 18
  ctx.fillStyle = '#ffffff'; ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'left'; ctx.fillText(`SCORE: ${score}`, 15, 30)
  ctx.textAlign = 'right'; ctx.fillText(`HI: ${highScore}`, canvas.width - 15, 30)
  ctx.textAlign = 'left'

  // Lives as small ship icons
  for (let i = 0; i < lives; i++) {
    const lx = 20 + i * 24, ly = 50
    ctx.save()
    ctx.translate(lx, ly)
    ctx.rotate(-Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(8, 0)
    ctx.lineTo(-5, -5)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-5, 5)
    ctx.closePath()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }

  // Level indicator
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${isPortrait ? 12 : 14}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`WAVE ${level}`, canvas.width / 2, 25)
}

function drawTouchControls() {
  if (!isTouchDevice || state !== 'playing') return

  {
    const dp = joystickCenter || dpadPos()
    const alpha = dpadOpacity

    // Outer ring
    ctx.beginPath()
    ctx.arc(dp.x, dp.y, DPAD_R, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${0.2 * alpha})`; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = `rgba(255,255,255,${0.04 * alpha})`; ctx.fill()

    if (joystickCenter) {
      // Thumb nub — clamped to radius
      const tdx = joystickThumb.x - dp.x, tdy = joystickThumb.y - dp.y
      const td = Math.hypot(tdx, tdy)
      const clamp = Math.min(td, DPAD_R)
      const nx = td > 0 ? tdx / td * clamp : 0
      const ny = td > 0 ? tdy / td * clamp : 0
      ctx.beginPath()
      ctx.arc(dp.x + nx, dp.y + ny, 18, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${0.2 * alpha})`; ctx.fill()
      ctx.strokeStyle = `rgba(255,255,255,${0.4 * alpha})`; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // Direction arrows
    const drawArrow = (angle: number, active: boolean) => {
      ctx.save()
      ctx.translate(dp.x, dp.y)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(DPAD_R - 12, 0)
      ctx.lineTo(DPAD_R - 28, -10)
      ctx.lineTo(DPAD_R - 28, 10)
      ctx.closePath()
      ctx.fillStyle = active ? `rgba(255,255,255,${0.7 * alpha})` : `rgba(255,255,255,${0.25 * alpha})`
      ctx.fill()
      ctx.restore()
    }
    drawArrow(-Math.PI / 2, dpad.up)
    drawArrow(Math.PI, dpad.left)
    drawArrow(0, dpad.right)
    if (controlMode === 'direction') {
      drawArrow(Math.PI / 2, dpad.down)
    }
  }

  const fp = firePos()
  const fo = fireOpacity  // 0.1..1
  {
    const alpha = fireActive ? 1 : fo
    ctx.beginPath()
    ctx.arc(fp.x, fp.y, BTN_R, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${(fireActive ? 0.35 : 0.1) * alpha})`
    ctx.fill()
    ctx.strokeStyle = `rgba(255,255,255,${(fireActive ? 0.9 : 0.4) * alpha})`
    ctx.lineWidth = 2.5; ctx.stroke()
    ctx.fillStyle = `rgba(255,255,255,${(fireActive ? 0.95 : 0.5) * alpha})`
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'
    ctx.fillText('FIRE', fp.x, fp.y + 5)
  }

  // Hyperspace button — fades with fire button
  const hp = hyperspacePos()
  {
    const alpha = hyperspaceActive ? 1 : fo
    ctx.beginPath()
    ctx.arc(hp.x, hp.y, HYPER_R, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,150,255,${(hyperspaceActive ? 0.35 : 0.1) * alpha})`
    ctx.fill()
    ctx.strokeStyle = `rgba(100,150,255,${(hyperspaceActive ? 0.9 : 0.4) * alpha})`
    ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = `rgba(150,200,255,${(hyperspaceActive ? 0.95 : 0.5) * alpha})`
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('HYPER', hp.x, hp.y + 3)
  }
}

function drawMenu() {
  for (const ast of menuAsteroids) drawAsteroid(ast)

  ctx.textAlign = 'center'

  const titleSize = isPortrait ? 42 : 64
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('ASTEROIDS', canvas.width / 2, canvas.height * 0.35)

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#cccccc'; ctx.font = `${isPortrait ? 18 : 22}px monospace`
    const startText = isTouchDevice ? 'TAP TO START' : 'PRESS ENTER OR SPACE TO START'
    ctx.fillText(startText, canvas.width / 2, canvas.height * 0.50)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${isPortrait ? 12 : 14}px monospace`
  if (isTouchDevice) {
    ctx.fillText('D-PAD: MOVE    FIRE: SHOOT', canvas.width / 2, canvas.height * 0.60)
  } else {
    ctx.fillText('ARROWS/WASD — MOVE    SPACE — FIRE', canvas.width / 2, canvas.height * 0.60)
  }

  if (highScore > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${isPortrait ? 14 : 16}px monospace`
    ctx.fillText(`HIGH SCORE: ${highScore}`, canvas.width / 2, canvas.height * 0.68)
  }

  // Control mode toggle
  const ctrlFont = isPortrait ? 14 : 16
  ctx.font = `${ctrlFont}px monospace`
  const modeLabel = controlMode === 'direction' ? '► DIRECTION MODE' : '► SPIN & THROTTLE'
  const toggleText = isTouchDevice ? `[ ${modeLabel} ]  TAP TO CHANGE` : `[ ${modeLabel} ]  TAB TO CHANGE`
  const toggleY = canvas.height * 0.76
  const tw = ctx.measureText(toggleText).width
  ctrlToggleBounds = { x: canvas.width / 2 - tw / 2 - 10, y: toggleY - ctrlFont - 2, w: tw + 20, h: ctrlFont + 12 }

  // Highlight box
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1
  ctx.strokeRect(ctrlToggleBounds.x, ctrlToggleBounds.y, ctrlToggleBounds.w, ctrlToggleBounds.h)

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(toggleText, canvas.width / 2, toggleY)
}

function drawGameOver() {
  ctx.textAlign = 'center'
  const titleSize = isPortrait ? 36 : 48
  ctx.fillStyle = '#ff4444'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40)
  ctx.fillStyle = '#ffffff'; ctx.font = `${isPortrait ? 20 : 24}px monospace`
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 10)
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffdd00'; ctx.font = `${isPortrait ? 16 : 20}px monospace`
    ctx.fillText('NEW HIGH SCORE!', canvas.width / 2, canvas.height / 2 + 45)
  }
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `${isPortrait ? 14 : 18}px monospace`
    const text = isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 90)
  }
}

function draw() {
  drawBackground()

  if (state === 'menu') { drawMenu() }
  else if (state === 'playing') {
    for (const ast of asteroids) drawAsteroid(ast)
    drawShip(); drawBullets(); drawParticles(); drawHUD(); drawTouchControls()
  } else if (state === 'gameover') {
    for (const ast of asteroids) drawAsteroid(ast)
    drawParticles(); drawHUD(); drawGameOver()
  }
}

// ─── Loop ───
function loop() { update(); draw(); requestAnimationFrame(loop) }
loop()
