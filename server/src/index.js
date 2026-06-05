require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { getDb } = require('./db');
const { attachUser } = require('./middleware/auth');
const tasksRouter = require('./routes/tasks');
const authRouter = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const invitesRouter = require('./routes/invites');
const membersRouter = require('./routes/members');
const teamsRouter = require('./routes/teams');
const { agentsRouter, columnsRouter, instructionsRouter, agentTemplatesRouter, rolesRouter } = require('./routes/other');
const subscriptionsRouter = require('./routes/subscriptions');
const clientsRouter = require('./routes/clients');
const docsRouter = require('./routes/docs');
const notificationsRouter = require('./routes/notifications');
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
app.use('/api/instructions', instructionsRouter);
app.use('/api/agent-templates', agentTemplatesRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/projects/:projectId/members', membersRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/docs', docsRouter);
app.use('/api/notifications', notificationsRouter);

// SSE — real-time push to connected browsers
app.get('/api/events', (req, res) => addClient(res, req.user?.sub));

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

// Warm up DB connection on startup (triggers schema + seed on first call)
getDb();
app.listen(PORT, () => {
  console.log(`\n🚀 AutoKan server running at http://localhost:${PORT}`);
  console.log(`   API health: http://localhost:${PORT}/api/health\n`);
});
