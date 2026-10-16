const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('gameScore');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authTitle = document.getElementById('authTitle');
const authDescription = document.getElementById('authDescription');
const authMessage = document.getElementById('authMessage');
const accountControls = document.getElementById('accountControls');
const accountName = document.getElementById('accountName');
const logoutButton = document.getElementById('logoutButton');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const keys = {};
const bullets = [];
const comets = [];
const blackHoles = [];
const enemyShips = [];
const enemyBullets = [];
const enemyDamageMultiplier = 0.5;
const maxEnemyHitDamage = 2;
const particles = [];
const shockwaves = [];
const stars = [];
const bonusStars = [];
const blueStars = [];

const ship = {
    x: canvas.width / 2,
    y: canvas.height - 38,
    radius: 18,
    speed: 300,
    cooldown: 0,
    invulnerable: 0,
    lives: 3,
    maxLives: 3,
    absorptionHearts: 0,
    energy: 180,
    maxEnergy: 180,
    energyRegen: 18,
    phantomDashUnlocked: false,
    phantomDashTimer: 0,
    phantomDashCooldown: 0,
    phantomDashDirection: { x: 0, y: 0 },
    fireRateMultiplier: 1,
    damageMultiplier: 1,
    multishotLevel: 0,
    explosiveShot: false,
    selfDestructUnlocked: false,
    selfDestructCharging: false,
    selfDestructCharge: 0,
    selfDestructMustRelease: false,
    chargedBeam: false,
    beamCharging: false,
    beamCharge: 0,
    beamHoldTime: 0,
    beamMustRelease: false,
    starMagnet: false,
    locked: false,
    powerShotTimer: 0,
    nextShotFast: false,
    blueStarTimer: 0,
    lifeRegenTimer: 30,
    frozenTimer: 0,
    fireTimer: 0,
    burnTickTimer: 0
};

let score = 0;
let level = 1;
let comboCount = 0;
let comboTimer = 0;
let comboBonusScore = 0;
let lastTime = 0;
let spawnTimer = 0;
let smallShipSpawnTimer = 0;
let blueStarSpawnTimer = 0;
let gameOver = false;
let hasStarted = false;
let bossSpawned = false;
let levelCleared = false;
let levelRewardCoins = 0;
let levelRewardSaveFailed = false;
let menuScreen = 'home';
let skillTreeMessage = '';
let completedLevelPendingNext = null;
let levelClearCooldown = 0;
let gameOverFromDeath = false;
let screenShake = { intensity: 0, timer: 0, duration: 0 };
let hitstopTimer = 0;

function addScreenShake(intensity = 5, duration = 0.2) {
    // Keep the strongest recent shake so light hits don't override heavy ones.
    if (screenShake.timer > 0 && intensity < screenShake.intensity) return;
    screenShake.intensity = intensity;
    screenShake.duration = duration;
    screenShake.timer = duration;
}

function addHitstop(duration = 0.05) {
    hitstopTimer = Math.max(hitstopTimer, duration);
}

function updateScreenEffects(dt) {
    if (screenShake.timer > 0) {
        screenShake.timer = Math.max(0, screenShake.timer - dt);
        if (screenShake.timer === 0) screenShake.intensity = 0;
    }
    hitstopTimer = Math.max(0, hitstopTimer - dt);
}

function getScreenShakeOffset() {
    if (screenShake.timer <= 0) return { x: 0, y: 0 };
    const falloff = screenShake.timer / screenShake.duration;
    const magnitude = screenShake.intensity * falloff;
    return {
        x: (Math.random() * 2 - 1) * magnitude,
        y: (Math.random() * 2 - 1) * magnitude
    };
}

const audio = {
    ctx: null,
    enabled: true,
    musicGain: null,
    musicElement: null,
    musicStarted: false,
    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            this.enabled = false;
            return;
        }
        this.ctx = new AudioContextClass();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.18;
        this.musicGain.connect(this.ctx.destination);

        this.musicElement = document.getElementById('bgMusic') || document.createElement('audio');
        this.musicElement.src = this.musicElement.id === 'bgMusic' ? this.musicElement.getAttribute('src') : './mondamusic-retro-arcade-game-music-512837.mp3';
        this.musicElement.loop = true;
        this.musicElement.volume = 0.5;
        this.musicElement.preload = 'auto';
        this.musicElement.setAttribute('playsinline', 'true');
    },
    ensure() {
        if (!this.enabled) return;
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    startMusic() {
        if (!this.enabled) return;
        this.ensure();
        if (!this.musicElement) {
            this.init();
        }
        if (this.musicElement && !this.musicStarted) {
            this.musicElement.load();
            this.musicElement.play().catch(() => {});
            this.musicStarted = true;
        }
    },
    playTone(frequency, duration, type = 'square', volume = 0.08, sweep = 0) {
        if (!this.enabled || !this.ctx) return;
        this.ensure();

        const oscillator = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        if (sweep !== 0) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + sweep), this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(volume, this.ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        oscillator.connect(gain);
        gain.connect(this.ctx.destination);
        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
    },
    playShoot() {
        this.playTone(520, 0.08, 'square', 0.05, 60);
    },
    playHit() {
        this.playTone(170, 0.12, 'sawtooth', 0.05, -30);
    },
    playPickup() {
        this.playTone(760, 0.10, 'triangle', 0.08, 80);
    },
    playLevelClear() {
        this.playTone(440, 0.12, 'triangle', 0.08, 100);
        setTimeout(() => this.playTone(660, 0.16, 'triangle', 0.08, 120), 90);
    },
    playExplosion() {
        this.playTone(120, 0.20, 'sawtooth', 0.06, -80);
    }
};

const levelMapNodes = [
    { level: 1, x: 75, y: 165, name: 'EARTH', risk: 'RISK: LOW', type: 'earth' },
    { level: 2, x: 215, y: 165, name: 'MARS', risk: 'RISK: HIGH', type: 'mars' },
    { level: 3, x: 355, y: 165, name: 'MERCURY', risk: 'RISK: SEVERE', type: 'mercury' },
    { level: 4, x: 495, y: 165, name: 'VENUS', risk: 'RISK: EXTREME', type: 'venus' },
    { level: 5, x: 635, y: 165, name: 'JUPITER', risk: 'RISK: FATAL', type: 'jupiter' },
    { level: 6, x: 635, y: 300, name: 'SATURN', risk: 'RISK: COSMIC', type: 'saturn' },
    { level: 7, x: 495, y: 300, name: 'URANUS', risk: 'RISK: UNKNOWN', type: 'uranus' },
    { level: 8, x: 355, y: 300, name: 'NEPTUNE', risk: 'RISK: VOID', type: 'neptune' },
    { level: 9, x: 215, y: 300, name: 'PLUTO', risk: 'RISK: OMEGA', type: 'pluto' },
    { level: 10, x: 75, y: 300, name: 'KEPLER', risk: 'RISK: EXTINCTION', type: 'kepler' },
    { level: 11, name: 'IO', risk: 'RISK: VOLCANIC', type: 'io', enemyType: 'io-pyro' },
    { level: 12, name: 'EUROPA', risk: 'RISK: FROZEN', type: 'europa', enemyType: 'europa-cryo' },
    { level: 13, name: 'TITAN', risk: 'RISK: TOXIC', type: 'titan', enemyType: 'titan-hunter' },
    { level: 14, name: 'TRITON', risk: 'RISK: PHANTOM', type: 'triton', enemyType: 'triton-phantom' },
    { level: 15, name: 'CERES', risk: 'RISK: COLLISION', type: 'ceres', enemyType: 'ceres-bomber' },
    { level: 16, name: 'ERIS', risk: 'RISK: ASSASSIN', type: 'eris', enemyType: 'eris-stalker' },
    { level: 17, name: 'MAKEMAKE', risk: 'RISK: PRISMATIC', type: 'makemake', enemyType: 'makemake-prism' },
    { level: 18, name: 'HAUMEA', risk: 'RISK: SPINNING', type: 'haumea', enemyType: 'haumea-spinner' },
    { level: 19, name: 'GANYMEDE', risk: 'RISK: ARMORED', type: 'ganymede', enemyType: 'ganymede-guardian' },
    { level: 20, name: 'CALLISTO', risk: 'RISK: CATACLYSM', type: 'callisto', enemyType: 'callisto-sentinel' }
];
const levelsPerPage = 5;
let levelSelectionPage = 0;
const planetBossProfiles = [
    { planet: 'EARTH', name: 'Gaia Colossus', color: '#4ade80', description: 'Balanced aimed shots', appearance: 'flora', volley: [0], cooldown: 1.25 },
    { planet: 'MARS', name: 'Redstorm Marauder', color: '#fb7c55', description: 'Twin flanking shots', appearance: 'flame', volley: [-0.2, 0.2], cooldown: 1.2 },
    { planet: 'MERCURY', name: 'Solar Lancer', color: '#e2e8f0', description: 'Rapid high-speed shots', appearance: 'solar', volley: [0], cooldown: 0.72, bulletSpeed: 1.3 },
    { planet: 'VENUS', name: 'Ashen Witch', color: '#f97316', description: 'Burning shots', appearance: 'flame', volley: [0], cooldown: 1.35, status: 'fire' },
    { planet: 'JUPITER', name: 'Storm Monarch', color: '#fcd34d', description: 'Wide five-shot storm', appearance: 'storm', volley: [-0.48, -0.24, 0, 0.24, 0.48], cooldown: 1.6 },
    { planet: 'SATURN', name: 'Ringbreaker', color: '#fbbf24', description: 'Three-shot ring volley', appearance: 'rings', volley: [-0.34, 0, 0.34], cooldown: 1.45 },
    { planet: 'URANUS', name: 'Frostbreaker', color: '#67e8f9', description: 'Alternating twin shots', appearance: 'ice', volley: [-0.22, 0.22], cooldown: 0.95, bulletSpeed: 1.15 },
    { planet: 'NEPTUNE', name: 'Abyssal Warden', color: '#3b82f6', description: 'Freezing aimed shots', appearance: 'abyss', volley: [0], cooldown: 1.35, status: 'freeze' },
    { planet: 'PLUTO', name: 'Dwarf King', color: '#d6b49a', description: 'Heavy slow shots', appearance: 'stone', volley: [0], cooldown: 1.8, bulletSpeed: 1.4 },
    { planet: 'KEPLER', name: 'Event Horizon', color: '#c4b5fd', description: 'Four-way crossfire', appearance: 'void', volley: [-0.22, 0.22, Math.PI - 0.22, Math.PI + 0.22], cooldown: 1.55 },
    { planet: 'IO', name: 'Caldera Prime', color: '#f97316', description: 'Volcanic burning fan', appearance: 'magma', volley: [-0.3, 0, 0.3], cooldown: 1.45, status: 'fire' },
    { planet: 'EUROPA', name: 'Glacier Sovereign', color: '#93c5fd', description: 'Freezing three-shot volley', appearance: 'ice', volley: [-0.24, 0, 0.24], cooldown: 1.4, status: 'freeze' },
    { planet: 'TITAN', name: 'Smog Stalker', color: '#bef264', description: 'Fast aimed shots', appearance: 'toxic', volley: [0], cooldown: 0.82, bulletSpeed: 1.3 },
    { planet: 'TRITON', name: 'Phantom Admiral', color: '#38bdf8', description: 'Ghostly twin volleys', appearance: 'ghost', volley: [-0.18, 0.18], cooldown: 1.05, bulletSpeed: 1.15 },
    { planet: 'CERES', name: 'Asteroid Breaker', color: '#a8a29e', description: 'Heavy wide three-shot bursts', appearance: 'asteroid', volley: [-0.4, 0, 0.4], cooldown: 1.7, bulletSpeed: 1.25 },
    { planet: 'ERIS', name: 'Nightblade', color: '#c084fc', description: 'Rapid twin shots', appearance: 'shadow', volley: [-0.16, 0.16], cooldown: 0.78 },
    { planet: 'MAKEMAKE', name: 'Prism Sovereign', color: '#fb7185', description: 'Seven-shot prism fan', appearance: 'prism', volley: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6], cooldown: 1.7 },
    { planet: 'HAUMEA', name: 'The Spinner', color: '#e879f9', description: 'Rotating three-shot volley', appearance: 'spinner', volley: [-0.28, 0, 0.28], cooldown: 1.1 },
    { planet: 'GANYMEDE', name: 'Titanic Guardian', color: '#94a3b8', description: 'Armored five-shot barrage', appearance: 'armor', volley: [-0.44, -0.22, 0, 0.22, 0.44], cooldown: 1.65, bulletSpeed: 1.2 },
    { planet: 'CALLISTO', name: 'Last Sentinel', color: '#a78bfa', description: 'Cataclysmic seven-shot barrage', appearance: 'sentinel', volley: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6], cooldown: 1.35, bulletSpeed: 1.25 }
];
const enemyCodexEntries = [
    { id: 'scout', name: 'Scout', description: 'Basic enemy ship with aimed shots.' },
    { id: 'cold-scout', name: 'Cold Scout', description: 'Freezes the pilot on collision.' },
    { id: 'mars-raider', name: 'Mars Raider', description: 'Fast raider firing twin shots.' },
    { id: 'mercury-dart', name: 'Mercury Dart', description: 'Very fast ship with quick shots.' },
    { id: 'venus-scorcher', name: 'Venus Scorcher', description: 'Sets the pilot on fire on contact.' },
    { id: 'saturn-warden', name: 'Saturn Warden', description: 'Armored ship with a three-shot spread.' },
    { id: 'neptune-wraith', name: 'Neptune Wraith', description: 'Phases and dashes across the screen.' },
    { id: 'io-pyro', name: 'Io Pyro', description: 'Volcanic ship with burning attacks.' },
    { id: 'europa-cryo', name: 'Europa Cryo', description: 'Icy attacks can freeze the pilot.' },
    { id: 'titan-hunter', name: 'Titan Hunter', description: 'Locks on and lunges toward the pilot.' },
    { id: 'triton-phantom', name: 'Triton Phantom', description: 'Phases out before sudden dashes.' },
    { id: 'ceres-bomber', name: 'Ceres Bomber', description: 'Slow, durable ship with heavy volleys.' },
    { id: 'eris-stalker', name: 'Eris Stalker', description: 'Fast assassin with frequent dashes.' },
    { id: 'makemake-prism', name: 'Makemake Prism', description: 'Fires a wide five-shot fan.' },
    { id: 'haumea-spinner', name: 'Haumea Spinner', description: 'Moves erratically and fires paired shots.' },
    { id: 'ganymede-guardian', name: 'Ganymede Guardian', description: 'Heavily armored with a triple spread.' },
    { id: 'callisto-sentinel', name: 'Callisto Sentinel', description: 'Durable ship with a wide fan volley.' },
    ...planetBossProfiles.map((boss, index) => ({
        id: `boss-${levelMapNodes[index].type}`,
        name: boss.name,
        description: `${boss.planet} boss: ${boss.description}.`
    }))
];
const enemyTypeStats = {
    scout: { radius: 14, scale: 0.55, moveSpeed: 32.5, bulletSpeed: 240, shotCooldown: 2.6, health: 3, score: 20 },
    'cold-scout': { radius: 14, scale: 0.55, moveSpeed: 30, bulletSpeed: 220, shotCooldown: 2.8, health: 3.5, score: 30 },
    'mars-raider': { radius: 13, scale: 0.52, moveSpeed: 62, bulletSpeed: 225, shotCooldown: 2.2, health: 3.5, score: 30 },
    'venus-scorcher': { radius: 14, scale: 0.56, moveSpeed: 34, bulletSpeed: 230, shotCooldown: 2.6, health: 3.5, score: 34 },
    'mercury-dart': { radius: 12, scale: 0.48, moveSpeed: 88, bulletSpeed: 310, shotCooldown: 2.8, health: 2.5, score: 30 },
    'saturn-warden': { radius: 18, scale: 0.68, moveSpeed: 24, bulletSpeed: 205, shotCooldown: 3.1, health: 7, score: 45 },
    'neptune-wraith': { radius: 15, scale: 0.58, moveSpeed: 42, bulletSpeed: 220, shotCooldown: 2.7, health: 4, score: 40 },
    'io-pyro': { radius: 16, scale: 0.6, moveSpeed: 40, bulletSpeed: 245, shotCooldown: 2.3, health: 5, score: 52 },
    'europa-cryo': { radius: 16, scale: 0.6, moveSpeed: 35, bulletSpeed: 215, shotCooldown: 2.5, health: 5.5, score: 58 },
    'titan-hunter': { radius: 17, scale: 0.63, moveSpeed: 52, bulletSpeed: 280, shotCooldown: 2.1, health: 6, score: 64 },
    'triton-phantom': { radius: 16, scale: 0.6, moveSpeed: 50, bulletSpeed: 255, shotCooldown: 2.2, health: 6.5, score: 70 },
    'ceres-bomber': { radius: 18, scale: 0.66, moveSpeed: 30, bulletSpeed: 190, shotCooldown: 2.8, health: 8, score: 76 },
    'eris-stalker': { radius: 16, scale: 0.6, moveSpeed: 75, bulletSpeed: 285, shotCooldown: 1.9, health: 7, score: 82 },
    'makemake-prism': { radius: 17, scale: 0.64, moveSpeed: 48, bulletSpeed: 250, shotCooldown: 2.2, health: 8, score: 88 },
    'haumea-spinner': { radius: 18, scale: 0.66, moveSpeed: 45, bulletSpeed: 240, shotCooldown: 2.0, health: 9, score: 94 },
    'ganymede-guardian': { radius: 20, scale: 0.72, moveSpeed: 28, bulletSpeed: 230, shotCooldown: 2.3, health: 12, score: 105 },
    'callisto-sentinel': { radius: 20, scale: 0.72, moveSpeed: 40, bulletSpeed: 270, shotCooldown: 1.8, health: 13, score: 120 }
};
const codexEntriesPerPage = 6;
let codexPage = 0;
let codexSelectedEntryId = null;

// Accounts now live on the game server (see server.js) instead of browser storage.
// The old localStorage keys are kept only to migrate existing demo accounts.
const legacyAccountsStorageKey = 'spaceShooterAccounts';
const legacyProgressKey = 'spaceShooterHighestUnlockedLevel';
let highestUnlockedLevel = 1;
let currentAccount = null;
let spaceCoins = 0;
let isSigningIn = false;
const shipSkins = [
    {
        id: 'default',
        name: 'STARLING',
        description: 'CLASSIC BLUE HULL',
        cost: 0,
        shape: 'classic',
        colors: ['#ffffff', '#dbeafe', '#93c5fd', '#334155'],
        outline: '#f8fafc',
        canopy: ['#e0f2fe', '#38bdf8', '#075985'],
        exhaust: ['#f97316', '#facc15'],
        bulletColor: '#f8fafc',
        bulletCoreColor: '#ecfeff',
        bulletFillColor: 'rgba(34, 211, 238, 0.38)',
        beamColor: '#22d3ee',
        lifeColor: '#fbbf24',
        heartColor: '#60a5fa'
    },
    {
        id: 'crimson',
        name: 'CRIMSON FANG',
        description: 'SCARLET DART HULL',
        cost: 120,
        shape: 'dart',
        colors: ['#fee2e2', '#f87171', '#dc2626', '#450a0a'],
        outline: '#fecaca',
        canopy: ['#ffe4e6', '#fb7185', '#9f1239'],
        exhaust: ['#fb7185', '#fef08a'],
        bulletColor: '#fca5a5',
        bulletCoreColor: '#fee2e2',
        bulletFillColor: 'rgba(248, 113, 113, 0.38)',
        beamColor: '#f87171',
        lifeColor: '#f87171',
        heartColor: '#fb7185'
    },
    {
        id: 'emerald',
        name: 'EMERALD WING',
        description: 'WIDE VERDANT HULL',
        cost: 180,
        shape: 'wing',
        colors: ['#dcfce7', '#4ade80', '#16a34a', '#052e16'],
        outline: '#bbf7d0',
        canopy: ['#ecfdf5', '#34d399', '#065f46'],
        exhaust: ['#4ade80', '#d9f99d'],
        bulletColor: '#86efac',
        bulletCoreColor: '#ecfdf5',
        bulletFillColor: 'rgba(74, 222, 128, 0.38)',
        beamColor: '#4ade80',
        lifeColor: '#4ade80',
        heartColor: '#34d399'
    },
    {
        id: 'phantom',
        name: 'PHANTOM',
        description: 'VIOLET GHOST HULL',
        cost: 240,
        shape: 'phantom',
        colors: ['#f3e8ff', '#c084fc', '#9333ea', '#3b0764'],
        outline: '#e9d5ff',
        canopy: ['#faf5ff', '#a78bfa', '#5b21b6'],
        exhaust: ['#c084fc', '#e9d5ff'],
        bulletColor: '#d8b4fe',
        bulletCoreColor: '#f3e8ff',
        bulletFillColor: 'rgba(192, 132, 252, 0.38)',
        beamColor: '#c084fc',
        lifeColor: '#c084fc',
        heartColor: '#a78bfa'
    },
    {
        id: 'solar',
        name: 'SOLAR FLARE',
        description: 'GOLDEN HEAVY HULL',
        cost: 300,
        shape: 'heavy',
        colors: ['#fef3c7', '#fbbf24', '#d97706', '#451a03'],
        outline: '#fde68a',
        canopy: ['#fffbeb', '#f59e0b', '#92400e'],
        exhaust: ['#f59e0b', '#fef08a'],
        bulletColor: '#fde68a',
        bulletCoreColor: '#fffbeb',
        bulletFillColor: 'rgba(251, 191, 36, 0.38)',
        beamColor: '#fbbf24',
        lifeColor: '#fbbf24',
        heartColor: '#f59e0b'
    },
    {
        id: 'tide',
        name: 'DEEP TIDE',
        description: 'CYAN CRYSTAL HULL',
        cost: 360,
        shape: 'crystal',
        colors: ['#cffafe', '#22d3ee', '#0891b2', '#083344'],
        outline: '#a5f3fc',
        canopy: ['#ecfeff', '#67e8f9', '#155e75'],
        exhaust: ['#22d3ee', '#e0f2fe'],
        bulletColor: '#67e8f9',
        bulletCoreColor: '#ecfeff',
        bulletFillColor: 'rgba(34, 211, 238, 0.38)',
        beamColor: '#22d3ee',
        lifeColor: '#22d3ee',
        heartColor: '#38bdf8'
    }
];

function getActiveSkin() {
    return shipSkins.find(entry => entry.id === activeShipSkin) || shipSkins[0];
}
let ownedShipSkins = ['default'];
let activeShipSkin = 'default';
let skinShopMessage = '';
let questMessage = '';
let activeQuests = [];
const questTypes = [
    { id: 'defeat-enemies', label: 'DEFEAT ENEMIES', action: 'enemies defeated', targets: [6, 8, 10, 12, 15], reward: 35 },
    { id: 'collect-stars', label: 'COLLECT STARS', action: 'stars collected', targets: [2, 3, 4, 5], reward: 45 },
    { id: 'clear-levels', label: 'CLEAR LEVELS', action: 'levels cleared', targets: [1, 2], reward: 80 },
    { id: 'defeat-bosses', label: 'DEFEAT BOSSES', action: 'bosses defeated', targets: [1, 2], reward: 110 },
    { id: 'destroy-comets', label: 'DESTROY COMETS', action: 'comets destroyed', targets: [5, 8, 12], reward: 50 },
    { id: 'destroy-black-holes', label: 'DESTROY BLACK HOLES', action: 'black holes destroyed', targets: [1, 2, 3], reward: 75 }
];

