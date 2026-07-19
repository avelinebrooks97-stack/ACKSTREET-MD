const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pino = require('pino');

const SESSION_PREFIX = 'ACKSTREET-MD~';
const TEMP_ROOT = path.join(__dirname, 'temp_sessions');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(TEMP_ROOT)) fs.mkdirSync(TEMP_ROOT, { recursive: true });

// In-memory job tracker: requestId -> { status, code, sessionId, error }
const jobs = new Map();

function cleanupJob(requestId) {
  const dir = path.join(TEMP_ROOT, requestId);
  fs.rm(dir, { recursive: true, force: true }, () => {});
  setTimeout(() => jobs.delete(requestId), 5 * 60 * 1000);
}

async function runPairing(requestId, phoneNumber) {
  const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
} = await import('@whiskeysockets/baileys');
  const sessionDir = path.join(TEMP_ROOT, requestId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestWaWebVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['ACKSTREET-MD-Pairing', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;

    if (connection === 'open') {
      try {
        await new Promise(res => setTimeout(res, 1500));
        const credsPath = path.join(sessionDir, 'creds.json');
        const credsRaw = fs.readFileSync(credsPath, 'utf-8');
        const sessionId = SESSION_PREFIX + Buffer.from(credsRaw, 'utf-8').toString('base64');

        jobs.set(requestId, { status: 'connected', sessionId });

        await sock.logout().catch(() => {});
        sock.end();
        cleanupJob(requestId);
      } catch (err) {
        jobs.set(requestId, { status: 'error', error: 'Failed to read session after connecting.' });
        cleanupJob(requestId);
      }
    }

    if (connection === 'close') {
      const job = jobs.get(requestId);
      if (job && job.status === 'waiting') {
        jobs.set(requestId, { status: 'error', error: 'Connection closed before pairing completed.' });
        cleanupJob(requestId);
      }
    }
  });

  setTimeout(async () => {
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      const job = jobs.get(requestId) || {};
      jobs.set(requestId, { ...job, status: 'waiting', code });
    } catch (err) {
      jobs.set(requestId, { status: 'error', error: 'Failed to generate pairing code. Check the number and try again.' });
      cleanupJob(requestId);
    }
  }, 3000);
}

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.post('/api/pair', async (req, res) => {
  const rawNumber = (req.body?.number || '').replace(/[^0-9]/g, '');
  if (!rawNumber || rawNumber.length < 8) {
    return res.status(400).json({ error: 'Enter a valid phone number with country code, no + or spaces.' });
  }

  const requestId = crypto.randomBytes(8).toString('hex');
  jobs.set(requestId, { status: 'starting' });

  runPairing(requestId, rawNumber).catch(err => {
    jobs.set(requestId, { status: 'error', error: err.message });
  });

  res.json({ requestId });
});

app.get('/api/status/:requestId', (req, res) => {
  const job = jobs.get(req.params.requestId);
  if (!job) return res.status(404).json({ error: 'Unknown or expired request.' });
  res.json(job);
});

console.log('Public dir contents:', fs.readdirSync(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`ACKSTREET MD pairing site running on port ${PORT}`);
});
