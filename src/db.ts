// Uses the built-in node:sqlite module (Node.js >= 22.5)
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'leads.db');

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    initSchema(db);
  }
  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      url TEXT UNIQUE,
      title TEXT,
      body TEXT,
      author TEXT,
      score INTEGER,
      score_reason TEXT,
      drafted_message TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export interface Lead {
  id: number;
  source: string;
  url: string;
  title: string;
  body: string;
  author: string;
  score: number | null;
  score_reason: string | null;
  drafted_message: string | null;
  status: 'new' | 'approved' | 'dismissed' | 'sent';
  created_at: string;
}

export function insertLead(lead: Omit<Lead, 'id' | 'score' | 'score_reason' | 'drafted_message' | 'status' | 'created_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO leads (source, url, title, body, author)
    VALUES (?, ?, ?, ?, ?)
  `).run(lead.source, lead.url, lead.title, lead.body, lead.author);
}

export function getUnscoredLeads(): Lead[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM leads WHERE score IS NULL ORDER BY created_at DESC`).all() as Lead[];
}

export function getScoredUndraftedLeads(): Lead[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM leads WHERE score >= 7 AND drafted_message IS NULL ORDER BY score DESC
  `).all() as Lead[];
}

export function updateScore(id: number, score: number, reason: string, relevantAgents: string[]): void {
  const db = getDb();
  db.prepare(`
    UPDATE leads SET score = ?, score_reason = ? WHERE id = ?
  `).run(score, `${reason}\nRelevant agents: ${relevantAgents.join(', ')}`, id);
}

export function updateDraft(id: number, message: string): void {
  const db = getDb();
  db.prepare(`UPDATE leads SET drafted_message = ? WHERE id = ?`).run(message, id);
}

export function updateStatus(id: number, status: Lead['status']): void {
  const db = getDb();
  db.prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, id);
}

export function getLeadsByStatus(status?: string, minScore?: number): Lead[] {
  const db = getDb();
  if (status && minScore !== undefined) {
    return db.prepare(`SELECT * FROM leads WHERE status = ? AND score >= ? ORDER BY score DESC, created_at DESC`).all(status, minScore) as Lead[];
  } else if (status) {
    return db.prepare(`SELECT * FROM leads WHERE status = ? ORDER BY score DESC, created_at DESC`).all(status) as Lead[];
  } else if (minScore !== undefined) {
    return db.prepare(`SELECT * FROM leads WHERE score >= ? ORDER BY score DESC, created_at DESC`).all(minScore) as Lead[];
  }
  return db.prepare(`SELECT * FROM leads ORDER BY score DESC, created_at DESC`).all() as Lead[];
}

export function getAllLeads(): Lead[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM leads ORDER BY COALESCE(score, 0) DESC, created_at DESC`).all() as Lead[];
}