const skillDefinitions = [
    { id: 'extraLives', name: 'Extra Hull', description: '+1 starting absorption heart', cost: 100, maxLevel: 10, maxLabel: 'MAX HULL' },
    { id: 'maxEnergy', name: 'Energy Core', description: '+30 starting energy', cost: 75, maxLevel: 10, maxLabel: 'MAX ENERGY' },
    { id: 'fireRate', name: 'Rapid Fire', description: '+10% fire rate', cost: 100, maxLevel: 10, maxLabel: 'MAX FIRE RATE' },
    { id: 'damage', name: 'Heavy Rounds', description: '+25% shot damage', cost: 125, maxLevel: 10, maxLabel: 'MAX DAMAGE' },
    { id: 'beam', name: 'Charged Beam', description: 'Unlock beam ability', cost: 300, maxLevel: 1 },
    { id: 'selfDestruct', name: 'Self Destruct', description: 'Unlock self destruct', cost: 350, maxLevel: 1 },
    { id: 'beamChargeRate', name: 'Beam Charge', description: 'Charge beam faster', cost: 150, maxLevel: 5 },
    { id: 'beamEnergyCost', name: 'Beam Efficiency', description: 'Beam costs less energy', cost: 150, maxLevel: 5 },
    { id: 'selfDestructCharge', name: 'Safe Detonation', description: 'Faster charge, less life drain', cost: 150, maxLevel: 5 },
    { id: 'thrusters', name: 'Thrusters', description: 'Rank 1 adds twin rear engines; +10% movement speed per rank', cost: 125, maxLevel: 3, maxLabel: 'MAX SPEED' },
    { id: 'phantomDash', name: 'Phantom Dash', description: 'Hold Q + a direction to dash through attacks; costs 36 energy', cost: 350, maxLevel: 1 },
    { id: 'reactorOverdrive', name: 'Reactor Overdrive', description: '+20% energy regeneration', cost: 125, maxLevel: 3, maxLabel: 'MAX RECHARGE' },
    { id: 'multishot', name: 'Multishot', description: '3-way spread, 5-way upgrade, and reduced volley energy cost', cost: 175, maxLevel: 3, maxLabel: 'MAX VOLLEY' },
    { id: 'shieldMatrix', name: 'Shield Matrix', description: 'Reduce damage taken by 10% per rank', cost: 180, maxLevel: 3, maxLabel: 'MAX SHIELDS' },
    { id: 'starMagnetism', name: 'Star Magnetism', description: 'Collect bonus stars from farther away', cost: 150, maxLevel: 3, maxLabel: 'MAX MAGNET' },
    { id: 'comboDrive', name: 'Combo Drive', description: '+0.6 seconds to your combo timer per rank', cost: 160, maxLevel: 3, maxLabel: 'MAX COMBO' },
    { id: 'coinScavenger', name: 'Coin Scavenger', description: '+15% level completion coins per rank', cost: 200, maxLevel: 3, maxLabel: 'MAX SALVAGE' }
];

const starterSkillIds = ['extraLives', 'maxEnergy', 'fireRate', 'damage'];
const skillTreeNodeRects = [];
const skillNodes = [
    { id: 'hull-1', skillId: 'extraLives', rank: 1, x: 100, y: 130, parents: [] },
    { id: 'energy-1', skillId: 'maxEnergy', rank: 1, x: 280, y: 130, parents: [] },
    { id: 'rapid-1', skillId: 'fireRate', rank: 1, x: 460, y: 130, parents: [] },
    { id: 'damage-1', skillId: 'damage', rank: 1, x: 640, y: 130, parents: [] },
    { id: 'hull-2', skillId: 'extraLives', rank: 2, x: 100, y: 300, parents: ['hull-1'] },
    { id: 'energy-2', skillId: 'maxEnergy', rank: 2, x: 280, y: 300, parents: ['energy-1'] },
    { id: 'rapid-2', skillId: 'fireRate', rank: 2, x: 460, y: 300, parents: ['rapid-1'] },
    { id: 'damage-2', skillId: 'damage', rank: 2, x: 640, y: 300, parents: ['damage-1'] },
    { id: 'hull-3', skillId: 'extraLives', rank: 3, x: 70, y: 470, parents: ['hull-2'] },
    { id: 'hull-4', skillId: 'extraLives', rank: 4, x: 130, y: 620, parents: ['hull-2'] },
    { id: 'energy-3', skillId: 'maxEnergy', rank: 3, x: 250, y: 470, parents: ['energy-2'] },
    { id: 'energy-4', skillId: 'maxEnergy', rank: 4, x: 310, y: 620, parents: ['energy-2'] },
    { id: 'rapid-3', skillId: 'fireRate', rank: 3, x: 430, y: 470, parents: ['rapid-2'] },
    { id: 'rapid-4', skillId: 'fireRate', rank: 4, x: 490, y: 620, parents: ['rapid-2'] },
    { id: 'damage-3', skillId: 'damage', rank: 3, x: 610, y: 470, parents: ['damage-2'] },
    { id: 'damage-4', skillId: 'damage', rank: 4, x: 670, y: 620, parents: ['damage-2'] },
    { id: 'beam', skillId: 'beam', rank: 1, x: 610, y: 790, parents: ['hull-1', 'energy-1', 'rapid-1', 'damage-1'] },
    { id: 'self-destruct', skillId: 'selfDestruct', rank: 1, x: 1150, y: 790, parents: ['hull-1', 'energy-1', 'rapid-1', 'damage-1'] },
    { id: 'beam-charge-1', skillId: 'beamChargeRate', rank: 1, x: 610, y: 960, parents: ['beam'] },
    { id: 'beam-charge-2', skillId: 'beamChargeRate', rank: 2, x: 610, y: 1120, parents: ['beam-charge-1'] },
    { id: 'beam-charge-3', skillId: 'beamChargeRate', rank: 3, x: 610, y: 1280, parents: ['beam-charge-2'] },
    { id: 'beam-efficiency-1', skillId: 'beamEnergyCost', rank: 1, x: 790, y: 960, parents: ['beam'] },
    { id: 'beam-efficiency-2', skillId: 'beamEnergyCost', rank: 2, x: 790, y: 1120, parents: ['beam-efficiency-1'] },
    { id: 'beam-efficiency-3', skillId: 'beamEnergyCost', rank: 3, x: 790, y: 1280, parents: ['beam-efficiency-2'] },
    { id: 'self-destruct-charge-1', skillId: 'selfDestructCharge', rank: 1, x: 1150, y: 960, parents: ['self-destruct'] },
    { id: 'self-destruct-charge-2', skillId: 'selfDestructCharge', rank: 2, x: 1150, y: 1120, parents: ['self-destruct-charge-1'] },
    { id: 'self-destruct-charge-3', skillId: 'selfDestructCharge', rank: 3, x: 1150, y: 1280, parents: ['self-destruct-charge-2'] },
    { id: 'thrusters-1', skillId: 'thrusters', rank: 1, x: 70, y: 790, parents: ['hull-2'] },
    { id: 'thrusters-2', skillId: 'thrusters', rank: 2, x: 70, y: 960, parents: ['thrusters-1'] },
    { id: 'thrusters-3', skillId: 'thrusters', rank: 3, x: 70, y: 1120, parents: ['thrusters-2'] },
    { id: 'phantom-dash', skillId: 'phantomDash', rank: 1, x: 70, y: 1280, parents: ['thrusters-3'] },
    { id: 'reactor-overdrive-1', skillId: 'reactorOverdrive', rank: 1, x: 970, y: 790, parents: ['energy-2'] },
    { id: 'reactor-overdrive-2', skillId: 'reactorOverdrive', rank: 2, x: 970, y: 960, parents: ['reactor-overdrive-1'] },
    { id: 'reactor-overdrive-3', skillId: 'reactorOverdrive', rank: 3, x: 970, y: 1120, parents: ['reactor-overdrive-2'] },
    { id: 'multishot-1', skillId: 'multishot', rank: 1, x: 1330, y: 790, parents: ['damage-4'] },
    { id: 'multishot-2', skillId: 'multishot', rank: 2, x: 1330, y: 960, parents: ['multishot-1'] },
    { id: 'multishot-3', skillId: 'multishot', rank: 3, x: 1330, y: 1120, parents: ['multishot-2'] },
    { id: 'shield-matrix-1', skillId: 'shieldMatrix', rank: 1, x: 250, y: 790, parents: ['hull-4'] },
    { id: 'shield-matrix-2', skillId: 'shieldMatrix', rank: 2, x: 250, y: 960, parents: ['shield-matrix-1'] },
    { id: 'shield-matrix-3', skillId: 'shieldMatrix', rank: 3, x: 250, y: 1120, parents: ['shield-matrix-2'] },
    { id: 'star-magnetism-1', skillId: 'starMagnetism', rank: 1, x: 970, y: 1280, parents: ['reactor-overdrive-3'] },
    { id: 'star-magnetism-2', skillId: 'starMagnetism', rank: 2, x: 970, y: 1440, parents: ['star-magnetism-1'] },
    { id: 'star-magnetism-3', skillId: 'starMagnetism', rank: 3, x: 970, y: 1600, parents: ['star-magnetism-2'] },
    { id: 'combo-drive-1', skillId: 'comboDrive', rank: 1, x: 1330, y: 1280, parents: ['multishot-3'] },
    { id: 'combo-drive-2', skillId: 'comboDrive', rank: 2, x: 1330, y: 1440, parents: ['combo-drive-1'] },
    { id: 'combo-drive-3', skillId: 'comboDrive', rank: 3, x: 1330, y: 1600, parents: ['combo-drive-2'] },
    { id: 'coin-scavenger-1', skillId: 'coinScavenger', rank: 1, x: 430, y: 790, parents: ['energy-4'] },
    { id: 'coin-scavenger-2', skillId: 'coinScavenger', rank: 2, x: 430, y: 960, parents: ['coin-scavenger-1'] },
    { id: 'coin-scavenger-3', skillId: 'coinScavenger', rank: 3, x: 430, y: 1120, parents: ['coin-scavenger-2'] }
];
let skillTreePurchasedNodes = {};
let skillTreePan = { x: 0, y: 0 };
let skillTreeDrag = null;
let skillTreeLevels = Object.fromEntries(skillDefinitions.map(skill => [skill.id, 0]));
let appliedSkillLevels = { ...skillTreeLevels };

function normalizeAccountProgress(account) {
    if (!account || typeof account !== 'object') return null;
    const normalized = { ...account };
    normalized.quests = normalizeQuests(normalized.quests);
    const validSkinIds = new Set(shipSkins.map(skin => skin.id));
    normalized.ownedShipSkins = Array.isArray(normalized.ownedShipSkins)
        ? [...new Set(normalized.ownedShipSkins.filter(id => validSkinIds.has(id)))]
        : [];
    if (!normalized.ownedShipSkins.includes('default')) normalized.ownedShipSkins.unshift('default');
    normalized.activeShipSkin = validSkinIds.has(normalized.activeShipSkin)
        && normalized.ownedShipSkins.includes(normalized.activeShipSkin)
        ? normalized.activeShipSkin
        : 'default';
    normalized.highestUnlockedLevel = Math.min(
        levelMapNodes.length,
        Math.max(1, Number(normalized.highestUnlockedLevel) || 1)
    );
    normalized.spaceCoins = Math.max(0, Number(normalized.spaceCoins) || 0);
    normalized.skillTree = normalized.skillTree && typeof normalized.skillTree === 'object'
        ? { ...normalized.skillTree }
        : {};
    normalized.skillTreeNodes = normalized.skillTreeNodes && typeof normalized.skillTreeNodes === 'object'
        ? { ...normalized.skillTreeNodes }
        : {};
    return normalized;
}

