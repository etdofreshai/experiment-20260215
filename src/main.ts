import './style.css'

// ─── Canvas Setup ───
const canvas = document.createElement('canvas')
document.getElementById('app')!.appendChild(canvas)
const ctx = canvas.getContext('2d')!

function resize() {
  canvas.width = innerWidth
  canvas.height = innerHeight
}
resize()
addEventListener('resize', resize)

// ─── Audio (Web Audio API) ───
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
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3 * (1 - i / len)
  const s = audioCtx.createBufferSource(); s.buffer = buf
  const g = audioCtx.createGain(); s.connect(g); g.connect(audioCtx.destination)
  g.gain.setValueAtTime(0.03, audioCtx.currentTime)
  s.start()
}

function sfxGameOver() {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain()
  o.connect(g); g.connect(audioCtx.destination)
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(440, audioCtx.currentTime)
  o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.8)
  g.gain.setValueAtTime(0.15, audioCtx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8)
  o.start(); o.stop(audioCtx.currentTime + 0.8)
}

let thrustTick = 0

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

// Stars background (static)
const stars = Array.from({ length: 200 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.3, a: Math.random() * 0.6 + 0.2
}))

// ─── Input ───
const keys: Record<string, boolean> = {}
addEventListener('keydown', e => {
  keys[e.code] = true
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) startGame()
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { state = 'menu' }
  if (state === 'playing' && (e.code === 'KeyH' || e.code === 'ShiftRight')) hyperspace()
})
addEventListener('keyup', e => { keys[e.code] = false })

// ─── Touch Controls ───
const touch: Record<string, boolean> = { left: false, right: false, thrust: false, fire: false, hyperspace: false }
let touchDpadCenter = { x: 0, y: 0 }
const DPAD_RADIUS = 50
const DPAD_DEAD = 15
const BTN_RADIUS = 35

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// Track active touches per zone
const activeTouches: Map<number, string> = new Map()

function classifyTouch(tx: number, ty: number): string {
  // D-pad zone (left side, bottom)
  const dCx = 90, dCy = canvas.height - 110
  touchDpadCenter = { x: dCx, y: dCy }
  const ddist = Math.hypot(tx - dCx, ty - dCy)
  if (ddist < DPAD_RADIUS + 40) return 'dpad'

  // Fire button
  const fCx = canvas.width - 100, fCy = canvas.height - 130
  if (Math.hypot(tx - fCx, ty - fCy) < BTN_RADIUS + 15) return 'fire'

  // Hyperspace button
  const hCx = canvas.width - 170, hCy = canvas.height - 70
  if (Math.hypot(tx - hCx, ty - hCy) < BTN_RADIUS + 10) return 'hyperspace'

  // Tap anywhere else in menu/gameover
  return 'tap'
}

function updateDpadFromTouch(tx: number, ty: number) {
  const dCx = 90, dCy = canvas.height - 110
  const dx = tx - dCx, dy = ty - dCy
  const d = Math.hypot(dx, dy)
  touch.left = false; touch.right = false; touch.thrust = false
  if (d > DPAD_DEAD) {
    const angle = Math.atan2(dy, dx)
    if (angle > 2.3 || angle < -2.3) touch.left = true    // left
    if (angle > -0.8 && angle < 0.8) touch.right = true   // right
    if (angle < -0.4 && angle > -2.7) touch.thrust = true  // up
  }
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const zone = classifyTouch(t.clientX, t.clientY)
    activeTouches.set(t.identifier, zone)

    if (state === 'menu') { startGame(); continue }
    if (state === 'gameover') { state = 'menu'; continue }

    if (zone === 'dpad') updateDpadFromTouch(t.clientX, t.clientY)
    if (zone === 'fire') { touch.fire = true; fireBullet() }
    if (zone === 'hyperspace') { touch.hyperspace = true; hyperspace() }
  }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (activeTouches.get(t.identifier) === 'dpad') {
      updateDpadFromTouch(t.clientX, t.clientY)
    }
  }
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const zone = activeTouches.get(t.identifier)
    activeTouches.delete(t.identifier)
    if (zone === 'dpad') { touch.left = false; touch.right = false; touch.thrust = false }
    if (zone === 'fire') touch.fire = false
    if (zone === 'hyperspace') touch.hyperspace = false
  }
}, { passive: false })

canvas.addEventListener('touchcancel', e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier)
  }
  touch.left = false; touch.right = false; touch.thrust = false
  touch.fire = false; touch.hyperspace = false
})

// ─── Hyperspace ───
let hyperCooldown = 0
function hyperspace() {
  if (state !== 'playing' || !shipVisible || hyperCooldown > 0) return
  spawnParticles(ship.pos.x, ship.pos.y, 10, 2)
  ship.pos.x = Math.random() * canvas.width
  ship.pos.y = Math.random() * canvas.height
  ship.vel.x = 0; ship.vel.y = 0
  spawnParticles(ship.pos.x, ship.pos.y, 10, 2)
  hyperCooldown = 90 // 1.5 sec cooldown
}

