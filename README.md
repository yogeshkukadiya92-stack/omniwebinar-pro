# OmniWebinar Pro - Enterprise Live Webinar Platform (WebinarJam & EverWebinar Alternative)

OmniWebinar Pro is a complete, production-grade **Full-Stack Live & Automated Webinar Platform** built with all the core and advanced capabilities of **WebinarJam** and **EverWebinar**.

---

## 🌟 Key Features Included

1. **🎙️ Host Studio (Live Stage)**:
   - WebRTC Camera, Microphone & Screen Sharing via browser APIs.
   - Live VU Audio Level Meter with active decibel monitoring.
   - Dynamic Stage Layouts: **Solo Speaker**, **Split 2-Up**, **Slides + PIP**.
   - Interactive Canvas Whiteboard / Pen Annotation over slides or video.

2. **📑 Slide Deck Presentation Controller & Annotation**:
   - Host can switch stage source between **Camera**, **Slide Deck**, and **Screen Share**.
   - 6 high-converting curriculum slides with Next (➡️) / Previous (⬅️) controls and live slide counter.
   - Speaker Notes drawer for presenter cues.
   - Whiteboard pen and highlighter draw directly over presentation slides.
   - Slide transitions instantly synchronize across all connected attendee screens via WebSockets.

3. **🙋 Dedicated Q&A System with Live Upvoting**:
   - Dedicated Q&A tab on both Host Studio and Attendee Room.
   - Attendees submit questions; other attendees vote with thumbs up (👍).
   - Real-time sort: highest-voted questions float to the top.
   - **"🎙️ Answer Live"**: Host clicks to pin the question to all attendee screens with a prominent glowing stage banner: *"Host is answering live: [Question text]"*.

4. **✋ Raise Hand & "Bring Attendee to Stage"**:
   - Attendees click **"✋ Raise Hand"** to request stage speaking permissions.
   - Host receives notification in the "Raised Hands" manager with real-time queue.
   - Host clicks **"🎙️ Invite to Stage"** -> Attendee receives an invitation modal with camera/mic permissions.
   - When accepted, the stage automatically switches to **Split 2-Up** with both the Host and Attendee on stage! Host can mute or remove them back to the audience at any time.

5. **🛡️ The Panic Button (WebinarJam Star Feature)**:
   - One-click disaster recovery mechanism.
   - Spins up a pre-warmed emergency shadow room and automatically migrates all attendees in under 3 seconds without page reload.

6. **💳 Real Payment & Checkout Engine (Stripe / Razorpay)**:
   - Enhanced 1-Click Checkout modal with payment options: **Credit/Debit Card**, **UPI / QR Scan**, and **Net Banking**.
   - Connects to backend `POST /api/checkout/create-order` endpoint.
   - Generates instant verified tax invoice and access credentials modal (`ORD-XXXXX`).

7. **📅 Calendar Integration (Google Calendar & .ics Download)**:
   - Seamless 1-click calendar sync on registration confirmation:
     - **"📅 Add to Google Calendar"** (pre-populated event title, description, time, and join URL).
     - **"🍎 Download .ics"** (RFC 5545 compliant calendar invite for Apple Calendar and Microsoft Outlook).

8. **🔄 Evergreen Automated Webinar Engine (EverWebinar Mode)**:
   - Toggle between **Live Broadcast** and **Evergreen Automated Replay** mode in the top header.
   - In Evergreen mode, automated timeline schedules realistic attendee comments, triggers polls at set timestamps, and pushes live offers automatically.

9. **🔥 Live Timed Offers (In-Webinar Sales Engine)**:
   - Pushes timed offer cards with animated countdown timers, strikethrough regular prices, deal pricing, scarcity unit badges, and 1-click checkout.

10. **📊 Live Polls & Quizzes**:
    - Host broadcasts questions; attendees vote in real-time, and animated percentage graphs render immediately.

11. **📎 Downloadable Handouts**:
    - Host pushes PDF cheat sheets and resources directly to attendees' screens with 1-click download.

12. **🤖 AI Webinar Assistant (Gemini 2.5 Flash)**:
    - Connected backend endpoint `POST /api/ai/co-host` providing instant, intelligent answers to pricing, replay, refund, and curriculum questions in < 300ms.

13. **📼 Replica Replay & Attendance Analytics**:
    - Minute-by-minute attendee retention curve and offer conversion telemetry.
    - Synchronized scrub timeline with chat, poll, and offer log markers.

---

## 🏗️ Full-Stack Backend Architecture

The platform runs a lightweight, ultra-performant Node.js + Express backend with SQLite (WAL mode) and WebSockets:

- **`server/server.js`**:
  - Express REST API (`/api/register`, `/api/calendar/:webinarId.ics`, `/api/checkout/create-order`, `/api/qna/:webinarId`, `/api/ai/co-host`, `/api/stats/:webinarId`).
  - WebSocket Server for real-time room events (Chat, Q&A upvotes, Live answering banner, Raise hand, Stage invites, Slide changes, Offers, Polls).
- **`server/db.js`**:
  - Built-in `node:sqlite` database with WAL mode.
  - Pre-migrated schemas for webinars, registrants, chat messages, Q&A questions with upvotes, polls, raised hands, and orders.
- **`start_dev.js`**:
  - Direct entry point that boots the full-stack server on `http://localhost:3000`.

---

## 🚀 How to Run the Platform

```bash
# 1. Install dependencies
npm install

# 2. Start the full-stack server
npm start
# or
node server/server.js
```

Open in your browser:
👉 **`http://localhost:3000`**

### Multi-Tab / Multi-Device Live Testing

1. Open `http://localhost:3000/` in **Tab 1** (Set View to **🎙️ Host Studio**).
2. Open `http://localhost:3000/` in **Tab 2** (Set View to **👥 Attendee View**).
3. In **Tab 2 (Attendee View)**:
   - Click **"✋ Raise Hand"** -> Tab 1 immediately gets a notification badge `✋ Hands (1)`.
   - In Tab 1, switch to the **Hands** tab and click **"🎙️ Invite"** -> Tab 2 displays the Stage Invite modal!
   - Click **"Accept & Join Stage"** -> Both screens transition into **Split 2-Up** with the guest speaker on stage!
   - In Tab 2, ask a question in the **Q&A** tab -> Tab 1 sees the question; host clicks **"🎙️ Answer Live"** -> Tab 2 displays the prominent live answering banner!
4. In **Tab 1 (Host Studio)**:
   - Switch Source to **"📑 Slides"** -> Click Next / Prev -> Tab 2 updates to the exact presentation slide in real-time!
   - Click **"Launch Live Offer"** -> Tab 2 pops the offer card with countdown timer.
   - Click **"Claim Offer"** in Tab 2, select Card or UPI, and click **"Pay Now"** -> An automated verified order receipt is generated instantly!
