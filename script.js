const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const nicknameInput = document.getElementById('nickname');
const deathScreen = document.getElementById('deathScreen');
const retryBtn = document.getElementById('retryBtn');
const languageSelect = document.getElementById('language');

// Player
let player = { x: 400, y: 300, width: 50, height: 20, speed: 3, health: 100, oxygen: 100 };
let keys = {};

// Düşman, mayın ve görev
let enemies = [];
let mines = [];
let kills = 0;
let level = 1;

// Küfür filtresi
const bannedWords = ['fuck','shit','s-i-k-t','ba-ba-31pro']; // örnek
function cleanNickname(name) {
    let clean = name.toLowerCase();
    bannedWords.forEach(word => { clean = clean.replace(word, '***'); });
    return clean;
}

// Menüden başlat
startBtn.onclick = () => {
    player.nickname = cleanNickname(nicknameInput.value) || 'Player';
    menu.style.display = 'none';
    canvas.style.display = 'block';
    startGame();
};

// Tekrar oyna
retryBtn.onclick = () => {
    deathScreen.style.display = 'none';
    canvas.style.display = 'block';
    resetGame();
};

function startGame() {
    // Başlangıç düşman ve mayın
    spawnEnemies(level);
    spawnMines(level);
    requestAnimationFrame(gameLoop);
}

function resetGame() {
    player.x = 400; player.y = 300;
    player.health = 100; player.oxygen = 100;
    kills = 0;
    enemies = [];
    mines = [];
    spawnEnemies(level);
    spawnMines(level);
    requestAnimationFrame(gameLoop);
}

function spawnEnemies(level) {
    for(let i=0; i<level+2; i++) {
        enemies.push({ x: Math.random()*700+50, y: Math.random()*500+50, width: 50, height:20, health:50 });
    }
}

function spawnMines(level) {
    for(let i=0; i<level; i++) {
        mines.push({ x: Math.random()*750+25, y: Math.random()*550+25, width: 30, height: 30 });
    }
}

document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

function gameLoop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Player hareketi
    if(keys['ArrowUp']) player.y -= player.speed;
    if(keys['ArrowDown']) player.y += player.speed;
    if(keys['ArrowLeft']) player.x -= player.speed;
    if(keys['ArrowRight']) player.x += player.speed;
    
    // Canvas sınırları
    player.x = Math.max(0, Math.min(canvas.width-player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height-player.height, player.y));
    
    // Player çizimi
    ctx.fillStyle = 'lime';
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Düşman çizimi
    ctx.fillStyle = 'red';
    enemies.forEach(enemy => ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height));

    // Mayın çizimi
    ctx.fillStyle = 'orange';
    mines.forEach(mine => ctx.fillRect(mine.x, mine.y, mine.width, mine.height));

    // Can kontrol
    if(player.health <= 0) {
        canvas.style.display = 'none';
        deathScreen.style.display = 'flex';
        return;
    }

    requestAnimationFrame(gameLoop);
}
