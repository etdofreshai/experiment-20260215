import './style.css'

// =============================================================================
// ASTEROIDS GAME
// =============================================================================

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score')!
const livesEl = document.getElementById('lives')!
const gameOverEl = document.getElementById('game-over')!
const finalScoreEl = document.getElementById('final-score')!
const restartBtn = document.getElementById('restart')!

// Canvas setup
function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// =============================================================================
// GAME STATE
// =============================================================================

interface Vector2 {
  x: number
  y: number
}

interface Ship {
  pos: Vector2
  vel: Vector2
  angle: number
  thrust: boolean
  rotating: number // -1, 0, 1
}

interface Bullet {
  pos: Vector2
  vel: Vector2
  life: number
}

interface Asteroid {
  pos: Vector2
  vel: Vector2
  radius: number
  vertices: Vector2[]
}

let ship: Ship
let bullets: Bullet[] = []
let asteroids: Asteroid[] = []
let score = 0
let lives = 3
let gameOver = false
let keys: Record<string, boolean> = {}

const SHIP_SIZE = 15
const SHIP_THRUST = 0.15
const SHIP_FRICTION = 0.98
const SHIP_ROTATION_SPEED = 0.08
const BULLET_SPEED = 7
const BULLET_LIFE = 60
const ASTEROID_SPEEDS = [1, 1.5, 2]
const ASTEROID_SIZES = [50, 30, 15]

// =============================================================================
// INITIALIZATION
// =============================================================================

function initShip() {
  ship = {
    pos: { x: canvas.width / 2, y: canvas.height / 2 },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,
    thrust: false,
    rotating: 0
  }
}

function createAsteroid(x: number, y: number, size: number): Asteroid {
  const radius = ASTEROID_SIZES[size]
  const speed = ASTEROID_SPEEDS[size]
  const angle = Math.random() * Math.PI * 2
  
  // Generate random asteroid shape
  const vertices: Vector2[] = []
  const points = 8 + Math.floor(Math.random() * 4)
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    const r = radius * (0.7 + Math.random() * 0.3)
    vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  
  return {
    pos: { x, y },
    vel: {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed
    },
    radius,
    vertices
  }
}

function spawnAsteroids(count: number) {
  asteroids = []
  for (let i = 0; i < count; i++) {
    let x, y
    do {
      x = Math.random() * canvas.width
      y = Math.random() * canvas.height
      const dx = x - ship.pos.x
      const dy = y - ship.pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 150) break
    } while (true)
    asteroids.push(createAsteroid(x, y, 0))
  }
}