function fireBullet() {
  if (state !== 'playing' || !shipVisible || bullets.length >= 8) return
  const bSpeed = 8
  bullets.push({
    pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
    vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
    life: 60
  })
}

const showTouch = isTouchDevice()

// ─── Menu animation asteroids ───
let menuAsteroids: Asteroid[] = []
function initMenuAsteroids() {
  menuAsteroids = []
  for (let i = 0; i < 8; i++) {
    menuAsteroids.push(makeAsteroid(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      30 + Math.random() * 40
    ))
  }
}
initMenuAsteroids()

// ─── Game Init ───
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume()
  state = 'playing'
  score = 0
  lives = 3
  level = 1
  bullets = []
  asteroids = []
  particles = []
  respawnTimer = 0
  shipVisible = true
  resetShip()
  spawnAsteroids(4)
}

function resetShip() {
  ship = {
    pos: { x: canvas.width / 2, y: canvas.height / 2 },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,
    thrust: false,
    radius: 15
  }
}

function makeAsteroid(x: number, y: number, radius: number): Asteroid {
  const numVerts = 8 + Math.floor(Math.random() * 5)
  const verts: number[] = []
  for (let i = 0; i < numVerts; i++) {
    verts.push(0.7 + Math.random() * 0.6)
  }
  return {
    pos: { x, y },
    vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
    radius,
    verts,
    spin: (Math.random() - 0.5) * 0.02,
    rot: Math.random() * Math.PI * 2
  }
}

function spawnAsteroids(count: number) {
  for (let i = 0; i < count; i++) {
    let x: number, y: number
    // Spawn away from ship
    do {
      x = Math.random() * canvas.width
      y = Math.random() * canvas.height
    } while (dist(x, y, ship.pos.x, ship.pos.y) < 150)
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
    particles.push({
      pos: { x, y },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 30 + Math.random() * 30,
      maxLife: 60
    })
  }
}

