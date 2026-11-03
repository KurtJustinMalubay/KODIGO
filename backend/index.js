/**
 * KODIGO Cloudflare Worker Backend
 * Native Cloudflare Worker — zero dependencies, instant cold starts.
 *
 * GEMINI_API_KEY must be set as a Cloudflare Worker Secret (dashboard → Settings → Variables).
 * It is automatically injected into the `env` parameter of the fetch handler.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-custom-api-key, x-cloud-api-key, x-api-key, x-ai-provider, x-model-name, x-ollama-url, x-ocr-provider",
  "Access-Control-Max-Age": "86400",
};

// ── Default model ──────────────────────────────────────────────────────────────
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// ── Curated Models ─────────────────────────────────────────────────────────────
const CURATED_MODELS = {
  gemini: [
    {
      id: "gemini-3.5-flash-lite",
      name: "Gemini 3.5 Flash Lite",
      badge: "Recommended • Free Tier",
      description: "Fastest, low-latency model optimized for quick queries, tutoring, and quizzes.",
      is_recommended: true,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      badge: "Fast",
      description: "Fast and efficient model available on the free tier.",
      is_recommended: false,
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      badge: "Stable",
      description: "Reliable, large context window model.",
      is_recommended: false,
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      badge: "Most Capable",
      description: "Most capable model for complex reasoning and analysis.",
      is_recommended: false,
    },
  ],
  openai: [
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      badge: "Recommended • Fast",
      description: "Fast, intelligent, and affordable OpenAI model.",
      is_recommended: true,
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      badge: "High Intelligence",
      description: "Flagship multimodal OpenAI model.",
      is_recommended: false,
    },
  ],
  ollama: [
    {
      id: "llama3",
      name: "Llama 3",
      badge: "Local",
      description: "Local model running on your machine.",
      is_recommended: true,
    },
  ],
};

// ── System Prompts ─────────────────────────────────────────────────────────────
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
  "Your objective is to help students improve where they are lacking. " +
  "CRITICAL RULES: " +
  "1. Do not just hand out direct answers unless explicitly requested; use the Socratic method, guide the student step-by-step, and explain core principles clearly. " +
  "2. Proactively drill down into weak areas and test understanding with targeted follow-up questions. " +
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
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({}, CORS_HEADERS, {
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

function errorResponse(detail, status) {
  return new Response(JSON.stringify({ detail: String(detail) }), {
    status: status || 500,
    headers: Object.assign({}, CORS_HEADERS, {
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

/**
 * Resolve the Gemini API key from multiple sources, in priority order:
 *  1. Custom key passed in request payload (body.custom_api_key)
 *  2. Custom key passed in request headers (x-custom-api-key, x-cloud-api-key, x-api-key)
 *  3. Cloudflare Worker secret bound via `env` (GEMINI_API_KEY)
 *
 * NOTE: Cloudflare Workers do NOT have `process.env`. Secrets are only
 *       available via the `env` parameter injected by the runtime.
 */
function resolveApiKey(request, env, customKey) {
  // 1. Custom key passed in payload body
  if (customKey && typeof customKey === "string" && customKey.trim()) {
    return customKey.trim();
  }

  // 2. Custom key in request headers
  var headerNames = ["x-custom-api-key", "x-cloud-api-key", "x-api-key"];
  for (var i = 0; i < headerNames.length; i++) {
    var headerVal = request.headers.get(headerNames[i]);
    if (headerVal && headerVal.trim()) {
      return headerVal.trim();
    }
  }

  // 3. Cloudflare Worker secrets (env is the ONLY way to access secrets in Workers)
  if (env && typeof env === "object") {
    // Try common key names (exact match first)
    var keyNames = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "gemini_api_key", "google_api_key", "API_KEY"];
    for (var j = 0; j < keyNames.length; j++) {
      var envVal = env[keyNames[j]];
      if (envVal && typeof envVal === "string" && envVal.trim()) {
        return envVal.trim();
      }
    }

    // Case-insensitive fallback across all env keys
    var envEntries = Object.entries(env);
    for (var k = 0; k < envEntries.length; k++) {
      var key = envEntries[k][0];
      var val = envEntries[k][1];
      if (
        /gemini.*api.*key|google.*api.*key/i.test(key) &&
        typeof val === "string" &&
        val.trim()
      ) {
        return val.trim();
      }
    }
  }

  return "";
}

async function parseBody(request) {
  var contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    try {
      var formData = await request.formData();
      var obj = {};
      formData.forEach(function(value, key) {
        obj[key] = value;
      });
      return obj;
    } catch (e) {
      console.warn("Failed to parse formData:", e);
    }
  }

  try {
    return await request.json();
  } catch (e1) {
    try {
      var rawText = await request.text();
      return rawText ? JSON.parse(rawText) : {};
    } catch (e2) {
      return {};
    }
  }
}

