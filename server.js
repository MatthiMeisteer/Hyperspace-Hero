'use strict';

// Space Arcade account server.
// Uses only built-in Node.js modules, so it runs with: node server.js
// Accounts are stored in data/db.json with scrypt password hashes.
// Sessions are random tokens in an HttpOnly cookie; only a SHA-256 hash of each token is stored.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SESSION_COOKIE = 'sa_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LEVEL = 20;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEYLEN = 64;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

const STATIC_FILES = {
    '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
    '/script.js': { file: 'script.js', type: 'text/javascript; charset=utf-8' },
    '/mondamusic-retro-arcade-game-music-512837.mp3': {
        file: 'mondamusic-retro-arcade-game-music-512837.mp3',
        type: 'audio/mpeg'
    }
};

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
        "default-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "media-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ')
};

// ---------- Database ----------

let db = { accounts: [], sessions: [] };
let writeQueue = Promise.resolve();

async function loadDatabase() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    try {
        const parsed = JSON.parse(await fsp.readFile(DB_FILE, 'utf8'));
        if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.sessions)) {
            throw new Error(`${DB_FILE} has an invalid structure.`);
        }
        db = parsed;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await persistDatabase();
    }
    removeExpiredSessions();
}

async function writeDatabaseFile() {
    const tempFile = `${DB_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tempFile, JSON.stringify(db, null, 2), 'utf8');
    // OneDrive or antivirus software can briefly lock the target file on Windows.
    for (let attempt = 0; ; attempt++) {
        try {
            await fsp.rename(tempFile, DB_FILE);
            return;
        } catch (error) {
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
            await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
        }
    }
}

function persistDatabase() {
    const write = writeQueue.then(writeDatabaseFile);
    writeQueue = write.catch(() => { });
    return write;
}

function removeExpiredSessions() {
    const now = Date.now();
    db.sessions = db.sessions.filter(session => session.expiresAt > now);
}


 // ---------- Database: PostgreSQL / Neon ----------

let db = { accounts: [], sessions: [] };
let writeQueue = Promise.resolve();

async function loadDatabase() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured.');
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY,
            data JSONB NOT NULL
        )
    `);

    await pool.query(`
        INSERT INTO app_state (id, data)
        VALUES (1, '{"accounts":[],"sessions":[]}'::jsonb)
        ON CONFLICT (id) DO NOTHING
    `);

    const result = await pool.query(
        'SELECT data FROM app_state WHERE id = 1'
    );

    db = result.rows[0].data;

    if (!db || !Array.isArray(db.accounts) || !Array.isArray(db.sessions)) {
        throw new Error('The PostgreSQL database has an invalid structure.');
    }

    const oldSessionCount = db.sessions.length;
    removeExpiredSessions();

    if (db.sessions.length !== oldSessionCount) {
        await persistDatabase();
    }
}

async function writeDatabaseFile() {
    await pool.query(
        'UPDATE app_state SET data = $1::jsonb WHERE id = 1',
        [JSON.stringify(db)]
    );
}

function persistDatabase() {
    const write = writeQueue.then(writeDatabaseFile);
    writeQueue = write.catch(() => {});
    return write;
}

function removeExpiredSessions() {
    const now = Date.now();
    db.sessions = db.sessions.filter(session => session.expiresAt > now);
}

function findAccount(username) {
    const key = username.toLowerCase();
    return db.accounts.find(account => account.usernameKey === key);
}


// ---------- Validation ----------

function validateUsername(value) {
    if (typeof value !== 'string') return 'Username is required.';
    const username = value.trim();
    if (username.length < 3 || username.length > 24) return 'Username must be between 3 and 24 characters.';
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) return 'Username may only contain letters, numbers, ".", "_" and "-".';
    return null;
}

function validatePassword(value) {
    if (typeof value !== 'string' || value.length < 8) return 'Password must be at least 8 characters long.';
    if (value.length > 128) return 'Password must be at most 128 characters long.';
    return null;
}

function clampInteger(value, min, max, fallback) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function isSafeKey(key) {
    return typeof key === 'string' && key.length <= 64 && /^[A-Za-z0-9_-]+$/.test(key);
}

