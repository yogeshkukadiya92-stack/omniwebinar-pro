const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const cors = require('cors');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '..')));

// --- REST Endpoints ---

// 1. Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'OmniWebinar Pro Enterprise Engine', uptime: process.uptime() });
});

// 2. Registration API
app.post('/api/register', (req, res) => {
  try {
    const { webinarId = 'webinar-101', firstName, lastName = '', email, phone = '' } = req.body;
    if (!firstName || !email) {
      return res.status(400).json({ error: 'First name and email are required' });
    }

    const id = 'reg_' + Math.random().toString(36).substring(2, 11);
    const joinToken = 'token_' + Math.random().toString(36).substring(2, 15);

    const stmt = db.prepare(`
      INSERT INTO registrants (id, webinar_id, first_name, last_name, email, phone, join_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, webinarId, firstName, lastName, email, phone, joinToken);

    const webinar = db.prepare('SELECT * FROM webinars WHERE id = ?').get(webinarId);
    const scheduledTime = webinar ? new Date(webinar.scheduled_at) : new Date(Date.now() + 86400000);
    const title = webinar ? webinar.title : 'Live AI Webinar Masterclass';

    // Google Calendar URL generator
    const startTimeISO = scheduledTime.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const endTimeISO = new Date(scheduledTime.getTime() + 60 * 60000).toISOString().replace(/-|:|\.\d\d\d/g, '');
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startTimeISO}/${endTimeISO}&details=${encodeURIComponent(`Join live via your unique link: http://localhost:3000/index.html?token=${joinToken}`)}&location=OmniWebinar+Live+Studio`;

    // .ics URL
    const icsUrl = `/api/calendar/${webinarId}.ics`;

    res.json({
      success: true,
      registrant: { id, firstName, email, joinToken },
      joinUrl: `/index.html?token=${joinToken}`,
      googleCalendarUrl: gCalUrl,
      icsCalendarUrl: icsUrl
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Dynamic .ics Calendar File Download
app.get('/api/calendar/:webinarId.ics', (req, res) => {
  const webinar = db.prepare('SELECT * FROM webinars WHERE id = ?').get(req.params.webinarId) || {
    id: 'webinar-101',
    title: 'High-Ticket AI Automation Masterclass 2026',
    description: 'Scale your AI Agency to $50k/mo without manual coding.',
    scheduled_at: new Date(Date.now() + 86400000).toISOString()
  };

  const start = new Date(webinar.scheduled_at);
  const end = new Date(start.getTime() + 60 * 60000);

  const formatICSDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OmniWebinar Pro//Enterprise Live Webinar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${webinar.id}-${Date.now()}@omniwebinar.io`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${webinar.title}`,
    `DESCRIPTION:${webinar.description} \\n\\nJoin URL: http://localhost:3000/index.html`,
    'LOCATION:OmniWebinar Live Studio',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Webinar starts in 15 minutes!',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="webinar-${webinar.id}.ics"`);
  res.send(icsContent);
});

// 4. Q&A Questions Fetch API
app.get('/api/qna/:webinarId', (req, res) => {
  const questions = db.prepare(`
    SELECT * FROM qna_questions 
    WHERE webinar_id = ? 
    ORDER BY upvotes DESC, created_at ASC
  `).all(req.params.webinarId);
  res.json({ questions });
});

// 5. Checkout & Order Processing API
app.post('/api/checkout/create-order', (req, res) => {
  try {
    const {
      webinarId = 'webinar-101',
      customerName,
      customerEmail,
      productTitle = 'AI Automation Agency Accelerator (Full License)',
      amount = 197,
      currency = 'USD',
      paymentMethod = 'card'
    } = req.body;

    const orderId = 'ord_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const paymentId = 'pay_' + Math.random().toString(36).substring(2, 15);

    const stmt = db.prepare(`
      INSERT INTO orders (id, webinar_id, customer_name, customer_email, product_title, amount, currency, status, payment_method, payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(orderId, webinarId, customerName, customerEmail, productTitle, amount, currency, 'completed', paymentMethod, paymentId);

    // Broadcast live sales toast to all connected clients!
    broadcast({
      type: 'ORDER_COMPLETED',
      order: {
        orderId,
        customerName: customerName.split(' ')[0] + ' ***',
        productTitle,
        amount,
        currency,
        timestamp: new Date().toLocaleTimeString()
      }
    });

    res.json({
      success: true,
      order: {
        orderId,
        paymentId,
        customerName,
        customerEmail,
        productTitle,
        amount,
        currency,
        status: 'PAID',
        receiptUrl: `/receipts/${orderId}`
      }
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. AI Co-Host Question Answer API
app.post('/api/ai/co-host', async (req, res) => {
  const { question, webinarContext = 'High-Ticket AI Automation Masterclass' } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question required' });
  }

  const qLower = question.toLowerCase();
  let aiAnswer = '';

  if (qLower.includes('price') || qLower.includes('cost') || qLower.includes('discount') || qLower.includes('offer')) {
    aiAnswer = "The exclusive live masterclass discount price is $197 (normally $997) with all 6 VIP bonuses included until the countdown timer expires!";
  } else if (qLower.includes('replay') || qLower.includes('recording') || qLower.includes('missed')) {
    aiAnswer = "Yes! Full HD Replica Replay access will be emailed to all registrants immediately after the live session finishes.";
  } else if (qLower.includes('refund') || qLower.includes('guarantee') || qLower.includes('risk')) {
    aiAnswer = "You are protected by our 30-day 100% money-back guarantee. If you don't generate your first client, you get a full no-questions-asked refund.";
  } else if (qLower.includes('slides') || qLower.includes('handout') || qLower.includes('notes')) {
    aiAnswer = "The official slide deck & cheatsheet PDF can be downloaded directly from the Handouts tab in the live room.";
  } else if (qLower.includes('beginner') || qLower.includes('experience') || qLower.includes('coding')) {
    aiAnswer = "Zero coding required! Everything taught uses modern visual no-code and low-code AI workflow orchestrators.";
  } else {
    aiAnswer = `Great question! Alex Vance is explaining this right now on the main stage. In summary: applying scalable AI agent architectures gives you a 10x competitive advantage. Feel free to ask more in the Q&A tab!`;
  }

  res.json({
    success: true,
    question,
    answer: aiAnswer,
    model: 'Gemini 2.5 Flash Enterprise Co-Host',
    latencyMs: 145
  });
});

// 7. Webinar Platform Statistics API
app.get('/api/stats/:webinarId', (req, res) => {
  const regCount = db.prepare('SELECT count(*) as c FROM registrants WHERE webinar_id = ?').get(req.params.webinarId).c;
  const orderCount = db.prepare('SELECT count(*) as c FROM orders WHERE webinar_id = ?').get(req.params.webinarId).c;
  const totalRevenue = db.prepare('SELECT sum(amount) as s FROM orders WHERE webinar_id = ?').get(req.params.webinarId).s || 0;
  const questionsCount = db.prepare('SELECT count(*) as c FROM qna_questions WHERE webinar_id = ?').get(req.params.webinarId).c;

  res.json({
    registrants: regCount,
    orders: orderCount,
    revenue: totalRevenue,
    questions: questionsCount
  });
});

// --- HTTP & WebSocket Server Setup ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Room state in memory
const roomState = {
  activeOffer: null,
  activePoll: null,
  pinnedChat: null,
  currentSlide: 1,
  totalSlides: 12,
  slideModeActive: false,
  raisedHands: [], // [{ id, attendeeId, attendeeName }]
  stageSpeakers: [], // [{ id, name, role }]
  answeringQuestion: null // active question being answered live
};

function broadcast(data, excludeWs = null) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws, req) => {
  ws.clientId = 'client_' + Math.random().toString(36).substring(2, 9);
  ws.isHost = false;

  // Send initial room snapshot to newly connected client
  ws.send(JSON.stringify({
    type: 'ROOM_SNAPSHOT',
    roomState,
    clientId: ws.clientId
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'JOIN_ROOM':
          ws.role = data.role || 'attendee';
          ws.name = data.name || (ws.role === 'host' ? 'Host Alex' : 'Attendee');
          ws.isHost = ws.role === 'host';
          break;

        case 'CHAT_MESSAGE': {
          const msgId = 'msg_' + Date.now();
          const stmt = db.prepare(`
            INSERT INTO chat_messages (id, webinar_id, sender_name, sender_role, message)
            VALUES (?, ?, ?, ?, ?)
          `);
          stmt.run(msgId, data.webinarId || 'webinar-101', data.sender, data.role || 'attendee', data.text);

          broadcast({
            type: 'CHAT_MESSAGE',
            id: msgId,
            sender: data.sender,
            text: data.text,
            isHost: data.isHost || false,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          break;
        }

        case 'CHAT_PIN':
          roomState.pinnedChat = data.message;
          broadcast({ type: 'CHAT_PIN', message: data.message });
          break;

        case 'CHAT_DELETE':
          broadcast({ type: 'CHAT_DELETE', id: data.id });
          break;

        case 'REACTION':
          broadcast({ type: 'REACTION', emoji: data.emoji }, ws);
          break;

        case 'OFFER_PUSH':
          roomState.activeOffer = data.offer;
          broadcast({ type: 'OFFER_PUSH', offer: data.offer });
          break;

        case 'POLL_LAUNCH':
          roomState.activePoll = data.poll;
          broadcast({ type: 'POLL_LAUNCH', poll: data.poll });
          break;

        case 'POLL_VOTE': {
          if (roomState.activePoll) {
            roomState.activePoll.votes = data.votes;
            broadcast({ type: 'POLL_VOTE_UPDATE', votes: data.votes });
          }
          break;
        }

        case 'HANDOUT_PUSH':
          broadcast({ type: 'HANDOUT_PUSH', handout: data.handout });
          break;

        case 'PANIC_TRIGGER':
          broadcast({ type: 'PANIC_TRIGGER', targetRoom: data.targetRoom });
          break;

        // Q&A System
        case 'QNA_ASK': {
          const qId = 'qna_' + Date.now();
          const stmt = db.prepare(`
            INSERT INTO qna_questions (id, webinar_id, author_id, author_name, question, upvotes)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          stmt.run(qId, data.webinarId || 'webinar-101', ws.clientId, data.authorName, data.question, 1);

          broadcast({
            type: 'QNA_NEW_QUESTION',
            question: {
              id: qId,
              authorName: data.authorName,
              question: data.question,
              upvotes: 1,
              isAnswered: false,
              answerText: null,
              createdAt: new Date().toLocaleTimeString()
            }
          });
          break;
        }

        case 'QNA_UPVOTE': {
          const q = db.prepare('SELECT upvotes FROM qna_questions WHERE id = ?').get(data.questionId);
          if (q) {
            const newVotes = q.upvotes + 1;
            db.prepare('UPDATE qna_questions SET upvotes = ? WHERE id = ?').run(newVotes, data.questionId);
            broadcast({
              type: 'QNA_UPVOTE_UPDATE',
              questionId: data.questionId,
              upvotes: newVotes
            });
          }
          break;
        }

        case 'QNA_ANSWER_LIVE':
          roomState.answeringQuestion = data.question;
          broadcast({
            type: 'QNA_ANSWERING_LIVE',
            question: data.question
          });
          break;

        case 'QNA_DISMISS_LIVE':
          roomState.answeringQuestion = null;
          broadcast({ type: 'QNA_ANSWERING_LIVE', question: null });
          break;

        // Raise Hand & Stage Controls
        case 'RAISE_HAND': {
          const existing = roomState.raisedHands.find(h => h.attendeeId === ws.clientId);
          if (!existing) {
            const item = { id: 'hand_' + Date.now(), attendeeId: ws.clientId, attendeeName: data.attendeeName || 'Attendee' };
            roomState.raisedHands.push(item);
            broadcast({ type: 'RAISED_HANDS_UPDATE', raisedHands: roomState.raisedHands });
          }
          break;
        }

        case 'LOWER_HAND': {
          roomState.raisedHands = roomState.raisedHands.filter(h => h.attendeeId !== (data.attendeeId || ws.clientId));
          broadcast({ type: 'RAISED_HANDS_UPDATE', raisedHands: roomState.raisedHands });
          break;
        }

        case 'INVITE_TO_STAGE': {
          broadcast({
            type: 'STAGE_INVITATION',
            attendeeId: data.attendeeId,
            attendeeName: data.attendeeName
          });
          break;
        }

        case 'ACCEPT_STAGE_INVITE': {
          roomState.raisedHands = roomState.raisedHands.filter(h => h.attendeeId !== ws.clientId);
          const speaker = { id: ws.clientId, name: data.attendeeName || 'Guest Speaker', role: 'guest_speaker' };
          if (!roomState.stageSpeakers.some(s => s.id === speaker.id)) {
            roomState.stageSpeakers.push(speaker);
          }
          broadcast({
            type: 'STAGE_SPEAKERS_UPDATE',
            speakers: roomState.stageSpeakers,
            raisedHands: roomState.raisedHands
          });
          break;
        }

        case 'REMOVE_FROM_STAGE': {
          roomState.stageSpeakers = roomState.stageSpeakers.filter(s => s.id !== data.speakerId);
          broadcast({
            type: 'STAGE_SPEAKERS_UPDATE',
            speakers: roomState.stageSpeakers,
            removedSpeakerId: data.speakerId
          });
          break;
        }

        // Slide Deck Presentation
        case 'SLIDE_CHANGE':
          roomState.currentSlide = data.slideNumber;
          roomState.slideModeActive = data.slideModeActive !== undefined ? data.slideModeActive : true;
          broadcast({
            type: 'SLIDE_CHANGE',
            slideNumber: data.slideNumber,
            slideModeActive: roomState.slideModeActive
          });
          break;

        case 'WHITEBOARD_DRAW':
          broadcast({ type: 'WHITEBOARD_DRAW', stroke: data.stroke }, ws);
          break;

        case 'WHITEBOARD_CLEAR':
          broadcast({ type: 'WHITEBOARD_CLEAR' }, ws);
          break;

        // WebRTC Signaling Relay (for direct peer video/audio streaming between host & attendee)
        case 'SIGNAL':
          broadcast({
            type: 'SIGNAL',
            from: ws.clientId,
            data: data.data
          }, ws);
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('WebSocket message handling error:', e);
    }
  });

  ws.on('close', () => {
    roomState.raisedHands = roomState.raisedHands.filter(h => h.attendeeId !== ws.clientId);
    roomState.stageSpeakers = roomState.stageSpeakers.filter(s => s.id !== ws.clientId);
    broadcast({
      type: 'RAISED_HANDS_UPDATE',
      raisedHands: roomState.raisedHands
    });
    broadcast({
      type: 'STAGE_SPEAKERS_UPDATE',
      speakers: roomState.stageSpeakers
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 OmniWebinar Pro Enterprise Engine active!`);
  console.log(`📡 HTTP & WebSocket running on http://localhost:${PORT}`);
  console.log(`💾 SQLite Database connected with WAL mode`);
  console.log(`====================================================`);
});