function init() {
  initShip()
  bullets = []
  asteroids = []
  score = 0
  lives = 3
  gameOver = false
  gameOverEl.classList.add('hidden')
  spawnAsteroids(4)
  updateUI()
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

// Keyboard
window.addEventListener('keydown', (e) => {
  keys[e.key] = true
  if (e.key === ' ' && !gameOver) {
    e.preventDefault()
    shootBullet()
  }
})

window.addEventListener('keyup', (e) => {
  keys[e.key] = false
})

function shootBullet() {
  if (gameOver) return
  bullets.push({
    pos: { x: ship.pos.x, y: ship.pos.y },
    vel: {
      x: Math.cos(ship.angle) * BULLET_SPEED + ship.vel.x,
      y: Math.sin(ship.angle) * BULLET_SPEED + ship.vel.y
    },
    life: BULLET_LIFE
  })
}

// Touch controls
let joystickActive = false
let joystickAngle = 0
let joystickDistance = 0

const joystick = document.getElementById('joystick')!
const joystickStick = document.getElementById('joystick-stick')!
const fireBtn = document.getElementById('fire-btn')!

function handleJoystickStart(e: TouchEvent | MouseEvent) {
  e.preventDefault()
  joystickActive = true
  handleJoystickMove(e)
}

function handleJoystickMove(e: TouchEvent | MouseEvent) {
  if (!joystickActive) return
  e.preventDefault()
  
  const rect = joystick.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  
  const touch = 'touches' in e ? e.touches[0] : e
  const dx = touch.clientX - centerX
  const dy = touch.clientY - centerY
  
  const distance = Math.sqrt(dx * dx + dy * dy)
  const maxDistance = rect.width / 2 - 25
  
  joystickDistance = Math.min(distance, maxDistance)
  joystickAngle = Math.atan2(dy, dx)
  
  const stickX = Math.cos(joystickAngle) * joystickDistance
  const stickY = Math.sin(joystickAngle) * joystickDistance
  
  joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`
}

function handleJoystickEnd() {
  joystickActive = false
  joystickDistance = 0
  joystickStick.style.transform = 'translate(-50%, -50%)'
}

joystick.addEventListener('touchstart', handleJoystickStart)
joystick.addEventListener('touchmove', handleJoystickMove)
joystick.addEventListener('touchend', handleJoystickEnd)
joystick.addEventListener('mousedown', handleJoystickStart)
document.addEventListener('mousemove', handleJoystickMove)
document.addEventListener('mouseup', handleJoystickEnd)

let fireHoldTimer: number | null = null

function startFiring() {
  if (gameOver) return
  shootBullet()
  fireHoldTimer = window.setInterval(() => shootBullet(), 200)
}

function stopFiring() {
  if (fireHoldTimer !== null) {
    clearInterval(fireHoldTimer)
    fireHoldTimer = null
  }
}

fireBtn.addEventListener('touchstart', (e) => {
  e.preventDefault()
  startFiring()
})

fireBtn.addEventListener('touchend', (e) => {
  e.preventDefault()
  stopFiring()
})

fireBtn.addEventListener('mousedown', (e) => {
  e.preventDefault()
  startFiring()
})

fireBtn.addEventListener('mouseup', (e) => {
  e.preventDefault()
  stopFiring()
})

// Restart button
restartBtn.addEventListener('click', init)

// =============================================================================
// GAME LOGIC
// =============================================================================

function updateShip() {
  // Keyboard controls
  if (keys['ArrowLeft']) ship.rotating = -1
  else if (keys['ArrowRight']) ship.rotating = 1
  else ship.rotating = 0
  
  ship.thrust = keys['ArrowUp'] || false
  
  // Joystick controls
  if (joystickDistance > 10) {
    const targetAngle = joystickAngle
    ship.angle = targetAngle
    ship.thrust = joystickDistance > 20
  } else if (ship.rotating !== 0) {
    ship.angle += ship.rotating * SHIP_ROTATION_SPEED
  }
  
  // Apply thrust
  if (ship.thrust) {
    ship.vel.x += Math.cos(ship.angle) * SHIP_THRUST
    ship.vel.y += Math.sin(ship.angle) * SHIP_THRUST
  }
  
  // Apply friction
  ship.vel.x *= SHIP_FRICTION
  ship.vel.y *= SHIP_FRICTION
  
  // Update position
  ship.pos.x += ship.vel.x
  ship.pos.y += ship.vel.y
  
  // Wrap around screen
  if (ship.pos.x < 0) ship.pos.x = canvas.width
  if (ship.pos.x > canvas.width) ship.pos.x = 0
  if (ship.pos.y < 0) ship.pos.y = canvas.height
  if (ship.pos.y > canvas.height) ship.pos.y = 0
}

function updateBullets() {
  bullets = bullets.filter(bullet => {
    bullet.pos.x += bullet.vel.x
    bullet.pos.y += bullet.vel.y
    bullet.life--
    
    // Wrap around
    if (bullet.pos.x < 0) bullet.pos.x = canvas.width
    if (bullet.pos.x > canvas.width) bullet.pos.x = 0
    if (bullet.pos.y < 0) bullet.pos.y = canvas.height
    if (bullet.pos.y > canvas.height) bullet.pos.y = 0
    
    return bullet.life > 0
  })
}

function updateAsteroids() {
  asteroids.forEach(asteroid => {
    asteroid.pos.x += asteroid.vel.x
    asteroid.pos.y += asteroid.vel.y
    
    // Wrap around
    if (asteroid.pos.x < -asteroid.radius) asteroid.pos.x = canvas.width + asteroid.radius
    if (asteroid.pos.x > canvas.width + asteroid.radius) asteroid.pos.x = -asteroid.radius
    if (asteroid.pos.y < -asteroid.radius) asteroid.pos.y = canvas.height + asteroid.radius
    if (asteroid.pos.y > canvas.height + asteroid.radius) asteroid.pos.y = -asteroid.radius
  })
}

function checkCollisions() {
  // Bullet-asteroid collisions
  for (let i = bullets.length - 1; i >= 0; i--) {
    for (let j = asteroids.length - 1; j >= 0; j--) {
      const bullet = bullets[i]
      const asteroid = asteroids[j]
      
      const dx = bullet.pos.x - asteroid.pos.x
      const dy = bullet.pos.y - asteroid.pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist < asteroid.radius) {
        bullets.splice(i, 1)
        asteroids.splice(j, 1)
        
        // Add score
        const size = ASTEROID_SIZES.indexOf(asteroid.radius)
        score += (3 - size) * 100
        
        // Split asteroid
        if (size < 2) {
          const newSize = size + 1
          for (let k = 0; k < 2; k++) {
            asteroids.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, newSize))
          }
        }
        
        updateUI()
        break
      }
    }
  }
  
  // Ship-asteroid collisions
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const asteroid = asteroids[i]
    const dx = ship.pos.x - asteroid.pos.x
    const dy = ship.pos.y - asteroid.pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    
    if (dist < asteroid.radius + SHIP_SIZE) {
      asteroids.splice(i, 1)
      lives--
      updateUI()
      
      if (lives <= 0) {
        endGame()
      } else {
        initShip()
      }
      break
    }
  }
  
  // Check for level clear
  if (asteroids.length === 0) {
    spawnAsteroids(Math.min(4 + Math.floor(score / 1000), 10))
  }
}

function updateUI() {
  scoreEl.textContent = `Score: ${score}`
  livesEl.textContent = `Lives: ${lives}`
}

function endGame() {
  gameOver = true
  gameOverEl.classList.remove('hidden')
  finalScoreEl.textContent = `Final Score: ${score}`
}

// =============================================================================
// RENDERING
// =============================================================================

function drawShip() {
  ctx.save()
  ctx.translate(ship.pos.x, ship.pos.y)
  ctx.rotate(ship.angle + Math.PI / 2)
  
  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -SHIP_SIZE)
  ctx.lineTo(SHIP_SIZE * 0.7, SHIP_SIZE)
  ctx.lineTo(0, SHIP_SIZE * 0.6)
  ctx.lineTo(-SHIP_SIZE * 0.7, SHIP_SIZE)
  ctx.closePath()
  ctx.stroke()
  
  // Thrust flame
  if (ship.thrust) {
    ctx.fillStyle = '#ff8844'
    ctx.beginPath()
    ctx.moveTo(0, SHIP_SIZE * 0.6)
    ctx.lineTo(SHIP_SIZE * 0.4, SHIP_SIZE * 1.3 + Math.random() * 5)
    ctx.lineTo(-SHIP_SIZE * 0.4, SHIP_SIZE * 1.3 + Math.random() * 5)
    ctx.closePath()
    ctx.fill()
  }
  
  ctx.restore()
}

function drawBullets() {
  ctx.fillStyle = '#ffffff'
  bullets.forEach(bullet => {
    ctx.beginPath()
    ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawAsteroids() {
  ctx.strokeStyle = '#888888'
  ctx.lineWidth = 2
  
  asteroids.forEach(asteroid => {
    ctx.save()
    ctx.translate(asteroid.pos.x, asteroid.pos.y)
    
    ctx.beginPath()
    asteroid.vertices.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y)
      else ctx.lineTo(v.x, v.y)
    })
    ctx.closePath()
    ctx.stroke()
    
    ctx.restore()
  })
}

function drawStars() {
  // Static star field (recreate on resize)
  if (!canvas.dataset.stars) {
    const stars: { x: number, y: number, r: number }[] = []
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5
      })
    }
    canvas.dataset.stars = JSON.stringify(stars)
  }
  
  const stars = JSON.parse(canvas.dataset.stars)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  stars.forEach((star: { x: number, y: number, r: number }) => {
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  })
}

function render() {
  // Clear
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  drawStars()
  drawAsteroids()
  drawBullets()
  drawShip()
}

// =============================================================================
// GAME LOOP
// =============================================================================

function gameLoop() {
  if (!gameOver) {
    updateShip()
    updateBullets()
    updateAsteroids()
    checkCollisions()
  }
  
  render()
  requestAnimationFrame(gameLoop)
}

// =============================================================================
// START
// =============================================================================

init()
gameLoop()