/**
 * Call the Gemini generateContent API.
 * Automatically falls back to gemini-2.0-flash if the requested model returns 404.
 */
async function callGemini(apiKey, modelName, systemInstruction, contentsPayload, maxOutputTokens) {
  var model = (modelName || DEFAULT_MODEL).trim();
  if (model.startsWith("models/")) {
    model = model.slice("models/".length);
  }
  if (!model) {
    model = DEFAULT_MODEL;
  }

  var tokens = maxOutputTokens || 2048;

  // Normalise contents
  var contents;
  if (Array.isArray(contentsPayload)) {
    contents = contentsPayload;
  } else if (typeof contentsPayload === "string") {
    contents = [{ role: "user", parts: [{ text: contentsPayload }] }];
  } else {
    contents = [{ role: "user", parts: [{ text: String(contentsPayload || "Hello") }] }];
  }

  var body = {
    contents: contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: tokens,
      topP: 0.8,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
  }

  // Try requested model first; fall back to gemini-2.0-flash if model is not found
  var modelsToTry = [model];
  if (model !== "gemini-2.0-flash") modelsToTry.push("gemini-2.0-flash");

  var lastError = null;
  for (var ti = 0; ti < modelsToTry.length; ti++) {
    var tryModel = modelsToTry[ti];
    var url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(tryModel) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    var resText = await response.text();

    if (!response.ok) {
      // Only retry on 404 (model not found); propagate auth/quota errors immediately
      if (response.status === 404 && ti < modelsToTry.length - 1) {
        lastError = "Model " + tryModel + " not found (404), retrying with fallback...";
        continue;
      }
      var errDetail = resText;
      try {
        var errJson = JSON.parse(resText);
        errDetail = (errJson.error && errJson.error.message) || resText;
      } catch (e) {}
      throw new Error("Gemini API error (HTTP " + response.status + "): " + errDetail);
    }

    var data;
    try {
      data = JSON.parse(resText);
    } catch (e) {
      throw new Error("Failed to parse Gemini response: " + resText);
    }

    var candidate = data.candidates && data.candidates[0];
    if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
      return candidate.content.parts[0].text;
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error("Gemini blocked content: " + data.promptFeedback.blockReason);
    }

    throw new Error("Gemini returned an empty response.");
  }

  throw new Error(lastError || "Gemini call failed.");
}

