const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- DÜNYA AYARLARI ---
const WORLD_WIDTH = 6000; // Daha geniş
const WORLD_HEIGHT = 2500;
const SURFACE_Y = 150; 

// --- GEMİ TİPLERİ ---
const SHIPS = {
    balanced: { name: 'SAVAŞÇI', speed: 5, hp: 100, turn: 0.08, color: '#00ffff' },
    scout: { name: 'KAŞİF', speed: 7, hp: 60, turn: 0.1, color: '#00ff00' },
    heavy: { name: 'ZIRHLI', speed: 3.5, hp: 180, turn: 0.04, color: '#ff00ff' }
};

let selectedShip = 'balanced';
let gameActive = false;
let score = 0;
let camera = { x: 0, y: 0 };

const player = {
    x: 500, y: 300,
    angle: 0, 
    health: 100, maxHealth: 100, oxygen: 100,
    torpCd: 0, lastShotTime: 0
};

// Listeler
let terrainPoints = []; 
let bullets = [];
let enemies = [];
let particles = [];
let items = [];
let bubbles = [];
let decorations = [];

const keys = {};
const mouse = { x: 0, y: 0 };

// --- ARAZİ OLUŞTURMA (Daha Zorlu) ---
function generateTerrain() {
    terrainPoints = [];
    let height = WORLD_HEIGHT - 300;
    // 50px aralıklarla nokta koyuyoruz
    for(let x = 0; x <= WORLD_WIDTH; x += 50) {
        // Rastgelelik (Perlin noise benzeri basit varyasyon)
        height += (Math.random() - 0.5) * 150;
        
        // Çok yukarı veya çok aşağı gitmesin
        if(height > WORLD_HEIGHT - 100) height = WORLD_HEIGHT - 100;
        if(height < SURFACE_Y + 300) height = SURFACE_Y + 300; // Yüzeye çok yaklaşmasın
        
        terrainPoints.push({x: x, y: height});
        
        // Dekorasyon (Yosun, Taş) - DAHA SIK
        if(Math.random() > 0.3) { // %70 doluluk
            decorations.push({
                x: x, y: height,
                type: Math.random() > 0.6 ? 'rock' : 'weed',
                size: Math.random() * 30 + 10
            });
        }
    }
    // Altı kapat
    terrainPoints.push({x: WORLD_WIDTH, y: WORLD_HEIGHT});
    terrainPoints.push({x: 0, y: WORLD_HEIGHT});
}

function initGame() {
    const stats = SHIPS[selectedShip];
    player.maxHealth = stats.hp;
    player.health = stats.hp;
    player.x = 500; player.y = SURFACE_Y + 100;
    player.angle = 0;
    player.oxygen = 100;
    score = 0;
    
    bullets = []; enemies = []; items = []; bubbles = [];
    
    generateTerrain();
    
    // Daha fazla düşman ve eşya
    for(let i=0; i<25; i++) spawnEnemy();
    for(let i=0; i<15; i++) spawnItem();
    
    gameActive = true;
    loop();
}

