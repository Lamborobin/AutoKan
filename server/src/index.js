require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { initDb } = require('./db');
const { attachUser } = require('./middleware/auth');
const tasksRouter = require('./routes/tasks');
const authRouter = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const { agentsRouter, columnsRouter, secretsRouter, instructionsRouter, agentTemplatesRouter, rolesRouter } = require('./routes/other');
const { addClient } = require('./sse');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

// Attach user from JWT on every request (non-blocking)
app.use(attachUser);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/secrets', secretsRouter);
app.use('/api/instructions', instructionsRouter);
app.use('/api/agent-templates', agentTemplatesRouter);
app.use('/api/roles', rolesRouter);

// SSE — real-time push to connected browsers
app.get('/api/events', (req, res) => addClient(res));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Init DB and start
initDb();
app.listen(PORT, () => {
  console.log(`\n🚀 FlowAgent server running at http://localhost:${PORT}`);
  console.log(`   API health: http://localhost:${PORT}/api/health\n`);
});