// ─── Update ───
function update() {
  if (state === 'menu') {
    for (const a of menuAsteroids) {
      a.pos.x += a.vel.x
      a.pos.y += a.vel.y
      a.rot += a.spin
      wrap(a.pos)
    }
    return
  }
  if (state === 'gameover') return

  // Respawn
  if (respawnTimer > 0) {
    respawnTimer--
    if (respawnTimer === 0) {
      resetShip()
      shipVisible = true
    }
    // Still update asteroids
    for (const a of asteroids) {
      a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos)
    }
    updateParticles()
    return
  }

  // Ship controls
  if (keys['ArrowLeft'] || keys['KeyA']) ship.angle -= 0.05
  if (keys['ArrowRight'] || keys['KeyD']) ship.angle += 0.05
  ship.thrust = !!(keys['ArrowUp'] || keys['KeyW'])
  if (ship.thrust) {
    thrustTick++
    if (thrustTick % 4 === 0) sfxThrust()
  } else { thrustTick = 0 }
  if (ship.thrust) {
    ship.vel.x += Math.cos(ship.angle) * 0.1
    ship.vel.y += Math.sin(ship.angle) * 0.1
  }
  // Friction
  ship.vel.x *= 0.99
  ship.vel.y *= 0.99
  // Speed cap
  const spd = Math.hypot(ship.vel.x, ship.vel.y)
  if (spd > 6) { ship.vel.x *= 6 / spd; ship.vel.y *= 6 / spd }
  ship.pos.x += ship.vel.x
  ship.pos.y += ship.vel.y
  wrap(ship.pos)

  // Shoot
  if (keys['Space'] && bullets.length < 8) {
    keys['Space'] = false // one shot per press
    if (audioCtx.state === 'suspended') audioCtx.resume()
    sfxShoot()
    const bSpeed = 8
    bullets.push({
      pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
      vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
      life: 60
    })
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.pos.x += b.vel.x; b.pos.y += b.vel.y
    b.life--
    if (b.life <= 0 || b.pos.x < -10 || b.pos.x > canvas.width + 10 || b.pos.y < -10 || b.pos.y > canvas.height + 10) {
      bullets.splice(i, 1)
    }
  }

  // Asteroids
  for (const a of asteroids) {
    a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos)
  }

  // Bullet-Asteroid collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const b = bullets[bi], a = asteroids[ai]
      if (!b || !a) continue
      if (dist(b.pos.x, b.pos.y, a.pos.x, a.pos.y) < a.radius) {
        bullets.splice(bi, 1)
        sfxBoom(a.radius > 20)
        spawnParticles(a.pos.x, a.pos.y, 8)
        if (a.radius > 20) {
          // Split
          for (let k = 0; k < 2; k++) {
            const child = makeAsteroid(a.pos.x, a.pos.y, a.radius * 0.55)
            child.vel.x = (Math.random() - 0.5) * 3
            child.vel.y = (Math.random() - 0.5) * 3
            asteroids.push(child)
          }
          score += 20
        } else {
          score += 50
        }
        asteroids.splice(ai, 1)
        break
      }
    }
  }

  // Ship-Asteroid collision
  if (shipVisible) {
    for (const a of asteroids) {
      if (dist(ship.pos.x, ship.pos.y, a.pos.x, a.pos.y) < a.radius + ship.radius - 5) {
        sfxBoom(true)
        spawnParticles(ship.pos.x, ship.pos.y, 20, 3)
        shipVisible = false
        lives--
        if (lives <= 0) {
          sfxGameOver()
          state = 'gameover'
          if (score > highScore) {
            highScore = score
            localStorage.setItem('asteroids-hi', String(highScore))
          }
        } else {
          respawnTimer = 120
        }
        break
      }
    }
  }

  // Next level
  if (asteroids.length === 0) {
    level++
    spawnAsteroids(3 + level)
  }

  updateParticles()
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.pos.x += p.vel.x; p.pos.y += p.vel.y
    p.life--
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
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function drawShip() {
  if (!shipVisible) return
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle)
  // Ship body
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(-12, -10)
  ctx.lineTo(-6, 0)
  ctx.lineTo(-12, 10)
  ctx.closePath()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.stroke()
  // Thrust flame
  if (ship.thrust) {
    ctx.beginPath()
    ctx.moveTo(-8, -4)
    ctx.lineTo(-18 - Math.random() * 8, 0)
    ctx.lineTo(-8, 4)
    ctx.strokeStyle = `hsl(${30 + Math.random() * 20}, 100%, 60%)`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

function drawBullets() {
  ctx.fillStyle = '#fff'
  for (const b of bullets) {
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife
    ctx.fillStyle = `rgba(255,200,100,${a})`
    ctx.fillRect(p.pos.x, p.pos.y, 2, 2)
  }
}

function drawHUD() {
  ctx.fillStyle = '#fff'
  ctx.font = '18px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`SCORE: ${score}`, 20, 35)
  ctx.textAlign = 'right'
  ctx.fillText(`HI: ${highScore}`, canvas.width - 20, 35)
  // Lives
  ctx.textAlign = 'left'
  for (let i = 0; i < lives; i++) {
    ctx.save()
    ctx.translate(25 + i * 25, 60)
    ctx.rotate(-Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-3, 0); ctx.lineTo(-7, 6)
    ctx.closePath()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.restore()
  }
}

function drawMenu() {
  // Floating asteroids
  for (const a of menuAsteroids) drawAsteroidShape(a)

  ctx.textAlign = 'center'

  // Title
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 64px monospace'
  ctx.fillText('ASTEROIDS', canvas.width / 2, canvas.height / 2 - 80)

  // Subtitle
  ctx.font = '18px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText('A CLASSIC ARCADE GAME', canvas.width / 2, canvas.height / 2 - 45)

  // Blinking "press start"
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#fff'
    ctx.font = '22px monospace'
    ctx.fillText('PRESS ENTER OR SPACE TO START', canvas.width / 2, canvas.height / 2 + 30)
  }

  // Controls
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '14px monospace'
  ctx.fillText('ARROW KEYS / WASD — MOVE    SPACE — SHOOT', canvas.width / 2, canvas.height / 2 + 80)

  // High score
  if (highScore > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '16px monospace'
    ctx.fillText(`HIGH SCORE: ${highScore}`, canvas.width / 2, canvas.height / 2 + 120)
  }
}

function drawGameOver() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 48px monospace'
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40)
  ctx.font = '24px monospace'
  ctx.fillText(`SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 10)
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = '20px monospace'
    ctx.fillText('NEW HIGH SCORE!', canvas.width / 2, canvas.height / 2 + 45)
  }
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '18px monospace'
    ctx.fillText('PRESS ENTER TO CONTINUE', canvas.width / 2, canvas.height / 2 + 90)
  }
}

function draw() {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawStars()

  if (state === 'menu') {
    drawMenu()
  } else if (state === 'playing') {
    for (const a of asteroids) drawAsteroidShape(a)
    drawShip()
    drawBullets()
    drawParticles()
    drawHUD()
  } else if (state === 'gameover') {
    for (const a of asteroids) drawAsteroidShape(a)
    drawParticles()
    drawHUD()
    drawGameOver()
  }
}

// ─── Loop ───
function loop() {
  update()
  draw()
  requestAnimationFrame(loop)
}
loop()