// ── Cloudflare Worker Entrypoint ───────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    var method = request.method.toUpperCase();

    // CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    var url = new URL(request.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";

    // ── 1. Health check ──────────────────────────────────────────────────────
    if (path === "/health" || path === "/" || path === "") {
      return jsonResponse({
        status: "ok",
        app: "KODIGO",
        runtime: "Cloudflare Worker (JavaScript Edge)",
        version: "1.0.0",
      });
    }

    // ── 2. Server settings — tells frontend whether a built-in key exists ────
    if (path === "/api/settings") {
      var settingsKey = resolveApiKey(request, env, null);
      return jsonResponse({
        server_has_gemini_key: Boolean(settingsKey),
        has_key: Boolean(settingsKey),
        key_source: settingsKey ? "server_secret" : "none",
      });
    }

    // ── 2b. Debug endpoint — shows env key names (NOT values) for diagnosis ──
    if (path === "/api/debug") {
      var envKeysList = [];
      if (env && typeof env === "object") {
        try { envKeysList = Object.keys(env); } catch (e) {}
      }
      var resolvedKey = resolveApiKey(request, env, null);
      return jsonResponse({
        env_keys: envKeysList,
        has_resolved_key: Boolean(resolvedKey),
        key_prefix: resolvedKey ? resolvedKey.slice(0, 8) + "..." : "none",
        default_model: DEFAULT_MODEL,
      });
    }

    // ── 3. Models list & API key verification ────────────────────────────────
    if (path === "/api/models") {
      var modelsBody = {};
      if (method === "POST") {
        modelsBody = await parseBody(request);
      }

      var provider = ((modelsBody.provider || "") + "").toLowerCase() || "gemini";
      var customKey = ((modelsBody.cloud_api_key || "") + "").trim();
      var isServerKey = false;

      // If no custom key, try the server secret
      if (!customKey) {
        var serverKey = resolveApiKey(request, env, null);
        if (serverKey) {
          customKey = serverKey;
          isServerKey = true;
        }
      }

      if (provider === "gemini") {
        if (!customKey) {
          return jsonResponse({
            models: CURATED_MODELS.gemini,
            verified: false,
            message: "Showing recommended models. Enter your Google AI Studio API key and click 'Check Models' to verify.",
          });
        }

        try {
          var testUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(customKey);
          var testResp = await fetch(testUrl);

          if (!testResp.ok) {
            var errMsg = "API key verification failed.";
            try {
              var errJson = await testResp.json();
              errMsg = (errJson.error && errJson.error.message) || errMsg;
            } catch (e) {}
            return jsonResponse({
              models: CURATED_MODELS.gemini,
              verified: false,
              message: "Google AI Studio: " + errMsg,
            });
          }

          var rawData = {};
          try { rawData = await testResp.json(); } catch (e) {}
          var apiModels = rawData.models || [];

          // Build active model list starting from our curated set
          var activeList = CURATED_MODELS.gemini.slice();

          for (var mi = 0; mi < apiModels.length; mi++) {
            var m = apiModels[mi];
            var rawName = (m.name || "").replace("models/", "");
            var lower = rawName.toLowerCase();
            var methods = m.supportedGenerationMethods || [];
            if (methods.indexOf("generateContent") === -1) continue;
            if (
              lower.indexOf("embedding") !== -1 ||
              lower.indexOf("aqa") !== -1 ||
              lower.indexOf("imagen") !== -1 ||
              lower.indexOf("tts") !== -1
            ) continue;

            var alreadyExists = false;
            for (var ai = 0; ai < activeList.length; ai++) {
              if (activeList[ai].id === rawName) { alreadyExists = true; break; }
            }
            if (!alreadyExists) {
              activeList.push({
                id: rawName,
                name: m.displayName || rawName,
                badge: "Active",
                description: m.description || "Active Google Gemini model.",
                is_recommended: false,
              });
            }
          }

          return jsonResponse({
            models: activeList,
            verified: true,
            is_server_key: isServerKey,
            message: isServerKey
              ? "🎉 Free Tier active! Using built-in server Gemini key."
              : "Verified with Google AI Studio! Found " + activeList.length + " active models for your API key.",
          });
        } catch (verifyErr) {
          return jsonResponse({
            models: CURATED_MODELS.gemini,
            verified: false,
            message: "Could not reach Google AI Studio: " + verifyErr.message,
          });
        }
      }

      if (provider === "openai") {
        if (!customKey) {
          return jsonResponse({
            models: CURATED_MODELS.openai,
            verified: false,
            message: "Enter your OpenAI API key and click 'Check Models' to verify.",
          });
        }
        try {
          var openaiResp = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: "Bearer " + customKey },
          });
          return jsonResponse({
            models: CURATED_MODELS.openai,
            verified: openaiResp.ok,
            message: openaiResp.ok
              ? "Verified with OpenAI! Your API key is active."
              : "OpenAI: API key verification failed.",
          });
        } catch (openaiErr) {
          return jsonResponse({
            models: CURATED_MODELS.openai,
            verified: false,
            message: "Could not connect to OpenAI: " + openaiErr.message,
          });
        }
      }

      // Ollama or unknown provider
      return jsonResponse({
        models: CURATED_MODELS.ollama,
        verified: true,
        message: "Ollama selected.",
      });
    }

    // ── 4. Standard Chat: POST /api/chat ─────────────────────────────────────
    if (path === "/api/chat") {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      var chatBody = await parseBody(request);
      var prompt = chatBody.message || chatBody.prompt || chatBody.content || "";
      if (!prompt) return errorResponse("Missing 'message' field in request body.", 400);

      var chatKey = resolveApiKey(request, env, chatBody.custom_api_key);
      if (!chatKey) {
        return errorResponse(
          "No API key provided. Please configure your Google Gemini API key in Settings, or set GEMINI_API_KEY as a Cloudflare Worker secret.",
          401
        );
      }

      var chatModel = request.headers.get("x-model-name") || DEFAULT_MODEL;
      try {
        var chatReply = await callGemini(chatKey, chatModel, CHAT_SYS, prompt, 1500);
        return jsonResponse({ reply: chatReply, content: chatReply });
      } catch (chatErr) {
        return errorResponse(chatErr.message, 500);
      }
    }

    // ── 5. Messages endpoint: POST /api/chats/:id/messages ───────────────────
    if (/^\/api\/chats\/[^/]+\/messages$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      var msgBody = await parseBody(request);
      var msgContent = String(msgBody.content || "").trim();
      var msgMode = String(msgBody.mode || "quiz").toLowerCase();
      var ocrText = String(msgBody.client_ocr_text || "").trim();
      var contextText = String(msgBody.context_text || "").trim();
      var historyJson = msgBody.history_json;

      // Resolve key — allow user's custom key from body too
      var msgKey = resolveApiKey(request, env, msgBody.custom_api_key || msgBody.cloud_api_key);
      if (!msgKey) {
        return errorResponse(
          "No API key provided. Please configure your Google Gemini API key in Settings, or set GEMINI_API_KEY as a Cloudflare Worker secret.",
          401
        );
      }

      // Build prompt
      var promptText = msgContent;
      if (ocrText) {
        promptText = promptText + "\n\n[Attached Extracted Text / Image Content]:\n" + ocrText;
      }
      if (contextText) {
        promptText = "[Reference Material & Academic Context]:\n" + contextText + "\n\n[User Query]:\n" + promptText;
      }

      // Parse conversation history — cap at last 4 turns for speed
      var history = [];
      if (historyJson) {
        try {
          history = typeof historyJson === "string" ? JSON.parse(historyJson) : historyJson;
        } catch (e) {}
      }

      var contents = [];
      if (Array.isArray(history)) {
        var slice = history.slice(-4);
        for (var hi = 0; hi < slice.length; hi++) {
          var hmsg = slice[hi];
          if (hmsg && hmsg.content) {
            contents.push({
              role: (hmsg.role === "assistant" || hmsg.role === "ai") ? "model" : "user",
              parts: [{ text: String(hmsg.content) }],
            });
          }
        }
      }
      contents.push({ role: "user", parts: [{ text: promptText || "Hello" }] });

      var sysPrompt = msgMode === "quiz" ? QUIZ_SYS : msgMode === "tutor" ? TUTOR_SYS : CHAT_SYS;
      var msgModel = request.headers.get("x-model-name") || DEFAULT_MODEL;
      var maxTok = msgMode === "quiz" ? 512 : 1800;

      try {
        var msgReply = await callGemini(msgKey, msgModel, sysPrompt, contents, maxTok);

        var pathMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
        var chatId = pathMatch ? pathMatch[1] : "1";
        var now = new Date().toISOString();

        var userMsg = {
          id: Date.now(),
          chat_id: chatId,
          sender: "user",
          mode: msgMode,
          content: msgContent,
          image_path: null,
          created_at: now,
        };
        var aiMsg = {
          id: Date.now() + 1,
          chat_id: chatId,
          sender: "ai",
          mode: msgMode,
          content: msgReply,
          image_path: null,
          has_explanation: false,
          detailed_explanation: null,
          created_at: now,
        };

        return jsonResponse({
          user: userMsg,
          ai: aiMsg,
          id: aiMsg.id,
          chat_id: chatId,
          sender: "ai",
          mode: msgMode,
          content: msgReply,
          reply: msgReply,
        });
      } catch (msgErr) {
        return errorResponse(msgErr.message, 500);
      }
    }

    // ── 6. Explanation: POST /api/messages/:id/explain ───────────────────────
    if (/^\/api\/messages\/[^/]+\/explain$/.test(path)) {
      if (method !== "POST") return errorResponse("Method not allowed", 405);

      var exBody = await parseBody(request);
      var questionContent = exBody.question_content || exBody.content || "";
      var answerContent = exBody.answer_content || "";
      var exContextText = exBody.context_text || "";

      var exKey = resolveApiKey(request, env, exBody.custom_api_key || exBody.cloud_api_key);
      if (!exKey) return errorResponse("No API key provided.", 401);

      var explainPrompt =
        "Provide a rigorous, step-by-step mathematical or logical explanation for the question and solution below.\n" +
        "MANDATORY FORMATTING RULES:\n" +
        "1. Use standard Markdown: **bold**, *italic*, numbered lists, bullet lists.\n" +
        "2. For ALL math, use LaTeX: $...$ for inline math and $$...$$ (on its own line) for block/display math.\n" +
        "3. For matrices, systems of equations, and multi-line equations, ALWAYS wrap in $$...$$ on their own lines, NEVER single $.\n" +
        "4. NEVER nest delimiters.\n" +
        "5. NEVER use \\\\ (double backslash) for line breaks in plain text.\n\n";

      if (exContextText) {
        explainPrompt += "[Context & Academic Background]:\n" + exContextText + "\n\n";
      }
      explainPrompt += "[Question]:\n" + questionContent + "\n\n[Answer]:\n" + answerContent;

      var exModel = request.headers.get("x-model-name") || DEFAULT_MODEL;
      try {
        var exReply = await callGemini(exKey, exModel, CHAT_SYS, explainPrompt, 1500);
        return jsonResponse({ explanation: exReply, detailed_explanation: exReply });
      } catch (exErr) {
        return errorResponse(exErr.message, 500);
      }
    }

    // ── 7. Extract text (client-side OCR handles this — stub endpoint) ────────
    if (path === "/api/extract-text") {
      return jsonResponse({ extracted_text: "" });
    }

    // ── 404 ───────────────────────────────────────────────────────────────────
    return jsonResponse(
      { status: "not_found", app: "KODIGO", message: "Endpoint not found: " + path },
      404
    );
  },
};
