# KODIGO

## Prereqs
Python 3.10+, Node 18+. The first launch guides you through choosing an online AI provider (OpenAI or Gemini) or local Ollama. Online AI requires an API key; Ollama requires the Ollama app and a downloaded model such as `llama3`.

Image OCR uses the online OCR.space service by default and works without configuration through its shared demo key. For regular use, add your own free OCR.space API key in Settings. Uploaded images are sent to OCR.space when online OCR is selected. You can instead choose offline Tesseract in setup or Settings; offline OCR requires Tesseract installed and available on PATH.

## Run locally for testing
Open **two terminals** in the project folder and leave both running. In PowerShell, run:

### Terminal 1: Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The API will be available at http://localhost:8000 (interactive API docs: http://localhost:8000/docs).
The local Vite frontend uses this local API by default, ignoring the production API values in `.env`; set `VITE_LOCAL_API_URL` to override it. Production builds use `VITE_API_URL`, then `VITE_API_BASE_URL`, and otherwise the Render API.

### Terminal 2: Frontend
```powershell
cd frontend
npm install
npm run dev
```

Open the frontend at http://localhost:5173. Choose an AI provider and model in the first-run setup; provider, model, and OCR settings can be changed later in the in-app Settings panel.

## Google Drive sync
Google Drive sync backs up chats, references, academic profiles, and shareable app preferences in the selected KODIGO folder. API keys and other credential-like settings are excluded from Drive and remain on the device where they were entered. When syncing settings from another device, enter its API keys locally in Settings.
