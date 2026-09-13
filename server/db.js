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

    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      template_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_content TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS broadcast_logs (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      segment TEXT NOT NULL,
      subject TEXT,
      recipient_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      clicks INTEGER DEFAULT 0,
      registrations INTEGER DEFAULT 0,
      sales_count INTEGER DEFAULT 0,
      commission_amount REAL DEFAULT 0,
      payout_status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS handouts (
      id TEXT PRIMARY KEY,
      webinar_id TEXT NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      filesize TEXT DEFAULT '4.2 MB',
      file_type TEXT DEFAULT 'PDF',
      download_url TEXT NOT NULL,
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

  // Seed default email templates if empty
  const templateCount = db.prepare('SELECT count(*) as c FROM email_templates').get().c;
  if (templateCount === 0) {
    const insertTpl = db.prepare(`
      INSERT INTO email_templates (id, webinar_id, template_type, subject, body_content)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertTpl.run('tpl_1', 'webinar-101', 'CONFIRMATION', '🎟️ Your VIP Pass: High-Ticket AI Masterclass', 'We have prepared an extraordinary presentation covering high-conversion funnel architecture and zero-downtime streaming.');
    insertTpl.run('tpl_2', 'webinar-101', 'REMINDER_24H', '⏰ 24 Hours Left: Live AI Agency Masterclass', 'Get your notepad ready. Tomorrow we break down the exact automations generating $50,000/mo.');
    insertTpl.run('tpl_3', 'webinar-101', 'REPLAY_OFFER', '⚡ Replay & Limited Time $197 Bundle', 'Missed the live broadcast? Catch the full interactive replay and claim your bonuses before midnight.');
  }

  // Seed initial affiliates if empty
  const affiliateCount = db.prepare('SELECT count(*) as c FROM affiliates').get().c;
  if (affiliateCount === 0) {
    const insertAff = db.prepare(`
      INSERT INTO affiliates (id, name, code, clicks, registrations, sales_count, commission_amount, payout_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAff.run('aff_1', 'Rahul Sharma (Tech Lead)', 'rahul_tech', 1420, 280, 22, 1300.20, 'PAID');
    insertAff.run('aff_2', 'Growth Media Agency', 'growth_agency', 2140, 420, 34, 2009.40, 'PAID');
    insertAff.run('aff_3', 'Priya Patel Coaching', 'priya_vip', 890, 195, 16, 945.60, 'PENDING');
  }

  // Seed initial handouts if empty
  const handoutCount = db.prepare('SELECT count(*) as c FROM handouts').get().c;
  if (handoutCount === 0) {
    const insertHandout = db.prepare(`
      INSERT INTO handouts (id, webinar_id, title, filename, filesize, file_type, download_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertHandout.run('handout_1', 'webinar-101', 'Webinar_Blueprint_2026.pdf', 'Webinar_Blueprint_2026.pdf', '4.2 MB', 'PDF', '/api/handouts/download/blueprint.pdf');
  }
}

initDb();

module.exports = {
  db
};
