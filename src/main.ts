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

function sfxSwat() {
  const len = audioCtx.sampleRate * 0.08
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(0.15, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08)
  s.start()
}

function sfxSquish(big = false) {
  const len = audioCtx.sampleRate * (big ? 0.3 : 0.12)
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const t = i / audioCtx.sampleRate
    d[i] = (Math.random() * 2 - 1) * (1 - i / len) * Math.sin(t * 300)
  }
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(big ? 0.2 : 0.12, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (big ? 0.3 : 0.12))
  s.start()
}

function sfxBuzz() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(150, audioCtx.currentTime)
  o.frequency.setValueAtTime(160, audioCtx.currentTime + 0.02)
  o.frequency.setValueAtTime(145, audioCtx.currentTime + 0.04)
  g.gain.setValueAtTime(0.04, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04)
  o.start(); o.stop(audioCtx.currentTime + 0.04)
}

function sfxSpray() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'sine'
  o.frequency.setValueAtTime(800, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.1)
  o.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.2)
  g.gain.setValueAtTime(0.1, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2)
  o.start(); o.stop(audioCtx.currentTime + 0.2)
}

// ─── Types ───
interface Vec2 { x: number; y: number }
type InsectKind = 'fly' | 'beetle' | 'moth' | 'mosquito' | 'roach' | 'wasp'
interface Ship { pos: Vec2; vel: Vec2; angle: number; thrust: boolean; radius: number }
interface Bullet { pos: Vec2; vel: Vec2; life: number }
interface Insect {
  pos: Vec2; vel: Vec2; radius: number; kind: InsectKind
  wingPhase: number; rot: number; wobble: number; wobbleSpeed: number
  hp: number
}
interface Particle { pos: Vec2; vel: Vec2; life: number; maxLife: number; color: string }
interface Splat { x: number; y: number; radius: number; color: string; alpha: number }

const INSECT_COLORS: Record<InsectKind, string> = {
  fly: '#44cc44',
  beetle: '#cc6622',
  moth: '#bb99dd',
  mosquito: '#aaaaaa',
  roach: '#885533',
  wasp: '#ffcc00',
}

const INSECT_KINDS: InsectKind[] = ['fly', 'beetle', 'moth', 'mosquito', 'roach', 'wasp']

// ─── State ───
type GameState = 'menu' | 'playing' | 'gameover'
let state: GameState = 'menu'
let score = 0
let highScore = parseInt(localStorage.getItem('insects-hi') || '0')
let lives = 3
let level = 1
let ship: Ship
let bullets: Bullet[] = []
let insects: Insect[] = []
let particles: Particle[] = []
let splats: Splat[] = []
let respawnTimer = 0
let shipVisible = true
let sprayCooldown = 0
let thrustTick = 0
let frameCount = 0

// Grass blades
const grassBlades = Array.from({ length: 120 }, () => ({
  x: Math.random(), h: 15 + Math.random() * 30, lean: (Math.random() - 0.5) * 0.3,
  green: 40 + Math.random() * 60, alpha: 0.2 + Math.random() * 0.3
}))

// ─── Input ───
const keys: Record<string, boolean> = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) startGame()
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { state = 'menu' }
  if (state === 'playing' && (e.code === 'KeyH' || e.code === 'ShiftRight')) doSpray()
})
addEventListener('keyup', e => { keys[e.code] = false })

// ─── Touch Controls ───
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

const dpad = { left: false, right: false, up: false }
let dpadTouchId: number | null = null
let fireActive = false
let fireTouchId: number | null = null
let fireAutoTimer: ReturnType<typeof setInterval> | null = null
let sprayActive = false

const DPAD_R = 55
const DPAD_DEAD = 14
const BTN_R = 38
const SPRAY_R = 30

