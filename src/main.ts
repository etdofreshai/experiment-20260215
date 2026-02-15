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

function sfxShoot() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'square'
  o.frequency.setValueAtTime(880, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.1)
  g.gain.setValueAtTime(0.12, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1)
  o.start(); o.stop(audioCtx.currentTime + 0.1)
}

function sfxBoom(big = false) {
  const len = audioCtx.sampleRate * (big ? 0.35 : 0.15)
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(big ? 0.2 : 0.1, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (big ? 0.35 : 0.15))
  s.start()
}

function sfxThrust() {
  const len = audioCtx.sampleRate * 0.04
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(0.05, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04)
  s.start()
}

function sfxHyperspace() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'sine'
  o.frequency.setValueAtTime(200, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.15)
  o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3)
  g.gain.setValueAtTime(0.15, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
  o.start(); o.stop(audioCtx.currentTime + 0.3)
}

// ─── Types ───
interface Vec2 { x: number; y: number }
interface Ship { pos: Vec2; vel: Vec2; angle: number; thrust: boolean; radius: number }
interface Bullet { pos: Vec2; vel: Vec2; life: number }
interface Asteroid { pos: Vec2; vel: Vec2; radius: number; verts: number[]; spin: number; rot: number }
interface Particle { pos: Vec2; vel: Vec2; life: number; maxLife: number }

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
let hyperCooldown = 0
let thrustTick = 0

const stars = Array.from({ length: 200 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.3, a: Math.random() * 0.6 + 0.2
}))

// ─── Input ───
const keys: Record<string, boolean> = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) startGame()
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { state = 'menu' }
  if (state === 'playing' && (e.code === 'KeyH' || e.code === 'ShiftRight')) doHyperspace()
})
addEventListener('keyup', e => { keys[e.code] = false })

// ─── Touch Controls ───
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

// D-pad state
const dpad = { left: false, right: false, up: false }
let dpadTouchId: number | null = null
// Button states
let fireActive = false
let fireTouchId: number | null = null
let fireAutoTimer: ReturnType<typeof setInterval> | null = null
let hyperActive = false

// Layout constants
const DPAD_R = 55
const DPAD_DEAD = 14
const BTN_R = 38
const HYPER_R = 30

function dpadPos() { return { x: 90, y: canvas.height - 120 } }
function firePos() { return { x: canvas.width - 85, y: canvas.height - 140 } }
function hyperPos() { return { x: canvas.width - 170, y: canvas.height - 75 } }

function hitTest(tx: number, ty: number, cx: number, cy: number, r: number) {
  return Math.hypot(tx - cx, ty - cy) < r + 20
}

function updateDpad(tx: number, ty: number) {
  const c = dpadPos()
  const dx = tx - c.x, dy = ty - c.y
  const d = Math.hypot(dx, dy)
  dpad.left = false; dpad.right = false; dpad.up = false
  if (d > DPAD_DEAD) {
    const a = Math.atan2(dy, dx)
    if (a < -0.3 && a > -2.8) dpad.up = true     // upper half
    if (a > 2.2 || a < -2.2) dpad.left = true     // left side
    if (a > -0.9 && a < 0.9) dpad.right = true    // right side
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (audioCtx.state === 'suspended') audioCtx.resume()

  if (state === 'menu') { startGame(); return }
  if (state === 'gameover') { state = 'menu'; return }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const dp = dpadPos(), fp = firePos(), hp = hyperPos()

    if (dpadTouchId === null && hitTest(t.clientX, t.clientY, dp.x, dp.y, DPAD_R)) {
      dpadTouchId = t.identifier
      updateDpad(t.clientX, t.clientY)
    } else if (hitTest(t.clientX, t.clientY, hp.x, hp.y, HYPER_R)) {
      hyperActive = true
      doHyperspace()
    } else if (hitTest(t.clientX, t.clientY, fp.x, fp.y, BTN_R)) {
      fireTouchId = t.identifier
      fireActive = true
      shootBullet()
      if (!fireAutoTimer) {
        fireAutoTimer = setInterval(() => { if (fireActive) shootBullet() }, 180)
      }
    }
  }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === dpadTouchId) updateDpad(t.clientX, t.clientY)
  }
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === dpadTouchId) {
      dpadTouchId = null
      dpad.left = false; dpad.right = false; dpad.up = false
    }
    if (t.identifier === fireTouchId) {
      fireTouchId = null
      fireActive = false
      if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null }
    }
  }
  hyperActive = false
}, { passive: false })