function sanitizeProgress(input) {
    const source = input && typeof input === 'object' ? input : {};
    const skillTree = {};
    if (source.skillTree && typeof source.skillTree === 'object') {
        for (const [key, value] of Object.entries(source.skillTree).slice(0, 100)) {
            if (isSafeKey(key)) skillTree[key] = clampInteger(value, 0, 100, 0);
        }
    }
    const skillTreeNodes = {};
    if (source.skillTreeNodes && typeof source.skillTreeNodes === 'object') {
        for (const [key, value] of Object.entries(source.skillTreeNodes).slice(0, 200)) {
            if (isSafeKey(key)) skillTreeNodes[key] = value === true;
        }
    }
    const ownedShipSkins = Array.isArray(source.ownedShipSkins)
        ? [...new Set(source.ownedShipSkins.filter(isSafeKey))].slice(0, 50)
        : [];
    if (!ownedShipSkins.includes('default')) ownedShipSkins.unshift('default');
    const activeShipSkin = isSafeKey(source.activeShipSkin) && ownedShipSkins.includes(source.activeShipSkin)
        ? source.activeShipSkin
        : 'default';
    const quests = Array.isArray(source.quests)
        ? source.quests.slice(0, 5).filter(quest => quest && typeof quest === 'object' && isSafeKey(quest.type)).map(quest => {
            const target = clampInteger(quest.target, 1, 100000, 1);
            return {
                id: typeof quest.id === 'string' && quest.id.length <= 64 ? quest.id : crypto.randomUUID(),
                type: quest.type,
                target,
                progress: clampInteger(quest.progress, 0, target, 0),
                reward: clampInteger(quest.reward, 0, 100000, 0)
            };
        })
        : [];

    return {
        highestUnlockedLevel: clampInteger(source.highestUnlockedLevel, 1, MAX_LEVEL, 1),
        spaceCoins: clampInteger(source.spaceCoins, 0, 1e9, 0),
        skillTree,
        skillTreeNodes,
        ownedShipSkins,
        activeShipSkin,
        quests
    };
}

function publicAccount(account) {
    return { username: account.username, ...account.progress };
}

// ---------- Passwords & sessions ----------

async function hashPassword(password, salt = crypto.randomBytes(16)) {
    const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

async function verifyPassword(password, account) {
    if (account.legacyHash) {
        // Imported demo accounts still carry the old client-side PBKDF2 hash.
        const hash = crypto.pbkdf2Sync(password.normalize('NFKC'), Buffer.from(account.passwordSalt, 'hex'), 120000, 32, 'sha256');
        const expected = Buffer.from(account.passwordHash, 'hex');
        return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
    }
    const { hash } = await hashPassword(password, Buffer.from(account.passwordSalt, 'hex'));
    const expected = Buffer.from(account.passwordHash, 'hex');
    const actual = Buffer.from(hash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Used so that logins for unknown usernames take as long as for existing ones.
let dummyAccountPromise = hashPassword(crypto.randomBytes(16).toString('hex'))
    .then(({ salt, hash }) => ({ passwordSalt: salt, passwordHash: hash }));

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
    const cookies = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

function sessionCookie(token, maxAgeSeconds) {
    return [
        `${SESSION_COOKIE}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${maxAgeSeconds}`,
        COOKIE_SECURE ? 'Secure' : null
    ].filter(Boolean).join('; ');
}

async function createSession(res, account) {
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ tokenHash: hashToken(token), usernameKey: account.usernameKey, expiresAt: Date.now() + SESSION_TTL_MS });
    await persistDatabase();
    res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
}

function getSession(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const session = db.sessions.find(entry => entry.tokenHash === tokenHash);
    if (!session || session.expiresAt <= Date.now()) return null;
    const account = db.accounts.find(entry => entry.usernameKey === session.usernameKey);
    return account ? { session, account } : null;
}

// ---------- Login rate limiting ----------

const loginFailures = new Map();

function isRateLimited(ip) {
    const entry = loginFailures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.firstFailure > LOGIN_WINDOW_MS) {
        loginFailures.delete(ip);
        return false;
    }
    return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(ip) {
    const entry = loginFailures.get(ip);
    if (!entry || Date.now() - entry.firstFailure > LOGIN_WINDOW_MS) {
        loginFailures.set(ip, { count: 1, firstFailure: Date.now() });
    } else {
        entry.count += 1;
    }
}

// ---------- HTTP helpers ----------

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendJson(res, status, body) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(payload)
    });
    res.end(payload);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
            reject(new HttpError(415, 'Requests must be sent as JSON.'));
            return;
        }
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new HttpError(413, 'Request body is too large.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch {
                reject(new HttpError(400, 'Request body is not valid JSON.'));
            }
        });
        req.on('error', reject);
    });
}

function assertSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch {
        throw new HttpError(403, 'Invalid request origin.');
    }
    if (originHost !== req.headers.host) throw new HttpError(403, 'Cross-origin requests are not allowed.');
}

// ---------- API routes ----------

