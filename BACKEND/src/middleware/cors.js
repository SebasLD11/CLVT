// src/middleware/cors.js
const cors = require('cors');
const norm = s => (s || '').replace(/\/+$/,''); // quita / final

// Lee FRONT_URL y una lista opcional CORS_ORIGINS (coma-separado)
const extra = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowed = [
  process.env.FRONT_URL,                     // p.ej. https://www.byek1tty.com
  ...extra,                                  // p.ej. https://byek1tty.com
  // Dominios explícitos (por seguridad, mantenlos aunque pongas envs)
  'https://www.byek1tty.com',
  'https://byek1tty.com',
  'https://bye-k1tty-vgs-distribution.vercel.app',
].filter(Boolean).map(norm);

// Debug útil en Heroku logs
console.log('[CORS] Allowlist:', allowed);

const options = {
  origin(origin, cb) {
    // Permite llamadas sin Origin (curl/healthchecks)
    if (!origin) return cb(null, true);
    return allowed.includes(norm(origin))
      ? cb(null, true)
      : cb(new Error(`CORS: origin not allowed -> ${origin}`), false);
  },
  credentials: true,
  methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  maxAge: 86400, // cachea preflight 24h
};

const mw = cors(options);
mw.options = cors(options); // reusa opciones para app.options()
module.exports = mw;