// --- GÜNCELLEME ---
function update() {
    if(!gameActive) return;

    const stats = SHIPS[selectedShip];

    // 1. KONTROLLER (WASD / OKLAR)
    if(keys['w'] || keys['ArrowUp']) player.y -= stats.speed;
    if(keys['s'] || keys['ArrowDown']) player.y += stats.speed;
    if(keys['a'] || keys['ArrowLeft']) { player.x -= stats.speed; player.angle = Math.PI; } // Sola dön
    if(keys['d'] || keys['ArrowRight']) { player.x += stats.speed; player.angle = 0; } // Sağa dön

    // 2. SINIRLAR VE ZEMİN ÇARPIŞMASI (KRİTİK DÜZELTME)
    if(player.x < 50) player.x = 50;
    if(player.x > WORLD_WIDTH-50) player.x = WORLD_WIDTH-50;
    if(player.y < SURFACE_Y) player.y = SURFACE_Y; 

    // Zemin Kontrolü (Matematiksel Çarpışma)
    let groundHeight = getTerrainHeightAt(player.x);
    if(player.y > groundHeight - 15) { // 15px tolerans
        player.y = groundHeight - 15;
        player.health -= 1; // Sürtünme hasarı
        createExplosion(player.x, player.y + 10, '#888', 2); // Toz efekti
    }

    // 3. OKSİJEN
    if(player.y <= SURFACE_Y + 10) player.oxygen = Math.min(100, player.oxygen + 0.8);
    else player.oxygen -= 0.05;
    
    if(player.oxygen <= 0) player.health -= 0.2;
    if(player.health <= 0) gameOver();

    // 4. KAMERA
    camera.x += ((player.x - canvas.width/2) - camera.x) * 0.1;
    camera.y += ((player.y - canvas.height/2) - camera.y) * 0.1;
    
    camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH - canvas.width));
    camera.y = Math.max(-200, Math.min(camera.y, WORLD_HEIGHT - canvas.height));

    // 5. MERMİLER
    bullets.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        if(b.life <= 0) bullets.splice(i, 1);
    });

    // 6. DÜŞMANLAR
    enemies.forEach((e, i) => {
        // AI: Takip
        if(e.type === 'sub' || e.type === 'boss') {
            let dx = player.x - e.x;
            let dy = player.y - e.y;
            let dist = Math.hypot(dx, dy);
            if(dist < 700) {
                e.x += (dx/dist) * e.speed;
                e.y += (dy/dist) * e.speed;
                // Yüzü oyuncuya dönsün
                e.face = dx > 0 ? 1 : -1;
            }
        }

        // Çarpışma: Mermi vs Düşman
        bullets.forEach((b, j) => {
            if(Math.hypot(b.x - e.x, b.y - e.y) < e.size) {
                e.health -= b.dmg;
                createExplosion(b.x, b.y, b.color, 3);
                bullets.splice(j, 1);
                
                if(e.health <= 0) {
                    createExplosion(e.x, e.y, '#ff0000', 20);
                    enemies.splice(i, 1);
                    score += 100;
                    spawnEnemy(); 
                    if(Math.random() < 0.5) spawnItem(e.x, e.y); // %50 Loot
                }
            }
        });

        // Çarpışma: Oyuncu vs Düşman
        if(Math.hypot(player.x - e.x, player.y - e.y) < e.size + 20) {
            player.health -= 0.5;
            createExplosion(player.x, player.y, '#ff0000', 1);
        }
    });

    // 7. EŞYALAR
    items.forEach((item, i) => {
        if(Math.hypot(player.x - item.x, player.y - item.y) < 35) {
            player.health = Math.min(player.maxHealth, player.health + 25);
            createExplosion(item.x, item.y, '#00ff00', 15);
            items.splice(i, 1);
        }
    });

    // Boss Spawn
    if(score > 1500 && !enemies.some(e => e.type === 'boss')) {
        document.getElementById('bossWarning').classList.remove('hidden');
        setTimeout(()=>document.getElementById('bossWarning').classList.add('hidden'), 4000);
        enemies.push({
            x: player.x + 600, y: player.y, type: 'boss',
            health: 800, maxHealth: 800, size: 80, speed: 2, face: -1
        });
    }

    // UI
    document.getElementById('hpBar').style.width = (player.health/player.maxHealth*100) + '%';
    document.getElementById('oxBar').style.width = player.oxygen + '%';
    document.getElementById('scoreVal').innerText = score;
    document.getElementById('depthVal').innerText = Math.floor(Math.max(0, player.y - SURFACE_Y));
    
    if(player.torpCd > 0) player.torpCd--;
}

// --- ÇİZİM ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Arka Plan
    let grd = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    grd.addColorStop(0, "#001a33");
    grd.addColorStop(1, "#000000");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Arazi (Terrain)
    ctx.fillStyle = "#050505";
    ctx.beginPath();
    if(terrainPoints.length > 0) {
        ctx.moveTo(terrainPoints[0].x, terrainPoints[0].y);
        for(let i=1; i<terrainPoints.length; i++) ctx.lineTo(terrainPoints[i].x, terrainPoints[i].y);
    }
    ctx.fill();
    ctx.strokeStyle = "#0055ff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Dekorasyonlar
    decorations.forEach(d => {
        if(d.type === 'weed') {
            ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(d.x, d.y);
            ctx.quadraticCurveTo(d.x + Math.sin(Date.now()*0.002 + d.x)*20, d.y - d.size*3, d.x, d.y - d.size*5);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI*2); ctx.fill();
        }
    });

    // Oyuncu
    drawPlayer();

    // Düşmanlar
    enemies.forEach(e => {
        ctx.save();
        ctx.translate(e.x, e.y);
        if(e.face === 1) ctx.scale(-1, 1);

        if(e.type === 'boss') {
            // Kraken
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'red'; ctx.lineWidth = 6;
            for(let k=0; k<6; k++) {
                ctx.beginPath(); ctx.moveTo(0, 30);
                ctx.quadraticCurveTo(Math.sin(Date.now()*0.005+k)*40, 80, Math.cos(Date.now()*0.005+k)*80, 120);
                ctx.stroke();
            }
        } else if(e.type === 'sub') {
            ctx.fillStyle = '#ff4444';
            ctx.beginPath(); ctx.ellipse(0, 0, 35, 12, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#330000'; ctx.fillRect(-5, -15, 10, 15);
        } else {
            // Mayın veya Deniz Anası
            ctx.fillStyle = '#cc00ff';
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
        }
        
        // Can Barı
        if(e.type === 'boss') {
            ctx.fillStyle = 'red'; ctx.fillRect(-40, -60, 80, 8);
            ctx.fillStyle = '#0f0'; ctx.fillRect(-40, -60, 80 * (e.health/e.maxHealth), 8);
        }
        ctx.restore();
    });

    // Eşyalar
    items.forEach(item => {
        ctx.save(); ctx.translate(item.x, item.y);
        let s = 1 + Math.sin(Date.now()*0.005)*0.2;
        ctx.scale(s, s);
        ctx.fillStyle = '#00ff00';
        ctx.shadowBlur = 10; ctx.shadowColor = '#00ff00';
        ctx.fillRect(-12, -4, 24, 8); ctx.fillRect(-4, -12, 8, 24);
        ctx.restore();
    });

    // Mermiler
    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 10; ctx.shadowColor = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.type==='torp'?6:3, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Parçacıklar
    particles.forEach(p => {
        ctx.globalAlpha = p.life / 30;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        p.x += p.vx; p.y += p.vy; p.life--;
        if(p.life <= 0) particles.splice(particles.indexOf(p), 1);
        ctx.globalAlpha = 1;
    });

    ctx.restore();
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    if(player.angle === Math.PI) ctx.scale(-1, 1); // Sola dönünce aynala

    const color = SHIPS[selectedShip].color;
    ctx.shadowBlur = 15; ctx.shadowColor = color;
    ctx.fillStyle = color;
    
    // Gemi Gövdesi
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(-20, -12);
    ctx.lineTo(-15, 0);
    ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();
    
    // Kule
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-5, -15, 10, 8);

    ctx.shadowBlur = 0;
    ctx.restore();
}