function dpadPos() { return { x: 90, y: canvas.height - 120 } }
function firePos() { return { x: canvas.width - 85, y: canvas.height - 140 } }
function sprayPos() { return { x: canvas.width - 170, y: canvas.height - 75 } }

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
    if (a < -0.3 && a > -2.8) dpad.up = true
    if (a > 2.2 || a < -2.2) dpad.left = true
    if (a > -0.9 && a < 0.9) dpad.right = true
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  if (state === 'menu') { startGame(); return }
  if (state === 'gameover') { state = 'menu'; return }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const dp = dpadPos(), fp = firePos(), sp = sprayPos()
    if (dpadTouchId === null && hitTest(t.clientX, t.clientY, dp.x, dp.y, DPAD_R)) {
      dpadTouchId = t.identifier; updateDpad(t.clientX, t.clientY)
    } else if (hitTest(t.clientX, t.clientY, sp.x, sp.y, SPRAY_R)) {
      sprayActive = true; doSpray()
    } else if (hitTest(t.clientX, t.clientY, fp.x, fp.y, BTN_R)) {
      fireTouchId = t.identifier; fireActive = true; shootBullet()
      if (!fireAutoTimer) fireAutoTimer = setInterval(() => { if (fireActive) shootBullet() }, 180)
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
    if (t.identifier === dpadTouchId) { dpadTouchId = null; dpad.left = false; dpad.right = false; dpad.up = false }
    if (t.identifier === fireTouchId) { fireTouchId = null; fireActive = false; if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null } }
  }
  sprayActive = false
}, { passive: false })

canvas.addEventListener('touchcancel', e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === dpadTouchId) { dpadTouchId = null; dpad.left = false; dpad.right = false; dpad.up = false }
    if (e.changedTouches[i].identifier === fireTouchId) { fireTouchId = null; fireActive = false; if (fireAutoTimer) { clearInterval(fireAutoTimer); fireAutoTimer = null } }
  }
  sprayActive = false
})

// ─── Actions ───
function shootBullet() {
  if (state !== 'playing' || !shipVisible || bullets.length >= 8) return
  if (audioCtx.state === 'suspended') audioCtx.resume()
  sfxSwat()
  const bSpeed = 8
  bullets.push({
    pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
    vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
    life: 60
  })
}

function doSpray() {
  if (state !== 'playing' || !shipVisible || sprayCooldown > 0) return
  sfxSpray()
  // Kill or damage nearby insects
  for (const ins of insects) {
    const d = dist(ship.pos.x, ship.pos.y, ins.pos.x, ins.pos.y)
    if (d < 120) {
      ins.hp--
      spawnColorParticles(ins.pos.x, ins.pos.y, 4, INSECT_COLORS[ins.kind])
    }
  }
  // Spray cloud particles
  for (let i = 0; i < 20; i++) {
    const a = ship.angle + (Math.random() - 0.5) * 1.2
    const s = 1 + Math.random() * 3
    particles.push({
      pos: { x: ship.pos.x, y: ship.pos.y },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 20 + Math.random() * 20, maxLife: 40,
      color: `rgba(180,255,180,`
    })
  }
  sprayCooldown = 90
}

// ─── Menu animation insects ───
let menuInsects: Insect[] = []
function initMenuInsects() {
  menuInsects = []
  for (let i = 0; i < 10; i++) {
    menuInsects.push(makeInsect(
      Math.random() * canvas.width, Math.random() * canvas.height, 20 + Math.random() * 25
    ))
  }
}
initMenuInsects()

// ─── Game Init ───
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume()
  state = 'playing'
  score = 0; lives = 3; level = 1
  bullets = []; insects = []; particles = []; splats = []
  respawnTimer = 0; shipVisible = true; sprayCooldown = 0
  resetShip()
  spawnInsects(5)
}

function resetShip() {
  ship = {
    pos: { x: canvas.width / 2, y: canvas.height / 2 },
    vel: { x: 0, y: 0 }, angle: -Math.PI / 2, thrust: false, radius: 15
  }
}

function makeInsect(x: number, y: number, radius: number): Insect {
  const kind = INSECT_KINDS[Math.floor(Math.random() * INSECT_KINDS.length)]
  const speed = kind === 'mosquito' ? 2.5 : kind === 'wasp' ? 2 : kind === 'roach' ? 1.8 : 1.2
  const angle = Math.random() * Math.PI * 2
  return {
    pos: { x, y },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    radius, kind,
    wingPhase: Math.random() * Math.PI * 2,
    rot: angle,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.02 + Math.random() * 0.04,
    hp: radius > 25 ? 2 : 1
  }
}

