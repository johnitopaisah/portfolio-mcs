require('dotenv').config();

const express           = require('express');
const cors              = require('cors');
const helmet            = require('helmet');
const morgan            = require('morgan');
const compression       = require('compression');
const swaggerUi         = require('swagger-ui-express');
const swaggerSpec       = require('./swagger');
const { register }      = require('./metrics');
const metricsMiddleware = require('./metricsMiddleware');
const { startDailyDigest }         = require('./services/visitorDigest');
const { startDailyJobDigest }      = require('./services/jobIngestion/notificationService');
const { startConsentReminderWorker } = require('./workers/consentReminderWorker');

const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security ────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/docs')) {
    return helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })(req, res, next);
  }
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })(req, res, next);
});

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

// ── Prometheus HTTP middleware ───────────────────────────────
app.use(metricsMiddleware);

// ── Prometheus metrics endpoint ─────────────────────────────
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ── Health ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Swagger UI ───────────────────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Portfolio MCS — API Docs',
    customCss: `
      .swagger-ui .topbar { background: #09090b; border-bottom: 1px solid #27272a; }
      .swagger-ui .topbar-wrapper img { display: none; }
      .swagger-ui .topbar-wrapper::after {
        content: 'Portfolio MCS API';
        color: #a78bfa;
        font-size: 18px;
        font-weight: 700;
        font-family: monospace;
      }
      .swagger-ui .info .title { color: #a78bfa; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  })
);

app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Routes ──────────────────────────────────────────────────
app.use('/api/projects',       require('./routes/projectImages'));
app.use('/api/projects',       require('./routes/projects'));
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/profile',        require('./routes/profile'));
app.use('/api/skills',         require('./routes/skills'));
app.use('/api/experiences',    require('./routes/experiences'));
app.use('/api/certifications', require('./routes/certifications'));
app.use('/api/contact',        require('./routes/contact'));
app.use('/api/social-links',   require('./routes/socialLinks'));
app.use('/api/visitors',       require('./routes/visitors'));
app.use('/api/jobs',           require('./routes/jobs'));
app.use('/api/admin/jobs',     require('./routes/admin/jobs'));
app.use('/api/admin/ai',      require('./routes/admin/ai'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/education',             require('./routes/education'));
app.use('/api/referees',                  require('./routes/referees'));
app.use('/api/referee-invitations',       require('./routes/refereeInvitations'));
app.use('/api/referee-contact-requests',  require('./routes/refereeContactRequests'));

// ── 404 + Error handler ─────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[API] port ${PORT}  env:${process.env.NODE_ENV || 'development'}`);

  // 08:00 Europe/Paris — visitor analytics digest
  startDailyDigest();

  // 08:15 Europe/Paris — job opportunities digest (15 min after visitor digest)
  if (process.env.NOTIFY_EMAIL_USER) {
    startDailyJobDigest();
  } else {
    console.warn('[JobDigest] NOTIFY_EMAIL_USER not set — job digest disabled');
  }

  // Consent reminder worker — checks every 24h for overdue consent requests
  startConsentReminderWorker();
});
