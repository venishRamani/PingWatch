### PingWatch // API Uptime & Health Monitor

A lightweight developer-tool system built to monitor HTTP/HTTPS endpoints, log response latencies, and track service uptime automatically using background cron workers.

---

### Tech Stack
* **Runtime:** Node.js, Express
* **Database:** SQLite (with automated tables for monitors and check logs)
* **Automation:** `node-cron` (background health-check worker)
* **HTTP Client:** `Axios`

---

### Key Features
* **Automated Background Pings:** Runs background workers on a schedule to check endpoint availability.
* **Latency Logging:** Records exact millisecond response times and status codes (`200`, `404`, `500`).
* **All-in-One Architecture:** Combines backend API routes and a clean dark-mode dashboard into a single streamlined service.
