require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');

const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security ────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({
  // Allow images/assets to be loaded cross-origin (user-ui & admin-ui
  // are on different ports/domains from the API)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Health ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/profile',        require('./routes/profile'));
app.use('/api/projects',       require('./routes/projects'));
app.use('/api/skills',         require('./routes/skills'));
app.use('/api/experiences',    require('./routes/experiences'));
app.use('/api/certifications', require('./routes/certifications'));
app.use('/api/contact',        require('./routes/contact'));

// ── 404 + Error handler ─────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use(errorHandler);

app.listen(PORT, () =>
  console.log(`[API] port ${PORT}  env:${process.env.NODE_ENV || 'development'}`)
);