// --- YARDIMCI FONKSİYONLAR ---
function getTerrainHeightAt(x) {
    // X koordinatına denk gelen zemin yüksekliğini bul (Lineer İnterpolasyon)
    // terrainPoints dizisi 50px aralıklarla dolu
    if(terrainPoints.length === 0) return WORLD_HEIGHT;
    
    // X sınırları
    if(x < 0) x = 0;
    if(x > WORLD_WIDTH) x = WORLD_WIDTH;

    // Hangi iki nokta arasında?
    let index = Math.floor(x / 50);
    if(index >= terrainPoints.length - 1) return terrainPoints[terrainPoints.length-1].y;

    let p1 = terrainPoints[index];
    let p2 = terrainPoints[index+1];
    
    // Aradaki oran (0.0 ile 1.0 arası)
    let ratio = (x - p1.x) / 50;
    
    // Yüksekliği hesapla
    return p1.y + (p2.y - p1.y) * ratio;
}

function fireBullet() {
    bullets.push({
        x: player.x, y: player.y, 
        vx: (player.angle===Math.PI ? -12 : 12), vy: 0, 
        life: 80, dmg: 10, color: '#ffff00'
    });
}

function fireTorpedo() {
    if(player.torpCd > 0) return;
    bullets.push({
        x: player.x, y: player.y,
        vx: (player.angle===Math.PI ? -6 : 6), vy: 0,
        life: 300, dmg: 50, color: '#00ffff', type: 'torp'
    });
    player.torpCd = 300;
}

function spawnEnemy() {
    let type = Math.random() > 0.8 ? 'jelly' : 'sub';
    enemies.push({
        x: Math.random()*WORLD_WIDTH, 
        y: Math.random()*(WORLD_HEIGHT-400)+300,
        type: type, health: 40, maxHealth: 40, size: 30, speed: 2, face: -1
    });
}

function spawnItem(x, y) {
    items.push({
        x: x || Math.random()*WORLD_WIDTH,
        y: y || Math.random()*(WORLD_HEIGHT-300)+200,
        type: 'hp'
    });
}

function createExplosion(x, y, color, count) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10,
            life: 20+Math.random()*10, color: color, size: Math.random()*4
        });
    }
}

// GİRİŞ DİNLEYİCİLERİ (DÜZELTİLMİŞ)
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);
window.addEventListener('mousedown', e => {
    if(!gameActive) return;
    // UI üzerine tıklamayı engellemek için CSS'de pointer-events ayarlı
    if(e.button === 0) fireBullet();
    if(e.button === 2) fireTorpedo();
});
window.addEventListener('contextmenu', e => e.preventDefault());

// Menü İşlemleri
function selectShip(type) {
    selectedShip = type;
    document.querySelectorAll('.ship-card').forEach(el => el.classList.remove('selected'));
    // Bu basit bir seçim mantığı, tıklanan elemente selected sınıfı ekler
    // (HTML'deki onclick ile çağrılır)
    // Not: event.currentTarget HTML onclick içinde direkt çalışmayabilir, CSS ile idare ediyoruz
    // Görsel geri bildirim için JS ile tekrar seçelim:
    if(type==='balanced') document.querySelectorAll('.ship-card')[0].classList.add('selected');
    if(type==='scout') document.querySelectorAll('.ship-card')[1].classList.add('selected');
    if(type==='heavy') document.querySelectorAll('.ship-card')[2].classList.add('selected');
}

document.getElementById('startBtn').addEventListener('click', () => {
    const nick = document.getElementById('nickInput').value;
    if(nick.trim() === "") { alert("İSİM GEREKLİ!"); return; }
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    initGame();
});

document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('deathScreen').classList.add('hidden');
    document.getElementById('menuScreen').classList.remove('hidden');
});

function gameOver() {
    gameActive = false;
    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('deathScreen').classList.remove('hidden');
    document.getElementById('finalScore').innerText = score;
}

// Animasyon Döngüsü
function loop() {
    if(gameActive) {
        update();
        draw();
        requestAnimationFrame(loop);
    }
}