canvas.addEventListener('touchcancel', e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === dpadTouchId) {
      dpadTouchId = null; dpad.left = false; dpad.right = false; dpad.up = false
    }
    if (e.changedTouches[i].identifier === fireTouchId) {
      fireTouchId = null; fireActive = false
      if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null }
    }
  }
  hyperActive = false
})

// ─── Actions ───
function shootBullet() {
  if (state !== 'playing' || !shipVisible || bullets.length >= 8) return
  if (audioCtx.state === 'suspended') audioCtx.resume()
  sfxShoot()
  const bSpeed = 8
  bullets.push({
    pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
    vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
    life: 60
  })
}

function doHyperspace() {
  if (state !== 'playing' || !shipVisible || hyperCooldown > 0) return
  sfxHyperspace()
  spawnParticles(ship.pos.x, ship.pos.y, 12, 2)
  ship.pos.x = Math.random() * canvas.width
  ship.pos.y = Math.random() * canvas.height
  ship.vel.x = 0; ship.vel.y = 0
  spawnParticles(ship.pos.x, ship.pos.y, 12, 2)
  hyperCooldown = 90 // 1.5s cooldown
}

// ─── Menu animation asteroids ───
let menuAsteroids: Asteroid[] = []
function initMenuAsteroids() {
  menuAsteroids = []
  for (let i = 0; i < 8; i++) {
    menuAsteroids.push(makeAsteroid(
      Math.random() * canvas.width, Math.random() * canvas.height, 30 + Math.random() * 40
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
  respawnTimer = 0; shipVisible = true; hyperCooldown = 0
  resetShip()
  spawnAsteroids(4)
}

function resetShip() {
  ship = {
    pos: { x: canvas.width / 2, y: canvas.height / 2 },
    vel: { x: 0, y: 0 }, angle: -Math.PI / 2, thrust: false, radius: 15
  }
}

function makeAsteroid(x: number, y: number, radius: number): Asteroid {
  const numVerts = 8 + Math.floor(Math.random() * 5)
  const verts: number[] = []
  for (let i = 0; i < numVerts; i++) verts.push(0.7 + Math.random() * 0.6)
  return {
    pos: { x, y }, vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
    radius, verts, spin: (Math.random() - 0.5) * 0.02, rot: Math.random() * Math.PI * 2
  }
}

function spawnAsteroids(count: number) {
  for (let i = 0; i < count; i++) {
    let x: number, y: number
    do { x = Math.random() * canvas.width; y = Math.random() * canvas.height }
    while (dist(x, y, ship.pos.x, ship.pos.y) < 150)
    asteroids.push(makeAsteroid(x, y, 40 + Math.random() * 20))
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

function spawnParticles(x: number, y: number, count: number, speed = 2) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = Math.random() * speed
    particles.push({ pos: { x, y }, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s }, life: 30 + Math.random() * 30, maxLife: 60 })
  }
}

// ─── Update ───
function update() {
  if (state === 'menu') {
    for (const a of menuAsteroids) { a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos) }
    return
  }
  if (state === 'gameover') return

  if (respawnTimer > 0) {
    respawnTimer--
    if (respawnTimer === 0) { resetShip(); shipVisible = true }
    for (const a of asteroids) { a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos) }
    updateParticles()
    return
  }

  // Ship controls (keyboard + touch D-pad)
  if (keys['ArrowLeft'] || keys['KeyA'] || dpad.left) ship.angle -= 0.05
  if (keys['ArrowRight'] || keys['KeyD'] || dpad.right) ship.angle += 0.05
  ship.thrust = !!(keys['ArrowUp'] || keys['KeyW'] || dpad.up)

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

  if (hyperCooldown > 0) hyperCooldown--

  // Shoot (keyboard)
  if (keys['Space']) { keys['Space'] = false; shootBullet() }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--
    if (b.life <= 0 || b.pos.x < -10 || b.pos.x > canvas.width + 10 || b.pos.y < -10 || b.pos.y > canvas.height + 10)
      bullets.splice(i, 1)
  }

  for (const a of asteroids) { a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos) }

  // Bullet-Asteroid collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const b = bullets[bi], a = asteroids[ai]
      if (!b || !a) continue
      if (dist(b.pos.x, b.pos.y, a.pos.x, a.pos.y) < a.radius) {
        bullets.splice(bi, 1)
        spawnParticles(a.pos.x, a.pos.y, 8)
        sfxBoom(a.radius > 20)
        if (a.radius > 20) {
          for (let k = 0; k < 2; k++) {
            const child = makeAsteroid(a.pos.x, a.pos.y, a.radius * 0.55)
            child.vel.x = (Math.random() - 0.5) * 3; child.vel.y = (Math.random() - 0.5) * 3
            asteroids.push(child)
          }
          score += 20
        } else { score += 50 }
        asteroids.splice(ai, 1)
        break
      }
    }
  }

  // Ship-Asteroid collision
  if (shipVisible) {
    for (const a of asteroids) {
      if (dist(ship.pos.x, ship.pos.y, a.pos.x, a.pos.y) < a.radius + ship.radius - 5) {
        spawnParticles(ship.pos.x, ship.pos.y, 20, 3)
        sfxBoom(true)
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

  if (asteroids.length === 0) { level++; spawnAsteroids(3 + level) }
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
function drawStars() {
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.a})`
    ctx.fillRect(s.x * canvas.width, s.y * canvas.height, s.r, s.r)
  }
}

function drawAsteroidShape(a: Asteroid) {
  ctx.beginPath()
  const n = a.verts.length
  for (let i = 0; i <= n; i++) {
    const angle = a.rot + (i % n) / n * Math.PI * 2
    const r = a.radius * a.verts[i % n]
    const x = a.pos.x + Math.cos(angle) * r
    const y = a.pos.y + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
}

function drawShip() {
  if (!shipVisible) return
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle)
  ctx.beginPath()
  ctx.moveTo(18, 0); ctx.lineTo(-12, -10); ctx.lineTo(-6, 0); ctx.lineTo(-12, 10)
  ctx.closePath()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
  if (ship.thrust) {
    ctx.beginPath()
    ctx.moveTo(-8, -4); ctx.lineTo(-18 - Math.random() * 8, 0); ctx.lineTo(-8, 4)
    ctx.strokeStyle = `hsl(${30 + Math.random() * 20}, 100%, 60%)`; ctx.lineWidth = 1.5; ctx.stroke()
  }
  ctx.restore()
}

function drawBullets() {
  ctx.fillStyle = '#fff'
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI * 2); ctx.fill() }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife
    ctx.fillStyle = `rgba(255,200,100,${a})`; ctx.fillRect(p.pos.x, p.pos.y, 2, 2)
  }
}

function drawHUD() {
  const fontSize = isPortrait ? 16 : 18
  ctx.fillStyle = '#fff'; ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'left'; ctx.fillText(`SCORE: ${score}`, 15, 30)
  ctx.textAlign = 'right'; ctx.fillText(`HI: ${highScore}`, canvas.width - 15, 30)
  ctx.textAlign = 'left'
  for (let i = 0; i < lives; i++) {
    ctx.save(); ctx.translate(20 + i * 22, 52); ctx.rotate(-Math.PI / 2)
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore()
  }
}

function drawTouchControls() {
  if (!isTouchDevice || state !== 'playing') return

  // ─── D-Pad (bottom-left) ───
  const dp = dpadPos()
  // Outer ring
  ctx.beginPath()
  ctx.arc(dp.x, dp.y, DPAD_R, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill()

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
    ctx.fillStyle = active ? 'rgba(0,255,136,0.7)' : 'rgba(255,255,255,0.25)'
    ctx.fill()
    ctx.restore()
  }
  drawArrow(-Math.PI / 2, dpad.up)    // Up = thrust
  drawArrow(Math.PI, dpad.left)        // Left = rotate left
  drawArrow(0, dpad.right)             // Right = rotate right

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('THRUST', dp.x, dp.y - DPAD_R - 8)

  // ─── Fire Button (bottom-right) ───
  const fp = firePos()
  ctx.beginPath()
  ctx.arc(fp.x, fp.y, BTN_R, 0, Math.PI * 2)
  ctx.fillStyle = fireActive ? 'rgba(255,68,68,0.45)' : 'rgba(255,68,68,0.12)'
  ctx.fill()
  ctx.strokeStyle = fireActive ? 'rgba(255,68,68,0.9)' : 'rgba(255,68,68,0.4)'
  ctx.lineWidth = 2.5; ctx.stroke()
  ctx.fillStyle = fireActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'
  ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'
  ctx.fillText('FIRE', fp.x, fp.y + 6)

  // ─── Hyperspace Button (bottom-right, offset) ───
  const hp = hyperPos()
  const hReady = hyperCooldown <= 0
  ctx.beginPath()
  ctx.arc(hp.x, hp.y, HYPER_R, 0, Math.PI * 2)
  ctx.fillStyle = hyperActive && hReady ? 'rgba(80,140,255,0.45)' : (hReady ? 'rgba(80,140,255,0.1)' : 'rgba(100,100,100,0.08)')
  ctx.fill()
  ctx.strokeStyle = hReady ? (hyperActive ? 'rgba(80,140,255,0.9)' : 'rgba(80,140,255,0.35)') : 'rgba(100,100,100,0.15)'
  ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = hReady ? (hyperActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.15)'
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
  ctx.fillText('HYPER', hp.x, hp.y + 4)

  // Cooldown arc
  if (!hReady) {
    const pct = hyperCooldown / 90
    ctx.beginPath()
    ctx.arc(hp.x, hp.y, HYPER_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pct))
    ctx.strokeStyle = 'rgba(80,140,255,0.3)'; ctx.lineWidth = 3; ctx.stroke()
  }
}

function drawMenu() {
  for (const a of menuAsteroids) drawAsteroidShape(a)
  ctx.textAlign = 'center'

  const titleSize = isPortrait ? 42 : 64
  ctx.fillStyle = '#fff'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('ASTEROIDS', canvas.width / 2, canvas.height * 0.35)

  ctx.font = `${isPortrait ? 14 : 18}px monospace`; ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText('A CLASSIC ARCADE GAME', canvas.width / 2, canvas.height * 0.35 + titleSize * 0.6)

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#fff'; ctx.font = `${isPortrait ? 18 : 22}px monospace`
    const startText = isTouchDevice ? 'TAP TO START' : 'PRESS ENTER OR SPACE TO START'
    ctx.fillText(startText, canvas.width / 2, canvas.height * 0.55)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${isPortrait ? 12 : 14}px monospace`
  if (isTouchDevice) {
    ctx.fillText('D-PAD: MOVE    FIRE: SHOOT    HYPER: TELEPORT', canvas.width / 2, canvas.height * 0.65)
  } else {
    ctx.fillText('ARROWS/WASD — MOVE    SPACE — SHOOT    H — HYPERSPACE', canvas.width / 2, canvas.height * 0.65)
  }

  if (highScore > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${isPortrait ? 14 : 16}px monospace`
    ctx.fillText(`HIGH SCORE: ${highScore}`, canvas.width / 2, canvas.height * 0.73)
  }
}

function drawGameOver() {
  ctx.textAlign = 'center'
  const titleSize = isPortrait ? 36 : 48
  ctx.fillStyle = '#fff'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40)
  ctx.font = `${isPortrait ? 20 : 24}px monospace`
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 10)
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffd700'; ctx.font = `${isPortrait ? 16 : 20}px monospace`
    ctx.fillText('NEW HIGH SCORE!', canvas.width / 2, canvas.height / 2 + 45)
  }
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `${isPortrait ? 14 : 18}px monospace`
    const text = isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 90)
  }
}

function draw() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawStars()

  if (state === 'menu') { drawMenu() }
  else if (state === 'playing') {
    for (const a of asteroids) drawAsteroidShape(a)
    drawShip(); drawBullets(); drawParticles(); drawHUD(); drawTouchControls()
  } else if (state === 'gameover') {
    for (const a of asteroids) drawAsteroidShape(a)
    drawParticles(); drawHUD(); drawGameOver()
  }
}

// ─── Loop ───
function loop() { update(); draw(); requestAnimationFrame(loop) }
loop()
