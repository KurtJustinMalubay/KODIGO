# KODIGO

<p align="center">
  <img src="kodigo.png" alt="KODIGO Logo" width="180" />
</p>

<p align="center">
  <strong>Fast, Local-First AI Academic Tutor, Quiz Solver, and Class Record Assistant</strong>
</p>

<p align="center">
  Created & Developed by <strong>Kurt Justin J. Malubay (SASHIMI24)</strong>
</p>

---

## 🚀 Overview

**KODIGO** is a modern, privacy-focused educational assistant designed to solve quizzes, tutor students step-by-step, and manage academic performance with intelligent class record analysis.

### Key Architecture Highlights
- **100% Local-First Data Privacy**: All user conversations, messages, reference documents, academic profiles, and settings are stored locally on your device using **IndexedDB** and `localStorage`. No chat history or private documents are retained on backend servers.
- **Global Edge Compute**: The backend runs as a stateless, zero-dependency **Cloudflare Worker** connected directly to the **Google Gemini API**, providing near-instant responses with 0ms cold starts worldwide.
- **Cloudflare Pages SPA**: The frontend is a responsive React + Vite single-page application deployed on Cloudflare Pages.
- **Built-In Device Speech**:
  - **Speech-to-Text (STT)**: Uses your device's native browser speech recognition (`webkitSpeechRecognition` / `SpeechRecognition`) with zero cloud latency.
  - **Text-to-Speech (TTS)**: Uses device native `window.speechSynthesis` with automated math and LaTeX speech translation (pronouncing matrices, fractions, and symbols naturally).
- **Bulletproof LaTeX & Math Rendering**: Uses KaTeX with a custom preprocessor (`fixLatex`) to handle matrices, systems of equations, and complex inline math without rendering artifacts.
- **Class Record Intelligence**: Import class grade sheets (Excel `.xlsx`, `.csv`, `.pdf`, or AI vision parse) to build academic context for personalized Socratic tutoring.

---

## 🛠️ Modes & Features

| Mode | Purpose | Behavior |
| :--- | :--- | :--- |
| **Quiz Mode** | Quick quiz & test solving | Delivers only direct numbered answers (e.g. `1. A`, `2. 3.14`) with zero chat preamble or filler. |
| **Chat Mode** | Direct, step-by-step explanation | Direct, concise explanations with beautifully rendered LaTeX math blocks and step-by-step breakdowns. |
| **Tutor Mode** | Socratic academic coaching | Personalized tutor that reads your local academic profile, targets your weak subjects, and guides you to understand core principles. |
| **Academic Records** | Performance tracking | Import grade records, view grade distributions, filter tutoring sessions by subject, and export `.krec` backup files. |

---

## 🏗️ Project Structure

```text
kodigo/
├── frontend/                  # React + Vite Single-Page Application
│   ├── public/
│   │   ├── _redirects         # Cloudflare Pages SPA client-side routing
│   │   └── kodigo.png
│   ├── src/
│   │   ├── components/        # ChatFeed, InputBar, TutorWorkspace, Md (KaTeX)
│   │   ├── hooks/
│   │   │   └── useSpeech.js   # Native STT & TTS speech hooks
│   │   ├── utils/
│   │   │   ├── classRecordParser.js # Excel / CSV / AI record parser
│   │   │   └── imageOptimizer.js    # Client-side image compression & OCR
│   │   ├── api.js             # API client & local settings manager
│   │   ├── db.js              # Local IndexedDB storage engine
│   │   └── App.jsx
│   └── package.json
│
├── backend/                   # Cloudflare Worker Backend
│   ├── index.js               # Native Cloudflare Worker entrypoint (zero dependencies)
│   └── wrangler.toml          # Cloudflare Worker configuration
│
├── wrangler.toml              # Root Cloudflare Worker configuration
├── index.js                   # Root Worker entrypoint
└── README.md
```

---

## 🌐 Cloudflare Deployment

KODIGO is designed to deploy cleanly into Cloudflare:

### 1. Backend (Cloudflare Worker)
The backend is a lightweight JavaScript Worker with **zero external packages**:

1. In the **Cloudflare Dashboard**, navigate to **Workers & Pages** → **Create application** → **Worker**.
2. Connect your GitHub repository (`KODIGO`).
3. Set the build configuration:
   - **Root directory**: `backend`
   - **Build command**: *(leave empty)*
   - **Deploy command**: `npx wrangler deploy`
4. Under **Settings** → **Variables and Secrets**, add your secret:
   - Variable name: `GEMINI_API_KEY`
   - Value: *(your Google Gemini API key)*
5. Ensure your `workers.dev` route is enabled in **Settings** → **Domains & Routes**.

### 2. Frontend (Cloudflare Pages)
1. In **Workers & Pages**, select **Create application** → **Pages** → **Connect to Git**.
2. Select your repository and set:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Under **Settings** → **Environment variables**, set:
   - `VITE_API_BASE_URL` = `https://<your-worker-name>.<your-subdomain>.workers.dev`

---

## 💻 Local Development

### 1. Backend (Worker)
Make sure you have [Node.js](https://nodejs.org/) installed (v18+).

```bash
cd backend
npx wrangler dev
```
The local Worker API will start at `http://localhost:8787`.

### 2. Frontend (Vite)
Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🔑 Configuration & API Keys

KODIGO supports both server-provided API keys and user-supplied custom keys:
- **Server Key**: Configure `GEMINI_API_KEY` in your Cloudflare Worker secrets. Users can use the free tier immediately without entering a key.
- **Custom Key**: Users can open the in-app **Settings** modal and select **Custom API Key** to use their own personal Google Gemini API key (stored securely in their browser's `localStorage`).

---

## 📜 License & Credits

Developed with ❤️ by **Kurt Justin J. Malubay (SASHIMI24)**.  
All rights reserved.