async function handleApi(req, res, pathname) {
    const ip = req.socket.remoteAddress || 'unknown';

    if (req.method !== 'GET') assertSameOrigin(req);

    if (pathname === '/api/session' && req.method === 'GET') {
        const current = getSession(req);
        if (!current) return sendJson(res, 401, { error: 'Not signed in.' });
        return sendJson(res, 200, { account: publicAccount(current.account) });
    }

    if (pathname === '/api/register' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const usernameError = validateUsername(body.username);
        if (usernameError) throw new HttpError(400, usernameError);
        const passwordError = validatePassword(body.password);
        if (passwordError) throw new HttpError(400, passwordError);

        const username = body.username.trim();
        if (findAccount(username)) throw new HttpError(409, 'That username is already taken.');
        const { salt, hash } = await hashPassword(body.password);
        // Check again: another registration may have finished while hashing.
        if (findAccount(username)) throw new HttpError(409, 'That username is already taken.');

        const account = {
            username,
            usernameKey: username.toLowerCase(),
            passwordSalt: salt,
            passwordHash: hash,
            createdAt: new Date().toISOString(),
            progress: sanitizeProgress(body.progress)
        };
        db.accounts.push(account);
        await createSession(res, account);
        return sendJson(res, 201, { account: publicAccount(account) });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
        if (isRateLimited(ip)) throw new HttpError(429, 'Too many failed login attempts. Try again in 15 minutes.');
        const body = await readJsonBody(req);
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const account = username ? findAccount(username) : null;
        const valid = password.length > 0 && password.length <= 128
            && await verifyPassword(password, account || await dummyAccountPromise)
            && Boolean(account);
        if (!valid) {
            recordLoginFailure(ip);
            throw new HttpError(401, 'Incorrect username or password.');
        }
        loginFailures.delete(ip);
        removeExpiredSessions();
        if (account.legacyHash) {
            // Upgrade the imported PBKDF2 hash to a fresh server-side scrypt hash.
            const { salt, hash } = await hashPassword(password);
            account.passwordSalt = salt;
            account.passwordHash = hash;
            delete account.legacyHash;
            await persistDatabase();
        }
        await createSession(res, account);
        return sendJson(res, 200, { account: publicAccount(account) });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
        const current = getSession(req);
        if (current) {
            db.sessions = db.sessions.filter(session => session !== current.session);
            await persistDatabase();
        }
        res.setHeader('Set-Cookie', sessionCookie('', 0));
        return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/migrate' && req.method === 'POST') {
        // Take over an old demo account: the client sends the existing PBKDF2 salt and hash.
        const body = await readJsonBody(req);
        const usernameError = validateUsername(body.username);
        if (usernameError) throw new HttpError(400, usernameError);
        const hexPattern = /^[a-f0-9]{64}$/;
        if (typeof body.passwordSalt !== 'string' || !/^[a-f0-9]{32}$/.test(body.passwordSalt)
            || typeof body.passwordHash !== 'string' || !hexPattern.test(body.passwordHash)) {
            throw new HttpError(400, 'The legacy account data is not in a valid format.');
        }

        const username = body.username.trim();
        if (findAccount(username)) throw new HttpError(409, 'An account with that username already exists. Sign in instead.');

        const account = {
            username,
            usernameKey: username.toLowerCase(),
            passwordSalt: body.passwordSalt,
            passwordHash: body.passwordHash,
            legacyHash: true,
            createdAt: new Date().toISOString(),
            progress: sanitizeProgress(body.progress)
        };
        db.accounts.push(account);
        await createSession(res, account);
        return sendJson(res, 201, { account: publicAccount(account) });
    }

    if (pathname === '/api/progress' && req.method === 'PUT') {
        const current = getSession(req);
        if (!current) throw new HttpError(401, 'Your session has expired. Please sign in again.');
        const body = await readJsonBody(req);
        current.account.progress = sanitizeProgress(body.progress);
        current.account.updatedAt = new Date().toISOString();
        await persistDatabase();
        return sendJson(res, 200, { account: publicAccount(current.account) });
    }

    throw new HttpError(404, 'Unknown API endpoint.');
}

// ---------- Static files ----------

async function serveStatic(req, res, pathname) {
    const entry = STATIC_FILES[pathname];
    if (!entry || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const filePath = path.join(ROOT, entry.file);
    const { size } = await fsp.stat(filePath);
    const headers = {
        ...SECURITY_HEADERS,
        'Content-Type': entry.type,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'bytes'
    };

    // Range support lets browsers stream and loop the background music.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
        let start = range[1] ? Number(range[1]) : size - Number(range[2]);
        let end = range[1] && range[2] ? Number(range[2]) : size - 1;
        start = Math.max(0, start);
        end = Math.min(size - 1, end);
        if (start > end) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
            res.end();
            return;
        }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
        return sendJson(res, 400, { error: 'Invalid URL.' });
    }

    try {
        if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
        else await serveStatic(req, res, pathname);
    } catch (error) {
        if (error instanceof HttpError) {
            if (!res.headersSent) sendJson(res, error.status, { error: error.message });
            return;
        }
        console.error(`Request failed: ${req.method} ${req.url}`, error);
        if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
        else res.destroy();
    }
});

loadDatabase().then(() => {
    setInterval(() => {
        const before = db.sessions.length;
        removeExpiredSessions();
        if (db.sessions.length !== before) persistDatabase().catch(error => console.error('Could not save sessions.', error));
    }, 60 * 60 * 1000).unref();

    server.listen(PORT, HOST, () => {
        console.log(`Space Arcade running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
        console.log('Accounts are stored in Neon PostgreSQL.');
    });
}).catch(error => {
    console.error('Could not start the server: the account database failed to load.', error);
    process.exit(1);
});
