const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- AYARLAR ---
const WORLD_WIDTH = 3000; // Harita genişliği (Ekrandan büyük)
const WORLD_HEIGHT = 1500; // Harita derinliği
const SURFACE_Y = 0; // Su yüzeyi koordinatı (Dünya koordinatlarında 0)

// --- OYUN DURUMU ---
let gameRunning = false;
let score = 0;
let camera = { x: 0, y: 0 };

// --- NESNELER ---
const player = {
    x: 100, y: 100, // Dünya koordinatları
    w: 60, h: 25,
    vx: 0, vy: 0,
    speed: 5,
    angle: 0,
    health: 100,
    oxygen: 100,
    torpCd: 0,
    nick: "Kaptan"
};

let bullets = [];
let enemies = [];
let particles = [];
let clouds = [];
let seaFloorPoints = []; // Deniz tabanı şekli için

// Inputlar
const keys = {};
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };

// --- BAŞLANGIÇ OLUŞTURMA ---
function initWorld() {
    // 1. Deniz Tabanı Oluştur (Girintili çıkıntılı)
    seaFloorPoints = [];
    for(let i=0; i<=WORLD_WIDTH; i+=100) {
        // Perlin noise benzeri rastgelelik
        let depth = WORLD_HEIGHT - 200 - Math.random() * 300;
        seaFloorPoints.push({x: i, y: depth});
    }
    // Tabanı sağ alt köşeye kapat
    seaFloorPoints.push({x: WORLD_WIDTH, y: WORLD_HEIGHT});
    seaFloorPoints.push({x: 0, y: WORLD_HEIGHT});

    // 2. Bulutlar
    clouds = [];
    for(let i=0; i<10; i++) {
        clouds.push({
            x: Math.random() * WORLD_WIDTH,
            y: -200 - Math.random() * 300, // Gökyüzünde
            w: 100 + Math.random() * 100,
            speed: 0.5 + Math.random()
        });
    }

    // 3. Değişkenleri Sıfırla
    player.x = 200; player.y = 200;
    player.health = 100; player.oxygen = 100;
    score = 0;
    enemies = [];
    bullets = [];
    
    // İlk düşmanlar
    spawnEnemy(); spawnEnemy(); spawnEnemy();
}