function getLegacyStoredAccounts() {
    // Old demo accounts were saved in localStorage with PBKDF2 password hashes.
    // They are only read here so they can be migrated to the server on first login.
    let parsed;
    try {
        parsed = JSON.parse(localStorage.getItem(legacyAccountsStorageKey) || '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAccountProgress).filter(Boolean);
}

async function apiRequest(path, method = 'GET', body) {
    let response;
    try {
        response = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw new Error('Could not reach the game server. Start it with "node server.js" and open http://localhost:3000.');
    }
    let data = {};
    try {
        data = await response.json();
    } catch {
        // Non-JSON responses (for example a proxy error page) are reported below.
    }
    if (!response.ok) {
        const error = new Error(data.error || `Server request failed (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return data;
}

function saveLegacyProgressHint() {
    // Remember locally how far this browser got, so legacy players can be migrated later.
    try {
        const previous = Number(localStorage.getItem(legacyProgressKey)) || 1;
        localStorage.setItem(legacyProgressKey, String(Math.max(previous, highestUnlockedLevel)));
    } catch {
        // Storage may be unavailable; progress stays server-side only.
    }
}

function createQuest(excludedTypes = []) {
    const availableTypes = questTypes.filter(definition => !excludedTypes.includes(definition.id));
    const definition = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const target = definition.targets[Math.floor(Math.random() * definition.targets.length)];
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: definition.id,
        target,
        progress: 0,
        reward: definition.reward + target * (definition.id === 'clear-levels' ? 10 : 2)
    };
}

function normalizeQuests(quests) {
    const validTypes = new Set(questTypes.map(quest => quest.id));
    const usedTypes = new Set();
    const normalized = Array.isArray(quests)
        ? quests.filter(quest => {
            if (!quest || !validTypes.has(quest.type) || usedTypes.has(quest.type)) return false;
            usedTypes.add(quest.type);
            return true;
        }).slice(0, 3).map(quest => {
            const definition = questTypes.find(entry => entry.id === quest.type);
            const target = Math.max(1, Math.floor(Number(quest.target) || 1));
            return {
                id: typeof quest.id === 'string' ? quest.id : createQuest().id,
                type: quest.type,
                target,
                progress: Math.min(target, Math.max(0, Math.floor(Number(quest.progress) || 0))),
                reward: Math.max(0, Math.floor(Number(quest.reward) || definition.reward))
            };
        })
        : [];
    while (normalized.length < 3) {
        const quest = createQuest([...usedTypes]);
        normalized.push(quest);
        usedTypes.add(quest.type);
    }
    return normalized;
}

function getAccountSkillLevels(account) {
    const emptyLevels = Object.fromEntries(skillDefinitions.map(skill => [skill.id, 0]));
    if (account.skillTreeNodes && typeof account.skillTreeNodes === 'object') {
        skillTreePurchasedNodes = Object.fromEntries(skillNodes.map(node => [
            node.id,
            account.skillTreeNodes[node.id] === true
        ]));
        recalculateSkillTreeLevels();
        return skillTreeLevels;
    }

    const savedSkills = account.skillTree && typeof account.skillTree === 'object'
        ? account.skillTree
        : {};
    skillTreeLevels = emptyLevels;
    skillTreePurchasedNodes = Object.fromEntries(skillNodes.map(node => [node.id, false]));
    const targetLevels = Object.fromEntries(skillDefinitions.map(skill => [
        skill.id,
        Math.min(skill.maxLevel, Math.max(0, Math.floor(Number(savedSkills[skill.id]) || 0)))
    ]));

    let madeProgress = true;
    while (madeProgress) {
        madeProgress = false;
        for (const node of skillNodes) {
            if (skillTreeLevels[node.skillId] >= targetLevels[node.skillId]
                || skillTreePurchasedNodes[node.id]
                || !node.parents.every(parentId => skillTreePurchasedNodes[parentId])) continue;
            skillTreePurchasedNodes[node.id] = true;
            skillTreeLevels[node.skillId] += 1;
            madeProgress = true;
        }
    }
    return skillTreeLevels;
}

function recalculateSkillTreeLevels() {
    skillTreeLevels = Object.fromEntries(skillDefinitions.map(skill => [skill.id, 0]));
    for (const node of skillNodes) {
        if (skillTreePurchasedNodes[node.id]) skillTreeLevels[node.skillId] += 1;
    }
}

function activateAccount(account) {
    const normalizedAccount = normalizeAccountProgress(account) || account;
    currentAccount = normalizedAccount;
    highestUnlockedLevel = normalizedAccount.highestUnlockedLevel;
    spaceCoins = normalizedAccount.spaceCoins;
    ownedShipSkins = [...normalizedAccount.ownedShipSkins];
    activeShipSkin = normalizedAccount.activeShipSkin;
    activeQuests = normalizedAccount.quests.map(quest => ({ ...quest }));
    skillTreeLevels = getAccountSkillLevels(normalizedAccount);
    appliedSkillLevels = Object.fromEntries(skillDefinitions.map(skill => [skill.id, 0]));
    document.body.classList.add('authenticated');
    accountName.textContent = `Pilot: ${normalizedAccount.username}`;
    saveLegacyProgressHint();
    openLevelMenu();
}

function syncAccountControlsVisibility() {
    accountControls.hidden = !currentAccount || menuScreen !== 'home' || hasStarted;
}

function openLevelSelectionMenu() {
    menuScreen = 'levels';
    hasStarted = false;
    syncAccountControlsVisibility();
    levelSelectionPage = Math.min(
        Math.floor((highestUnlockedLevel - 1) / levelsPerPage),
        Math.ceil(levelMapNodes.length / levelsPerPage) - 1
    );
}

function openSkillTreeMenu() {
    menuScreen = 'skills';
    hasStarted = false;
    syncAccountControlsVisibility();
    skillTreeMessage = '';
    skillTreePan = { x: 0, y: 0 };
    clampSkillTreePan();
}

function openEnemyCodexMenu() {
    menuScreen = 'codex';
    hasStarted = false;
    syncAccountControlsVisibility();
    codexPage = Math.min(codexPage, Math.ceil(enemyCodexEntries.length / codexEntriesPerPage) - 1);
    codexSelectedEntryId = null;
}

function openSkinShopMenu() {
    menuScreen = 'skins';
    hasStarted = false;
    syncAccountControlsVisibility();
    skinShopMessage = '';
}

function openQuestMenu() {
    menuScreen = 'quests';
    hasStarted = false;
    syncAccountControlsVisibility();
    questMessage = '';
}

async function saveAccountData() {
    // Progress is sent to the server; local state is updated only after it confirms the save.
    if (!currentAccount) throw new Error('A signed-in account is required to save progress.');

    const progress = {
        highestUnlockedLevel,
        spaceCoins,
        skillTree: { ...skillTreeLevels },
        skillTreeNodes: { ...skillTreePurchasedNodes },
        ownedShipSkins: [...ownedShipSkins],
        activeShipSkin,
        quests: activeQuests.map(quest => ({ ...quest }))
    };
    const data = await apiRequest('/api/progress', 'PUT', { progress });
    const saved = normalizeAccountProgress(data.account);
    if (saved) {
        // The server may have clamped or sanitized values; adopt its version.
        currentAccount = saved;
        highestUnlockedLevel = saved.highestUnlockedLevel;
        spaceCoins = saved.spaceCoins;
        ownedShipSkins = [...saved.ownedShipSkins];
        activeShipSkin = saved.activeShipSkin;
        activeQuests = saved.quests.map(quest => ({ ...quest }));
        getAccountSkillLevels(saved);
    }
    saveLegacyProgressHint();
}

function recordQuestProgress(type, amount = 1) {
    let changed = false;
    for (const quest of activeQuests) {
        if (quest.type !== type || quest.progress >= quest.target) continue;
        quest.progress = Math.min(quest.target, quest.progress + amount);
        changed = true;
    }
    if (!changed) return;

    saveAccountData().catch(error => {
        console.error('Could not save quest progress.', error);
        questMessage = 'QUEST PROGRESS COULD NOT BE SAVED';
    });
}

function claimQuest(index) {
    const quest = activeQuests[index];
    if (!quest || quest.progress < quest.target) return;

    const previousCoins = spaceCoins;
    const previousQuests = activeQuests.map(entry => ({ ...entry }));
    const previousAccount = currentAccount;
    spaceCoins += quest.reward;
    const otherTypes = activeQuests
        .filter((_, questIndex) => questIndex !== index)
        .map(entry => entry.type);
    activeQuests[index] = createQuest(otherTypes);
    saveAccountData().then(() => {
        questMessage = `QUEST CLAIMED: +${quest.reward} SPACE COINS`;
    }).catch(error => {
        spaceCoins = previousCoins;
        activeQuests = previousQuests;
        currentAccount = previousAccount;
        console.error('Could not save quest reward.', error);
        questMessage = 'CLAIM FAILED - COULD NOT SAVE';
    });
}

function buyOrEquipShipSkin(skinId) {
    const skin = shipSkins.find(entry => entry.id === skinId);
    if (!skin) return;

    if (ownedShipSkins.includes(skin.id)) {
        if (activeShipSkin === skin.id) {
            skinShopMessage = `${skin.name} IS ALREADY EQUIPPED`;
            return;
        }

        const previousSkin = activeShipSkin;
        activeShipSkin = skin.id;
        saveAccountData().then(() => {
            skinShopMessage = `${skin.name} EQUIPPED`;
        }).catch(error => {
            activeShipSkin = previousSkin;
            currentAccount.activeShipSkin = previousSkin;
            console.error('Could not save ship skin selection.', error);
            skinShopMessage = 'EQUIP FAILED - COULD NOT SAVE';
        });
        return;
    }

    if (spaceCoins < skin.cost) {
        skinShopMessage = 'NOT ENOUGH SPACE COINS';
        return;
    }

    const previousCoins = spaceCoins;
    const previousOwnedSkins = [...ownedShipSkins];
    const previousActiveSkin = activeShipSkin;
    const previousAccount = currentAccount;
    spaceCoins -= skin.cost;
    ownedShipSkins.push(skin.id);
    activeShipSkin = skin.id;
    saveAccountData().then(() => {
        skinShopMessage = `${skin.name} PURCHASED AND EQUIPPED`;
    }).catch(error => {
        spaceCoins = previousCoins;
        ownedShipSkins = previousOwnedSkins;
        activeShipSkin = previousActiveSkin;
        currentAccount = previousAccount;
        console.error('Could not save ship skin purchase.', error);
        skinShopMessage = 'PURCHASE FAILED - COULD NOT SAVE';
    });
}

function haveAllStarterSkills() {
    return starterSkillIds.every(skillId =>
        skillNodes.some(node => node.skillId === skillId && node.rank === 1 && skillTreePurchasedNodes[node.id])
    );
}

function isSkillNodeVisible(node) {
    if (starterSkillIds.includes(node.skillId)) return true;
    if (node.skillId === 'beam' || node.skillId === 'selfDestruct') return haveAllStarterSkills();
    return node.parents.every(parentId => skillTreePurchasedNodes[parentId]);
}

function isSkillAvailable(node) {
    return isSkillNodeVisible(node)
        && !skillTreePurchasedNodes[node.id]
        && node.parents.every(parentId => skillTreePurchasedNodes[parentId]);
}

function getSkillCost(node) {
    const skill = skillDefinitions.find(definition => definition.id === node.skillId);
    return skill.cost * node.rank;
}

function buySkillNode(nodeId) {
    const node = skillNodes.find(definition => definition.id === nodeId);
    if (!node || !isSkillNodeVisible(node)) return;

    if (skillTreePurchasedNodes[node.id]) {
        skillTreeMessage = 'THIS NODE IS ALREADY UNLOCKED';
        return;
    }
    if (!isSkillAvailable(node)) {
        skillTreeMessage = 'UNLOCK THE CONNECTED NODE FIRST';
        return;
    }

    const cost = getSkillCost(node);
    if (spaceCoins < cost) {
        skillTreeMessage = 'NOT ENOUGH SPACE COINS';
        return;
    }

    skillTreePurchasedNodes[node.id] = true;
    recalculateSkillTreeLevels();
    spaceCoins -= cost;
    saveAccountData().then(() => {
        skillTreeMessage = `${skillDefinitions.find(skill => skill.id === node.skillId).name.toUpperCase()} NODE UNLOCKED`;
    }).catch(error => {
        skillTreePurchasedNodes[node.id] = false;
        recalculateSkillTreeLevels();
        spaceCoins += cost;
        console.error('Could not save skill tree purchase.', error);
        skillTreeMessage = 'PURCHASE FAILED - COULD NOT SAVE';
    });
}

function setAuthMessage(message, success = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle('success', success);
}

function showAuthView(view) {
    const isRegistering = view === 'register';
    loginForm.hidden = isRegistering;
    registerForm.hidden = !isRegistering;
    authTitle.textContent = isRegistering ? 'Create your account' : 'Welcome back';
    authDescription.textContent = isRegistering
        ? 'Create a pilot profile to save your progress.'
        : 'Sign in to continue your mission.';
    setAuthMessage('');
}

function showAuthError(error) {
    console.error(error);
    setAuthMessage(error && error.message ? error.message : 'Something went wrong. Please try again.');
}

async function migrateLegacyAccount(username, password) {
    // Old demo accounts live in localStorage with a client-side PBKDF2 hash.
    // Send the salted hash to the server so it can take over the account; then remove the local copy.
    const legacy = getLegacyStoredAccounts().find(account =>
        account.username.toLowerCase() === username.toLowerCase()
    );
    if (!legacy || typeof legacy.passwordSalt !== 'string' || typeof legacy.passwordHash !== 'string') return null;

    try {
        const data = await apiRequest('/api/migrate', 'POST', {
            username,
            passwordHash: legacy.passwordHash,
            passwordSalt: legacy.passwordSalt,
            progress: {
                highestUnlockedLevel: legacy.highestUnlockedLevel,
                spaceCoins: legacy.spaceCoins,
                skillTree: legacy.skillTree,
                skillTreeNodes: legacy.skillTreeNodes,
                ownedShipSkins: legacy.ownedShipSkins,
                activeShipSkin: legacy.activeShipSkin,
                quests: legacy.quests
            }
        });
        try {
            const remaining = getLegacyStoredAccounts().filter(account =>
                account.username.toLowerCase() !== username.toLowerCase()
            );
            if (remaining.length === 0) localStorage.removeItem(legacyAccountsStorageKey);
            else localStorage.setItem(legacyAccountsStorageKey, JSON.stringify(remaining));
        } catch {
            // The local copy stays behind if storage is read-only; the server copy is leading.
        }
        return data.account;
    } catch (error) {
        if (error.status === 404) return null; // No such demo account on this browser.
        throw error;
    }
}

loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSigningIn) return;
    const username = loginForm.elements.username.value.trim();
    const password = loginForm.elements.password.value;
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    isSigningIn = true;
    setAuthMessage('');

    try {
        let data;
        try {
            data = await apiRequest('/api/login', 'POST', { username, password });
        } catch (error) {
            if (error.status !== 401) throw error;
            // Not a real account yet: try to take over an old demo account from this browser.
            const migratedAccount = await migrateLegacyAccount(username, password);
            if (!migratedAccount) throw error;
            data = { account: migratedAccount };
        }

        loginForm.reset();
        activateAccount(data.account);
    } catch (error) {
        showAuthError(error);
    } finally {
        submitButton.disabled = false;
        isSigningIn = false;
    }
});

registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSigningIn) return;
    const username = registerForm.elements.username.value.trim();
    const password = registerForm.elements.password.value;
    const confirmPassword = registerForm.elements.confirmPassword.value;
    const submitButton = registerForm.querySelector('button[type="submit"]');

    if (username.length < 3 || username.length > 24) {
        setAuthMessage('Username must be between 3 and 24 characters.');
        return;
    }
    if (password.length < 8) {
        setAuthMessage('Password must be at least 8 characters long.');
        return;
    }
    if (password !== confirmPassword) {
        setAuthMessage('The passwords do not match.');
        return;
    }

    submitButton.disabled = true;
    isSigningIn = true;
    setAuthMessage('');
    try {
        const data = await apiRequest('/api/register', 'POST', { username, password });
        registerForm.reset();
        activateAccount(data.account);
    } catch (error) {
        showAuthError(error);
    } finally {
        submitButton.disabled = false;
        isSigningIn = false;
    }
});

document.querySelectorAll('[data-auth-view]').forEach(button => {
    button.addEventListener('click', () => showAuthView(button.dataset.authView));
});

document.querySelectorAll('.password-toggle').forEach(button => {
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input) return;

    button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        button.title = show ? 'Hide password' : 'Show password';
        button.querySelector('.icon-eye').hidden = show;
        button.querySelector('.icon-eye-off').hidden = !show;
        input.focus({ preventScroll: true });
    });
});

logoutButton.addEventListener('click', async () => {
    try {
        await apiRequest('/api/logout', 'POST');
    } catch (error) {
        console.error('Could not sign out on the server.', error);
    }
    currentAccount = null;
    highestUnlockedLevel = 1;
    spaceCoins = 0;
    ownedShipSkins = ['default'];
    activeShipSkin = 'default';
    activeQuests = [];
    skillTreePurchasedNodes = Object.fromEntries(skillNodes.map(node => [node.id, false]));
    skillTreeLevels = Object.fromEntries(skillDefinitions.map(skill => [skill.id, 0]));
    appliedSkillLevels = { ...skillTreeLevels };
    accountControls.hidden = true;
    accountName.textContent = '';
    document.body.classList.remove('authenticated');
    resetGame(1);
    openLevelMenu();
    showAuthView('login');
});

(async () => {
    // Restore the previous session via the HttpOnly session cookie.
    try {
        const data = await apiRequest('/api/session');
        activateAccount(data.account);
    } catch (error) {
        if (error.status !== 401) showAuthError(error);
    }
})();

function startGame() {
    if (hasStarted) return;
    hasStarted = true;
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function createStars() {
    stars.length = 0;
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 2 + 1,
            speed: Math.random() * 30 + 10
        });
    }
}

function resetGame(startLevel = 1, preserveBuffs = false) {
    completedLevelPendingNext = null;
    ship.x = canvas.width / 2;
    ship.y = canvas.height - 38;
    ship.cooldown = 0;
    ship.invulnerable = 0;
    if (!preserveBuffs) {
        ship.lives = 3;
        ship.explosiveShot = false;
        ship.starMagnet = false;
    }
    ship.multishotLevel = skillTreeLevels.multishot;
    ship.starMagnet = skillTreeLevels.starMagnetism > 0;
    ship.maxLives = 3;
    ship.lives = preserveBuffs
        ? Math.min(ship.maxLives, ship.lives)
        : ship.maxLives;
    ship.absorptionHearts = preserveBuffs
        ? ship.absorptionHearts + Math.max(0, skillTreeLevels.extraLives - appliedSkillLevels.extraLives)
        : skillTreeLevels.extraLives;
    ship.maxEnergy = preserveBuffs
        ? ship.maxEnergy + (skillTreeLevels.maxEnergy - appliedSkillLevels.maxEnergy) * 30
        : 180 + skillTreeLevels.maxEnergy * 30;
    ship.fireRateMultiplier = preserveBuffs
        ? ship.fireRateMultiplier * (1 + skillTreeLevels.fireRate * 0.1) / (1 + appliedSkillLevels.fireRate * 0.1)
        : 1 + skillTreeLevels.fireRate * 0.1;
    ship.damageMultiplier = preserveBuffs
        ? ship.damageMultiplier * (1 + skillTreeLevels.damage * 0.25) / (1 + appliedSkillLevels.damage * 0.25)
        : 1 + skillTreeLevels.damage * 0.25;
    ship.speed = preserveBuffs
        ? ship.speed * (1 + skillTreeLevels.thrusters * 0.1) / (1 + appliedSkillLevels.thrusters * 0.1)
        : 300 * (1 + skillTreeLevels.thrusters * 0.1);
    ship.phantomDashUnlocked = skillTreeLevels.phantomDash > 0;
    ship.phantomDashTimer = 0;
    ship.phantomDashCooldown = 0;
    ship.phantomDashDirection = { x: 0, y: 0 };
    ship.energyRegen = preserveBuffs
        ? ship.energyRegen * (1 + skillTreeLevels.reactorOverdrive * 0.2) / (1 + appliedSkillLevels.reactorOverdrive * 0.2)
        : 18 * (1 + skillTreeLevels.reactorOverdrive * 0.2);
    ship.chargedBeam = preserveBuffs
        ? ship.chargedBeam || skillTreeLevels.beam > 0
        : skillTreeLevels.beam > 0;
    ship.selfDestructUnlocked = preserveBuffs
        ? ship.selfDestructUnlocked || skillTreeLevels.selfDestruct > 0
        : skillTreeLevels.selfDestruct > 0;
    appliedSkillLevels = { ...skillTreeLevels };
    ship.energy = ship.maxEnergy;
    ship.selfDestructCharging = false;
    ship.selfDestructCharge = 0;
    ship.selfDestructMustRelease = false;
    ship.beamCharging = false;
    ship.beamCharge = 0;
    ship.beamHoldTime = 0;
    ship.beamMustRelease = false;
    ship.locked = false;
    ship.powerShotTimer = 0;
    ship.nextShotFast = false;
    ship.blueStarTimer = 0;
    ship.lifeRegenTimer = 30;
    bullets.length = 0;
    comets.length = 0;
    blackHoles.length = 0;
    enemyShips.length = 0;
    enemyBullets.length = 0;
    particles.length = 0;
    shockwaves.length = 0;
    bonusStars.length = 0;
    blueStars.length = 0;
    score = 0;
    comboCount = 0;
    comboTimer = 0;
    comboBonusScore = 0;
    level = startLevel;
    spawnTimer = 0.8;
    smallShipSpawnTimer = 0;
    blueStarSpawnTimer = 0;
    gameOver = false;
    gameOverFromDeath = false;
    bossSpawned = false;
    levelCleared = false;
    levelRewardCoins = 0;
    levelRewardSaveFailed = false;
    screenShake.intensity = 0;
    screenShake.timer = 0;
    hitstopTimer = 0;
    updateScore();
}

function openLevelMenu() {
    if (levelCleared) {
        completedLevelPendingNext = level;
        levelCleared = false;
    }
    menuScreen = 'home';
    hasStarted = false;
    syncAccountControlsVisibility();
    gameOver = false;
    gameOverFromDeath = false;
    bullets.length = 0;
    comets.length = 0;
    blackHoles.length = 0;
    enemyShips.length = 0;
    enemyBullets.length = 0;
    particles.length = 0;
    shockwaves.length = 0;
    bonusStars.length = 0;
    blueStars.length = 0;
    ship.energy = ship.maxEnergy;
    ship.cooldown = 0;
    ship.invulnerable = 0;
    ship.phantomDashTimer = 0;
    ship.phantomDashCooldown = 0;
    ship.phantomDashDirection = { x: 0, y: 0 };
    ship.locked = false;
    ship.beamCharging = false;
    ship.beamCharge = 0;
    ship.beamHoldTime = 0;
    ship.beamMustRelease = false;
    ship.powerShotTimer = 0;
    ship.nextShotFast = false;
    ship.blueStarTimer = 0;
    updateScore();
}

function startLevelSelection(levelNumber) {
    if (levelNumber > highestUnlockedLevel || !levelMapNodes.some(node => node.level === levelNumber)) return;

    const preserveBuffs = completedLevelPendingNext === level && levelNumber === level + 1;
    completedLevelPendingNext = null;
    menuScreen = 'levels';
    resetGame(levelNumber, preserveBuffs);
    score = 0;
    updateScore();
    hasStarted = true;
    syncAccountControlsVisibility();
    audio.startMusic();
}

function getBossTarget() {
    return 1000 + (level - 1) * 500;
}

function updateScore() {
    if (scoreElement) scoreElement.textContent = `Level ${level} • Score: ${score}`;
}

function awardEnemyDefeat(enemyShip) {
    const baseScore = enemyShip.scoreValue || (enemyShip.isBoss ? 250 : 20);
    comboCount = comboTimer > 0 ? comboCount + 1 : 1;
    comboTimer = 3 + skillTreeLevels.comboDrive * 0.6;
    const comboMultiplier = 1 + Math.min(comboCount - 1, 10) * 0.1;
    const points = Math.floor(baseScore * comboMultiplier);
    comboBonusScore += points - baseScore;
    score += points;
    recordQuestProgress('defeat-enemies');
    if (enemyShip.isBoss) recordQuestProgress('defeat-bosses');
    updateScore();
}

function getDifficultyLevel() {
    return Math.max(0, Math.floor((score % 300) / 100));
}

function spawnComet() {
    const difficultyLevel = getDifficultyLevel();
    const extraComets = Math.min(3, 1 + difficultyLevel);

    for (let i = 0; i < extraComets; i++) {
        const radius = randomBetween(16, 30);
        const side = Math.floor(Math.random() * 4);

        let x;
        let y;

        if (side === 0) {
            x = randomBetween(0, canvas.width);
            y = -radius;
        } else if (side === 1) {
            x = canvas.width + radius;
            y = randomBetween(0, canvas.height);
        } else if (side === 2) {
            x = randomBetween(0, canvas.width);
            y = canvas.height + radius;
        } else {
            x = -radius;
            y = randomBetween(0, canvas.height);
        }

        const speedBoost = 1 + difficultyLevel * 0.22;

        comets.push({
            x,
            y,
            radius,
            vx: randomBetween(-70, 70) * speedBoost,
            vy: randomBetween(40, 120) * speedBoost,
            rotation: Math.random() * Math.PI * 2,
            spin: randomBetween(-2, 2),
            color: `hsl(${Math.random() * 30 + 10}, 70%, 55%)`,
            orbitingBlackHole: null,
            orbitAngle: 0,
            orbitRadius: 0
        });
    }
}

function addBurst(x, y, color, particleCount = 12, speed = 140, life = 0.8, minRadius = 2, maxRadius = 5) {
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x,
            y,
            vx: randomBetween(-speed, speed),
            vy: randomBetween(-speed, speed),
            life,
            color,
            radius: randomBetween(minRadius, maxRadius)
        });
    }
}

function spawnBonusStar() {
    const radius = 10;
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;

    if (side === 0) {
        x = randomBetween(0, canvas.width);
        y = -radius;
    } else if (side === 1) {
        x = canvas.width + radius;
        y = randomBetween(0, canvas.height);
    } else if (side === 2) {
        x = randomBetween(0, canvas.width);
        y = canvas.height + radius;
    } else {
        x = -radius;
        y = randomBetween(0, canvas.height);
    }

    bonusStars.push({
        x,
        y,
        radius,
        drift: randomBetween(-20, 20),
        bob: Math.random() * Math.PI * 2,
        speed: randomBetween(140, 220),
        pulse: randomBetween(0.8, 1.6),
        vx: randomBetween(-160, 160),
        vy: randomBetween(140, 260)
    });
}

function spawnBlueStar() {
    const radius = 14;
    blueStars.push({
        x: randomBetween(radius, canvas.width - radius),
        y: -radius,
        radius,
        bob: Math.random() * Math.PI * 2,
        vx: randomBetween(-35, 35),
        vy: randomBetween(45, 85)
    });
}

function spawnBlackHole() {
    const radius = randomBetween(30, 40);
    const health = 10 + Math.floor((level - 1) / 2);
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;

    if (side === 0) {
        x = randomBetween(0, canvas.width);
        y = -radius;
    } else if (side === 1) {
        x = canvas.width + radius;
        y = randomBetween(0, canvas.height);
    } else if (side === 2) {
        x = randomBetween(0, canvas.width);
        y = canvas.height + radius;
    } else {
        x = -radius;
        y = randomBetween(0, canvas.height);
    }

    blackHoles.push({
        x,
        y,
        radius,
        vx: randomBetween(-20, 20),
        vy: randomBetween(25, 60),
        rotation: Math.random() * Math.PI * 2,
        spin: randomBetween(-0.5, 0.5),
        health,
        maxHealth: health,
        pulse: Math.random() * Math.PI * 2,
        sucking: false,
        lifetime: 0,
        suckedComets: 0
    });
}

function getEnemyHealth(baseHealth) {
    return baseHealth * level;
}

function getEnemyAttackDamage() {
    return 0.5 + (level / 2);
}

// ---------- Enemy AI helpers ----------

// Smoothed ship velocity, used for intercept prediction. One frame stale is fine.
const shipVelocity = { x: 0, y: 0 };

function updateShipVelocity(dt) {
    if (ship.prevX === undefined) {
        ship.prevX = ship.x;
        ship.prevY = ship.y;
    }
    if (dt > 0) {
        shipVelocity.x = (ship.x - ship.prevX) / dt;
        shipVelocity.y = (ship.y - ship.prevY) / dt;
    }
    ship.prevX = ship.x;
    ship.prevY = ship.y;
}

// Iteratively solve where to aim so a shot of the given speed intercepts the
// moving ship. leadFactor (0..1) blends between raw aiming and full prediction,
// so enemies stay readable instead of becoming aimbots.
function predictInterceptAngle(fromX, fromY, bulletSpeed, leadFactor = 0.7) {
    const direct = Math.atan2(ship.y - fromY, ship.x - fromX);
    if (leadFactor <= 0 || bulletSpeed <= 0) return direct;

    let targetX = ship.x;
    let targetY = ship.y;
    for (let i = 0; i < 3; i++) {
        const travelTime = Math.hypot(targetX - fromX, targetY - fromY) / bulletSpeed;
        targetX = ship.x + shipVelocity.x * travelTime * leadFactor;
        targetY = ship.y + shipVelocity.y * travelTime * leadFactor;
    }
    const distance = Math.hypot(targetX - fromX, targetY - fromY);
    // Never predict further than a screen away; fall back to direct aiming.
    if (distance > Math.max(canvas.width, canvas.height)) return direct;
    return Math.atan2(targetY - fromY, targetX - fromX);
}

// Returns the direction to sidestep when a player bullet threatens this enemy
// soon, or 0 when safe. Used for bullet-dodging behaviour.
function findBulletThreatDirection(enemyShip) {
    for (const bullet of bullets) {
        const relX = enemyShip.x - bullet.x;
        const relY = enemyShip.y - bullet.y;
        const distance = Math.hypot(relX, relY);
        if (distance > 260 || distance < 1) continue;

        const bulletSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const closing = (bullet.vx * relX + bullet.vy * relY) / distance;
        if (closing < 60) continue; // Not heading toward us.

        const timeToClose = distance / bulletSpeed;
        if (timeToClose > 0.55) continue; // Too far away to matter yet.

        // Perpendicular miss distance: how far the shot will pass from the hull.
        const miss = Math.abs((relX * bullet.vy - relY * bullet.vx) / bulletSpeed);
        if (miss > 26 + enemyShip.radius * 0.5) continue;

        // Sidestep toward the side the bullet will pass on.
        return Math.sign(relX * bullet.vy - relY * bullet.vx) || 1;
    }
    return 0;
}

// Teamwork: after firing, nudge nearby allies so their next volley goes off
// shortly after this one, creating coordinated squad bursts.
function synchronizeSquadVolley(enemyShip) {
    for (const ally of enemyShips) {
        if (ally === enemyShip || ally.isBoss) continue;
        if ((ally.syncLock || 0) > 0) continue;
        if (Math.hypot(ally.x - enemyShip.x, ally.y - enemyShip.y) > 240) continue;
        if (ally.cooldown < 0.5) continue; // About to fire anyway.
        ally.cooldown = randomBetween(0.25, 0.55);
        ally.syncLock = 1.6; // Prevent endless sync chains.
    }
}

function damagePlayer(amount) {
    if (ship.invulnerable > 0) return;

    comboCount = 0;
    comboTimer = 0;
    comboBonusScore = 0;
    amount *= 1 - skillTreeLevels.shieldMatrix * 0.1;
    const absorbedDamage = Math.min(ship.absorptionHearts, amount);
    ship.absorptionHearts -= absorbedDamage;
    ship.lives -= amount - absorbedDamage;
    ship.invulnerable = 1.2;
    addScreenShake(9, 0.35);
    addHitstop(0.08);
}

function applyFreezeStatus(duration = 2) {
    ship.frozenTimer = Math.max(ship.frozenTimer, duration);
}

function applyFireStatus(duration = 2) {
    ship.fireTimer = Math.max(ship.fireTimer, duration);
    ship.burnTickTimer = Math.min(ship.burnTickTimer || 0.5, 0.5);
}

function spawnEnemyShip() {
    const bossProfile = planetBossProfiles[level - 1];
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? -40 : canvas.width + 40;

    enemyShips.push({
        x,
        y: 70,
        radius: 30,
        isBoss: true,
        type: 'planet-boss',
        bossProfile,
        codexId: `boss-${levelMapNodes[level - 1].type}`,
        scoreValue: 250,
        scale: 1.15,
        moveSpeed: 65,
        bulletSpeed: 240 * (bossProfile.bulletSpeed || 1),
        shotCooldown: bossProfile.cooldown,
        damage: getEnemyAttackDamage(),
        health: getEnemyHealth(12),
        maxHealth: getEnemyHealth(12),
        cooldown: 1.2,
        pulse: Math.random() * Math.PI * 2,
        rotation: 0
    });
}

function spawnSmallEnemyShip() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const availableTypes = [
        { type: 'scout', minLevel: 1 },
        { type: 'cold-scout', minLevel: 5 },
        { type: 'mars-raider', minLevel: 2 },
        { type: 'venus-scorcher', minLevel: 4 },
        { type: 'mercury-dart', minLevel: 3 },
        { type: 'saturn-warden', minLevel: 6 },
        { type: 'neptune-wraith', minLevel: 8 },
        { type: 'io-pyro', minLevel: 11 },
        { type: 'europa-cryo', minLevel: 12 },
        { type: 'titan-hunter', minLevel: 13 },
        { type: 'triton-phantom', minLevel: 14 },
        { type: 'ceres-bomber', minLevel: 15 },
        { type: 'eris-stalker', minLevel: 16 },
        { type: 'makemake-prism', minLevel: 17 },
        { type: 'haumea-spinner', minLevel: 18 },
        { type: 'ganymede-guardian', minLevel: 19 },
        { type: 'callisto-sentinel', minLevel: 20 }
    ].filter(enemyType => level >= enemyType.minLevel);
    const currentPlanetEnemy = levelMapNodes[level - 1]?.enemyType;
    const selectedType = currentPlanetEnemy && Math.random() < 0.5
        ? currentPlanetEnemy
        : availableTypes[Math.floor(Math.random() * availableTypes.length)].type;
    const stats = enemyTypeStats[selectedType];

    enemyShips.push({
        x: side < 0 ? -stats.radius : canvas.width + stats.radius,
        y: randomBetween(50, 120),
        radius: stats.radius,
        isBoss: false,
        type: selectedType,
        scoreValue: stats.score,
        scale: stats.scale,
        moveSpeed: stats.moveSpeed,
        bulletSpeed: stats.bulletSpeed,
        shotCooldown: stats.shotCooldown,
        damage: getEnemyAttackDamage(),
        health: getEnemyHealth(stats.health),
        maxHealth: getEnemyHealth(stats.health),
        cooldown: randomBetween(0.8, stats.shotCooldown),
        pulse: Math.random() * Math.PI * 2,
        rotation: 0,
        direction: side,
        flankSide: Math.random() < 0.5 ? -1 : 1,
        phaseTimer: randomBetween(0, 1.5),
        dashTimer: 0,
        homeY: randomBetween(50, 120)
    });
}

function triggerExplosion(x, y, radius = 42) {
    addScreenShake(6, 0.18);
    for (let i = comets.length - 1; i >= 0; i--) {
        const comet = comets[i];
        const dx = comet.x - x;
        const dy = comet.y - y;
        const distance = Math.hypot(dx, dy);

        if (distance <= radius) {
            comets.splice(i, 1);
            score += 15;
            recordQuestProgress('destroy-comets');
            addBurst(comet.x, comet.y, '#fbbf24');
            updateScore();
        }
    }
}

function startChargedBeam() {
    if (!ship.chargedBeam || ship.beamMustRelease || ship.locked || ship.energy <= 0 || gameOver || levelCleared) return;
    ship.beamHoldTime = 0;
    ship.beamCharge = 0;
}

function getCurrentDamageMultiplier() {
    return ship.damageMultiplier * (ship.blueStarTimer > 0 ? 2 : 1);
}

function hasFreeEnergyBuff() {
    return ship.powerShotTimer > 0 || ship.blueStarTimer > 0;
}

function getSelfDestructChargeStats() {
    const chargeRate = 1 + skillTreeLevels.selfDestructCharge * 0.25;
    const healthCostMultiplier = Math.max(0.25, 1 - skillTreeLevels.selfDestructCharge * 0.15);
    const healthCostPerSecond = 0.35 * healthCostMultiplier;
    const fullWipeChargeTime = 3 / chargeRate;
    const frameSafetyMargin = 0.03;
    return {
        chargeRate,
        healthCostMultiplier,
        fullWipeHealthCost: healthCostPerSecond * (fullWipeChargeTime + frameSafetyMargin)
    };
}

function startSelfDestruct() {
    if (!ship.selfDestructUnlocked || ship.selfDestructCharging || ship.selfDestructMustRelease || gameOver || levelCleared) return;
    if (ship.lives <= getSelfDestructChargeStats().fullWipeHealthCost) return;
    ship.selfDestructCharging = true;
    ship.selfDestructCharge = 0;
}

function releaseSelfDestruct() {
    const charge = ship.selfDestructCharge;
    const wasCharging = ship.selfDestructCharging;
    ship.selfDestructCharging = false;
    ship.selfDestructCharge = 0;
    ship.selfDestructMustRelease = false;
    if (wasCharging && charge > 0.05) resolveSelfDestruct(charge);
}

function resolveSelfDestruct(charge) {
    const fullWipe = charge > 3;
    const blastRadius = fullWipe ? Math.hypot(canvas.width, canvas.height) : 180 + charge * 100;
    shockwaves.push({
        x: ship.x,
        y: ship.y,
        radius: 8,
        startRadius: 8,
        previousRadius: 0,
        maxRadius: blastRadius,
        life: 0.55,
        maxLife: 0.55,
        destroyComets: true,
        cometScore: 10,
        destroyBlackHoles: true,
        hitBlackHoles: [],
        blackHoleDamage: charge,
        fullWipe
    });

    for (let i = enemyShips.length - 1; i >= 0; i--) {
        const enemyShip = enemyShips[i];
        if (!fullWipe && Math.hypot(enemyShip.x - ship.x, enemyShip.y - ship.y) > blastRadius) continue;

        enemyShip.health -= charge;
        addBurst(enemyShip.x, enemyShip.y, '#fbbf24');
        if (fullWipe || enemyShip.health <= 0) {
            enemyShips.splice(i, 1);
            awardEnemyDefeat(enemyShip);
            addBurst(enemyShip.x, enemyShip.y, '#fb923c', 8, 100, 0.5, 2, 4);
        }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const enemyBullet = enemyBullets[i];
        if (fullWipe || Math.hypot(enemyBullet.x - ship.x, enemyBullet.y - ship.y) <= blastRadius) {
            enemyBullets.splice(i, 1);
        }
    }

    addBurst(ship.x, ship.y, fullWipe ? '#ef4444' : '#f97316', 20, 220, 0.8, 3, 7);
    updateScore();
    ship.selfDestructCharging = false;
    ship.selfDestructCharge = 0;
}

function getShotAngles() {
    return ship.multishotLevel === 0
        ? [0]
        : ship.multishotLevel === 1
            ? [-0.35, 0, 0.35]
            : ship.multishotLevel === 2
                ? [-0.5, 0, 0.5]
                : [-0.6, -0.25, 0, 0.25, 0.6];
}

function isPurpleBeam(charge) {
    const chargeProgress = Math.min(1, charge / ((ship.maxEnergy - 10) / 36));
    return chargeProgress >= 0.5 || ship.blueStarTimer > 0;
}

function getBeamShotAngles(charge) {
    return isPurpleBeam(charge) ? getShotAngles() : [0];
}

function createBeamBullet(charge, damageMultiplier, angleOffset = 0, life = 0.35) {
    const isPurple = isPurpleBeam(charge);
    const skin = getActiveSkin();
    const angle = -Math.PI / 2 + (isPurple ? angleOffset : 0);
    const originX = ship.x;
    const originY = ship.y - 18;
    bullets.push({
        x: originX,
        y: originY,
        originX,
        originY,
        angle,
        radius: 6 + Math.min(charge, 3) * 2,
        spread: isPurple ? 0.22 : 0,
        color: isPurple ? '#a855f7' : skin.beamColor,
        fillColor: isPurple ? 'rgba(168, 85, 247, 0.38)' : skin.bulletFillColor,
        coreColor: isPurple ? '#f3e8ff' : skin.bulletCoreColor,
        vx: Math.cos(angle) * 5400,
        vy: Math.sin(angle) * 5400,
        beam: true,
        life,
        hitTargets: [],
        damage: (1 + charge * 4) * damageMultiplier
    });
}

function fireChargedBeam() {
    if (!ship.beamCharging) return;

    const charge = ship.beamCharge;
    ship.beamCharging = false;
    ship.beamCharge = 0;
    for (const angleOffset of getBeamShotAngles(charge)) {
        createBeamBullet(charge, getCurrentDamageMultiplier(), angleOffset);
    }
    audio.playShoot();
}

function bulletHitsTarget(bullet, target) {
    if (bullet.beam) {
        if (bullet.hitTargets.includes(target)) return false;

        const dx = target.x - bullet.originX;
        const dy = target.y - bullet.originY;
        const directionX = Math.cos(bullet.angle);
        const directionY = Math.sin(bullet.angle);
        const distanceAlongBeam = dx * directionX + dy * directionY;
        const distanceFromBeam = Math.abs(dx * directionY - dy * directionX);
        const beamLength = Math.hypot(bullet.x - bullet.originX, bullet.y - bullet.originY);
        const halfWidth = bullet.radius * 0.55 + Math.max(0, distanceAlongBeam) * bullet.spread;
        return distanceAlongBeam >= -target.radius
            && distanceAlongBeam <= beamLength + target.radius
            && distanceFromBeam < halfWidth + target.radius;
    }

    return Math.hypot(bullet.x - target.x, bullet.y - target.y) < bullet.radius + target.radius;
}

function shoot() {
    if (gameOver || ship.cooldown > 0) return;
    if (ship.locked || ship.energy < 10) {
        ship.locked = true;
        return;
    }

    const freeShot = hasFreeEnergyBuff();
    const shotCooldown = ship.nextShotFast ? (0.08 / ship.fireRateMultiplier) : (0.18 / ship.fireRateMultiplier);
    const shotDamage = getCurrentDamageMultiplier();
    if (ship.blueStarTimer > 0) {
        for (const angleOffset of getBeamShotAngles(0)) {
            createBeamBullet(0, shotDamage, angleOffset);
        }
    } else {
        const skin = getActiveSkin();
        for (const angleOffset of getShotAngles()) {
            const angle = -Math.PI / 2 + angleOffset;
            bullets.push({
                x: ship.x + Math.cos(angle) * 12,
                y: ship.y - 18 + Math.sin(angle) * 12,
                radius: 4,
                vx: Math.cos(angle) * 180,
                vy: Math.sin(angle) * 480 - 220,
                explosive: ship.explosiveShot,
                damage: shotDamage,
                skinColor: skin.bulletColor
            });
        }
    }

    if (!freeShot) {
        const volleyCostMultiplier = ship.multishotLevel >= 3 ? 0.75 : 1;
        ship.energy = Math.max(0, ship.energy - 18 * volleyCostMultiplier);
    }

    audio.playShoot();
    ship.cooldown = shotCooldown;
    ship.nextShotFast = false;

    if (ship.energy < 10) {
        ship.locked = true;
    }
}

function handleInput() {
    let dx = 0;
    let dy = 0;

    if (keys.ArrowLeft || keys.a) dx -= 1;
    if (keys.ArrowRight || keys.d) dx += 1;
    if (keys.ArrowUp || keys.w) dy -= 1;
    if (keys.ArrowDown || keys.s) dy += 1;

    const length = Math.hypot(dx, dy) || 1;
    ship.x += (dx / length) * ship.speed * 0.016;
    ship.y += (dy / length) * ship.speed * 0.016;

    ship.x = Math.max(ship.radius, Math.min(canvas.width - ship.radius, ship.x));
    ship.y = Math.max(ship.radius + 10, Math.min(canvas.height - ship.radius, ship.y));
}

function update(dt) {
    if (!hasStarted) {
        for (const star of stars) {
            star.y += star.speed * dt;
            if (star.y > canvas.height) {
                star.y = -5;
                star.x = Math.random() * canvas.width;
            }
        }
        return;
    }

    if (gameOver) {
        return;
    }

    if (levelCleared) {
        levelClearCooldown = Math.max(0, levelClearCooldown - dt);
        return;
    }

    updateShipVelocity(dt);

    ship.cooldown = Math.max(0, ship.cooldown - dt);
    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    ship.phantomDashTimer = Math.max(0, ship.phantomDashTimer - dt);
    ship.phantomDashCooldown = Math.max(0, ship.phantomDashCooldown - dt);
    ship.blueStarTimer = Math.max(0, ship.blueStarTimer - dt);
    ship.powerShotTimer = Math.max(0, ship.powerShotTimer - dt);
    ship.frozenTimer = Math.max(0, ship.frozenTimer - dt);
    if (comboTimer > 0) {
        comboTimer = Math.max(0, comboTimer - dt);
        if (comboTimer === 0) {
            comboCount = 0;
            comboBonusScore = 0;
        }
    }
    if (ship.fireTimer > 0) {
        ship.burnTickTimer -= dt;
        if (ship.burnTickTimer <= 0) {
            damagePlayer(0.25);
            ship.burnTickTimer = 0.5;
            if (ship.lives <= 0) {
                gameOver = true;
                gameOverFromDeath = true;
            }
        }
    } else {
        ship.burnTickTimer = 0.5;
    }
    ship.fireTimer = Math.max(0, ship.fireTimer - dt);

    if (ship.lives >= ship.maxLives) {
        ship.lives = ship.maxLives;
        ship.lifeRegenTimer = 60;
    } else {
        ship.lifeRegenTimer -= dt;
        if (ship.lifeRegenTimer <= 0) {
            ship.lives = Math.min(ship.maxLives, ship.lives + 1);
            ship.lifeRegenTimer = 60;
        }
    }

    if (ship.selfDestructCharging && keys.r) {
        const { chargeRate, healthCostMultiplier } = getSelfDestructChargeStats();
        ship.selfDestructCharge += dt * chargeRate;
        ship.lives = Math.max(0, ship.lives - 0.35 * healthCostMultiplier * dt);

        if (ship.lives <= 0) {
            ship.selfDestructCharging = false;
            ship.selfDestructCharge = 0;
            ship.selfDestructMustRelease = true;
            gameOver = true;
            gameOverFromDeath = true;
        } else if (ship.selfDestructCharge > 3) {
            ship.selfDestructMustRelease = true;
            resolveSelfDestruct(ship.selfDestructCharge);
        }
    }

    if (ship.beamCharging) {
        const beamEfficiency = Math.max(0.25, 1 - skillTreeLevels.beamEnergyCost * 0.15);
        if (!hasFreeEnergyBuff()) {
            ship.energy = Math.max(0, ship.energy - 36 * beamEfficiency * dt);
        }
        ship.beamCharge += dt * (1 + skillTreeLevels.beamChargeRate * 0.25);
        if (ship.energy <= 0) {
            ship.beamMustRelease = true;
            ship.locked = true;
            fireChargedBeam();
        }
    } else if (ship.locked) {
        ship.energy = Math.min(ship.maxEnergy, ship.energy + ship.energyRegen * dt);
        if (ship.energy >= ship.maxEnergy) {
            ship.energy = ship.maxEnergy;
            ship.locked = false;
        }
    } else {
        ship.energy = Math.min(ship.maxEnergy, ship.energy + ship.energyRegen * dt);
    }

    if (ship.chargedBeam && keys[' '] && !ship.beamMustRelease && !ship.beamCharging && !ship.locked) {
        ship.beamHoldTime += dt;
        const beamStartDelay = Math.max(0.1, 0.5 / (1 + skillTreeLevels.beamChargeRate * 0.25));
        if (ship.beamHoldTime >= beamStartDelay) {
            ship.beamCharging = true;
            ship.beamCharge = 0;
            if (!hasFreeEnergyBuff()) {
                const beamEfficiency = Math.max(0.25, 1 - skillTreeLevels.beamEnergyCost * 0.15);
                ship.energy = Math.max(0, ship.energy - 10 * beamEfficiency);
            }
            if (ship.energy <= 0) {
                ship.beamMustRelease = true;
                ship.locked = true;
                fireChargedBeam();
            }
        }
    } else if (!keys[' ']) {
        ship.beamHoldTime = 0;
    }

    const requestedMovement = ship.frozenTimer > 0 ? { x: 0, y: 0 } : {
        x: (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0),
        y: (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0)
    };

    const movementLength = Math.hypot(requestedMovement.x, requestedMovement.y);
    if (ship.phantomDashUnlocked && keys.q && movementLength > 0
        && ship.frozenTimer <= 0 && !ship.locked
        && ship.phantomDashTimer <= 0 && ship.phantomDashCooldown <= 0
        && ship.energy >= 36) {
        ship.energy -= 36;
        ship.phantomDashDirection = {
            x: requestedMovement.x / movementLength,
            y: requestedMovement.y / movementLength
        };
        ship.phantomDashTimer = 0.38;
        ship.phantomDashCooldown = 0.72;
        ship.invulnerable = Math.max(ship.invulnerable, ship.phantomDashTimer);
        if (ship.energy < 10) ship.locked = true;
    }

    const isDashing = ship.phantomDashTimer > 0 && ship.frozenTimer <= 0;
    const movement = isDashing ? ship.phantomDashDirection : requestedMovement;
    const movementSpeed = ship.speed * (isDashing ? 3 : 1);
    const len = Math.hypot(movement.x, movement.y) || 1;
    ship.x += (movement.x / len) * movementSpeed * dt;
    ship.y += (movement.y / len) * movementSpeed * dt;
    ship.x = Math.max(ship.radius, Math.min(canvas.width - ship.radius, ship.x));
    ship.y = Math.max(ship.radius + 8, Math.min(canvas.height - ship.radius, ship.y));

    for (const star of stars) {
        star.y += star.speed * dt;
        if (star.y > canvas.height) {
            star.y = -5;
            star.x = Math.random() * canvas.width;
        }
    }

    if (bonusStars.length < 1 && Math.random() < 0.006) {
        spawnBonusStar();
    }

    for (let i = bonusStars.length - 1; i >= 0; i--) {
        const bonusStar = bonusStars[i];
        bonusStar.bob += dt * 3;

        if (ship.starMagnet) {
            const dx = ship.x - bonusStar.x;
            const dy = ship.y - bonusStar.y;
            const distance = Math.hypot(dx, dy) || 1;

            if (distance < 140 + skillTreeLevels.starMagnetism * 65) {
                const pull = (240 * (1 + skillTreeLevels.starMagnetism * 0.25)) / distance;
                bonusStar.vx += (dx / distance) * pull * dt * 60;
                bonusStar.vy += (dy / distance) * pull * dt * 60;
            }
        }

        bonusStar.x += bonusStar.vx * dt;
        bonusStar.y += bonusStar.vy * dt;

        if (bonusStar.x < -bonusStar.radius || bonusStar.x > canvas.width + bonusStar.radius || bonusStar.y > canvas.height + bonusStar.radius) {
            bonusStars.splice(i, 1);
            continue;
        }

        const dx = ship.x - bonusStar.x;
        const dy = ship.y - bonusStar.y;
        const distance = Math.hypot(dx, dy);

        if (distance < ship.radius + bonusStar.radius) {
            ship.powerShotTimer = 3.5;
            ship.nextShotFast = true;
            ship.invulnerable = Math.max(ship.invulnerable, 2.0);
            ship.energy = ship.maxEnergy;
            ship.locked = false;
            addBurst(bonusStar.x, bonusStar.y, '#facc15');
            bonusStars.splice(i, 1);
            recordQuestProgress('collect-stars');
        }
    }

    if (level >= 3 && blueStars.length === 0 && ship.blueStarTimer <= 0) {
        blueStarSpawnTimer -= dt;
        if (blueStarSpawnTimer <= 0) {
            if (Math.random() < 0.025) {
                spawnBlueStar();
            }
            blueStarSpawnTimer = randomBetween(1, 2);
        }
    }

    for (let i = blueStars.length - 1; i >= 0; i--) {
        const blueStar = blueStars[i];
        blueStar.bob += dt * 2.5;
        blueStar.x += blueStar.vx * dt;
        blueStar.y += blueStar.vy * dt;

        if (blueStar.y > canvas.height + blueStar.radius) {
            blueStars.splice(i, 1);
            continue;
        }

        if (Math.hypot(ship.x - blueStar.x, ship.y - blueStar.y) < ship.radius + blueStar.radius) {
            blueStars.splice(i, 1);
            recordQuestProgress('collect-stars');
            ship.blueStarTimer = 8;
            ship.invulnerable = Math.max(ship.invulnerable, 8);
            ship.energy = ship.maxEnergy;
            ship.locked = false;
            ship.absorptionHearts += 1;
            addBurst(blueStar.x, blueStar.y, '#38bdf8', 18, 180, 1, 2, 6);
            audio.playPickup();
        }
    }

    const bossTarget = getBossTarget();
    const bossPhase = score >= bossTarget;
    const difficultyLevel = getDifficultyLevel();
    spawnTimer -= dt;

    if (!bossSpawned && bossPhase) {
        bossSpawned = true;
        spawnEnemyShip();
    }

    if (!levelCleared) {
        const smallShips = enemyShips.filter(enemyShip => !enemyShip.isBoss).length;
        if (smallShips < 2) {
            smallShipSpawnTimer -= dt;
            if (smallShipSpawnTimer <= 0) {
                spawnSmallEnemyShip();
                smallShipSpawnTimer = randomBetween(6, 9);
            }
        }
    }

    if (bossSpawned && !enemyShips.some(enemyShip => enemyShip.isBoss) && score >= bossTarget && !levelCleared) {
        levelCleared = true;
        levelClearCooldown = 1;
        highestUnlockedLevel = Math.max(highestUnlockedLevel, Math.min(levelMapNodes.length, level + 1));
        levelRewardCoins = Math.floor(
            (75 + level * 25) * (1 + skillTreeLevels.coinScavenger * 0.15)
        );
        spaceCoins += levelRewardCoins;
        recordQuestProgress('clear-levels');
        saveAccountData().then(() => {
            levelRewardSaveFailed = false;
        }).catch(error => {
            levelRewardSaveFailed = true;
            console.error('Could not save account progress or space coins.', error);
        });
        audio.playLevelClear();
    }

    if (!bossSpawned && spawnTimer <= 0) {
        spawnComet();

        if (score >= 300 && blackHoles.length === 0 && Math.random() < 0.18) {
            spawnBlackHole();
        }

        const minDelay = Math.max(0.35, 1.2 - difficultyLevel * 0.12);
        const maxDelay = Math.max(0.5, 1.8 - difficultyLevel * 0.15);
        spawnTimer = randomBetween(minDelay, maxDelay);
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (bullet.beam) bullet.life -= dt;

        if (bullet.y < -20 || bullet.y > canvas.height + 30 || bullet.x < -30 || bullet.x > canvas.width + 30 || (bullet.beam && bullet.life <= 0)) {
            bullets.splice(i, 1);
            continue;
        }

        let bulletDestroyed = false;

        for (let j = enemyShips.length - 1; j >= 0; j--) {
            const enemyShip = enemyShips[j];

            if (bulletHitsTarget(bullet, enemyShip)) {
                if (bullet.beam) {
                    bullet.hitTargets.push(enemyShip);
                } else {
                    bullets.splice(i, 1);
                }
                enemyShip.health -= bullet.damage || 1;
                addBurst(enemyShip.x, enemyShip.y, '#f8fafc');

                if (bullet.explosive) {
                    triggerExplosion(enemyShip.x, enemyShip.y, 42);
                }

                if (enemyShip.health <= 0) {
                    enemyShips.splice(j, 1);
                    awardEnemyDefeat(enemyShip);
                    addBurst(enemyShip.x, enemyShip.y, '#fb923c', 8, 100, 0.5, 2, 4);
                    audio.playHit();
                    addScreenShake(enemyShip.isBoss ? 14 : 5, enemyShip.isBoss ? 0.45 : 0.15);
                    addHitstop(enemyShip.isBoss ? 0.14 : 0.04);
                }
                if (!bullet.beam) {
                    bulletDestroyed = true;
                    break;
                }
            }
        }

        if (bulletDestroyed) continue;

        for (let j = blackHoles.length - 1; j >= 0; j--) {
            const blackHole = blackHoles[j];

            if (bulletHitsTarget(bullet, blackHole)) {
                if (bullet.beam) {
                    bullet.hitTargets.push(blackHole);
                } else {
                    bullets.splice(i, 1);
                }
                blackHole.health -= bullet.damage || 1;
                addBurst(blackHole.x, blackHole.y, '#0f172a');

                if (bullet.explosive) {
                    triggerExplosion(blackHole.x, blackHole.y, 42);
                }

                if (blackHole.health <= 0) {
                    shockwaves.push({
                        x: blackHole.x,
                        y: blackHole.y,
                        radius: blackHole.radius,
                        startRadius: blackHole.radius,
                        previousRadius: 0,
                        maxRadius: Math.hypot(canvas.width, canvas.height),
                        life: 0.9,
                        maxLife: 0.9,
                        destroyComets: true,
                        cometScore: 25
                    });

                    for (let k = enemyShips.length - 1; k >= 0; k--) {
                        const enemyShip = enemyShips[k];
                        enemyShips.splice(k, 1);
                        awardEnemyDefeat(enemyShip);
                        addBurst(enemyShip.x, enemyShip.y, '#fb923c', 8, 100, 0.5, 2, 4);
                    }
                    enemyBullets.length = 0;

                    blackHoles.splice(j, 1);
                    recordQuestProgress('destroy-black-holes');
                    score += 100;
                    ship.lives = Math.min(ship.maxLives, ship.lives + 1);
                    addBurst(blackHole.x, blackHole.y, '#7c3aed');
                    audio.playExplosion();
                    addScreenShake(12, 0.4);
                    addHitstop(0.1);
                    updateScore();
                }
                if (!bullet.beam) {
                    bulletDestroyed = true;
                    break;
                }
            }
        }

        if (bulletDestroyed) continue;

        for (let j = comets.length - 1; j >= 0; j--) {
            const comet = comets[j];

            if (bulletHitsTarget(bullet, comet)) {
                if (bullet.beam) {
                    bullet.hitTargets.push(comet);
                } else {
                    bullets.splice(i, 1);
                }
                comets.splice(j, 1);
                recordQuestProgress('destroy-comets');
                score += 10;
                addBurst(comet.x, comet.y, comet.color);

                if (bullet.explosive) {
                    triggerExplosion(comet.x, comet.y, 34);
                    audio.playExplosion();
                }

                updateScore();
                if (!bullet.beam) break;
            }
        }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const enemyBullet = enemyBullets[i];
        enemyBullet.x += enemyBullet.vx * dt;
        enemyBullet.y += enemyBullet.vy * dt;

        if (enemyBullet.x < -20 || enemyBullet.x > canvas.width + 20 || enemyBullet.y < -20 || enemyBullet.y > canvas.height + 20) {
            enemyBullets.splice(i, 1);
            continue;
        }

        const dx = ship.x - enemyBullet.x;
        const dy = ship.y - enemyBullet.y;
        const distance = Math.hypot(dx, dy);

        if (distance < ship.radius + enemyBullet.radius) {
            enemyBullets.splice(i, 1);
            addBurst(ship.x, ship.y, '#ef4444');
            audio.playHit();

            damagePlayer(Math.min(maxEnemyHitDamage, (enemyBullet.damage || 1) * enemyDamageMultiplier));
            if (ship.phantomDashTimer <= 0) {
                if (enemyBullet.status === 'fire') applyFireStatus(2);
                if (enemyBullet.status === 'freeze') applyFreezeStatus(2.5);
            }

            if (ship.lives <= 0) {
                gameOver = true;
                gameOverFromDeath = true;
            }
        }
    }

    for (let i = enemyShips.length - 1; i >= 0; i--) {
        const enemyShip = enemyShips[i];
        enemyShip.cooldown -= dt;
        if ((enemyShip.syncLock || 0) > 0) enemyShip.syncLock -= dt;
        enemyShip.pulse += dt * 4;
        enemyShip.rotation = Math.atan2(ship.y - enemyShip.y, ship.x - enemyShip.x);

        const targetDir = Math.sign(ship.x - enemyShip.x);
        const chaseDirection = targetDir || enemyShip.direction || 1;
        if (enemyShip.type === 'neptune-wraith'
            || enemyShip.type === 'triton-phantom'
            || enemyShip.type === 'eris-stalker') {
            enemyShip.phaseTimer -= dt;
            enemyShip.dashTimer = Math.max(0, enemyShip.dashTimer - dt);
            if (enemyShip.phaseTimer <= 0) {
                enemyShip.direction = chaseDirection;
                enemyShip.dashTimer = enemyShip.type === 'eris-stalker' ? 0.8 : 0.65;
                enemyShip.phaseTimer = enemyShip.type === 'eris-stalker'
                    ? 2.2
                    : enemyShip.type === 'triton-phantom' ? 2.7 : 3.2;
            }
            const dashMultiplier = enemyShip.type === 'eris-stalker' ? 3.8 : 3;
            enemyShip.x += enemyShip.direction * enemyShip.moveSpeed * (enemyShip.dashTimer > 0 ? dashMultiplier : 1) * dt;
            enemyShip.y += Math.sin(enemyShip.pulse) * 26 * dt;
        } else if (enemyShip.type === 'titan-hunter') {
            enemyShip.phaseTimer -= dt;
            enemyShip.dashTimer = Math.max(0, enemyShip.dashTimer - dt);
            if (enemyShip.phaseTimer <= 0) {
                enemyShip.dashTimer = 0.55;
                enemyShip.phaseTimer = 2.8;
            }
            const dashMultiplier = enemyShip.dashTimer > 0 ? 2.7 : 1;
            enemyShip.x += chaseDirection * enemyShip.moveSpeed * dashMultiplier * dt;
            enemyShip.y += Math.sign(ship.y - enemyShip.y) * enemyShip.moveSpeed * 0.45 * dashMultiplier * dt;
        } else if (enemyShip.type === 'haumea-spinner') {
            enemyShip.x += Math.sin(enemyShip.pulse * 0.7) * enemyShip.moveSpeed * dt;
            enemyShip.y += Math.sin(enemyShip.pulse * 1.6) * 34 * dt;
        } else if (enemyShip.type === 'mercury-dart') {
            enemyShip.x += chaseDirection * enemyShip.moveSpeed * dt;
            enemyShip.y += enemyShip.moveSpeed * 0.45 * dt;
        } else if (enemyShip.isBoss) {
            // Boss: drift toward a standoff band around the player instead of
            // blindly tracking. Keeps horizontal coverage while staying at range.
            const standoffX = ship.x - Math.sign(ship.x - enemyShip.x || 1) * 170;
            enemyShip.x += Math.sign(standoffX - enemyShip.x) * enemyShip.moveSpeed * dt;
            enemyShip.y += Math.sign(ship.y - 80 - enemyShip.y) * enemyShip.moveSpeed * 0.4 * dt;
        } else {
            // Baseline: chase the player, but lighter ships swing wide for a
            // flanking arc instead of stacking on the same horizontal line.
            const flankers = ['mars-raider', 'mercury-dart', 'eris-stalker', 'titan-hunter', 'neptune-wraith', 'triton-phantom'];
            const isFlanker = flankers.includes(enemyShip.type);
            let moveDirection = chaseDirection;
            let moveSpeed = enemyShip.moveSpeed;

            const threatDirection = findBulletThreatDirection(enemyShip);
            if (threatDirection !== 0) {
                // Dodge: sidestep away from incoming player bullets.
                moveDirection = threatDirection;
                moveSpeed *= 1.7;
                enemyShip.dodgeTimer = 0.2;
            } else if ((enemyShip.dodgeTimer || 0) > 0) {
                enemyShip.dodgeTimer -= dt;
                moveDirection = enemyShip.lastDodgeDirection || moveDirection;
                moveSpeed *= 1.7;
            } else if (isFlanker) {
                // Flank: circle toward the player's side rather than shadowing
                // their exact x, so squads surround instead of lining up.
                const gap = ship.x - enemyShip.x;
                const desiredX = ship.x + (gap > 0 ? -1 : 1) * 130 * (enemyShip.flankSide || 1);
                moveDirection = Math.sign(desiredX - enemyShip.x) || chaseDirection;
            }
            enemyShip.lastDodgeDirection = moveDirection;

            enemyShip.x += moveDirection * moveSpeed * dt;
            enemyShip.x += Math.sin(enemyShip.pulse) * (isFlanker ? 34 : 14) * dt;
            enemyShip.y += Math.sign(ship.y - 60 - enemyShip.y) * enemyShip.moveSpeed * 0.25 * dt;
        }

        if (enemyShip.x < enemyShip.radius) enemyShip.x = enemyShip.radius;
        if (enemyShip.x > canvas.width - enemyShip.radius) enemyShip.x = canvas.width - enemyShip.radius;
        if (enemyShip.y < enemyShip.radius + 10) enemyShip.y = enemyShip.radius + 10;
        const maxEnemyY = ['mercury-dart', 'titan-hunter'].includes(enemyShip.type)
            ? canvas.height * 0.55
            : 120;
        if (enemyShip.y > maxEnemyY) {
            enemyShip.y = ['mercury-dart', 'titan-hunter'].includes(enemyShip.type) ? 55 : 120;
            enemyShip.direction *= -1;
        }

        if (enemyShip.cooldown <= 0) {
            const difficulty = getDifficultyLevel();
            // Path prediction: aim where the ship will be when the bullet arrives.
            // Bosses predict better and get stronger with difficulty; small ships
            // only lead their shots once the score pressure rises.
            const leadFactor = enemyShip.isBoss
                ? 0.75 + Math.min(0.25, difficulty * 0.12)
                : Math.min(0.55, 0.25 + difficulty * 0.2);
            const angle = predictInterceptAngle(enemyShip.x, enemyShip.y, enemyShip.bulletSpeed, leadFactor);
            const standardVolleys = {
                'mars-raider': [-0.16, 0.16],
                'saturn-warden': [-0.3, 0, 0.3],
                'ceres-bomber': [-0.24, 0, 0.24],
                'makemake-prism': [-0.4, -0.2, 0, 0.2, 0.4],
                'haumea-spinner': [-0.2, 0.2],
                'ganymede-guardian': [-0.34, 0, 0.34],
                'callisto-sentinel': [-0.5, -0.25, 0, 0.25, 0.5]
            };
            let volley = enemyShip.isBoss ? enemyShip.bossProfile.volley : standardVolleys[enemyShip.type] || [0];
            let patternRotation = 0;

            if (enemyShip.isBoss) {
                // Attack pattern cycling: spread volleys alternate between aimed
                // fan, sweeping arc and suppression wall, telegraphed by the
                // pattern index so the player can learn the rhythm.
                enemyShip.patternIndex = (enemyShip.patternIndex || 0) + 1;
                patternRotation = (enemyShip.patternIndex % 3) * 0.18 - 0.18;
                if (volley.length >= 5 && difficulty >= 1) {
                    // Wide volleys briefly tighten into an aimed burst.
                    volley = enemyShip.patternIndex % 3 === 0 ? [-0.2, -0.1, 0, 0.1, 0.2] : volley;
                }
            } else {
                synchronizeSquadVolley(enemyShip);
            }
            const standardBulletColors = {
                'saturn-warden': '#fbbf24',
                'neptune-wraith': '#67e8f9',
                'io-pyro': '#fb923c',
                'europa-cryo': '#93c5fd',
                'titan-hunter': '#bef264',
                'triton-phantom': '#a5f3fc',
                'ceres-bomber': '#fdba74',
                'eris-stalker': '#c084fc',
                'makemake-prism': '#f0abfc',
                'haumea-spinner': '#fda4af',
                'ganymede-guardian': '#fde68a',
                'callisto-sentinel': '#d8b4fe'
            };
            const bulletColor = enemyShip.isBoss
                ? enemyShip.bossProfile.color
                : standardBulletColors[enemyShip.type] || '#fca5a5';
            for (const offset of volley) {
                const shotAngle = angle + offset + patternRotation;
                enemyBullets.push({
                    x: enemyShip.x,
                    y: enemyShip.y + 14,
                    radius: ['saturn-warden', 'ceres-bomber', 'ganymede-guardian', 'callisto-sentinel'].includes(enemyShip.type) ? 7 : 5,
                    vx: Math.cos(shotAngle) * enemyShip.bulletSpeed,
                    vy: Math.sin(shotAngle) * enemyShip.bulletSpeed,
                    damage: enemyShip.damage,
                    color: bulletColor,
                    status: enemyShip.isBoss
                        ? enemyShip.bossProfile.status || null
                        : enemyShip.type === 'io-pyro'
                            ? 'fire'
                            : enemyShip.type === 'europa-cryo' ? 'freeze' : null
                });
            }
            enemyShip.cooldown = enemyShip.shotCooldown;
            if (enemyShip.syncLock > 0) enemyShip.syncLock -= 1;
        }

        const dx = ship.x - enemyShip.x;
        const dy = ship.y - enemyShip.y;
        const distance = Math.hypot(dx, dy);

        if (distance < ship.radius + enemyShip.radius) {
            if (ship.blueStarTimer > 0 || ship.phantomDashTimer > 0) continue;
            if (['neptune-wraith', 'triton-phantom', 'eris-stalker'].includes(enemyShip.type)
                && enemyShip.dashTimer > 0.3) continue;

            enemyShips.splice(i, 1);
            addBurst(ship.x, ship.y, '#f87171');
            audio.playHit();

            if (enemyShip.type === 'cold-scout') {
                applyFreezeStatus(2.5);
            }
            if (enemyShip.type === 'venus-scorcher') {
                applyFireStatus(2.0);
            }

            damagePlayer(Math.min(maxEnemyHitDamage, (enemyShip.damage || 1) * enemyDamageMultiplier));

            if (enemyShip.type === 'io-pyro' || (enemyShip.isBoss && enemyShip.bossProfile.status === 'fire')) applyFireStatus(2);
            if (enemyShip.type === 'europa-cryo' || (enemyShip.isBoss && enemyShip.bossProfile.status === 'freeze')) applyFreezeStatus(2.5);

            if (ship.lives <= 0) {
                gameOver = true;
                gameOverFromDeath = true;
            }
        }
    }

    for (let i = blackHoles.length - 1; i >= 0; i--) {
        const blackHole = blackHoles[i];

        blackHole.x += blackHole.vx * dt;
        blackHole.y += blackHole.vy * dt;
        blackHole.rotation += blackHole.spin * dt;
        blackHole.pulse += dt * 3;

        if (blackHole.x < -blackHole.radius || blackHole.x > canvas.width + blackHole.radius || blackHole.y > canvas.height + blackHole.radius) {
            blackHoles.splice(i, 1);
            continue;
        }

        let dx = ship.x - blackHole.x;
        let dy = ship.y - blackHole.y;
        let distance = Math.hypot(dx, dy);
        const sizeScale = blackHole.radius / 35;
        const gravityRadius = blackHole.radius * 7 + level * 18;

        if (distance > 0 && distance < gravityRadius) {
            const pullSpeed = (24 + level * 8) * sizeScale * (1 - distance / gravityRadius);
            ship.x -= (dx / distance) * pullSpeed * dt;
            ship.y -= (dy / distance) * pullSpeed * dt;
            ship.x = Math.max(ship.radius, Math.min(canvas.width - ship.radius, ship.x));
            ship.y = Math.max(ship.radius + 8, Math.min(canvas.height - ship.radius, ship.y));

            dx = ship.x - blackHole.x;
            dy = ship.y - blackHole.y;
            distance = Math.hypot(dx, dy);
        }

        if (distance < ship.radius + blackHole.radius) {
            if (ship.blueStarTimer > 0 || ship.phantomDashTimer > 0) continue;

            blackHoles.splice(i, 1);
            addBurst(ship.x, ship.y, '#7c3aed');
            audio.playHit();

            damagePlayer(1);

            if (ship.lives <= 0) {
                gameOver = true;
                gameOverFromDeath = true;
            }
        }
    }

    for (let i = comets.length - 1; i >= 0; i--) {
        const comet = comets[i];
        let orbitingBlackHole = blackHoles.includes(comet.orbitingBlackHole)
            ? comet.orbitingBlackHole
            : null;
        if (!orbitingBlackHole) {
            comet.orbitingBlackHole = null;
            let nearestDistance = Infinity;
            for (const blackHole of blackHoles) {
                const distanceToHole = Math.hypot(blackHole.x - comet.x, blackHole.y - comet.y);
                const influenceRadius = blackHole.radius * 7 + level * 18;
                if (distanceToHole < influenceRadius && distanceToHole < nearestDistance) {
                    orbitingBlackHole = blackHole;
                    nearestDistance = distanceToHole;
                }
            }
            if (orbitingBlackHole) {
                comet.orbitingBlackHole = orbitingBlackHole;
                comet.orbitAngle = Math.atan2(comet.y - orbitingBlackHole.y, comet.x - orbitingBlackHole.x);
                comet.orbitRadius = nearestDistance;
            }
        }

        if (orbitingBlackHole) {
            const sizeScale = orbitingBlackHole.radius / 35;
            comet.orbitAngle += (Math.sign(comet.spin) || 1) * 1.6 * sizeScale * dt;
            comet.orbitRadius = Math.max(
                orbitingBlackHole.radius + comet.radius * 0.35,
                comet.orbitRadius - 8 * sizeScale * dt
            );
            comet.x = orbitingBlackHole.x + Math.cos(comet.orbitAngle) * comet.orbitRadius;
            comet.y = orbitingBlackHole.y + Math.sin(comet.orbitAngle) * comet.orbitRadius;
        } else {
            comet.x += comet.vx * dt;
            comet.y += comet.vy * dt;
        }
        comet.rotation += comet.spin * dt;

        if (orbitingBlackHole
            && comet.orbitRadius <= orbitingBlackHole.radius + comet.radius * 0.35) {
            orbitingBlackHole.suckedComets += 1;
            addBurst(comet.x, comet.y, '#a78bfa', 8, 85, 0.45, 1, 3);
            comets.splice(i, 1);
            continue;
        }

        if (comet.x < -comet.radius || comet.x > canvas.width + comet.radius || comet.y > canvas.height + comet.radius) {
            comets.splice(i, 1);
            continue;
        }

        let hitEnemy = false;
        for (let j = enemyShips.length - 1; j >= 0; j--) {
            const enemyShip = enemyShips[j];
            if (Math.hypot(enemyShip.x - comet.x, enemyShip.y - comet.y) >= enemyShip.radius + comet.radius) continue;

            enemyShip.health -= 2;
            addBurst(enemyShip.x, enemyShip.y, comet.color, 10, 110, 0.55, 2, 4);
            comets.splice(i, 1);
            hitEnemy = true;
            if (enemyShip.health <= 0) {
                enemyShips.splice(j, 1);
                awardEnemyDefeat(enemyShip);
                addBurst(enemyShip.x, enemyShip.y, '#fb923c', 8, 100, 0.5, 2, 4);
                audio.playHit();
            }
            break;
        }
        if (hitEnemy) continue;

        const dx = ship.x - comet.x;
        const dy = ship.y - comet.y;
        const distance = Math.hypot(dx, dy);

        if (distance < ship.radius + comet.radius) {
            if (ship.phantomDashTimer > 0 && ship.blueStarTimer <= 0) continue;
            comets.splice(i, 1);
            if (ship.blueStarTimer > 0) {
                score += 10;
                addBurst(comet.x, comet.y, comet.color);
                updateScore();
                continue;
            }

            addBurst(ship.x, ship.y, '#ff6b6b');
            audio.playHit();

            damagePlayer(1);

            if (ship.lives <= 0) {
                gameOver = true;
                gameOverFromDeath = true;
            }
        }
    }

    for (let i = 0; i < comets.length; i++) {
        for (let j = i + 1; j < comets.length; j++) {
            const first = comets[i];
            const second = comets[j];
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distance = Math.hypot(dx, dy);
            const minDistance = first.radius + second.radius;

            if (distance >= minDistance) continue;

            const nx = distance === 0 ? 1 : dx / distance;
            const ny = distance === 0 ? 0 : dy / distance;
            const overlap = minDistance - distance;
            first.x -= nx * overlap / 2;
            first.y -= ny * overlap / 2;
            second.x += nx * overlap / 2;
            second.y += ny * overlap / 2;

            const relativeVelocity = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
            if (relativeVelocity < 0) {
                const impulse = -relativeVelocity * 0.35;
                first.vx -= impulse * nx;
                first.vy -= impulse * ny;
                second.vx += impulse * nx;
                second.vy += impulse * ny;
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;

        if (particle.life <= 0) {
            particles.splice(i, 1);
        }
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const shockwave = shockwaves[i];
        const previousRadius = shockwave.previousRadius ?? shockwave.radius;
        shockwave.previousRadius = shockwave.radius;
        shockwave.life -= dt;
        const progress = 1 - shockwave.life / shockwave.maxLife;
        shockwave.radius = shockwave.startRadius + (shockwave.maxRadius - shockwave.startRadius) * progress;

        if (shockwave.destroyComets) {
            for (let j = comets.length - 1; j >= 0; j--) {
                const comet = comets[j];
                const distance = Math.hypot(comet.x - shockwave.x, comet.y - shockwave.y);
                if (distance + comet.radius < previousRadius || distance - comet.radius > shockwave.radius) continue;

                comets.splice(j, 1);
                recordQuestProgress('destroy-comets');
                score += shockwave.cometScore;
                addBurst(comet.x, comet.y, comet.color);
                updateScore();
            }
        }

        if (shockwave.destroyBlackHoles) {
            for (let j = blackHoles.length - 1; j >= 0; j--) {
                const blackHole = blackHoles[j];
                const distance = Math.hypot(blackHole.x - shockwave.x, blackHole.y - shockwave.y);
                if (shockwave.hitBlackHoles.includes(blackHole)
                    || distance + blackHole.radius < previousRadius
                    || distance - blackHole.radius > shockwave.radius) continue;

                shockwave.hitBlackHoles.push(blackHole);
                blackHole.health -= shockwave.blackHoleDamage;
                addBurst(blackHole.x, blackHole.y, '#a78bfa');
                if (shockwave.fullWipe || blackHole.health <= 0) {
                    blackHoles.splice(j, 1);
                    recordQuestProgress('destroy-black-holes');
                    score += 100;
                    updateScore();
                }
            }
        }

        if (shockwave.life <= 0) {
            shockwaves.splice(i, 1);
        }
    }
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#020817');
    gradient.addColorStop(1, '#111827');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
        ctx.save();
        ctx.shadowColor = '#bfdbfe';
        ctx.shadowBlur = star.radius > 1.5 ? 8 : 3;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawReflectiveFinish(accentColor) {
    ctx.save();
    ctx.clip();
    const reflection = ctx.createLinearGradient(-18, -24, 16, 12);
    reflection.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    reflection.addColorStop(0.28, 'rgba(255, 255, 255, 0.32)');
    reflection.addColorStop(0.55, 'rgba(255, 255, 255, 0.02)');
    reflection.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = reflection;
    ctx.fillRect(-24, -30, 48, 48);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -15);
    ctx.lineTo(-2, -20);
    ctx.lineTo(5, -19);
    ctx.stroke();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 4);
    ctx.lineTo(-4, 8);
    ctx.lineTo(4, 8);
    ctx.stroke();
    ctx.restore();
}

function drawShip() {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    const skin = getActiveSkin();

    if (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }

    if (ship.phantomDashTimer > 0) {
        ctx.globalAlpha *= 0.55;
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 2, 26, 34, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (const side of [-1, 1]) {
            ctx.strokeStyle = 'rgba(196, 181, 253, 0.8)';
            ctx.beginPath();
            ctx.moveTo(side * 9, 17);
            ctx.lineTo(side * 13, 27);
            ctx.lineTo(side * 8, 36);
            ctx.stroke();
        }
    }

    if (ship.starMagnet) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (ship.explosiveShot) {
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 2, 12, 0, Math.PI * 2);
        ctx.stroke();
    }

    traceShipHull(skin.shape);
    const hullGradient = ctx.createLinearGradient(-16, -8, 16, 14);
    hullGradient.addColorStop(0, skin.colors[0]);
    hullGradient.addColorStop(0.3, skin.colors[1]);
    hullGradient.addColorStop(0.68, skin.colors[2]);
    hullGradient.addColorStop(1, skin.colors[3]);
    ctx.fillStyle = hullGradient;
    ctx.fill();
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawReflectiveFinish(skin.outline);

    const canopyGradient = ctx.createLinearGradient(-5, 10, 5, 22);
    canopyGradient.addColorStop(0, skin.canopy[0]);
    canopyGradient.addColorStop(0.35, skin.canopy[1]);
    canopyGradient.addColorStop(1, skin.canopy[2]);
    ctx.fillStyle = canopyGradient;
    ctx.fillRect(-5, 10, 10, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(-3, 11, 2, 5);

    if (skillTreeLevels.thrusters > 0) {
        for (const thrusterX of [-11, 11]) {
            const exhaust = ctx.createLinearGradient(thrusterX, 19, thrusterX, 32);
            exhaust.addColorStop(0, skin.exhaust[0]);
            exhaust.addColorStop(0.45, skin.exhaust[1]);
            exhaust.addColorStop(1, 'rgba(37, 99, 235, 0)');
            ctx.fillStyle = exhaust;
            ctx.beginPath();
            ctx.moveTo(thrusterX - 3, 19);
            ctx.lineTo(thrusterX, 32);
            ctx.lineTo(thrusterX + 3, 19);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = skin.colors[2];
            ctx.fillRect(thrusterX - 3, 13, 6, 9);
            ctx.strokeStyle = skin.outline;
            ctx.lineWidth = 1;
            ctx.strokeRect(thrusterX - 3, 13, 6, 9);
            ctx.fillStyle = skin.canopy[1];
            ctx.fillRect(thrusterX - 1, 18, 2, 4);
        }
    }

    if (ship.multishotLevel > 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-26, 4, 8, 16);
        ctx.fillRect(18, 4, 8, 16);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-30, 10, 6, 6);
        ctx.fillRect(24, 10, 6, 6);
    }

    ctx.fillStyle = skin.exhaust[0];
    ctx.beginPath();
    ctx.moveTo(-6, 18);
    ctx.lineTo(0, 30);
    ctx.lineTo(6, 18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin.exhaust[1];
    ctx.beginPath();
    ctx.moveTo(-4, 20);
    ctx.lineTo(0, 32);
    ctx.lineTo(4, 20);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

}

function drawComet(comet) {
    ctx.save();
    ctx.translate(comet.x, comet.y);
    ctx.rotate(comet.rotation);

    ctx.beginPath();
    ctx.arc(0, 0, comet.radius, 0, Math.PI * 2);
    const rockGradient = ctx.createRadialGradient(
        -comet.radius * 0.35,
        -comet.radius * 0.4,
        comet.radius * 0.08,
        0,
        0,
        comet.radius
    );
    rockGradient.addColorStop(0, '#fef3c7');
    rockGradient.addColorStop(0.24, comet.color);
    rockGradient.addColorStop(1, '#292524');
    ctx.fillStyle = rockGradient;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, comet.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(28, 25, 23, 0.45)';
    ctx.beginPath();
    ctx.arc(-comet.radius * 0.3, -comet.radius * 0.15, comet.radius * 0.4, 0, Math.PI * 2);
    ctx.arc(comet.radius * 0.2, comet.radius * 0.25, comet.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 237, 213, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-comet.radius * 0.65, comet.radius * 0.2);
    ctx.lineTo(-comet.radius * 0.2, comet.radius * 0.05);
    ctx.lineTo(comet.radius * 0.05, comet.radius * 0.32);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(-comet.radius * 0.2, -comet.radius * 0.2, comet.radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

}

function drawBlackHole(blackHole) {
    const glow = 1 + Math.sin(blackHole.pulse) * 0.12;

    ctx.save();
    ctx.translate(blackHole.x, blackHole.y);
    ctx.rotate(blackHole.rotation);

    ctx.beginPath();
    ctx.fillStyle = '#020617';
    ctx.arc(0, 0, blackHole.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.lineWidth = 3;
    ctx.arc(0, 0, blackHole.radius * glow + 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.arc(0, 0, blackHole.radius * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#f8fafc';
    for (let i = 0; i < blackHole.maxHealth; i++) {
        const angle = (Math.PI * 2 * i) / blackHole.maxHealth - Math.PI / 2;
        const ringRadius = blackHole.radius + 16;
        const dotX = Math.cos(angle) * ringRadius;
        const dotY = Math.sin(angle) * ringRadius;
        const isActive = i < blackHole.health;
        ctx.beginPath();
        ctx.fillStyle = isActive ? '#f8fafc' : 'rgba(148,163,184,0.35)';
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawBullets() {
    for (const bullet of bullets) {
        if (bullet.beam) {
            ctx.save();
            const baseWidth = bullet.radius * 0.55;
            const tipWidth = baseWidth + Math.hypot(bullet.x - bullet.originX, bullet.y - bullet.originY) * bullet.spread;
            const perpendicularX = -Math.sin(bullet.angle);
            const perpendicularY = Math.cos(bullet.angle);
            const baseLeftX = bullet.originX + perpendicularX * baseWidth;
            const baseLeftY = bullet.originY + perpendicularY * baseWidth;
            const baseRightX = bullet.originX - perpendicularX * baseWidth;
            const baseRightY = bullet.originY - perpendicularY * baseWidth;
            const tipLeftX = bullet.x + perpendicularX * tipWidth;
            const tipLeftY = bullet.y + perpendicularY * tipWidth;
            const tipRightX = bullet.x - perpendicularX * tipWidth;
            const tipRightY = bullet.y - perpendicularY * tipWidth;
            ctx.fillStyle = bullet.fillColor;
            ctx.shadowColor = bullet.color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(baseLeftX, baseLeftY);
            ctx.lineTo(tipLeftX, tipLeftY);
            ctx.lineTo(tipRightX, tipRightY);
            ctx.lineTo(baseRightX, baseRightY);
            ctx.closePath();
            ctx.shadowBlur = 0;
            ctx.fill();

            ctx.fillStyle = bullet.coreColor;
            ctx.beginPath();
            ctx.moveTo(bullet.originX + perpendicularX * baseWidth * 0.35, bullet.originY + perpendicularY * baseWidth * 0.35);
            ctx.lineTo(bullet.x + perpendicularX * tipWidth * 0.35, bullet.y + perpendicularY * tipWidth * 0.35);
            ctx.lineTo(bullet.x - perpendicularX * tipWidth * 0.35, bullet.y - perpendicularY * tipWidth * 0.35);
            ctx.lineTo(bullet.originX - perpendicularX * baseWidth * 0.35, bullet.originY - perpendicularY * baseWidth * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            continue;
        }

        ctx.beginPath();
        ctx.fillStyle = bullet.skinColor || '#f8fafc';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawBonusStar(star) {
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(star.bob);

    ctx.fillStyle = star.color || '#facc15';
    ctx.shadowColor = star.color || '#facc15';
    ctx.shadowBlur = star.glow ? 20 : 0;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const outerX = Math.cos(angle) * (star.radius + 4);
        const outerY = Math.sin(angle) * (star.radius + 4);
        if (i === 0) {
            ctx.moveTo(outerX, outerY);
        } else {
            ctx.lineTo(outerX, outerY);
        }

        const innerAngle = angle + Math.PI / 10;
        const innerX = Math.cos(innerAngle) * (star.radius * 0.5);
        const innerY = Math.sin(innerAngle) * (star.radius * 0.5);
        ctx.lineTo(innerX, innerY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

function drawParticles() {
    for (const particle of particles) {
        ctx.beginPath();
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function drawShockwaves() {
    for (const shockwave of shockwaves) {
        const fade = shockwave.life / shockwave.maxLife;
        ctx.save();
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 7 * fade + 2;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(shockwave.x, shockwave.y, shockwave.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

function drawLevelPlanet(node, selected) {
    const radius = 25;

    ctx.save();
    ctx.translate(node.x, node.y);

    if (['jupiter', 'saturn', 'titan', 'haumea'].includes(node.type)) {
        ctx.strokeStyle = node.type === 'saturn' || node.type === 'titan'
            ? 'rgba(186, 230, 253, 0.8)'
            : 'rgba(226, 232, 240, 0.75)';
        ctx.lineWidth = node.type === 'saturn' || node.type === 'titan' ? 4 : 5;
        ctx.beginPath();
        ctx.ellipse(0, 2, node.type === 'saturn' || node.type === 'titan' ? 43 : 39, 12, node.type === 'saturn' ? 0.24 : -0.2, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.shadowColor = selected ? '#7dd3fc' : 'rgba(148, 163, 184, 0.5)';
    ctx.shadowBlur = selected ? 24 : 9;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();

    const palettes = {
        earth: ['#38bdf8', '#075985'],
        mars: ['#fca57a', '#9f341f'],
        mercury: ['#d1d5db', '#4b5563'],
        venus: ['#fde68a', '#c2410c'],
        jupiter: ['#f6d7a7', '#9a5534'],
        saturn: ['#fcd9a5', '#9a673e'],
        uranus: ['#a5f3fc', '#0e7490'],
        neptune: ['#60a5fa', '#1e3a8a'],
        pluto: ['#e7c7a5', '#704b3b'],
        kepler: ['#c4b5fd', '#5b21b6'],
        io: ['#fbbf24', '#9a3412'],
        europa: ['#e0f2fe', '#2563eb'],
        titan: ['#fdba74', '#78350f'],
        triton: ['#bae6fd', '#1d4ed8'],
        ceres: ['#d6d3d1', '#57534e'],
        eris: ['#e9d5ff', '#581c87'],
        makemake: ['#fecaca', '#991b1b'],
        haumea: ['#f5d0fe', '#7e22ce'],
        ganymede: ['#cbd5e1', '#334155'],
        callisto: ['#c4b5a5', '#44403c']
    };
    const gradient = ctx.createRadialGradient(-10, -12, 2, 4, 5, radius + 8);
    gradient.addColorStop(0, palettes[node.type][0]);
    gradient.addColorStop(1, palettes[node.type][1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

    if (node.type === 'earth') {
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.moveTo(-22, -10);
        ctx.lineTo(-9, -18);
        ctx.lineTo(-3, -11);
        ctx.lineTo(-6, -3);
        ctx.lineTo(-14, 1);
        ctx.lineTo(-18, 12);
        ctx.lineTo(-23, 5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(4, 2);
        ctx.lineTo(13, -2);
        ctx.lineTo(21, 2);
        ctx.lineTo(17, 9);
        ctx.lineTo(9, 15);
        ctx.lineTo(5, 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -7, 19, 3, -0.2, 0, Math.PI * 2);
        ctx.stroke();
    } else if (['mars', 'mercury', 'pluto', 'ceres', 'eris', 'callisto'].includes(node.type)) {
        const craterColor = node.type === 'mars'
            ? 'rgba(92, 32, 24, 0.45)'
            : node.type === 'pluto' || node.type === 'callisto'
                ? 'rgba(70, 45, 40, 0.45)'
                : 'rgba(31, 41, 55, 0.45)';
        ctx.fillStyle = craterColor;
        for (const crater of [[-11, -8, 5], [8, -13, 3], [12, 6, 6], [-5, 12, 4]]) {
            ctx.beginPath();
            ctx.arc(crater[0], crater[1], crater[2], 0, Math.PI * 2);
            ctx.fill();
        }
        if (node.type === 'mars' || node.type === 'pluto' || node.type === 'eris') {
            ctx.fillStyle = 'rgba(255, 220, 190, 0.75)';
            ctx.beginPath();
            ctx.ellipse(0, -20, 14, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        const stripeColor = node.type === 'venus'
            ? 'rgba(255, 237, 170, 0.55)'
            : node.type === 'uranus' ? 'rgba(207, 250, 254, 0.5)'
                : node.type === 'neptune' ? 'rgba(191, 219, 254, 0.55)'
                    : node.type === 'kepler' ? 'rgba(221, 214, 254, 0.55)'
                        : 'rgba(255, 242, 215, 0.7)';
        ctx.fillStyle = stripeColor;
        for (const stripe of [-15, -7, 2, 11, 19]) {
            ctx.beginPath();
            ctx.ellipse(0, stripe, radius, 3.5, node.type === 'venus' ? -0.12 : 0.08, 0, Math.PI * 2);
            ctx.fill();
        }
        if (node.type === 'io' || node.type === 'makemake') {
            ctx.fillStyle = node.type === 'io' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(248, 113, 113, 0.7)';
            for (const spot of [[-9, -5, 4], [11, -11, 3], [8, 9, 5]]) {
                ctx.beginPath();
                ctx.arc(spot[0], spot[1], spot[2], 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (node.type === 'jupiter') {
            ctx.fillStyle = '#c65f3d';
            ctx.beginPath();
            ctx.ellipse(8, 5, 7, 4, -0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (node.type === 'kepler') {
            ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
            ctx.beginPath();
            ctx.arc(8, -5, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
    ctx.strokeStyle = selected ? '#e0f2fe' : 'rgba(203, 213, 225, 0.8)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawSpaceCoinBalance() {
    ctx.save();
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#bbf7d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(35, 38, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(35, 38, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#052e16';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 35, 38);
    ctx.fillStyle = '#bbf7d0';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`SPACE COINS: ${spaceCoins}`, 55, 41);
    ctx.restore();
}

function drawMenuButton(rect, label, hint = '') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + (hint ? -4 : 4));
    if (hint) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(hint, rect.x + rect.width / 2, rect.y + rect.height / 2 + 17);
    }
}

function getHubButtonRects() {
    return [
        { x: 180, y: 139, width: 351, height: 48 },
        { x: 180, y: 195, width: 351, height: 48 },
        { x: 180, y: 251, width: 351, height: 48 },
        { x: 180, y: 307, width: 351, height: 48 }
    ];
}

function drawHomeScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);
    drawSpaceCoinBalance();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE ARCADE', 355.5, 105);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(`PILOT ${currentAccount?.username || ''}`, 355.5, 130);
    const [levelsButton, skillsButton, codexButton, skinsButton] = getHubButtonRects();
    drawMenuButton(levelsButton, 'LEVEL SELECT', 'PRESS 1');
    drawMenuButton(skillsButton, 'SKILL TREE', 'PRESS 2');
    drawMenuButton(codexButton, 'ENEMY CODEX', 'PRESS 3');
    drawMenuButton(skinsButton, 'SHIP SKINS', 'PRESS 4');
    ctx.textAlign = 'left';
    ctx.restore();
}

function getSkinCardRect(index) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    return { x: 35 + column * 326, y: 112 + row * 78, width: 310, height: 68 };
}

function traceShipHull(shape) {
    ctx.beginPath();
    if (shape === 'dart') {
        ctx.moveTo(0, -25);
        ctx.lineTo(11, 14);
        ctx.lineTo(0, 10);
        ctx.lineTo(-11, 14);
    } else if (shape === 'wing') {
        ctx.moveTo(0, -20);
        ctx.lineTo(21, 17);
        ctx.lineTo(5, 12);
        ctx.lineTo(0, 20);
        ctx.lineTo(-5, 12);
        ctx.lineTo(-21, 17);
    } else if (shape === 'heavy') {
        ctx.moveTo(0, -21);
        ctx.lineTo(18, -5);
        ctx.lineTo(18, 15);
        ctx.lineTo(5, 12);
        ctx.lineTo(0, 20);
        ctx.lineTo(-5, 12);
        ctx.lineTo(-18, 15);
        ctx.lineTo(-18, -5);
    } else if (shape === 'crystal') {
        ctx.moveTo(0, -25);
        ctx.lineTo(13, 4);
        ctx.lineTo(9, 18);
        ctx.lineTo(0, 13);
        ctx.lineTo(-9, 18);
        ctx.lineTo(-13, 4);
    } else if (shape === 'phantom') {
        ctx.moveTo(0, -24);
        ctx.lineTo(13, 15);
        ctx.lineTo(5, 11);
        ctx.lineTo(0, 20);
        ctx.lineTo(-5, 11);
        ctx.lineTo(-13, 15);
    } else {
        ctx.moveTo(0, -22);
        ctx.lineTo(16, 18);
        ctx.lineTo(0, 10);
        ctx.lineTo(-16, 18);
    }
    ctx.closePath();
}

function drawShipSkinPreview(skin, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.72, 0.72);
    traceShipHull(skin.shape);
    const gradient = ctx.createLinearGradient(-16, -8, 16, 14);
    gradient.addColorStop(0, skin.colors[0]);
    gradient.addColorStop(0.3, skin.colors[1]);
    gradient.addColorStop(0.68, skin.colors[2]);
    gradient.addColorStop(1, skin.colors[3]);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function drawSkinShopScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);
    drawSpaceCoinBalance();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHIP SKINS', 355.5, 76);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('BUY WITH SPACE COINS - COSMETIC ONLY', 355.5, 94);
    drawMenuButton(getQuestShopButton(), 'QUESTS');
    drawMenuButton(getSkillTreeBackButton(), 'BACK');

    for (const [index, skin] of shipSkins.entries()) {
        const rect = getSkinCardRect(index);
        const owned = ownedShipSkins.includes(skin.id);
        const equipped = activeShipSkin === skin.id;
        ctx.fillStyle = equipped ? 'rgba(30, 64, 75, 0.92)' : 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = equipped ? '#34d399' : '#475569';
        ctx.lineWidth = equipped ? 2 : 1;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        drawShipSkinPreview(skin, rect.x + 34, rect.y + 35);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#f8fafc';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(skin.name, rect.x + 62, rect.y + 27);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText(skin.description, rect.x + 62, rect.y + 45);
        ctx.textAlign = 'right';
        ctx.fillStyle = equipped ? '#6ee7b7' : owned ? '#7dd3fc' : '#fde68a';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `BUY ${skin.cost}`, rect.x + rect.width - 10, rect.y + 38);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = skinShopMessage.includes('FAILED') || skinShopMessage.includes('NOT ENOUGH')
        ? '#fca5a5'
        : '#86efac';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(skinShopMessage, 355.5, 359);
    ctx.restore();
}

function getQuestShopButton() {
    return { x: 365, y: 16, width: 150, height: 34 };
}

function getQuestCardRect(index) {
    return { x: 70, y: 112 + index * 82, width: 571, height: 70 };
}

function drawQuestScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);
    drawSpaceCoinBalance();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QUESTS', 355.5, 76);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('COMPLETE QUESTS, THEN CLICK TO CLAIM YOUR COINS', 355.5, 94);
    drawMenuButton(getSkillTreeBackButton(), 'SHOP');

    for (const [index, quest] of activeQuests.entries()) {
        const definition = questTypes.find(entry => entry.id === quest.type);
        const rect = getQuestCardRect(index);
        const completed = quest.progress >= quest.target;
        ctx.fillStyle = completed ? 'rgba(20, 83, 45, 0.88)' : 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = completed ? '#4ade80' : '#475569';
        ctx.lineWidth = completed ? 2 : 1;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#f8fafc';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(definition.label, rect.x + 16, rect.y + 24);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(`${quest.progress} / ${quest.target} ${definition.action}`, rect.x + 16, rect.y + 44);

        const bar = { x: rect.x + 16, y: rect.y + 53, width: 330, height: 7 };
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
        ctx.fillStyle = completed ? '#4ade80' : '#38bdf8';
        ctx.fillRect(bar.x, bar.y, bar.width * quest.progress / quest.target, bar.height);

        ctx.textAlign = 'right';
        ctx.fillStyle = completed ? '#86efac' : '#fde68a';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(
            completed ? `CLAIM +${quest.reward}` : `REWARD ${quest.reward}`,
            rect.x + rect.width - 14,
            rect.y + 39
        );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = questMessage.includes('FAILED') || questMessage.includes('COULD NOT')
        ? '#fca5a5'
        : '#86efac';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(questMessage, 355.5, 368);
    ctx.restore();
}

function getCodexPageButtons() {
    return {
        previous: { x: 165, y: 347, width: 75, height: 32 },
        next: { x: 471, y: 347, width: 75, height: 32 }
    };
}

function getCodexEntryRect(index) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    return { x: 35 + column * 326, y: 116 + row * 75, width: 310, height: 64 };
}

function drawPlanetBossDetails(profile, pulse = 0) {
    ctx.save();
    ctx.strokeStyle = profile.color;
    ctx.fillStyle = profile.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = profile.color;
    ctx.shadowBlur = 8;

    if (profile.appearance === 'ice') {
        for (let index = -2; index <= 2; index++) {
            const x = index * 9;
            const length = 7 + (2 - Math.abs(index)) * 3;
            ctx.beginPath();
            ctx.moveTo(x - 4, -20);
            ctx.lineTo(x, -20 - length);
            ctx.lineTo(x + 4, -20);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + 3, 12);
            ctx.lineTo(x, 19 + length * 0.45);
            ctx.lineTo(x - 3, 12);
            ctx.stroke();
        }
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-13, -9);
        ctx.lineTo(-5, -2);
        ctx.lineTo(-10, 5);
        ctx.moveTo(12, -8);
        ctx.lineTo(5, -1);
        ctx.lineTo(10, 6);
        ctx.moveTo(-5, -2);
        ctx.lineTo(2, -8);
        ctx.stroke();
    } else if (profile.appearance === 'ghost') {
        ctx.globalAlpha *= 0.5;
        for (const offset of [-7, 7]) {
            ctx.beginPath();
            ctx.moveTo(offset, -27);
            ctx.lineTo(offset + 20, 14);
            ctx.lineTo(offset + 8, 8);
            ctx.lineTo(offset, 17);
            ctx.lineTo(offset - 8, 8);
            ctx.lineTo(offset - 20, 14);
            ctx.closePath();
            ctx.stroke();
        }
        ctx.globalAlpha *= 2;
        ctx.lineWidth = 1.5;
        for (const x of [-17, 17]) {
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.quadraticCurveTo(x + Math.sin(pulse) * 4, 29, x * 0.6, 35);
            ctx.stroke();
        }
    } else if (profile.appearance === 'flora') {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 7, -8);
            ctx.quadraticCurveTo(side * 26, -28, side * 27, -12);
            ctx.quadraticCurveTo(side * 18, -5, side * 7, 1);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(side * 10, 7);
            ctx.quadraticCurveTo(side * 24, 18, side * 19, 27);
            ctx.stroke();
        }
    } else if (profile.appearance === 'solar') {
        ctx.beginPath();
        ctx.ellipse(0, 1, 37, 12, -0.2, 0, Math.PI * 2);
        ctx.stroke();
        for (let index = -2; index <= 2; index++) {
            const x = index * 12;
            ctx.beginPath();
            ctx.moveTo(x, -24);
            ctx.lineTo(x + Math.sin(pulse + index) * 3, -34);
            ctx.stroke();
        }
    } else if (profile.appearance === 'flame' || profile.appearance === 'magma') {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 9, 7);
            ctx.lineTo(side * 17, 18);
            ctx.lineTo(side * 23, 8);
            ctx.lineTo(side * 28, 24 + Math.sin(pulse + side) * 3);
            ctx.lineTo(side * 8, 18);
            ctx.closePath();
            ctx.fill();
        }
        if (profile.appearance === 'magma') {
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-11, -8);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-8, 8);
            ctx.moveTo(12, -11);
            ctx.lineTo(5, -3);
            ctx.lineTo(10, 5);
            ctx.stroke();
        }
    } else if (profile.appearance === 'storm') {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 16, -21);
            ctx.lineTo(side * 28, -29);
            ctx.lineTo(side * 22, -12);
            ctx.lineTo(side * 34, -17);
            ctx.lineTo(side * 18, 5);
            ctx.stroke();
        }
    } else if (profile.appearance === 'rings' || profile.appearance === 'spinner') {
        ctx.save();
        ctx.rotate(profile.appearance === 'spinner' ? pulse * 0.2 : -0.18);
        ctx.beginPath();
        ctx.ellipse(0, 2, 39, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (profile.appearance === 'spinner') {
            for (let index = 0; index < 4; index++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -24);
                ctx.lineTo(0, -36);
                ctx.stroke();
            }
        }
        ctx.restore();
    } else if (profile.appearance === 'abyss' || profile.appearance === 'void') {
        ctx.beginPath();
        ctx.ellipse(0, 2, 34, 14, pulse * 0.08, Math.PI * 0.1, Math.PI * 1.85);
        ctx.stroke();
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(side * 27, -18, 3 + (side > 0 ? 1 : 0), 0, Math.PI * 2);
            ctx.fill();
        }
        if (profile.appearance === 'void') {
            ctx.strokeStyle = '#f5f3ff';
            ctx.beginPath();
            ctx.moveTo(-8, -18);
            ctx.lineTo(0, -6);
            ctx.lineTo(8, -18);
            ctx.stroke();
        }
    } else if (profile.appearance === 'stone' || profile.appearance === 'asteroid') {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-13, -15);
        ctx.lineTo(-23, -7);
        ctx.lineTo(-17, 7);
        ctx.lineTo(-8, 2);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(13, -15);
        ctx.lineTo(23, -7);
        ctx.lineTo(17, 7);
        ctx.lineTo(8, 2);
        ctx.closePath();
        ctx.stroke();
        if (profile.appearance === 'asteroid') {
            for (const [x, y, radius] of [[-28, -18, 3], [28, 17, 4], [0, -32, 2]]) {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (profile.appearance === 'toxic') {
        for (const [x, y, radius] of [[-27, -20, 3], [27, -17, 4], [-24, 17, 2], [26, 17, 3]]) {
            ctx.beginPath();
            ctx.arc(x + Math.sin(pulse + x) * 2, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(-17, -18);
        ctx.quadraticCurveTo(0, -32, 17, -18);
        ctx.stroke();
    } else if (profile.appearance === 'shadow') {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 11, -18);
            ctx.lineTo(side * 31, -31);
            ctx.lineTo(side * 24, -6);
            ctx.lineTo(side * 34, 4);
            ctx.lineTo(side * 12, 3);
            ctx.closePath();
            ctx.fill();
        }
    } else if (profile.appearance === 'prism') {
        ctx.strokeStyle = '#fff1f2';
        ctx.beginPath();
        ctx.moveTo(-14, -10);
        ctx.lineTo(-4, -20);
        ctx.lineTo(0, -3);
        ctx.closePath();
        ctx.moveTo(14, -10);
        ctx.lineTo(4, -20);
        ctx.lineTo(0, -3);
        ctx.closePath();
        ctx.stroke();
        for (const x of [-27, 27]) {
            ctx.beginPath();
            ctx.moveTo(x, -4);
            ctx.lineTo(x * 1.2, 8);
            ctx.lineTo(x, 19);
            ctx.stroke();
        }
    } else if (profile.appearance === 'armor' || profile.appearance === 'sentinel') {
        ctx.lineWidth = 3;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 9, -18);
            ctx.lineTo(side * 25, -14);
            ctx.lineTo(side * 31, 1);
            ctx.lineTo(side * 18, 9);
            ctx.stroke();
        }
        if (profile.appearance === 'sentinel') {
            ctx.beginPath();
            ctx.moveTo(0, -29);
            ctx.lineTo(0, -37);
            ctx.moveTo(-30, 0);
            ctx.lineTo(-37, 0);
            ctx.moveTo(30, 0);
            ctx.lineTo(37, 0);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawEnemyCodexScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);

    if (codexSelectedEntryId) {
        drawEnemyCodexDetailScreen();
        ctx.restore();
        return;
    }

    drawMenuButton(getSkillTreeBackButton(), 'BACK');
    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ENEMY CODEX', 355.5, 72);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('ENEMIES AND PLANET BOSSES', 355.5, 94);

    const pageCount = Math.ceil(enemyCodexEntries.length / codexEntriesPerPage);
    const entries = enemyCodexEntries.slice(
        codexPage * codexEntriesPerPage,
        (codexPage + 1) * codexEntriesPerPage
    );
    entries.forEach((entry, index) => {
        const rect = getCodexEntryRect(index);
        const { x, y, width, height } = rect;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = entry.id.startsWith('boss-') ? '#f97316' : '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, width, height);
        ctx.textAlign = 'left';
        ctx.fillStyle = entry.id.startsWith('boss-') ? '#fdba74' : '#7dd3fc';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(entry.name.toUpperCase(), x + 12, y + 23);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText(entry.description, x + 12, y + 44, 286);
    });

    const arrows = getCodexPageButtons();
    drawMenuButton(arrows.previous, 'PREV');
    drawMenuButton(arrows.next, 'NEXT');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`PAGE ${codexPage + 1} / ${pageCount}  •  ${enemyCodexEntries.length} ENTRIES`, 355.5, 367);
    ctx.textAlign = 'left';
    ctx.restore();
}

function drawCodexEnemyPortrait(entry, x, y) {
    const isBoss = entry.id.startsWith('boss-');
    const bossIndex = isBoss
        ? levelMapNodes.findIndex(node => `boss-${node.type}` === entry.id)
        : -1;
    const color = isBoss
        ? planetBossProfiles[bossIndex]?.color || '#f97316'
        : {
            'cold-scout': '#7dd3fc',
            'mars-raider': '#fb7c55',
            'venus-scorcher': '#f97316',
            'mercury-dart': '#cbd5e1',
            'saturn-warden': '#fbbf24',
            'neptune-wraith': '#67e8f9',
            'io-pyro': '#f97316',
            'europa-cryo': '#93c5fd',
            'titan-hunter': '#a3a34b',
            'triton-phantom': '#38bdf8',
            'ceres-bomber': '#a8a29e',
            'eris-stalker': '#c084fc',
            'makemake-prism': '#fb7185',
            'haumea-spinner': '#e879f9',
            'ganymede-guardian': '#94a3b8',
            'callisto-sentinel': '#a78bfa'
        }[entry.id] || '#e2e8f0';

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.7, 1.7);
    if (isBoss) {
        if (planetBossProfiles[bossIndex].appearance === 'ghost') ctx.globalAlpha = 0.58;
        ctx.strokeStyle = color;
        ctx.globalAlpha *= 0.75;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = isBoss && planetBossProfiles[bossIndex].appearance === 'ghost' ? 0.58 : 1;
    }
    if (entry.id === 'saturn-warden') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 3, 30, 10, -0.2, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (entry.id === 'cold-scout') {
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
    }
    const hullPoints = {
        'cold-scout': [[18, 16], [6, 8], [0, 18], [-6, 8], [-18, 16]],
        'venus-scorcher': [[20, 14], [9, 10], [0, 20], [-9, 10], [-20, 14]],
        'mars-raider': [[22, 12], [8, 10], [0, 19], [-8, 10], [-22, 12]],
        'mercury-dart': [[12, 12], [0, 7], [-12, 12]],
        'saturn-warden': [[24, 14], [13, 18], [0, 10], [-13, 18], [-24, 14]],
        'neptune-wraith': [[18, 10], [12, 19], [0, 12], [-12, 19], [-18, 10]],
        'triton-phantom': [[18, 10], [12, 19], [0, 12], [-12, 19], [-18, 10]],
        'io-pyro': [[23, 16], [8, 8], [4, 17], [0, 12], [-4, 17], [-8, 8], [-23, 16]],
        'europa-cryo': [[15, 12], [6, 7], [0, 21], [-6, 7], [-15, 12]],
        'titan-hunter': [[25, 17], [10, 11], [0, 16], [-10, 11], [-25, 17]],
        'eris-stalker': [[25, 17], [10, 11], [0, 16], [-10, 11], [-25, 17]],
        'ceres-bomber': [[25, 12], [18, 21], [0, 14], [-18, 21], [-25, 12]],
        'ganymede-guardian': [[25, 12], [18, 21], [0, 14], [-18, 21], [-25, 12]],
        'makemake-prism': [[20, 12], [6, 12], [0, 22], [-6, 12], [-20, 12]],
        'haumea-spinner': [[22, 14], [12, 8], [0, 18], [-12, 8], [-22, 14]],
        'callisto-sentinel': [[22, 14], [12, 8], [0, 18], [-12, 8], [-22, 14]]
    }[entry.id] || [[18, 16], [0, 8], [-18, 16]];

    ctx.beginPath();
    ctx.moveTo(0, -26);
    hullPoints.forEach(([pointX, pointY]) => ctx.lineTo(pointX, pointY));
    ctx.closePath();
    const hull = ctx.createLinearGradient(-24, -15, 24, 18);
    hull.addColorStop(0, '#ffffff');
    hull.addColorStop(0.24, color);
    hull.addColorStop(0.7, color);
    hull.addColorStop(1, '#1e293b');
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawReflectiveFinish(color);
    const cockpit = ctx.createLinearGradient(-6, 10, 6, 22);
    cockpit.addColorStop(0, '#ffffff');
    cockpit.addColorStop(0.35, ['neptune-wraith', 'triton-phantom'].includes(entry.id)
        ? '#cffafe'
        : ['cold-scout', 'europa-cryo'].includes(entry.id) ? '#dbeafe' : '#f87171');
    cockpit.addColorStop(1, '#0f172a');
    ctx.fillStyle = cockpit;
    ctx.fillRect(-6, 10, 12, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(-4, 11, 2, 5);
    ctx.fillStyle = entry.id === 'saturn-warden'
        ? '#f97316'
        : entry.id === 'venus-scorcher' ? '#fdba74' : '#facc15';
    ctx.beginPath();
    ctx.moveTo(-5, 18);
    ctx.lineTo(0, 30);
    ctx.lineTo(5, 18);
    ctx.closePath();
    ctx.fill();
    if (isBoss) drawPlanetBossDetails(planetBossProfiles[bossIndex]);
    ctx.restore();
}

function drawEnemyCodexDetailScreen() {
    const entry = enemyCodexEntries.find(item => item.id === codexSelectedEntryId);
    if (!entry) {
        codexSelectedEntryId = null;
        return;
    }
    const isBoss = entry.id.startsWith('boss-');
    const bossIndex = isBoss
        ? levelMapNodes.findIndex(node => `boss-${node.type}` === entry.id)
        : -1;
    const baseHealth = isBoss ? 12 : enemyTypeStats[entry.id].health;
    const baseDamage = (0.5 + 0.5) * enemyDamageMultiplier;
    const accent = isBoss ? planetBossProfiles[bossIndex].color : '#7dd3fc';

    drawMenuButton(getSkillTreeBackButton(), 'CODEX');
    ctx.fillStyle = '#f8fafc';
    ctx.font = '15px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(entry.name.toUpperCase(), 355.5, 70);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(35, 100, 641, 268);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(35, 100, 641, 268);

    drawCodexEnemyPortrait(entry, 150, 232);

    const textX = 260;
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('HEALTH', textX, 135);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(`BASE: ${baseHealth} HP  (LEVEL 1)`, textX, 155);
    ctx.fillText(`SCALING: ${baseHealth} x LEVEL`, textX, 173);

    ctx.fillStyle = accent;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('DAMAGE PER HIT', textX, 207);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(`BASE: ${baseDamage} HEARTS  (LEVEL 1)`, textX, 227);
    ctx.fillText('SCALING: (0.5 + LEVEL / 2) x 0.5', textX, 245);
    ctx.fillText('MAXIMUM: 2 HEARTS PER HIT', textX, 263);

    ctx.fillStyle = accent;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText(isBoss ? 'SPECIAL ATTACK' : 'SPECIAL ABILITY', textX, 297);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText(entry.description, textX, 318, 395);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Click CODEX or press ESC to return.', 355.5, 389);
    ctx.textAlign = 'left';
}

function drawLevelSelectionScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);
    drawSpaceCoinBalance();
    const backButton = getSkillTreeBackButton();
    drawMenuButton(backButton, 'BACK');

    ctx.fillStyle = '#f8fafc';
    ctx.font = '22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT LEVEL', 355.5, 90);

    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('CLICK A PLANET OR USE ARROW KEYS', 355.5, 120);

    const pageNodes = getVisibleLevelPageNodes();
    ctx.beginPath();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 3;
    ctx.moveTo(pageNodes[0].x, pageNodes[0].y);
    for (const node of pageNodes.slice(1)) {
        ctx.lineTo(node.x, node.y);
    }
    ctx.stroke();

    for (const node of pageNodes) {
        const locked = node.level > highestUnlockedLevel;
        const selected = node.level === level && !locked;
        ctx.save();
        if (locked) ctx.globalAlpha = 0.35;
        drawLevelPlanet(node, selected);
        ctx.restore();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText(node.name, node.x, node.y + 43);
        ctx.fillStyle = selected ? '#7dd3fc' : '#cbd5e1';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(node.risk, node.x, node.y + 55);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(`LEVEL ${node.level}`, node.x, node.y + 66);
        if (locked) {
            ctx.fillStyle = '#fca5a5';
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.fillText('LOCKED', node.x, node.y + 78);
        }
    }

    const pageCount = Math.ceil(levelMapNodes.length / levelsPerPage);
    const arrowButtons = getLevelPageArrowRects();
    drawMenuButton(arrowButtons.previous, '<<');
    drawMenuButton(arrowButtons.next, '>>');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`PAGE ${levelSelectionPage + 1} / ${pageCount}`, 355.5, 344);

    ctx.textAlign = 'left';
    ctx.restore();
}

function getLevelPageArrowRects() {
    return {
        previous: { x: 242, y: 323, width: 64, height: 34 },
        next: { x: 405, y: 323, width: 64, height: 34 }
    };
}

function getVisibleLevelPageNodes() {
    const pageStart = levelSelectionPage * levelsPerPage;
    return levelMapNodes
        .slice(pageStart, pageStart + levelsPerPage)
        .map((node, index) => ({
            ...node,
            x: 75 + index * 140,
            y: index % 2 === 0 ? 165 : 225
        }));
}

function getSkillTreeBackButton() {
    return { x: 536, y: 16, width: 150, height: 34 };
}

function getVisibleSkillNodes() {
    return skillNodes.filter(isSkillNodeVisible);
}

function getSkillTreeViewport() {
    return { x: 20, y: 104, width: 671, height: 268 };
}

function clampSkillTreePan() {
    const viewport = getSkillTreeViewport();
    const graphWidth = 1450;
    const graphHeight = 1700;
    skillTreePan.x = Math.max(0, Math.min(graphWidth - viewport.width, skillTreePan.x));
    skillTreePan.y = Math.max(0, Math.min(graphHeight - viewport.height, skillTreePan.y));
}

function drawSkillIcon(skillId, x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (skillId === 'extraLives') {
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.bezierCurveTo(-3, 7, -12, 1, -12, -5);
        ctx.bezierCurveTo(-12, -12, -3, -13, 0, -7);
        ctx.bezierCurveTo(3, -13, 12, -12, 12, -5);
        ctx.bezierCurveTo(12, 1, 3, 7, 0, 10);
        ctx.fill();
    } else if (skillId === 'maxEnergy') {
        ctx.beginPath();
        ctx.moveTo(2, -13);
        ctx.lineTo(-8, 1);
        ctx.lineTo(-1, 1);
        ctx.lineTo(-3, 13);
        ctx.lineTo(8, -3);
        ctx.lineTo(1, -3);
        ctx.closePath();
        ctx.fill();
    } else if (skillId === 'fireRate') {
        for (const offsetY of [-7, 0, 7]) {
            ctx.beginPath();
            ctx.moveTo(-12, offsetY);
            ctx.lineTo(-4, offsetY);
            ctx.moveTo(-1, offsetY - 2);
            ctx.lineTo(7, offsetY - 2);
            ctx.lineTo(11, offsetY);
            ctx.lineTo(7, offsetY + 2);
            ctx.lineTo(-1, offsetY + 2);
            ctx.closePath();
            ctx.fill();
        }
    } else if (skillId === 'multishot') {
        ctx.lineWidth = 3;
        for (const angle of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ctx.moveTo(Math.sin(angle) * 5, 7);
            ctx.lineTo(Math.sin(angle) * 13, -11);
            ctx.stroke();
        }
    } else if (skillId === 'damage') {
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(4, -8);
        ctx.lineTo(10, -10);
        ctx.lineTo(9, -4);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 4);
        ctx.lineTo(10, 10);
        ctx.lineTo(3, 8);
        ctx.lineTo(0, 14);
        ctx.lineTo(-4, 8);
        ctx.lineTo(-10, 10);
        ctx.lineTo(-8, 4);
        ctx.lineTo(-14, 0);
        ctx.lineTo(-8, -4);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-3, -8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
    } else if (skillId === 'beam' || skillId === 'beamChargeRate' || skillId === 'beamEnergyCost') {
        ctx.beginPath();
        ctx.moveTo(-13, -5);
        ctx.lineTo(5, -5);
        ctx.lineTo(10, -2);
        ctx.lineTo(10, 2);
        ctx.lineTo(5, 5);
        ctx.lineTo(-13, 5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-7, 5);
        ctx.lineTo(-3, 5);
        ctx.lineTo(-5, 11);
        ctx.lineTo(-9, 11);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(11, -3);
        ctx.lineTo(14, -5);
        ctx.moveTo(12, 0);
        ctx.lineTo(16, 0);
        ctx.moveTo(11, 3);
        ctx.lineTo(14, 5);
        ctx.stroke();
    } else if (skillId === 'selfDestruct' || skillId === 'selfDestructCharge') {
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(4, -8);
        ctx.lineTo(11, -10);
        ctx.lineTo(9, -3);
        ctx.lineTo(14, 1);
        ctx.lineTo(8, 5);
        ctx.lineTo(9, 11);
        ctx.lineTo(2, 8);
        ctx.lineTo(-2, 13);
        ctx.lineTo(-5, 7);
        ctx.lineTo(-12, 8);
        ctx.lineTo(-9, 1);
        ctx.lineTo(-13, -4);
        ctx.lineTo(-6, -7);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(5, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 2);
        ctx.stroke();
    } else if (skillId === 'thrusters') {
        for (const offsetX of [-6, 6]) {
            ctx.beginPath();
            ctx.moveTo(offsetX - 3, -9);
            ctx.lineTo(offsetX + 3, -9);
            ctx.lineTo(offsetX + 2, 3);
            ctx.lineTo(offsetX, 11);
            ctx.lineTo(offsetX - 2, 3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-6, 13);
        ctx.lineTo(0, 16);
        ctx.lineTo(6, 13);
        ctx.stroke();
    } else if (skillId === 'reactorOverdrive') {
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(2, -9);
        ctx.lineTo(-5, 1);
        ctx.lineTo(0, 1);
        ctx.lineTo(-2, 9);
        ctx.lineTo(6, -2);
        ctx.lineTo(1, -2);
        ctx.closePath();
        ctx.fill();
    } else if (skillId === 'shieldMatrix') {
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(12, -9);
        ctx.lineTo(10, 5);
        ctx.lineTo(0, 14);
        ctx.lineTo(-10, 5);
        ctx.lineTo(-12, -9);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-1, 4);
        ctx.lineTo(6, -4);
        ctx.stroke();
    } else if (skillId === 'starMagnetism') {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.stroke();
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 14, -9);
            ctx.lineTo(side * 8, -5);
            ctx.lineTo(side * 14, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(side * 14, 9);
            ctx.lineTo(side * 8, 5);
            ctx.lineTo(side * 14, 0);
            ctx.stroke();
        }
    } else if (skillId === 'comboDrive') {
        ctx.beginPath();
        ctx.arc(0, 0, 12, -Math.PI * 0.75, Math.PI * 0.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-9, -9);
        ctx.lineTo(-12, -2);
        ctx.lineTo(-4, -3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-3, -7);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, 3);
        ctx.stroke();
    } else if (skillId === 'coinScavenger') {
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 15px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
    } else if (skillId === 'phantomDash') {
        ctx.beginPath();
        ctx.moveTo(-13, -8);
        ctx.lineTo(-4, -8);
        ctx.lineTo(2, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(4, -6);
        ctx.moveTo(13, 8);
        ctx.lineTo(4, 8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-4, 6);
        ctx.stroke();
    }

    ctx.restore();
}

function drawSkillTreeScreen() {
    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);
    drawSpaceCoinBalance();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SKILL TREE', 355.5, 76);

    const backButton = getSkillTreeBackButton();
    drawMenuButton(backButton, 'BACK');
    const purchasedStarterSkills = starterSkillIds.filter(skillId =>
        skillNodes.some(node => node.skillId === skillId && node.rank === 1 && skillTreePurchasedNodes[node.id])
    ).length;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(
        `BUY START NODES TO REVEAL ADVANCED BRANCHES (${purchasedStarterSkills}/4)`,
        355.5,
        94
    );

    const viewport = getSkillTreeViewport();
    const visibleNodes = getVisibleSkillNodes();
    const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
    const visibleById = new Map(visibleNodes.map(node => [node.id, node]));
    skillTreeNodeRects.length = 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    ctx.clip();
    ctx.translate(viewport.x - skillTreePan.x, viewport.y - skillTreePan.y);

    for (const node of visibleNodes) {
        for (const parentId of node.parents) {
            if (!visibleNodeIds.has(parentId)) continue;
            const parent = visibleById.get(parentId);
            const edgeUnlocked = skillTreePurchasedNodes[parentId] && skillTreePurchasedNodes[node.id];
            const edgeAvailable = isSkillAvailable(node);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(parent.x, parent.y);
            ctx.lineTo(node.x, node.y);
            ctx.strokeStyle = edgeUnlocked ? '#4ade80' : edgeAvailable ? '#38bdf8' : '#334155';
            ctx.lineWidth = edgeUnlocked ? 3 : 2;
            if (!edgeAvailable && !edgeUnlocked) ctx.setLineDash([6, 6]);
            ctx.shadowColor = edgeUnlocked ? '#22c55e' : '#3b82f6';
            ctx.shadowBlur = edgeUnlocked ? 10 : 4;
            ctx.stroke();
            ctx.restore();
        }
    }

    for (const node of visibleNodes) {
        const skill = skillDefinitions.find(definition => definition.id === node.skillId);
        const purchased = skillTreePurchasedNodes[node.id];
        const available = isSkillAvailable(node);
        const radius = ['beam', 'selfDestruct', 'phantomDash'].includes(node.skillId) ? 28 : 24;
        const color = purchased ? '#22c55e' : available ? '#38bdf8' : '#475569';
        skillTreeNodeRects.push({
            nodeId: node.id,
            x: node.x,
            y: node.y,
            radius
        });

        ctx.save();
        ctx.globalAlpha = purchased || available ? 1 : 0.55;
        ctx.shadowColor = color;
        ctx.shadowBlur = available && !purchased ? 14 : 6;
        ctx.fillStyle = purchased ? 'rgba(20, 83, 45, 0.96)' : 'rgba(15, 23, 42, 0.96)';
        ctx.strokeStyle = color;
        ctx.lineWidth = purchased ? 3 : 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius - 6, 0, Math.PI * 2);
        ctx.strokeStyle = purchased ? 'rgba(134, 239, 172, 0.65)' : 'rgba(125, 211, 252, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        drawSkillIcon(node.skillId, node.x, node.y, purchased ? '#dcfce7' : '#e0f2fe');
        ctx.restore();

        ctx.globalAlpha = purchased || available ? 1 : 0.55;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f8fafc';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(`${skill.name.toUpperCase()} ${node.rank}`, node.x, node.y + radius + 14);
        ctx.fillStyle = purchased ? '#86efac' : available ? '#7dd3fc' : '#94a3b8';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(
            purchased ? 'OWNED' : available ? `${getSkillCost(node)} COINS` : 'LOCKED',
            node.x,
            node.y + radius + 25
        );
        ctx.globalAlpha = 1;
    }
    ctx.restore();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG / ARROW KEYS TO EXPLORE • EACH NODE CAN ONLY BE BOUGHT ONCE', 355.5, 386);
    ctx.fillStyle = skillTreeMessage.includes('FAILED') || skillTreeMessage.includes('NOT ENOUGH')
        || skillTreeMessage.includes('ALREADY') || skillTreeMessage.includes('FIRST')
        ? '#fca5a5'
        : '#86efac';
    if (skillTreeMessage) ctx.fillText(skillTreeMessage, 355.5, 398);
    ctx.textAlign = 'left';
    ctx.restore();
}

function drawLevelCompletedScreen() {
    if (!levelCleared) return;

    const menuTransform = getMenuTransform();
    ctx.save();
    ctx.translate(menuTransform.x, menuTransform.y);
    ctx.scale(menuTransform.scale, menuTransform.scale);

    const panelX = 105;
    const panelY = 110;
    const panelWidth = 501;
    const panelHeight = 180;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = '#60a5fa';
    ctx.strokeRect(panelX + 4, panelY + 4, panelWidth - 8, panelHeight - 8);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETED', 355.5, panelY + 35);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText(`+${levelRewardCoins} SPACE COINS`, 355.5, panelY + 83);
    ctx.fillStyle = levelRewardSaveFailed ? '#fca5a5' : '#cbd5e1';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText(
        levelRewardSaveFailed
            ? 'COULD NOT SAVE ACCOUNT DATA'
            : levelClearCooldown > 0
                ? 'CONTINUING...'
                : 'PRESS ANY KEY OR CLICK TO CONTINUE',
        355.5,
        panelY + 125
    );
    ctx.textAlign = 'left';
    ctx.restore();
}

function getMenuTransform() {
    const scale = Math.min(1, canvas.width / 711, canvas.height / 400);
    return {
        scale,
        x: (canvas.width - 711 * scale) / 2,
        y: (canvas.height - 400 * scale) / 2
    };
}

function drawHud() {
    const hudScale = Math.max(0.65, Math.min(canvas.height / 400, canvas.width / 360));
    const hudWidth = canvas.width / hudScale;
    const hudHeight = canvas.height / hudScale;
    const skin = getActiveSkin();
    ctx.save();
    ctx.scale(hudScale, hudScale);

    const barX = 18;
    const barY = 28;
    const barWidth = 150;
    const barHeight = 13;
    const filledWidth = (ship.energy / ship.maxEnergy) * barWidth;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    if (ship.locked || ship.energy < 10) {
        ctx.fillStyle = '#7f1d1d';
    } else if (ship.energy < 30) {
        ctx.fillStyle = '#f87171';
    } else {
        ctx.fillStyle = skin.beamColor;
    }

    ctx.fillRect(barX, barY, filledWidth, barHeight);

    if (ship.powerShotTimer > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.strokeRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('ENERGY', barX, barY - 8);

    if (ship.chargedBeam) {
        const chargeY = 54;
        const chargeProgress = ship.beamCharging
            ? Math.min(1, ship.beamCharge / ((ship.maxEnergy - 10) / 36))
            : 0;
        const chargeWidth = chargeProgress * barWidth;
        const chargeColor = chargeProgress < 0.5 ? '#3b82f6' : '#a855f7';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(barX, chargeY, barWidth, 8);
        ctx.fillStyle = chargeProgress < 0.5 ? skin.beamColor : '#a855f7';
        ctx.fillRect(barX, chargeY, chargeWidth, 8);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(barX, chargeY, barWidth, 8);
        ctx.fillStyle = chargeColor;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(ship.beamCharging ? `CHARGING ${Math.floor(chargeProgress * 100)}%` : 'BEAM', barX, chargeY + 22);
    }

    if (ship.blueStarTimer > 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = '8px "Press Start 2P", monospace';
        const starStatusY = ship.chargedBeam && ship.selfDestructUnlocked ? 112 : ship.chargedBeam ? 100 : 54;
        ctx.fillText(`STAR ${Math.ceil(ship.blueStarTimer)}s`, barX, starStatusY);
    }

    if (ship.frozenTimer > 0) {
        ctx.fillStyle = '#7dd3fc';
        ctx.font = '8px "Press Start 2P", monospace';
        const frozenStatusY = ship.selfDestructUnlocked
            ? ship.chargedBeam ? 130 : 112
            : ship.chargedBeam ? 130 : 88;
        ctx.fillText(`FROZEN ${ship.frozenTimer.toFixed(1)}s`, barX, frozenStatusY);
    }

    if (ship.fireTimer > 0) {
        ctx.fillStyle = '#f97316';
        ctx.font = '8px "Press Start 2P", monospace';
        const burningStatusY = ship.selfDestructUnlocked
            ? ship.chargedBeam ? 150 : 132
            : ship.chargedBeam ? 150 : 108;
        ctx.fillText(`BURNING ${ship.fireTimer.toFixed(1)}s`, barX, burningStatusY);
    }

    if (ship.selfDestructUnlocked) {
        const selfDestructY = ship.chargedBeam ? 88 : 78;
        const chargeProgress = Math.min(1, ship.selfDestructCharge / 3);
        const canFullWipe = ship.lives > getSelfDestructChargeStats().fullWipeHealthCost;
        ctx.fillStyle = ship.selfDestructCharging || !canFullWipe ? '#fca5a5' : '#f8fafc';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(
            ship.selfDestructCharging
                ? `SELF DESTRUCT ${ship.selfDestructCharge.toFixed(1)}/3`
                : canFullWipe ? 'HOLD R: SELF DESTRUCT' : 'LOW HP FOR FULL WIPE',
            barX,
            selfDestructY
        );
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(barX, selfDestructY + 7, barWidth, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(barX, selfDestructY + 7, chargeProgress * barWidth, 6);
    }

    const maxBaseLives = 3;
    const visibleLives = Math.min(ship.lives, maxBaseLives);
    const fullVisibleLives = Math.floor(visibleLives);

    const drawLifeIcon = (index, color, fraction = 1, isHeart = false) => {
        const x = 18 + index * 26;
        const top = hudHeight - 34;
        const bottom = hudHeight - 18;
        const drawShape = () => {
            ctx.beginPath();
            if (isHeart) {
                ctx.moveTo(x + 8, bottom);
                ctx.bezierCurveTo(x + 5, bottom - 3, x, top + 7, x, top + 5);
                ctx.bezierCurveTo(x, top - 1, x + 6, top - 2, x + 8, top + 3);
                ctx.bezierCurveTo(x + 10, top - 2, x + 16, top - 1, x + 16, top + 5);
                ctx.bezierCurveTo(x + 16, top + 7, x + 11, bottom - 3, x + 8, bottom);
            } else {
                ctx.moveTo(x, bottom);
                ctx.lineTo(x + 8, top);
                ctx.lineTo(x + 16, bottom);
            }
            ctx.closePath();
            ctx.fill();
        };

        ctx.fillStyle = '#475569';
        drawShape();
        if (fraction > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, top, 16 * fraction, bottom - top);
            ctx.clip();
            ctx.fillStyle = color;
            drawShape();
            ctx.restore();
        }
    };

    for (let i = 0; i < fullVisibleLives; i++) {
        drawLifeIcon(i, skin.lifeColor);
    }
    if (visibleLives > fullVisibleLives) {
        drawLifeIcon(fullVisibleLives, skin.lifeColor, visibleLives - fullVisibleLives);
    }

    const fullAbsorptionHearts = Math.floor(ship.absorptionHearts);
    for (let i = 0; i < fullAbsorptionHearts; i++) {
        drawLifeIcon(visibleLives + i, skin.heartColor);
    }
    if (ship.absorptionHearts > fullAbsorptionHearts) {
        drawLifeIcon(
            visibleLives + fullAbsorptionHearts,
            skin.heartColor,
            ship.absorptionHearts - fullAbsorptionHearts
        );
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`LEVEL ${level}`, hudWidth - 18, 38);
    ctx.fillText(`SCORE ${score}/${getBossTarget()}`, hudWidth - 18, 58);
    if (ship.phantomDashUnlocked) {
        ctx.fillStyle = ship.phantomDashTimer > 0 ? '#c084fc' : '#e9d5ff';
        ctx.font = '7px "Press Start 2P", monospace';
        const dashStatus = ship.phantomDashTimer > 0
            ? 'PHANTOM DASH!'
            : ship.phantomDashCooldown > 0
                ? `DASH ${ship.phantomDashCooldown.toFixed(1)}s`
                : 'HOLD Q + MOVE: DASH';
        ctx.fillText(dashStatus, hudWidth - 18, 76);
    }
    if (comboCount > 1 && comboTimer > 0) {
        ctx.fillStyle = '#facc15';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(`COMBO X${comboCount}  +${comboBonusScore}`, hudWidth - 18, ship.phantomDashUnlocked ? 94 : 78);
    }
    ctx.restore();

    if (levelCleared) {
        drawLevelCompletedScreen();
    }

}

function getGameOverLayout() {
    const scale = Math.min(1.4, canvas.width / 500, canvas.height / 330);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const buttonWidth = 180 * scale;
    const buttonHeight = 58 * scale;
    const buttonY = centerY + 18 * scale;

    return {
        scale,
        centerX,
        centerY,
        panel: {
            x: centerX - 230 * scale,
            y: centerY - 130 * scale,
            width: 460 * scale,
            height: 260 * scale
        },
        restart: {
            x: centerX - 188 * scale,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight
        },
        menu: {
            x: centerX + 8 * scale,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight
        }
    };
}

function drawGameOverScreen() {
    if (!gameOver) return;

    const layout = getGameOverLayout();
    ctx.fillStyle = 'rgba(2, 8, 23, 0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
    ctx.fillRect(layout.panel.x, layout.panel.y, layout.panel.width, layout.panel.height);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2 * layout.scale;
    ctx.strokeRect(layout.panel.x, layout.panel.y, layout.panel.width, layout.panel.height);

    ctx.fillStyle = '#f8fafc';
    ctx.font = `${Math.round(24 * layout.scale)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', layout.centerX, layout.centerY - 70 * layout.scale);
    ctx.font = `${Math.round(10 * layout.scale)}px "Press Start 2P", monospace`;
    ctx.fillText(`LEVEL ${level}  |  SCORE ${score}`, layout.centerX, layout.centerY - 36 * layout.scale);

    for (const [button, label, color] of [
        [layout.restart, 'RESTART', '#0369a1'],
        [layout.menu, 'MENU', '#334155']
    ]) {
        ctx.fillStyle = color;
        ctx.fillRect(button.x, button.y, button.width, button.height);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = layout.scale;
        ctx.strokeRect(button.x, button.y, button.width, button.height);
        ctx.fillStyle = '#f8fafc';
        ctx.font = `${Math.round(11 * layout.scale)}px "Press Start 2P", monospace`;
        ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2 + 4 * layout.scale);
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${Math.round(8 * layout.scale)}px "Press Start 2P", monospace`;
    ctx.fillText('R / 1: RESTART     ESC / 2: MENU', layout.centerX, layout.centerY + 100 * layout.scale);
    ctx.textAlign = 'left';
}

function loop(timestamp) {
    let dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.03);
    lastTime = timestamp;

    // Hitstop: while active, gameplay time crawls so impacts feel weighty,
    // but the effects themselves still count down in real time.
    if (hitstopTimer > 0) dt *= 0.08;
    updateScreenEffects(dt);
    update(dt);
    drawBackground();

    if (!hasStarted) {
        if (menuScreen === 'home') drawHomeScreen();
        else if (menuScreen === 'skills') drawSkillTreeScreen();
        else if (menuScreen === 'codex') drawEnemyCodexScreen();
        else if (menuScreen === 'skins') drawSkinShopScreen();
        else if (menuScreen === 'quests') drawQuestScreen();
        else drawLevelSelectionScreen();
        requestAnimationFrame(loop);
        return;
    }

    const shakeOffset = getScreenShakeOffset();
    ctx.save();
    ctx.translate(shakeOffset.x, shakeOffset.y);

    drawBullets();
    for (const enemyBullet of enemyBullets) {
        ctx.beginPath();
        ctx.fillStyle = enemyBullet.color || '#fca5a5';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.arc(enemyBullet.x, enemyBullet.y, enemyBullet.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    for (const comet of comets) drawComet(comet);
    for (const blackHole of blackHoles) drawBlackHole(blackHole);
    for (const enemyShip of enemyShips) {
        ctx.save();
        ctx.translate(enemyShip.x, enemyShip.y);
        ctx.rotate(enemyShip.rotation);
        ctx.scale(enemyShip.scale, enemyShip.scale);

        if (['neptune-wraith', 'triton-phantom', 'eris-stalker'].includes(enemyShip.type)
            && enemyShip.dashTimer > 0) {
            ctx.globalAlpha = 0.45;
        }
        if (enemyShip.isBoss && enemyShip.bossProfile.appearance === 'ghost') {
            ctx.globalAlpha *= 0.58;
        }
        const enemyColor = {
            'cold-scout': '#7dd3fc',
            'mars-raider': '#fb7c55',
            'venus-scorcher': '#f97316',
            'mercury-dart': '#cbd5e1',
            'saturn-warden': '#fbbf24',
            'neptune-wraith': '#67e8f9',
            'io-pyro': '#f97316',
            'europa-cryo': '#93c5fd',
            'titan-hunter': '#a3a34b',
            'triton-phantom': '#38bdf8',
            'ceres-bomber': '#a8a29e',
            'eris-stalker': '#c084fc',
            'makemake-prism': '#fb7185',
            'haumea-spinner': '#e879f9',
            'ganymede-guardian': '#94a3b8',
            'callisto-sentinel': '#a78bfa'
        }[enemyShip.type] || (enemyShip.isBoss ? enemyShip.bossProfile.color : '#e2e8f0');
        if (enemyShip.isBoss) {
            const previousAlpha = ctx.globalAlpha;
            ctx.strokeStyle = enemyColor;
            ctx.globalAlpha = previousAlpha * 0.7;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 36 + Math.sin(enemyShip.pulse) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = previousAlpha;
        }
        if (enemyShip.type === 'saturn-warden') {
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, 3, 30, 10, -0.2, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (enemyShip.type === 'cold-scout') {
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(0, -26);
        if (enemyShip.type === 'cold-scout') {
            ctx.lineTo(18, 16);
            ctx.lineTo(6, 8);
            ctx.lineTo(0, 18);
            ctx.lineTo(-6, 8);
            ctx.lineTo(-18, 16);
        } else if (enemyShip.type === 'venus-scorcher') {
            ctx.lineTo(20, 14);
            ctx.lineTo(9, 10);
            ctx.lineTo(0, 20);
            ctx.lineTo(-9, 10);
            ctx.lineTo(-20, 14);
        } else if (enemyShip.type === 'mars-raider') {
            ctx.lineTo(22, 12);
            ctx.lineTo(8, 10);
            ctx.lineTo(0, 19);
            ctx.lineTo(-8, 10);
            ctx.lineTo(-22, 12);
        } else if (enemyShip.type === 'mercury-dart') {
            ctx.lineTo(12, 12);
            ctx.lineTo(0, 7);
            ctx.lineTo(-12, 12);
        } else if (enemyShip.type === 'saturn-warden') {
            ctx.lineTo(24, 14);
            ctx.lineTo(13, 18);
            ctx.lineTo(0, 10);
            ctx.lineTo(-13, 18);
            ctx.lineTo(-24, 14);
        } else if (enemyShip.type === 'neptune-wraith' || enemyShip.type === 'triton-phantom') {
            ctx.lineTo(18, 10);
            ctx.lineTo(12, 19);
            ctx.lineTo(0, 12);
            ctx.lineTo(-12, 19);
            ctx.lineTo(-18, 10);
        } else if (enemyShip.type === 'io-pyro') {
            ctx.lineTo(23, 16);
            ctx.lineTo(8, 8);
            ctx.lineTo(4, 17);
            ctx.lineTo(0, 12);
            ctx.lineTo(-4, 17);
            ctx.lineTo(-8, 8);
            ctx.lineTo(-23, 16);
        } else if (enemyShip.type === 'europa-cryo') {
            ctx.lineTo(15, 12);
            ctx.lineTo(6, 7);
            ctx.lineTo(0, 21);
            ctx.lineTo(-6, 7);
            ctx.lineTo(-15, 12);
        } else if (enemyShip.type === 'titan-hunter' || enemyShip.type === 'eris-stalker') {
            ctx.lineTo(25, 17);
            ctx.lineTo(10, 11);
            ctx.lineTo(0, 16);
            ctx.lineTo(-10, 11);
            ctx.lineTo(-25, 17);
        } else if (enemyShip.type === 'ceres-bomber' || enemyShip.type === 'ganymede-guardian') {
            ctx.lineTo(25, 12);
            ctx.lineTo(18, 21);
            ctx.lineTo(0, 14);
            ctx.lineTo(-18, 21);
            ctx.lineTo(-25, 12);
        } else if (enemyShip.type === 'makemake-prism') {
            ctx.lineTo(20, 12);
            ctx.lineTo(6, 12);
            ctx.lineTo(0, 22);
            ctx.lineTo(-6, 12);
            ctx.lineTo(-20, 12);
        } else if (enemyShip.type === 'haumea-spinner' || enemyShip.type === 'callisto-sentinel') {
            ctx.lineTo(22, 14);
            ctx.lineTo(12, 8);
            ctx.lineTo(0, 18);
            ctx.lineTo(-12, 8);
            ctx.lineTo(-22, 14);
        } else {
            ctx.lineTo(18, 16);
            ctx.lineTo(0, 8);
            ctx.lineTo(-18, 16);
        }
        ctx.closePath();
        const hullGradient = ctx.createLinearGradient(-24, -15, 24, 18);
        hullGradient.addColorStop(0, '#ffffff');
        hullGradient.addColorStop(0.22, enemyColor);
        hullGradient.addColorStop(0.7, enemyColor);
        hullGradient.addColorStop(1, '#1e293b');
        ctx.fillStyle = hullGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawReflectiveFinish(enemyColor);

        const cockpitGradient = ctx.createLinearGradient(-6, 10, 6, 22);
        cockpitGradient.addColorStop(0, '#ffffff');
        cockpitGradient.addColorStop(0.35, ['neptune-wraith', 'triton-phantom'].includes(enemyShip.type)
            ? '#cffafe'
            : ['cold-scout', 'europa-cryo'].includes(enemyShip.type) ? '#dbeafe' : '#f87171');
        cockpitGradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = cockpitGradient;
        ctx.fillRect(-6, 10, 12, 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(-4, 11, 2, 5);

        ctx.fillStyle = enemyShip.type === 'saturn-warden' ? '#f97316' : enemyShip.type === 'venus-scorcher' ? '#fdba74' : '#facc15';
        ctx.beginPath();
        ctx.moveTo(-5, 18);
        ctx.lineTo(0, 30);
        ctx.lineTo(5, 18);
        ctx.closePath();
        ctx.fill();

        if (enemyShip.isBoss) {
            drawPlanetBossDetails(enemyShip.bossProfile, enemyShip.pulse);
        }

        ctx.restore();

        if (enemyShip.isBoss) {
            const barWidth = 104;
            const barHeight = 6;
            const barX = enemyShip.x - barWidth / 2;
            const barY = enemyShip.y - enemyShip.radius - 14;
            const healthRatio = Math.max(0, Math.min(1, enemyShip.health / enemyShip.maxHealth));

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            ctx.fillStyle = enemyShip.bossProfile.color;
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(enemyShip.bossProfile.name.toUpperCase(), enemyShip.x, barY - 5);
            ctx.textAlign = 'left';
        }
    }
    for (const star of bonusStars) drawBonusStar(star);
    for (const star of blueStars) drawBonusStar({ ...star, color: '#38bdf8', glow: true });
    drawShip();
    drawParticles();
    drawShockwaves();
    ctx.restore();

    drawHud();
    drawGameOverScreen();

    requestAnimationFrame(loop);
}

window.addEventListener('keydown', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys[key] = true;
    audio.ensure();

    if (levelCleared) {
        if (levelClearCooldown <= 0) openLevelMenu();
        return;
    }

    if (!hasStarted) {
        if (menuScreen === 'home') {
            if (event.key === '1') openLevelSelectionMenu();
            else if (event.key === '2') openSkillTreeMenu();
            else if (event.key === '3') openEnemyCodexMenu();
            else if (event.key === '4') openSkinShopMenu();
        } else if (menuScreen === 'skins') {
            if (event.key === 'Escape' || event.key === 'Backspace') openLevelMenu();
        } else if (menuScreen === 'quests') {
            if (event.key === 'Escape' || event.key === 'Backspace') openSkinShopMenu();
            else if (['1', '2', '3'].includes(event.key)) claimQuest(Number(event.key) - 1);
        } else if (menuScreen === 'skills') {
            if (event.key === 'Escape' || event.key === 'Backspace') openLevelMenu();
            else if (event.key === 'ArrowDown' || event.key === 's') {
                skillTreePan.y += 100;
                clampSkillTreePan();
            } else if (event.key === 'ArrowUp' || event.key === 'w') {
                skillTreePan.y -= 100;
                clampSkillTreePan();
            } else if (event.key === 'ArrowRight' || event.key === 'd') {
                skillTreePan.x += 100;
                clampSkillTreePan();
            } else if (event.key === 'ArrowLeft' || event.key === 'a') {
                skillTreePan.x -= 100;
                clampSkillTreePan();
            }
        } else if (menuScreen === 'levels') {
            const pageCount = Math.ceil(levelMapNodes.length / levelsPerPage);
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                levelSelectionPage = Math.min(pageCount - 1, levelSelectionPage + 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                levelSelectionPage = Math.max(0, levelSelectionPage - 1);
            } else if (event.key === 'Escape' || event.key === 'Backspace') {
                openLevelMenu();
            }
        } else if (menuScreen === 'codex') {
            if (codexSelectedEntryId) {
                if (event.key === 'Escape' || event.key === 'Backspace') {
                    codexSelectedEntryId = null;
                }
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                const pageCount = Math.ceil(enemyCodexEntries.length / codexEntriesPerPage);
                codexPage = Math.min(pageCount - 1, codexPage + 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                const pageCount = Math.ceil(enemyCodexEntries.length / codexEntriesPerPage);
                codexPage = Math.max(0, codexPage - 1);
            } else if (event.key === 'Escape' || event.key === 'Backspace') {
                openLevelMenu();
            }
        }
        return;
    }

    if (gameOver) {
        if (event.key === 'r' || event.key === 'R' || event.key === '1') {
            startLevelSelection(level);
        } else if (event.key === 'Escape' || event.key === '2' || event.key === 'm' || event.key === 'M') {
            openLevelMenu();
        }
        return;
    }

    if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (ship.chargedBeam) {
            if (!event.repeat) startChargedBeam();
        } else {
            shoot();
        }
    }

    if (key === 'r' && !event.repeat) {
        startSelfDestruct();
    }

    if (event.key === 'r' || event.key === 'R') {
        if (gameOver) {
            resetGame();
        }
    }
});

canvas.addEventListener('pointerdown', (event) => {
    if (!hasStarted) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
        const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
        const menuTransform = getMenuTransform();
        const x = (canvasX - menuTransform.x) / menuTransform.scale;
        const y = (canvasY - menuTransform.y) / menuTransform.scale;

        if (menuScreen === 'home') {
            const [levelsButton, skillsButton, codexButton, skinsButton] = getHubButtonRects();
            const clicked = button => x >= button.x && x <= button.x + button.width
                && y >= button.y && y <= button.y + button.height;
            if (clicked(levelsButton)) openLevelSelectionMenu();
            else if (clicked(skillsButton)) openSkillTreeMenu();
            else if (clicked(codexButton)) openEnemyCodexMenu();
            else if (clicked(skinsButton)) openSkinShopMenu();
            return;
        }

        if (menuScreen === 'skins') {
            const questsButton = getQuestShopButton();
            if (x >= questsButton.x && x <= questsButton.x + questsButton.width
                && y >= questsButton.y && y <= questsButton.y + questsButton.height) {
                openQuestMenu();
                return;
            }
            const backButton = getSkillTreeBackButton();
            if (x >= backButton.x && x <= backButton.x + backButton.width
                && y >= backButton.y && y <= backButton.y + backButton.height) {
                openLevelMenu();
                return;
            }
            const selectedSkin = shipSkins.findIndex((_, index) => {
                const card = getSkinCardRect(index);
                return x >= card.x && x <= card.x + card.width
                    && y >= card.y && y <= card.y + card.height;
            });
            if (selectedSkin >= 0) buyOrEquipShipSkin(shipSkins[selectedSkin].id);
            return;
        }

        if (menuScreen === 'quests') {
            const backButton = getSkillTreeBackButton();
            if (x >= backButton.x && x <= backButton.x + backButton.width
                && y >= backButton.y && y <= backButton.y + backButton.height) {
                openSkinShopMenu();
                return;
            }
            const selectedQuest = activeQuests.findIndex((_, index) => {
                const card = getQuestCardRect(index);
                return x >= card.x && x <= card.x + card.width
                    && y >= card.y && y <= card.y + card.height;
            });
            if (selectedQuest >= 0) claimQuest(selectedQuest);
            return;
        }

        if (menuScreen === 'codex') {
            if (codexSelectedEntryId) {
                const backButton = getSkillTreeBackButton();
                if (x >= backButton.x && x <= backButton.x + backButton.width
                    && y >= backButton.y && y <= backButton.y + backButton.height) {
                    codexSelectedEntryId = null;
                }
                return;
            }
            const backButton = getSkillTreeBackButton();
            if (x >= backButton.x && x <= backButton.x + backButton.width
                && y >= backButton.y && y <= backButton.y + backButton.height) {
                openLevelMenu();
                return;
            }
            const arrows = getCodexPageButtons();
            const clicked = button => x >= button.x && x <= button.x + button.width
                && y >= button.y && y <= button.y + button.height;
            const pageCount = Math.ceil(enemyCodexEntries.length / codexEntriesPerPage);
            if (clicked(arrows.previous)) codexPage = Math.max(0, codexPage - 1);
            else if (clicked(arrows.next)) codexPage = Math.min(pageCount - 1, codexPage + 1);
            else {
                const firstEntryIndex = codexPage * codexEntriesPerPage;
                const pageEntries = enemyCodexEntries.slice(
                    firstEntryIndex,
                    firstEntryIndex + codexEntriesPerPage
                );
                const selectedIndex = pageEntries.findIndex((_, index) => {
                    const rect = getCodexEntryRect(index);
                    return x >= rect.x && x <= rect.x + rect.width
                        && y >= rect.y && y <= rect.y + rect.height;
                });
                if (selectedIndex >= 0) {
                    codexSelectedEntryId = pageEntries[selectedIndex].id;
                }
            }
            return;
        }

        if (menuScreen === 'skills') {
            const backButton = getSkillTreeBackButton();
            if (x >= backButton.x && x <= backButton.x + backButton.width
                && y >= backButton.y && y <= backButton.y + backButton.height) {
                openLevelMenu();
                return;
            }
            const viewport = getSkillTreeViewport();
            if (x < viewport.x || x > viewport.x + viewport.width
                || y < viewport.y || y > viewport.y + viewport.height) return;

            const clickedSkill = skillTreeNodeRects.find(node =>
                Math.hypot(
                    x - viewport.x + skillTreePan.x - node.x,
                    y - viewport.y + skillTreePan.y - node.y
                ) <= node.radius + 8
            );
            if (clickedSkill) {
                buySkillNode(clickedSkill.nodeId);
                return;
            }

            skillTreeDrag = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                panX: skillTreePan.x,
                panY: skillTreePan.y
            };
            canvas.setPointerCapture(event.pointerId);
            return;
        }

        if (menuScreen === 'levels') {
            const backButton = getSkillTreeBackButton();
            if (x >= backButton.x && x <= backButton.x + backButton.width
                && y >= backButton.y && y <= backButton.y + backButton.height) {
                openLevelMenu();
                return;
            }
            const arrowButtons = getLevelPageArrowRects();
            const clicked = button => x >= button.x && x <= button.x + button.width
                && y >= button.y && y <= button.y + button.height;
            const pageCount = Math.ceil(levelMapNodes.length / levelsPerPage);
            if (clicked(arrowButtons.previous)) {
                levelSelectionPage = Math.max(0, levelSelectionPage - 1);
                return;
            }
            if (clicked(arrowButtons.next)) {
                levelSelectionPage = Math.min(pageCount - 1, levelSelectionPage + 1);
                return;
            }

            for (const node of getVisibleLevelPageNodes()) {
                const distance = Math.hypot(x - node.x, y - node.y);
                if (distance <= 34) {
                    startLevelSelection(node.level);
                    return;
                }
            }
        }
        return;
    }

    if (gameOver) {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        const layout = getGameOverLayout();
        const clickedButton = button => x >= button.x && x <= button.x + button.width
            && y >= button.y && y <= button.y + button.height;

        if (clickedButton(layout.restart)) {
            startLevelSelection(level);
        } else if (clickedButton(layout.menu)) {
            openLevelMenu();
        }
        return;
    }

    if (levelCleared) {
        if (levelClearCooldown <= 0) openLevelMenu();
    }
});

canvas.addEventListener('pointermove', event => {
    if (!skillTreeDrag || event.pointerId !== skillTreeDrag.pointerId) return;

    const rect = canvas.getBoundingClientRect();
    const menuScale = getMenuTransform().scale;
    skillTreePan.x = skillTreeDrag.panX
        - (event.clientX - skillTreeDrag.clientX) * canvas.width / rect.width / menuScale;
    skillTreePan.y = skillTreeDrag.panY
        - (event.clientY - skillTreeDrag.clientY) * canvas.height / rect.height / menuScale;
    clampSkillTreePan();
});

function stopSkillTreeDrag(event) {
    if (skillTreeDrag && event.pointerId === skillTreeDrag.pointerId) skillTreeDrag = null;
}

canvas.addEventListener('pointerup', stopSkillTreeDrag);
canvas.addEventListener('pointercancel', stopSkillTreeDrag);

canvas.addEventListener('wheel', event => {
    if (menuScreen !== 'skills' || hasStarted) return;
    event.preventDefault();
    skillTreePan.x += event.deltaX;
    skillTreePan.y += event.deltaY;
    clampSkillTreePan();
}, { passive: false });

window.addEventListener('keyup', (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys[key] = false;

    if (key === 'r' && ship.selfDestructUnlocked) {
        releaseSelfDestruct();
    }

    if ((event.key === ' ' || event.code === 'Space') && ship.chargedBeam) {
        const wasCharging = ship.beamCharging;
        ship.beamMustRelease = false;
        ship.beamHoldTime = 0;
        if (wasCharging) {
            fireChargedBeam();
        } else if (hasStarted && !levelCleared && !gameOver && !ship.locked) {
            shoot();
        }
    }
});

window.addEventListener('resize', () => {
    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ship.x = Math.max(ship.radius, Math.min(canvas.width - ship.radius, ship.x + (canvas.width - previousWidth) / 2));
    ship.y = Math.max(ship.radius + 8, Math.min(canvas.height - ship.radius, ship.y + (canvas.height - previousHeight) / 2));
    createStars();
});

createStars();
resetGame();
requestAnimationFrame(loop);
