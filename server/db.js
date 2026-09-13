const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'webinar.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webinars (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      host_name TEXT DEFAULT 'Alex Vance',
      status TEXT DEFAULT 'scheduled',
      is_evergreen INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registrants (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      join_token TEXT UNIQUE NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      attended INTEGER DEFAULT 0,
      watched_seconds INTEGER DEFAULT 0,
      saw_offer INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT DEFAULT 'attendee',
      message TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS qna_questions (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT NOT NULL,
      question TEXT NOT NULL,
      upvotes INTEGER DEFAULT 1,
      is_answered INTEGER DEFAULT 0,
      answer_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS qna_upvotes (
      question_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      PRIMARY KEY (question_id, voter_id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      PRIMARY KEY (poll_id, voter_id)
    );

    CREATE TABLE IF NOT EXISTS raised_hands (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      attendee_id TEXT NOT NULL,
      attendee_name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      product_title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'completed',
      payment_method TEXT DEFAULT 'card',
      payment_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default webinar if not exists
  const checkWebinar = db.prepare('SELECT id FROM webinars WHERE id = ?').get('webinar-101');
  if (!checkWebinar) {
    const insert = db.prepare(`
      INSERT INTO webinars (id, title, description, scheduled_at, duration_minutes, host_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const date = new Date(Date.now() + 86400000).toISOString();
    insert.run(
      'webinar-101',
      'High-Ticket AI Automation Masterclass 2026',
      'Scale your AI Agency to $50k/mo without manual coding or hiring.',
      date,
      60,
      'Alex Vance & Sophia Miller',
      'live'
    );
  }
}

initDb();

module.exports = {
  db
};
