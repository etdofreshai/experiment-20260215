import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

let count = 0

// --- Theme Switcher ---
const themes = [
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #2d1f0f, #b33a00, #ff6a00)',
  'linear-gradient(135deg, #0a2e1f, #0f5132, #198754)',
]
let themeIndex = 0

function cycleTheme() {
  themeIndex = (themeIndex + 1) % themes.length
  document.body.style.background = themes[themeIndex]
}

// --- Typing Effect ---
function typeText(el: HTMLElement, text: string, speed = 50) {
  el.textContent = ''
  el.classList.add('typing-cursor')
  let i = 0
  const iv = setInterval(() => {
    el.textContent += text[i++]
    if (i >= text.length) {
      clearInterval(iv)
      setTimeout(() => el.classList.remove('typing-cursor'), 600)
    }
  }, speed)
}

// --- Particle Background ---
function initParticles() {
  const canvas = document.createElement('canvas')
  canvas.id = 'particles'
  document.body.prepend(canvas)
  const ctx = canvas.getContext('2d')!

  function resize() {
    canvas.width = innerWidth
    canvas.height = innerHeight
  }
  resize()
  addEventListener('resize', resize)

  interface Particle { x: number; y: number; r: number; vx: number; vy: number; a: number }
  const particles: Particle[] = Array.from({ length: 60 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    r: Math.random() * 2 + 0.5,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    a: Math.random() * 0.5 + 0.2,
  }))

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0) p.x = canvas.width
      if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height
      if (p.y > canvas.height) p.y = 0
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${p.a})`
      ctx.fill()
    }
    requestAnimationFrame(draw)
  }
  draw()
}

// --- Mouse Trail ---
function initMouseTrail() {
  const dots: HTMLDivElement[] = []
  document.addEventListener('mousemove', (e) => {
    const dot = document.createElement('div')
    dot.className = 'mouse-trail'
    dot.style.left = e.clientX + 'px'
    dot.style.top = e.clientY + 'px'
    document.body.appendChild(dot)
    dots.push(dot)
    setTimeout(() => {
      dot.remove()
      dots.shift()
    }, 500)
  })
}

// --- Easter Egg: type "hello" ---
function initEasterEgg() {
  let buffer = ''
  document.addEventListener('keydown', (e) => {
    buffer += e.key.toLowerCase()
    buffer = buffer.slice(-5)
    if (buffer === 'hello') {
      buffer = ''
      triggerConfetti()
      const h1 = document.querySelector('h1')
      if (h1) {
        h1.classList.add('flip')
        setTimeout(() => h1.classList.remove('flip'), 1000)
      }
    }
  })
}

function triggerConfetti() {
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div')
    c.className = 'confetti'
    c.style.left = Math.random() * 100 + 'vw'
    c.style.background = ['#ff6fd8', '#ffd200', '#845ec2', '#00c9a7', '#f7971e'][Math.floor(Math.random() * 5)]
    c.style.animationDuration = (Math.random() * 1.5 + 1) + 's'
    c.style.animationDelay = Math.random() * 0.3 + 's'
    document.body.appendChild(c)
    setTimeout(() => c.remove(), 3000)
  }
}

// --- Clock ---
function updateClock() {
  const el = document.getElementById('clock')
  if (el) el.textContent = new Date().toLocaleString()
}

// --- Render ---
function render() {
  // Only build the full DOM once; after that just update the counter text
  if (!document.getElementById('counter')) {
    // Render clock outside #app so it's never part of the centered/animated container
    if (!document.getElementById('clock')) {
      const clock = document.createElement('div')
      clock.id = 'clock'
      clock.className = 'clock'
      document.body.appendChild(clock)
    }
    app.innerHTML = `
      <h1>Back to Hello World! 🚀</h1>
      <p id="typed"></p>
      <div class="button-row">
        <button id="counter" type="button">Count: ${count}</button>
        <button id="theme-btn" type="button" title="Change theme">🎨</button>
      </div>
      <footer class="build-time">Built: ${__BUILD_TIME__}</footer>
    `
    document.querySelector('#counter')!.addEventListener('click', () => {
      count++
      document.getElementById('counter')!.textContent = `Count: ${count}`
    })
    document.getElementById('theme-btn')!.addEventListener('click', cycleTheme)
  }
  updateClock()
}

// --- Init ---
render()
typeText(document.getElementById('typed')!, 'This is a Vite + TypeScript project.')
setInterval(updateClock, 1000)
initParticles()
initMouseTrail()
initEasterEgg()
