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
  if (customKey && customKey.trim()) return customKey.trim();
  const headers = request.headers;
  for (const h of ["x-custom-api-key", "x-cloud-api-key", "x-api-key"]) {
    const val = headers.get(h);
    if (val && val.trim()) return val.trim();
  }
  if (env && env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
    return env.GEMINI_API_KEY.trim();
  }
  if (env && env.GOOGLE_API_KEY && env.GOOGLE_API_KEY.trim()) {
    return env.GOOGLE_API_KEY.trim();
  }
  return "";
}

async function callGemini(apiKey, modelName, systemInstruction, userPrompt) {
  let model = (modelName || "gemini-2.5-flash").trim();
  if (model.startsWith("models/")) {
    model = model.slice("models/".length);
  }
  if (!model) model = "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: String(userPrompt) }],
      },
    ],
  };

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
    if (path === "/health" || path === "/") {
      return jsonResponse({
        status: "ok",
        app: "KODIGO",
        runtime: "Cloudflare Worker (JavaScript Edge)",
        version: "1.0.0",
      });
    }

    // 2. Server settings check
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

      let body = {};
      try {
        body = await request.json();
      } catch {}

      const prompt = body.message || body.prompt || "";
      if (!prompt) {
        return errorResponse("Missing 'message' field in JSON body.", 400);
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
        return jsonResponse({ reply });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    // 5. Messages endpoint: POST /api/chats/:id/messages
    if (/^\/api\/chats\/[^/]+\/messages$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      let body = {};
      try {
        body = await request.json();
      } catch {}

      let content = body.content || "";
      const mode = body.mode || "quiz";
      const ocrText = body.client_ocr_text || "";
      if (ocrText) {
        content = `${content}\n\n[Attached Extracted Text / Image Content]:\n${ocrText}`;
      }

      const apiKey = resolveApiKey(request, env);
      if (!apiKey) {
        return errorResponse(
          "No API key provided. Please configure your Google Gemini API key in Settings or add GEMINI_API_KEY in Cloudflare Worker secrets.",
          400
        );
      }

      const sysPrompt =
        mode === "quiz" ? QUIZ_SYS : mode === "tutor" ? TUTOR_SYS : CHAT_SYS;
      const modelName = request.headers.get("x-model-name") || "gemini-2.5-flash";

      try {
        const reply = await callGemini(apiKey, modelName, sysPrompt, content);
        return jsonResponse({
          id: Date.now(),
          chat_id: 1,
          sender: "ai",
          mode,
          content: reply,
          image_path: null,
          has_explanation: false,
          detailed_explanation: null,
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    // 6. Detailed Explanation: POST /api/messages/:id/explain
    if (/^\/api\/messages\/[^/]+\/explain$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      let body = {};
      try {
        body = await request.json();
      } catch {}

      const content = body.content || "";
      const apiKey = resolveApiKey(request, env);
      if (!apiKey) {
        return errorResponse("No API key provided.", 400);
      }

      const explainPrompt =
        "Provide a rigorous, step-by-step mathematical or logical explanation for the question and solution below. " +
        "MANDATORY FORMATTING RULES: " +
        "1. Use standard Markdown: **bold**, *italic*, numbered lists, bullet lists. " +
        "2. For ALL math, use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math. " +
        "3. For matrices, systems of equations, and multi-line equations (\\begin{pmatrix}, \\begin{bmatrix}, \\begin{cases}, \\begin{aligned}), ALWAYS wrap in $$...$$ on their own lines, NEVER single $. " +
        "4. NEVER nest delimiters: NEVER write $$ $...$ $$ or $ $$...$$ $. " +
        "5. NEVER use \\\\ (double backslash) for line breaks in plain text.\n\n" +
        content;

      const modelName = request.headers.get("x-model-name") || "gemini-2.5-flash";
      try {
        const reply = await callGemini(apiKey, modelName, CHAT_SYS, explainPrompt);
        return jsonResponse({ detailed_explanation: reply });
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
