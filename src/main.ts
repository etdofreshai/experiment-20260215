import './style.css'

// ─── Orientation Lock ───
try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}) } catch {}

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
})
addEventListener('keyup', e => { keys[e.code] = false })

// ─── Touch Controls ───
let touchActive = false
let touchJoystickId: number | null = null
let touchJoystickCenter: Vec2 = { x: 0, y: 0 }
let touchJoystickAngle = 0
let touchJoystickDist = 0
const JOYSTICK_RADIUS = 55
const JOYSTICK_DEAD = 12
let touchFireActive = false
let touchFireTimer: number | null = null

// Detect touch device
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

function getJoystickArea() {
  // Left half of bottom portion
  return { x: 0, y: canvas.height * 0.5, w: canvas.width * 0.5, h: canvas.height * 0.5 }
}

function getFireArea() {
  // Right half of bottom portion
  return { x: canvas.width * 0.5, y: canvas.height * 0.5, w: canvas.width * 0.5, h: canvas.height * 0.5 }
}

function isInArea(tx: number, ty: number, area: { x: number; y: number; w: number; h: number }) {
  return tx >= area.x && tx <= area.x + area.w && ty >= area.y && ty <= area.y + area.h
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (state === 'menu') { startGame(); return }
  if (state === 'gameover') { state = 'menu'; return }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    const jArea = getJoystickArea()
    const fArea = getFireArea()

    if (touchJoystickId === null && isInArea(t.clientX, t.clientY, jArea)) {
      touchJoystickId = t.identifier
      touchJoystickCenter = { x: t.clientX, y: t.clientY }
      touchActive = true
    } else if (isInArea(t.clientX, t.clientY, fArea)) {
      touchFireActive = true
      shootBullet()
      if (!touchFireTimer) {
        touchFireTimer = window.setInterval(() => { if (touchFireActive) shootBullet() }, 180)
      }
    }
  }
}, { passive: false })

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === touchJoystickId) {
      const dx = t.clientX - touchJoystickCenter.x
      const dy = t.clientY - touchJoystickCenter.y
      touchJoystickDist = Math.min(Math.hypot(dx, dy), JOYSTICK_RADIUS)
      touchJoystickAngle = Math.atan2(dy, dx)
    }
  }
}, { passive: false })

canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i]
    if (t.identifier === touchJoystickId) {
      touchJoystickId = null
      touchJoystickDist = 0
      touchActive = false
    }
  }
  // Check if any fire touches remain
  let fireStillDown = false
  const fArea = getFireArea()
  for (let i = 0; i < e.touches.length; i++) {
    if (isInArea(e.touches[i].clientX, e.touches[i].clientY, fArea)) fireStillDown = true
  }
  if (!fireStillDown) {
    touchFireActive = false
    if (touchFireTimer) { clearInterval(touchFireTimer); touchFireTimer = null }
  }
}, { passive: false })

function shootBullet() {
  if (state !== 'playing' || !shipVisible || bullets.length >= 8) return
  const bSpeed = 8
  bullets.push({
    pos: { x: ship.pos.x + Math.cos(ship.angle) * 18, y: ship.pos.y + Math.sin(ship.angle) * 18 },
    vel: { x: Math.cos(ship.angle) * bSpeed + ship.vel.x * 0.3, y: Math.sin(ship.angle) * bSpeed + ship.vel.y * 0.3 },
    life: 60
  })
}

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
      a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos)
    }
    return
  }
  if (state === 'gameover') return

  // Respawn
  if (respawnTimer > 0) {
    respawnTimer--
    if (respawnTimer === 0) { resetShip(); shipVisible = true }
    for (const a of asteroids) { a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos) }
    updateParticles()
    return
  }

  // Ship controls — keyboard
  if (keys['ArrowLeft'] || keys['KeyA']) ship.angle -= 0.05
  if (keys['ArrowRight'] || keys['KeyD']) ship.angle += 0.05
  ship.thrust = !!(keys['ArrowUp'] || keys['KeyW'])

  // Ship controls — touch joystick
  if (touchActive && touchJoystickDist > JOYSTICK_DEAD) {
    ship.angle = touchJoystickAngle
    ship.thrust = touchJoystickDist > JOYSTICK_DEAD * 2
  }

  if (ship.thrust) {
    ship.vel.x += Math.cos(ship.angle) * 0.1
    ship.vel.y += Math.sin(ship.angle) * 0.1
  }
  ship.vel.x *= 0.99; ship.vel.y *= 0.99
  const spd = Math.hypot(ship.vel.x, ship.vel.y)
  if (spd > 6) { ship.vel.x *= 6 / spd; ship.vel.y *= 6 / spd }
  ship.pos.x += ship.vel.x; ship.pos.y += ship.vel.y
  wrap(ship.pos)

  // Shoot — keyboard
  if (keys['Space'] && bullets.length < 8) {
    keys['Space'] = false
    shootBullet()
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--
    if (b.life <= 0 || b.pos.x < -10 || b.pos.x > canvas.width + 10 || b.pos.y < -10 || b.pos.y > canvas.height + 10) {
      bullets.splice(i, 1)
    }
  }

  // Asteroids
  for (const a of asteroids) { a.pos.x += a.vel.x; a.pos.y += a.vel.y; a.rot += a.spin; wrap(a.pos) }

  // Bullet-Asteroid collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const b = bullets[bi], a = asteroids[ai]
      if (!b || !a) continue
      if (dist(b.pos.x, b.pos.y, a.pos.x, a.pos.y) < a.radius) {
        bullets.splice(bi, 1)
        spawnParticles(a.pos.x, a.pos.y, 8)
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

  // Next level
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

  // Joystick base
  const jx = 80, jy = canvas.height - 100
  ctx.beginPath()
  ctx.arc(jx, jy, JOYSTICK_RADIUS + 5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill()

  // Joystick stick
  let sx = jx, sy = jy
  if (touchActive && touchJoystickDist > 0) {
    sx = touchJoystickCenter.x + Math.cos(touchJoystickAngle) * touchJoystickDist
    sy = touchJoystickCenter.y + Math.sin(touchJoystickAngle) * touchJoystickDist
  }
  ctx.beginPath()
  ctx.arc(sx, sy, 22, 0, Math.PI * 2)
  ctx.fillStyle = touchActive ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.15)'
  ctx.fill()
  ctx.strokeStyle = touchActive ? 'rgba(0,255,136,0.7)' : 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2; ctx.stroke()

  // Fire button
  const fx = canvas.width - 80, fy = canvas.height - 100
  ctx.beginPath()
  ctx.arc(fx, fy, JOYSTICK_RADIUS + 5, 0, Math.PI * 2)
  ctx.fillStyle = touchFireActive ? 'rgba(255,68,68,0.4)' : 'rgba(255,68,68,0.15)'
  ctx.fill()
  ctx.strokeStyle = touchFireActive ? 'rgba(255,68,68,0.8)' : 'rgba(255,68,68,0.4)'
  ctx.lineWidth = 2; ctx.stroke()

  ctx.fillStyle = touchFireActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
  ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'
  ctx.fillText('FIRE', fx, fy + 5)
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
    ctx.fillText('LEFT: MOVE    RIGHT: FIRE', canvas.width / 2, canvas.height * 0.65)
  } else {
    ctx.fillText('ARROW KEYS / WASD — MOVE    SPACE — SHOOT', canvas.width / 2, canvas.height * 0.65)
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