function spawnInsects(count: number) {
  for (let i = 0; i < count; i++) {
    let x: number, y: number
    do { x = Math.random() * canvas.width; y = Math.random() * canvas.height }
    while (dist(x, y, ship.pos.x, ship.pos.y) < 150)
    insects.push(makeInsect(x, y, 25 + Math.random() * 25))
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

function spawnColorParticles(x: number, y: number, count: number, color: string) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = Math.random() * 3
    particles.push({
      pos: { x, y }, vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 20 + Math.random() * 30, maxLife: 50, color
    })
  }
}

// ─── Update ───
function update() {
  frameCount++

  if (state === 'menu') {
    for (const ins of menuInsects) {
      ins.wobble += ins.wobbleSpeed
      ins.vel.x += Math.sin(ins.wobble) * 0.05
      ins.vel.y += Math.cos(ins.wobble * 1.3) * 0.05
      const spd = Math.hypot(ins.vel.x, ins.vel.y)
      if (spd > 2) { ins.vel.x *= 2 / spd; ins.vel.y *= 2 / spd }
      ins.pos.x += ins.vel.x; ins.pos.y += ins.vel.y
      ins.rot = Math.atan2(ins.vel.y, ins.vel.x)
      ins.wingPhase += 0.3
      wrap(ins.pos)
    }
    return
  }
  if (state === 'gameover') return

  if (respawnTimer > 0) {
    respawnTimer--
    if (respawnTimer === 0) { resetShip(); shipVisible = true }
    for (const ins of insects) {
      ins.wobble += ins.wobbleSpeed
      ins.vel.x += Math.sin(ins.wobble) * 0.05
      ins.vel.y += Math.cos(ins.wobble * 1.3) * 0.05
      const spd = Math.hypot(ins.vel.x, ins.vel.y)
      if (spd > 2.5) { ins.vel.x *= 2.5 / spd; ins.vel.y *= 2.5 / spd }
      ins.pos.x += ins.vel.x; ins.pos.y += ins.vel.y
      ins.rot = Math.atan2(ins.vel.y, ins.vel.x)
      ins.wingPhase += 0.3
      wrap(ins.pos)
    }
    updateParticles()
    return
  }

  // Ship controls
  if (keys['ArrowLeft'] || keys['KeyA'] || dpad.left) ship.angle -= 0.05
  if (keys['ArrowRight'] || keys['KeyD'] || dpad.right) ship.angle += 0.05
  ship.thrust = !!(keys['ArrowUp'] || keys['KeyW'] || dpad.up)

  if (ship.thrust) {
    thrustTick++
    if (thrustTick % 4 === 0) sfxBuzz()
    ship.vel.x += Math.cos(ship.angle) * 0.1
    ship.vel.y += Math.sin(ship.angle) * 0.1
  } else { thrustTick = 0 }

  ship.vel.x *= 0.99; ship.vel.y *= 0.99
  const spd = Math.hypot(ship.vel.x, ship.vel.y)
  if (spd > 6) { ship.vel.x *= 6 / spd; ship.vel.y *= 6 / spd }
  ship.pos.x += ship.vel.x; ship.pos.y += ship.vel.y
  wrap(ship.pos)

  if (sprayCooldown > 0) sprayCooldown--

  if (keys['Space']) { keys['Space'] = false; shootBullet() }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--
    if (b.life <= 0 || b.pos.x < -10 || b.pos.x > canvas.width + 10 || b.pos.y < -10 || b.pos.y > canvas.height + 10)
      bullets.splice(i, 1)
  }

  // Insects move with wobble
  for (const ins of insects) {
    ins.wobble += ins.wobbleSpeed
    ins.vel.x += Math.sin(ins.wobble) * 0.05
    ins.vel.y += Math.cos(ins.wobble * 1.3) * 0.05
    const s = Math.hypot(ins.vel.x, ins.vel.y)
    const maxSpd = ins.kind === 'mosquito' ? 3 : ins.kind === 'wasp' ? 2.5 : 2
    if (s > maxSpd) { ins.vel.x *= maxSpd / s; ins.vel.y *= maxSpd / s }
    ins.pos.x += ins.vel.x; ins.pos.y += ins.vel.y
    ins.rot = Math.atan2(ins.vel.y, ins.vel.x)
    ins.wingPhase += 0.3
    wrap(ins.pos)
  }

  // Bullet-Insect collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ai = insects.length - 1; ai >= 0; ai--) {
      const b = bullets[bi], ins = insects[ai]
      if (!b || !ins) continue
      if (dist(b.pos.x, b.pos.y, ins.pos.x, ins.pos.y) < ins.radius) {
        bullets.splice(bi, 1)
        ins.hp--
        if (ins.hp <= 0) {
          spawnColorParticles(ins.pos.x, ins.pos.y, 10, INSECT_COLORS[ins.kind])
          sfxSquish(ins.radius > 25)
          splats.push({
            x: ins.pos.x, y: ins.pos.y,
            radius: ins.radius * 0.6,
            color: INSECT_COLORS[ins.kind],
            alpha: 0.4
          })
          if (ins.radius > 25) {
            // Split into smaller bugs
            for (let k = 0; k < 2; k++) {
              const child = makeInsect(ins.pos.x, ins.pos.y, ins.radius * 0.5)
              child.vel.x = (Math.random() - 0.5) * 4
              child.vel.y = (Math.random() - 0.5) * 4
              child.hp = 1
              insects.push(child)
            }
            score += 20
          } else { score += 50 }
          insects.splice(ai, 1)
        } else {
          spawnColorParticles(ins.pos.x, ins.pos.y, 4, INSECT_COLORS[ins.kind])
        }
        break
      }
    }
  }

  // Check dead insects from spray
  for (let i = insects.length - 1; i >= 0; i--) {
    if (insects[i].hp <= 0) {
      const ins = insects[i]
      spawnColorParticles(ins.pos.x, ins.pos.y, 10, INSECT_COLORS[ins.kind])
      sfxSquish(ins.radius > 25)
      splats.push({ x: ins.pos.x, y: ins.pos.y, radius: ins.radius * 0.5, color: INSECT_COLORS[ins.kind], alpha: 0.35 })
      if (ins.radius > 25) {
        for (let k = 0; k < 2; k++) {
          const child = makeInsect(ins.pos.x, ins.pos.y, ins.radius * 0.5)
          child.vel.x = (Math.random() - 0.5) * 4; child.vel.y = (Math.random() - 0.5) * 4; child.hp = 1
          insects.push(child)
        }
        score += 20
      } else { score += 50 }
      insects.splice(i, 1)
    }
  }

  // Ship-Insect collision
  if (shipVisible) {
    for (const ins of insects) {
      if (dist(ship.pos.x, ship.pos.y, ins.pos.x, ins.pos.y) < ins.radius + ship.radius - 5) {
        spawnColorParticles(ship.pos.x, ship.pos.y, 20, '#ff4444')
        sfxSquish(true)
        shipVisible = false
        lives--
        if (lives <= 0) {
          state = 'gameover'
          if (score > highScore) { highScore = score; localStorage.setItem('insects-hi', String(highScore)) }
        } else { respawnTimer = 120 }
        break
      }
    }
  }

  if (insects.length === 0) { level++; spawnInsects(4 + level) }
  updateParticles()

  // Fade splats
  for (let i = splats.length - 1; i >= 0; i--) {
    splats[i].alpha -= 0.001
    if (splats[i].alpha <= 0) splats.splice(i, 1)
  }
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
  // Dark green gradient
  const grd = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grd.addColorStop(0, '#0a1a0a')
  grd.addColorStop(1, '#0d2b0d')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Grass at bottom
  for (const g of grassBlades) {
    const x = g.x * canvas.width
    ctx.save()
    ctx.translate(x, canvas.height)
    ctx.rotate(g.lean + Math.sin(frameCount * 0.01 + g.x * 10) * 0.05)
    ctx.beginPath()
    ctx.moveTo(-2, 0)
    ctx.quadraticCurveTo(g.lean * 10, -g.h * 0.6, 0, -g.h)
    ctx.quadraticCurveTo(-g.lean * 10, -g.h * 0.6, 2, 0)
    ctx.fillStyle = `rgba(30,${g.green},20,${g.alpha})`
    ctx.fill()
    ctx.restore()
  }
}