// --- FİZİK VE MANTIK ---
function update() {
    if(!gameRunning) return;

    // 1. OYUNCU HAREKETİ
    if(keys['w'] || keys['ArrowUp']) player.vy = -player.speed;
    else if(keys['s'] || keys['ArrowDown']) player.vy = player.speed;
    else player.vy *= 0.95;

    if(keys['a'] || keys['ArrowLeft']) player.vx = -player.speed;
    else if(keys['d'] || keys['ArrowRight']) player.vx = player.speed;
    else player.vx *= 0.95;

    player.x += player.vx;
    player.y += player.vy;

    // 2. SINIRLAR VE YÜZEY MANTIĞI
    // Sol-Sağ sınırlar
    if(player.x < 50) player.x = 50;
    if(player.x > WORLD_WIDTH - 50) player.x = WORLD_WIDTH - 50;

    // Yüzey Sınırı (Yarısı çıkacak şekilde)
    // Su yüzeyi Y=0. Player yüksekliği 25.
    // Eğer Y < 0 ise suyun üstündeyiz.
    // Tamamen uçmasın diye sınır koyalım: -10 (yarısı dışarıda)
    if(player.y < -10) player.y = -10;
    
    // Dip Sınırı (Basitçe en alt)
    if(player.y > WORLD_HEIGHT - 50) player.y = WORLD_HEIGHT - 50;

    // 3. AÇI HESABI (Mouse'a değil harekete dönsün - daha sinematik)
    if(Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) {
        let targetAngle = Math.atan2(player.vy, player.vx);
        player.angle += (targetAngle - player.angle) * 0.1; // Yumuşak dönüş
    }

    // 4. OKSİJEN SİSTEMİ
    if(player.y <= 0) {
        // Yüzeydeyiz
        player.oxygen = Math.min(100, player.oxygen + 0.8);
    } else {
        // Sudayız
        player.oxygen -= 0.05;
        if(player.oxygen <= 0) player.health -= 0.1;
    }

    // 5. KAMERA TAKİBİ
    // Kamera oyuncuyu ortalar
    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;

    // Kamera dünya sınırlarından çıkmasın (Opsiyonel, şimdilik serbest bırakıyorum ki gökyüzünü gör)
    // Ancak gökyüzü çok yukarı gitmesin
    if(camera.y < -400) camera.y = -400; 
    if(camera.y > WORLD_HEIGHT - canvas.height) camera.y = WORLD_HEIGHT - canvas.height;
    if(camera.x < 0) camera.x = 0;
    if(camera.x > WORLD_WIDTH - canvas.width) camera.x = WORLD_WIDTH - canvas.width;

    // 6. BULUTLAR (Paralaks efekti)
    clouds.forEach(c => {
        c.x += c.speed;
        if(c.x > WORLD_WIDTH) c.x = -200;
    });

    // 7. MERMİLER
    for(let i=bullets.length-1; i>=0; i--) {
        let b = bullets[i];
        b.x += b.vx; b.y += b.vy; b.life--;
        // Suya çarpma efekti (mermi sudan havaya çıkarsa veya tersi)
        if(b.life <= 0) bullets.splice(i, 1);
    }
    
    // Cooldown
    if(player.torpCd > 0) player.torpCd--;

    // 8. DÜŞMANLAR (Basit takip)
    enemies.forEach((e, i) => {
        // Oyuncuya yaklaş
        let dx = player.x - e.x;
        let dy = player.y - e.y;
        let dist = Math.hypot(dx, dy);
        
        if(dist > 500) { // Çok uzaktaysa bekleme
            // idle
        } else {
            e.x += (dx/dist) * e.speed;
            e.y += (dy/dist) * e.speed;
        }

        // Çarpışma: Mermi vs Düşman
        for(let j=bullets.length-1; j>=0; j--) {
            let b = bullets[j];
            // Hitbox
            if(Math.abs(b.x - e.x) < 30 && Math.abs(b.y - e.y) < 20) {
                e.health -= b.dmg;
                createParticles(e.x, e.y, 'orange', 5);
                bullets.splice(j, 1);
                if(e.health <= 0) {
                    enemies.splice(i, 1);
                    createParticles(e.x, e.y, 'red', 20);
                    score += 100;
                    spawnEnemy(); // Yerine yenisi gelsin
                    // Zorlaşarak gelsin
                    if(Math.random() < 0.3) spawnEnemy();
                }
                break;
            }
        }

        // Çarpışma: Oyuncu vs Düşman
        if(dist < 40) {
            player.health -= 0.5;
        }
    });

    // Ölüm
    if(player.health <= 0) gameOver();
    
    updateHUD();
}

