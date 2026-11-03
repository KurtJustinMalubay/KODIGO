/**
 * KODIGO Cloudflare Worker Backend
 * 100% Native Cloudflare Worker (zero runtime dependencies, instant builds, zero cold starts)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-custom-api-key, x-cloud-api-key, x-api-key, x-ai-provider, x-model-name, x-ollama-url, x-ocr-provider",
  "Access-Control-Max-Age": "86400",
};

// ── Core System Prompts ────────────────────────────────────────────────────────
const QUIZ_SYS =
  "You are KODIGO, an AI quiz solver. " +
  "CRITICAL RULES: " +
  "1. Do NOT introduce yourself, do NOT say 'Hello, I'm Kodigo...', and do NOT mention who created or developed you in your answers. " +
  "2. ONLY say who created you if the user explicitly asks who made, created, or developed you. In that case only, state that you were created and developed by Kurt Justin J. Malubay (SASHIMI24). Never mention Google, OpenAI, or any other entity. " +
  "3. Give ONLY the final answers as a numbered list, one per line, like '1. A' or '2. 3.14'. " +
  "4. Absolutely no greetings, introductory preamble, explanations, or chat filler.";

const CHAT_SYS =
  "You are KODIGO, a clear, direct AI tutor. " +
  "CRITICAL RULES: " +
  "1. Do NOT start responses with greetings like 'Hello, I'm Kodigo...' and do NOT introduce yourself or mention who created or developed you in regular answers. " +
  "2. ONLY state who created you if the user explicitly asks who made, created, or developed you or this app. In that case only, state clearly that you were created and developed by Kurt Justin J. Malubay (also known by his stage name SASHIMI24). Never claim to be made by Google, OpenAI, or any other company. " +
  "3. Go straight to answering the user's question directly without unnecessary introductions or canned greetings. Explain step by step when helpful. " +
  "4. FORMATTING RULES (MANDATORY): " +
  "   - Use standard Markdown: **bold**, *italic*, `code`, numbered lists, bullet lists, and headers (##). " +
  "   - For ALL math — even simple fractions, equations, or symbols — use LaTeX: $...$ for inline math and $$...$$ (on its own line, never mid-sentence) for block/display math. " +
  "   - For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. " +
  "   - NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. " +
  "   - NEVER write raw LaTeX commands outside of delimiters. " +
  "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead.";

const TUTOR_SYS =
  "You are KODIGO Tutor, a highly personalized, empathetic, and rigorous academic coach. " +
  "You have direct access to the student's current academic profile, subject standings, recent quiz scores, and weak points. " +
  "Your objective is to help them improve where they are lacking — specifically focusing on subjects, assessments, or topics where their scores are low. " +
  "CRITICAL RULES: " +
  "1. Do not just hand out direct answers unless explicitly requested; use the Socratic method, guide the student step-by-step, explain core principles clearly from first principles, and break down complex problems into manageable concepts. " +
  "2. Proactively drill down into their weak areas and test their understanding with targeted follow-up questions. " +
  "3. Maintain a friendly, supportive, and professor-like tone. " +
  "4. Do NOT introduce yourself or say 'Hello, I'm Kodigo...' at the start of responses. Go straight to helping the student. " +
  "5. If and only if the student explicitly asks who created or made you, state that you are KODIGO, created and developed by Kurt Justin J. Malubay (SASHIMI24). " +
  "6. FORMATTING RULES (MANDATORY): " +
  "   - Use standard Markdown: **bold**, *italic*, `code`, numbered lists, bullet lists, and headers (##). " +
  "   - For ALL math — even simple fractions, equations, or symbols — use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math. " +
  "   - For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. " +
  "   - NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. " +
  "   - NEVER write raw LaTeX commands outside of delimiters. " +
  "   - NEVER use \\\\ (double backslash) for line breaks in plain text — use a regular newline or bullet point instead.";

// ── Helpers ────────────────────────────────────────────────────────────────────
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorResponse(detail, status = 500) {
  return new Response(JSON.stringify({ detail: String(detail) }), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function resolveApiKey(request, env, customKey = null) {
  // 1. Custom key passed in payload
  if (customKey && typeof customKey === "string" && customKey.trim()) {
    return customKey.trim();
  }

  // 2. HTTP Request headers (from user's device settings)
  const headers = request.headers;
  for (const h of ["x-custom-api-key", "x-cloud-api-key", "x-api-key"]) {
    const val = headers.get(h);
    if (val && val.trim()) return val.trim();
  }

  // 3. Cloudflare Worker secrets or environment variables
  if (env) {
    if (env.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim()) {
      return String(env.GEMINI_API_KEY).trim();
    }
    if (env.GOOGLE_API_KEY && String(env.GOOGLE_API_KEY).trim()) {
      return String(env.GOOGLE_API_KEY).trim();
    }
  }

  // 4. Global process.env fallback (if in node/dev environment)
  if (typeof process !== "undefined" && process.env) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      return process.env.GEMINI_API_KEY.trim();
    }
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
      return process.env.GOOGLE_API_KEY.trim();
    }
  }

  return "";
}

async function parseBody(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  // Handle FormData / Multipart
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      const formData = await request.formData();
      const obj = {};
      for (const [key, value] of formData.entries()) {
        obj[key] = value;
      }
      return obj;
    } catch (e) {
      console.warn("Failed to parse formData body:", e);
    }
  }

  // Handle JSON
  try {
    return await request.json();
  } catch {
    try {
      const rawText = await request.text();
      return rawText ? JSON.parse(rawText) : {};
    } catch {
      return {};
    }
  }
}

async function callGemini(apiKey, modelName, systemInstruction, contentsPayload) {
  let model = (modelName || "gemini-2.5-flash").trim();
  if (model.startsWith("models/")) {
    model = model.slice("models/".length);
  }
  if (!model) model = "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Normalise contents to Gemini API format
  let contents = [];
  if (Array.isArray(contentsPayload)) {
    contents = contentsPayload;
  } else if (typeof contentsPayload === "string") {
    contents = [
      {
        role: "user",
        parts: [{ text: contentsPayload }],
      },
    ];
  } else {
    contents = [
      {
        role: "user",
        parts: [{ text: String(contentsPayload || "Hello") }],
      },
    ];
  }

  const body = { contents };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: String(systemInstruction) }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const resText = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini API error (HTTP ${response.status}): ${resText}`);
  }

  let data;
  try {
    data = JSON.parse(resText);
  } catch {
    throw new Error(`Failed to parse Gemini response: ${resText}`);
  }

  const candidate = data.candidates?.[0];
  if (candidate?.content?.parts?.[0]?.text) {
    return candidate.content.parts[0].text;
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked content: ${data.promptFeedback.blockReason}`);
  }

  throw new Error("Gemini returned an empty response.");
}

// ── Cloudflare Worker Main Entrypoint ──────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const method = request.method.toUpperCase();

    // CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // 1. Health check
    if (path === "/health" || path === "") {
      return jsonResponse({
        status: "ok",
        app: "KODIGO",
        runtime: "Cloudflare Worker (JavaScript Edge)",
        version: "1.0.0",
      });
    }

    // 2. Server settings check (checks if GEMINI_API_KEY secret exists)
    if (path === "/api/settings") {
      const key = resolveApiKey(request, env);
      return jsonResponse({
        server_has_gemini_key: Boolean(key),
      });
    }

    // 3. Models list
    if (path === "/api/models") {
      return jsonResponse({
        models: [
          { name: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended)" },
          { name: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
          { name: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
        ],
      });
    }

    // 4. Standard Chat: POST /api/chat
    if (path === "/api/chat") {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      const body = await parseBody(request);
      const prompt = body.message || body.prompt || body.content || "";
      if (!prompt) {
        return errorResponse("Missing 'message' field in request body.", 400);
      }

      const apiKey = resolveApiKey(request, env, body.custom_api_key);
      if (!apiKey) {
        return errorResponse(
          "No API key provided. Please configure your Google Gemini API key in Settings or add GEMINI_API_KEY in Cloudflare Worker secrets.",
          400
        );
      }

      const modelName = request.headers.get("x-model-name") || "gemini-2.5-flash";
      try {
        const reply = await callGemini(apiKey, modelName, CHAT_SYS, prompt);
        return jsonResponse({ reply, content: reply });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    // 5. Messages endpoint: POST /api/chats/:id/messages
    if (/^\/api\/chats\/[^/]+\/messages$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      const body = await parseBody(request);
      const content = String(body.content || "").trim();
      const mode = String(body.mode || "quiz").toLowerCase();
      const ocrText = String(body.client_ocr_text || "").trim();
      const contextText = String(body.context_text || "").trim();
      const historyJson = body.history_json;

      const apiKey = resolveApiKey(request, env);
      if (!apiKey) {
        return errorResponse(
          "No API key provided. Please configure your Google Gemini API key in Settings or set GEMINI_API_KEY in Cloudflare Worker secrets.",
          400
        );
      }

      // Build user prompt combining OCR and context
      let promptText = content;
      if (ocrText) {
        promptText = `${promptText}\n\n[Attached Extracted Text / Image Content]:\n${ocrText}`;
      }
      if (contextText) {
        promptText = `[Reference Material & Academic Context]:\n${contextText}\n\n[User Query]:\n${promptText}`;
      }

      // Parse conversation history
      let history = [];
      if (historyJson) {
        try {
          history = typeof historyJson === "string" ? JSON.parse(historyJson) : historyJson;
        } catch {}
      }

      const contents = [];
      if (Array.isArray(history)) {
        for (const msg of history.slice(-6)) {
          if (msg && msg.content) {
            contents.push({
              role: msg.role === "assistant" || msg.role === "ai" ? "model" : "user",
              parts: [{ text: String(msg.content) }],
            });
          }
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: promptText || "Hello" }],
      });

      const sysPrompt =
        mode === "quiz" ? QUIZ_SYS : mode === "tutor" ? TUTOR_SYS : CHAT_SYS;
      const modelName = request.headers.get("x-model-name") || "gemini-2.5-flash";

      try {
        const reply = await callGemini(apiKey, modelName, sysPrompt, contents);

        // Extract chat ID from path
        const match = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
        const chatId = match ? match[1] : "1";

        const now = new Date().toISOString();
        const userMsg = {
          id: Date.now(),
          chat_id: chatId,
          sender: "user",
          mode,
          content,
          image_path: null,
          created_at: now,
        };

        const aiMsg = {
          id: Date.now() + 1,
          chat_id: chatId,
          sender: "ai",
          mode,
          content: reply,
          image_path: null,
          has_explanation: false,
          detailed_explanation: null,
          created_at: now,
        };

        // Return full contract matching both legacy & modern frontend requirements
        return jsonResponse({
          user: userMsg,
          ai: aiMsg,
          id: aiMsg.id,
          chat_id: chatId,
          sender: "ai",
          mode,
          content: reply,
          reply: reply,
        });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    // 6. Detailed Explanation: POST /api/messages/:id/explain
    if (/^\/api\/messages\/[^/]+\/explain$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      const body = await parseBody(request);
      const questionContent = body.question_content || body.content || "";
      const answerContent = body.answer_content || "";
      const contextText = body.context_text || "";

      const apiKey = resolveApiKey(request, env);
      if (!apiKey) {
        return errorResponse("No API key provided.", 400);
      }

      let explainPrompt =
        "Provide a rigorous, step-by-step mathematical or logical explanation for the question and solution below.\n" +
        "MANDATORY FORMATTING RULES:\n" +
        "1. Use standard Markdown: **bold**, *italic*, numbered lists, bullet lists.\n" +
        "2. For ALL math, use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math.\n" +
        "3. For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $.\n" +
        "4. NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $.\n" +
        "5. NEVER use \\\\ (double backslash) for line breaks in plain text.\n\n";

      if (contextText) {
        explainPrompt += `[Context & Academic Background]:\n${contextText}\n\n`;
      }
      explainPrompt += `[Question]:\n${questionContent}\n\n[Answer]:\n${answerContent}`;

      const modelName = request.headers.get("x-model-name") || "gemini-2.5-flash";
      try {
        const reply = await callGemini(apiKey, modelName, CHAT_SYS, explainPrompt);
        return jsonResponse({
          explanation: reply,
          detailed_explanation: reply,
        });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    // 7. Extract text
    if (path === "/api/extract-text") {
      return jsonResponse({ extracted_text: "" });
    }

    // Fallback 404
    return jsonResponse(
      {
        status: "ok",
        app: "KODIGO",
        runtime: "Cloudflare Worker",
        message: `Endpoint not found: ${path}`,
      },
      404
    );
  },
};