function drawSplats() {
  for (const s of splats) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
    ctx.fillStyle = s.color + Math.floor(s.alpha * 255).toString(16).padStart(2, '0')
    ctx.fill()
    // Smaller splatter dots
    for (let i = 0; i < 3; i++) {
      const ox = (Math.sin(s.x * i) * 0.7 + 0.3) * s.radius * 1.5
      const oy = (Math.cos(s.y * i) * 0.7 + 0.3) * s.radius * 1.5
      ctx.beginPath()
      ctx.arc(s.x + ox, s.y + oy, s.radius * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawInsect(ins: Insect) {
  const color = INSECT_COLORS[ins.kind]
  ctx.save()
  ctx.translate(ins.pos.x, ins.pos.y)
  ctx.rotate(ins.rot)

  const r = ins.radius
  const wingFlap = Math.sin(ins.wingPhase) * 0.5

  // Wings
  if (ins.kind !== 'roach') {
    ctx.globalAlpha = 0.35
    ctx.fillStyle = ins.kind === 'moth' ? '#ddbbff' : ins.kind === 'wasp' ? '#ffffcc' : '#aaffaa'

    // Left wing
    ctx.save()
    ctx.translate(-r * 0.1, -r * 0.3)
    ctx.scale(1, 0.5 + wingFlap)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.7, r * 0.5, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Right wing
    ctx.save()
    ctx.translate(-r * 0.1, r * 0.3)
    ctx.scale(1, 0.5 + wingFlap)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.7, r * 0.5, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.globalAlpha = 1
  }

  // Body
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.55, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Head
  ctx.beginPath()
  ctx.arc(r * 0.4, 0, r * 0.18, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.stroke()

  // Eyes
  ctx.fillStyle = ins.kind === 'wasp' ? '#ff0000' : '#ffffff'
  ctx.beginPath()
  ctx.arc(r * 0.48, -r * 0.08, r * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(r * 0.48, r * 0.08, r * 0.07, 0, Math.PI * 2)
  ctx.fill()

  // Pupils
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(r * 0.5, -r * 0.08, r * 0.035, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(r * 0.5, r * 0.08, r * 0.035, 0, Math.PI * 2)
  ctx.fill()

  // Legs (3 pairs)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    const lx = -r * 0.2 + i * r * 0.25
    const wiggle = Math.sin(ins.wingPhase + i) * 3
    // Top legs
    ctx.beginPath()
    ctx.moveTo(lx, -r * 0.2)
    ctx.lineTo(lx - 4, -r * 0.45 + wiggle)
    ctx.lineTo(lx - 8, -r * 0.55 + wiggle)
    ctx.stroke()
    // Bottom legs
    ctx.beginPath()
    ctx.moveTo(lx, r * 0.2)
    ctx.lineTo(lx - 4, r * 0.45 - wiggle)
    ctx.lineTo(lx - 8, r * 0.55 - wiggle)
    ctx.stroke()
  }

  // Antennae
  if (ins.kind !== 'roach') {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    const aw = Math.sin(ins.wingPhase * 0.5) * 3
    ctx.beginPath()
    ctx.moveTo(r * 0.5, -r * 0.1)
    ctx.quadraticCurveTo(r * 0.7, -r * 0.3 + aw, r * 0.65, -r * 0.45 + aw)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(r * 0.5, r * 0.1)
    ctx.quadraticCurveTo(r * 0.7, r * 0.3 - aw, r * 0.65, r * 0.45 - aw)
    ctx.stroke()
  }

  // Wasp stripes
  if (ins.kind === 'wasp') {
    ctx.fillStyle = '#000'
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-r * 0.3 + i * r * 0.2, -r * 0.2, r * 0.08, r * 0.4)
    }
  }

  // Beetle shell lines
  if (ins.kind === 'beetle') {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-r * 0.3, 0)
    ctx.lineTo(r * 0.2, 0)
    ctx.stroke()
  }

  ctx.restore()
}

function drawShip() {
  if (!shipVisible) return
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle)

  // Fly swatter handle
  ctx.strokeStyle = '#8B4513'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-18, 0)
  ctx.lineTo(-5, 0)
  ctx.stroke()

  // Swatter head (mesh rectangle)
  ctx.fillStyle = 'rgba(200,200,200,0.3)'
  ctx.strokeStyle = '#ccc'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(-2, -10, 20, 20, 3)
  ctx.fill()
  ctx.stroke()

  // Mesh lines
  ctx.strokeStyle = 'rgba(200,200,200,0.4)'
  ctx.lineWidth = 0.5
  for (let i = 2; i < 18; i += 4) {
    ctx.beginPath(); ctx.moveTo(i, -9); ctx.lineTo(i, 9); ctx.stroke()
  }
  for (let i = -8; i < 10; i += 4) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(18, i); ctx.stroke()
  }

  // Thrust = bug spray cloud
  if (ship.thrust) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.2
    ctx.fillStyle = `rgba(150,255,150,0.4)`
    ctx.beginPath()
    ctx.arc(-22 - Math.random() * 8, (Math.random() - 0.5) * 8, 5 + Math.random() * 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function drawBullets() {
  for (const b of bullets) {
    // Little spray droplet
    ctx.fillStyle = '#aaffaa'
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(150,255,150,0.3)'
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife
    if (p.color.startsWith('rgba')) {
      ctx.fillStyle = p.color + `${a})`
    } else {
      ctx.fillStyle = p.color + Math.floor(a * 200).toString(16).padStart(2, '0')
    }
    ctx.fillRect(p.pos.x - 1, p.pos.y - 1, 3, 3)
  }
}

function drawHUD() {
  const fontSize = isPortrait ? 16 : 18
  ctx.fillStyle = '#aaffaa'; ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'left'; ctx.fillText(`SCORE: ${score}`, 15, 30)
  ctx.textAlign = 'right'; ctx.fillText(`HI: ${highScore}`, canvas.width - 15, 30)
  ctx.textAlign = 'left'

  // Lives as little bug icons
  for (let i = 0; i < lives; i++) {
    const lx = 20 + i * 24, ly = 50
    ctx.fillStyle = '#44cc44'
    ctx.beginPath()
    ctx.ellipse(lx, ly, 8, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#44cc44'
    ctx.beginPath()
    ctx.arc(lx + 6, ly, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Level indicator
  ctx.fillStyle = 'rgba(170,255,170,0.4)'; ctx.font = `${isPortrait ? 12 : 14}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText(`WAVE ${level}`, canvas.width / 2, 25)
}

function drawTouchControls() {
  if (!isTouchDevice || state !== 'playing') return

  const dp = dpadPos()
  ctx.beginPath()
  ctx.arc(dp.x, dp.y, DPAD_R, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(170,255,170,0.15)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(170,255,170,0.03)'; ctx.fill()

  const drawArrow = (angle: number, active: boolean) => {
    ctx.save()
    ctx.translate(dp.x, dp.y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(DPAD_R - 12, 0)
    ctx.lineTo(DPAD_R - 28, -10)
    ctx.lineTo(DPAD_R - 28, 10)
    ctx.closePath()
    ctx.fillStyle = active ? 'rgba(0,255,100,0.7)' : 'rgba(170,255,170,0.25)'
    ctx.fill()
    ctx.restore()
  }
  drawArrow(-Math.PI / 2, dpad.up)
  drawArrow(Math.PI, dpad.left)
  drawArrow(0, dpad.right)

  ctx.fillStyle = 'rgba(170,255,170,0.2)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('MOVE', dp.x, dp.y - DPAD_R - 8)

  const fp = firePos()
  ctx.beginPath()
  ctx.arc(fp.x, fp.y, BTN_R, 0, Math.PI * 2)
  ctx.fillStyle = fireActive ? 'rgba(100,255,100,0.45)' : 'rgba(100,255,100,0.12)'
  ctx.fill()
  ctx.strokeStyle = fireActive ? 'rgba(100,255,100,0.9)' : 'rgba(100,255,100,0.4)'
  ctx.lineWidth = 2.5; ctx.stroke()
  ctx.fillStyle = fireActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'
  ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'
  ctx.fillText('SWAT', fp.x, fp.y + 5)

  const sp = sprayPos()
  const sReady = sprayCooldown <= 0
  ctx.beginPath()
  ctx.arc(sp.x, sp.y, SPRAY_R, 0, Math.PI * 2)
  ctx.fillStyle = sprayActive && sReady ? 'rgba(150,255,150,0.45)' : (sReady ? 'rgba(150,255,150,0.1)' : 'rgba(100,100,100,0.08)')
  ctx.fill()
  ctx.strokeStyle = sReady ? (sprayActive ? 'rgba(150,255,150,0.9)' : 'rgba(150,255,150,0.35)') : 'rgba(100,100,100,0.15)'
  ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = sReady ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
  ctx.fillText('SPRAY', sp.x, sp.y + 4)

  if (!sReady) {
    const pct = sprayCooldown / 90
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, SPRAY_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pct))
    ctx.strokeStyle = 'rgba(150,255,150,0.3)'; ctx.lineWidth = 3; ctx.stroke()
  }
}

function drawMenu() {
  for (const ins of menuInsects) drawInsect(ins)

  ctx.textAlign = 'center'

  const titleSize = isPortrait ? 42 : 64
  ctx.fillStyle = '#44ff44'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('🪲 INSECTS 🪲', canvas.width / 2, canvas.height * 0.35)

  ctx.font = `${isPortrait ? 14 : 18}px monospace`; ctx.fillStyle = 'rgba(170,255,170,0.6)'
  ctx.fillText('SWAT THE BUGS!', canvas.width / 2, canvas.height * 0.35 + titleSize * 0.6)

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#aaffaa'; ctx.font = `${isPortrait ? 18 : 22}px monospace`
    const startText = isTouchDevice ? 'TAP TO START' : 'PRESS ENTER OR SPACE TO START'
    ctx.fillText(startText, canvas.width / 2, canvas.height * 0.55)
  }

  ctx.fillStyle = 'rgba(170,255,170,0.4)'; ctx.font = `${isPortrait ? 12 : 14}px monospace`
  if (isTouchDevice) {
    ctx.fillText('D-PAD: MOVE    SWAT: SHOOT    SPRAY: AOE ATTACK', canvas.width / 2, canvas.height * 0.65)
  } else {
    ctx.fillText('ARROWS/WASD — MOVE    SPACE — SWAT    H — BUG SPRAY', canvas.width / 2, canvas.height * 0.65)
  }

  if (highScore > 0) {
    ctx.fillStyle = 'rgba(170,255,170,0.5)'; ctx.font = `${isPortrait ? 14 : 16}px monospace`
    ctx.fillText(`HIGH SCORE: ${highScore}`, canvas.width / 2, canvas.height * 0.73)
  }
}

function drawGameOver() {
  ctx.textAlign = 'center'
  const titleSize = isPortrait ? 36 : 48
  ctx.fillStyle = '#ff4444'; ctx.font = `bold ${titleSize}px monospace`
  ctx.fillText('INFESTED!', canvas.width / 2, canvas.height / 2 - 40)
  ctx.fillStyle = '#aaffaa'; ctx.font = `${isPortrait ? 20 : 24}px monospace`
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 10)
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffdd00'; ctx.font = `${isPortrait ? 16 : 20}px monospace`
    ctx.fillText('NEW HIGH SCORE!', canvas.width / 2, canvas.height / 2 + 45)
  }
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(170,255,170,0.7)'; ctx.font = `${isPortrait ? 14 : 18}px monospace`
    const text = isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 90)
  }
}

function draw() {
  drawBackground()
  drawSplats()

  if (state === 'menu') { drawMenu() }
  else if (state === 'playing') {
    for (const ins of insects) drawInsect(ins)
    drawShip(); drawBullets(); drawParticles(); drawHUD(); drawTouchControls()
  } else if (state === 'gameover') {
    for (const ins of insects) drawInsect(ins)
    drawParticles(); drawHUD(); drawGameOver()
  }
}

// ─── Loop ───
function loop() { update(); draw(); requestAnimationFrame(loop) }
loop()
