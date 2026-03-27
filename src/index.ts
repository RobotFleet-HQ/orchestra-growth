import 'dotenv/config';
import express from 'express';
import path from 'path';
import cron from 'node-cron';
import { runMonitor, runExtendedMonitor } from './monitor';
import { runScorer } from './scorer';
import { runDrafter } from './drafter';
import { getAllLeads, updateStatus, getLeadsByStatus } from './db';
import type { Lead } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API Routes ---

app.get('/api/leads', (req, res) => {
  const { status, minScore } = req.query;
  const leads = getLeadsByStatus(
    status as string | undefined,
    minScore ? parseInt(minScore as string) : undefined
  );
  res.json(leads);
});

app.get('/api/leads/all', (_req, res) => {
  res.json(getAllLeads());
});

app.patch('/api/leads/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body as { status: Lead['status'] };
  const valid = ['new', 'approved', 'dismissed', 'sent'];
  if (!valid.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  updateStatus(id, status);
  res.json({ ok: true });
});

app.post('/api/run', async (_req, res) => {
  res.json({ ok: true, message: 'Pipeline triggered' });
  runPipeline().catch(console.error);
});

// --- Dashboard ---

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Pipeline ---

async function runPipeline(): Promise<void> {
  console.log('[pipeline] Starting...');
  await runMonitor();
  await runScorer();
  await runDrafter();
  console.log('[pipeline] Done.');
}

// --- Scheduler: Reddit + HN every 30 minutes ---

cron.schedule('*/30 * * * *', () => {
  console.log('[cron] Triggering Reddit/HN pipeline...');
  runPipeline().catch(console.error);
});

// --- Scheduler: Google News + SO + LinkedIn every 60 minutes ---

cron.schedule('0 * * * *', () => {
  console.log('[cron] Triggering extended monitor (Google News + SO + LinkedIn)...');
  runExtendedMonitor().then(() => runScorer()).then(() => runDrafter()).catch(console.error);
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`Orchestra Growth dashboard running at http://localhost:${PORT}`);
  console.log('[startup] Running initial pipeline...');
  runPipeline().catch(console.error);
});