// --- ÇİZİM ---
function draw() {
    // 1. Ekranı temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // KAMERA HAREKETİ (Bütün dünyayı kaydırıyoruz)
    ctx.translate(-camera.x, -camera.y);

    // 2. GÖKYÜZÜ ÇİZİMİ (Arka plan)
    // Sadece suyun üstü (Y < 0) için gökyüzü gradyanı
    let skyGrad = ctx.createLinearGradient(0, -1000, 0, 0);
    skyGrad.addColorStop(0, '#87CEEB'); // Açık mavi
    skyGrad.addColorStop(1, '#E0F7FA'); // Beyazımsı
    ctx.fillStyle = skyGrad;
    ctx.fillRect(camera.x, -1000, canvas.width, 1000); // Sadece kameranın gördüğü yeri boya

    // Güneş
    ctx.fillStyle = 'yellow';
    ctx.beginPath(); ctx.arc(200, -300, 60, 0, Math.PI*2); ctx.fill();

    // Bulutlar
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    clouds.forEach(c => {
        ctx.beginPath(); 
        ctx.ellipse(c.x, c.y, c.w, 40, 0, 0, Math.PI*2); 
        ctx.fill();
    });

    // 3. DENİZ (SU) ÇİZİMİ
    let seaGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    seaGrad.addColorStop(0, 'rgba(0, 30, 60, 0.4)'); // Yüzey şeffaf
    seaGrad.addColorStop(0.3, '#001e36');
    seaGrad.addColorStop(1, '#000000'); // Dip karanlık
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Su Yüzeyi Çizgisi
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(WORLD_WIDTH, 0); ctx.stroke();

    // 4. DENİZ TABANI (Şekilli Zemin)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    if(seaFloorPoints.length > 0) {
        ctx.moveTo(seaFloorPoints[0].x, seaFloorPoints[0].y);
        for(let i=1; i<seaFloorPoints.length; i++) {
            ctx.lineTo(seaFloorPoints[i].x, seaFloorPoints[i].y);
        }
    }
    ctx.fill();

    // 5. OYUNCU ÇİZİMİ
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    
    // Gövde
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI*2); ctx.fill();
    // Kule
    ctx.fillStyle = 'orange';
    ctx.fillRect(-5, -20, 15, 15);
    // Pervane
    if(gameRunning) ctx.fillStyle = (Date.now()%200<100)?'#aaa':'#555';
    ctx.fillRect(-35, -5, 5, 10);
    
    ctx.restore();

    // 6. DÜŞMANLAR
    enemies.forEach(e => {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI*2); ctx.fill();
        // Göz
        ctx.fillStyle = 'black'; ctx.fillRect(-10, -5, 5, 5);
        ctx.restore();
    });

    // 7. MERMİLER
    bullets.forEach(b => {
        ctx.fillStyle = b.type==='torpedo' ? 'white' : 'yellow';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.type==='torpedo'?5:3, 0, Math.PI*2); ctx.fill();
    });

    // 8. EFEKTLER
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 20;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.random()*5, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.restore(); // Kamera translate iptal (HUD sabit kalsın)
}

// --- LOOP ---
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- YARDIMCI ---
function spawnEnemy() {
    enemies.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * (WORLD_HEIGHT-200) + 100,
        speed: 2 + Math.random(),
        health: 30
    });
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random()-0.5)*10,
            vy: (Math.random()-0.5)*10,
            life: 20 + Math.random()*10,
            color: color
        });
    }
}

// --- KONTROLLER ---
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

window.addEventListener('mousedown', e => {
    if(!gameRunning) return;
    // Mouse'un dünya koordinatlarını bul (Kamera farkını ekle)
    let worldMouseX = e.clientX + camera.x;
    let worldMouseY = e.clientY + camera.y;
    let angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);

    if(e.button === 0) { // Sol tık mermi
        bullets.push({x: player.x, y: player.y, vx: Math.cos(angle)*15, vy: Math.sin(angle)*15, life: 100, dmg: 10, type:'bullet'});
    }
    if(e.button === 2 && player.torpCd <= 0) { // Sağ tık torpido
        bullets.push({x: player.x, y: player.y, vx: Math.cos(angle)*8, vy: Math.sin(angle)*8, life: 300, dmg: 50, type:'torpedo'});
        player.torpCd = 300; // 5 sn (60fps)
    }
});
window.addEventListener('contextmenu', e => e.preventDefault());

// UI GÜNCELLEME
function updateHUD() {
    document.getElementById('hpBar').style.width = player.health + "%";
    document.getElementById('oxBar').style.width = player.oxygen + "%";
    document.getElementById('scoreVal').innerText = score;
    
    let tStatus = document.getElementById('torpStatus');
    if(player.torpCd > 0) {
        tStatus.innerText = "YÜKLENİYOR...";
        tStatus.style.color = "red";
    } else {
        tStatus.innerText = "TORPİDO HAZIR";
        tStatus.style.color = "lime";
    }
}

// BAŞLATMA
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

document.getElementById('startBtn').addEventListener('click', () => {
    player.nick = document.getElementById('nickInput').value;
    // Küfür filtresi (Basit)
    if(player.nick.toLowerCase().includes('sik') || player.nick.toLowerCase().includes('amk')) {
        alert("Terbiyeli isim koy!");
        return;
    }
    document.getElementById('menuScreen').classList.add('hidden');
    initWorld();
    gameRunning = true;
    loop();
});

document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('deathScreen').classList.add('hidden');
    initWorld();
    gameRunning = true;
});

function gameOver() {
    gameRunning = false;
    document.getElementById('deathScreen').classList.remove('hidden');
}