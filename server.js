/**
 * LifeGrass API server (Port 3000)
 * - Azure OpenAI: 다음 주 추천 생성
 * - Azure Blob Storage: 유저별 일기·설정 저장 (GET/POST /api/data/:username)
 * - 비밀번호 기반 사용자 인증
 * .env의 AZURE_* 값을 사용합니다. 키는 서버에서만 사용합니다.
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const PORT = process.env.PORT || 3000;

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-5-mini";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "lifegrass";

app.use(express.json());

// CORS 설정 (관리자 페이지에서 API 호출 허용)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3030");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

function sanitizeUsername(username) {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 50);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function getContainerClient() {
  if (!AZURE_STORAGE_CONNECTION_STRING) return null;
  const blobService = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
  const container = blobService.getContainerClient(AZURE_STORAGE_CONTAINER);
  await container.createIfNotExists();
  return container;
}

async function getUserBlobClient(username) {
  const container = await getContainerClient();
  if (!container) return null;
  const safeName = sanitizeUsername(username);
  if (!safeName) return null;
  return container.getBlockBlobClient(`users/${safeName}.json`);
}

async function listAllUsers() {
  const container = await getContainerClient();
  if (!container) return [];
  const users = [];
  for await (const blob of container.listBlobsFlat({ prefix: "users/" })) {
    const name = blob.name.replace("users/", "").replace(".json", "");
    if (name) users.push(name);
  }
  return users;
}

async function getRawUserData(username) {
  const client = await getUserBlobClient(username);
  if (!client) return null;
  try {
    const exists = await client.exists();
    if (!exists) return null;
    const download = await client.download();
    const chunks = [];
    for await (const chunk of download.readableStreamBody) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(text || "{}");
  } catch (e) {
    console.error("Blob read error:", e);
    return null;
  }
}

async function getUserData(username) {
  const data = await getRawUserData(username);
  if (!data) return { birthYear: null, filledWeeks: [], journal: {} };
  return {
    birthYear: data.birthYear ?? null,
    filledWeeks: Array.isArray(data.filledWeeks) ? data.filledWeeks : [],
    journal: data.journal && typeof data.journal === "object" ? data.journal : {},
  };
}

async function saveUserData(username, data, passwordHash = null) {
  const client = await getUserBlobClient(username);
  if (!client) return false;
  try {
    const existing = await getRawUserData(username);
    const payload = {
      passwordHash: passwordHash || (existing && existing.passwordHash) || null,
      birthYear: data.birthYear ?? null,
      filledWeeks: Array.isArray(data.filledWeeks) ? data.filledWeeks : [],
      journal: data.journal && typeof data.journal === "object" ? data.journal : {},
      updatedAt: new Date().toISOString(),
    };
    const content = JSON.stringify(payload, null, 2);
    await client.upload(Buffer.from(content, "utf8"), Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      overwrite: true,
    });
    return true;
  } catch (e) {
    console.error("Blob write error:", e);
    return false;
  }
}

async function deleteUserData(username) {
  const client = await getUserBlobClient(username);
  if (!client) return false;
  try {
    await client.deleteIfExists();
    return true;
  } catch (e) {
    console.error("Blob delete error:", e);
    return false;
  }
}

async function userExists(username) {
  const client = await getUserBlobClient(username);
  if (!client) return false;
  try {
    return await client.exists();
  } catch (e) {
    return false;
  }
}

async function verifyPassword(username, password) {
  const data = await getRawUserData(username);
  if (!data || !data.passwordHash) return false;
  return data.passwordHash === hashPassword(password);
}

// API: 유저 존재 여부 확인
app.get("/api/auth/check/:username", async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured" });
  }
  const exists = await userExists(username);
  res.json({ exists });
});

// API: 회원가입 (새 유저 + 비밀번호 설정)
app.post("/api/auth/register", async (req, res) => {
  const { username: rawUsername, password } = req.body || {};
  const username = sanitizeUsername(rawUsername || "");
  
  if (!username || username.length < 2) {
    return res.status(400).json({ error: "Username must be at least 2 characters" });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured" });
  }
  
  const exists = await userExists(username);
  if (exists) {
    return res.status(409).json({ error: "Username already taken" });
  }
  
  const passwordHash = hashPassword(password);
  const success = await saveUserData(username, { birthYear: null, filledWeeks: [], journal: {} }, passwordHash);
  
  if (!success) {
    return res.status(500).json({ error: "Failed to create user" });
  }
  
  res.json({ ok: true, token: generateToken(username) });
});

// API: 로그인
app.post("/api/auth/login", async (req, res) => {
  const { username: rawUsername, password } = req.body || {};
  const username = sanitizeUsername(rawUsername || "");
  
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password required" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured" });
  }
  
  const valid = await verifyPassword(username, password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid password" });
  }
  
  res.json({ ok: true, token: generateToken(username) });
});

function generateToken(username) {
  const payload = { username, ts: Date.now() };
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", process.env.TOKEN_SECRET || "lifegrass-secret-key")
    .update(data)
    .digest("hex");
  return Buffer.from(data).toString("base64") + "." + signature;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const [dataB64, signature] = token.split(".");
    const data = Buffer.from(dataB64, "base64").toString("utf8");
    const expected = crypto.createHmac("sha256", process.env.TOKEN_SECRET || "lifegrass-secret-key")
      .update(data)
      .digest("hex");
    if (signature !== expected) return null;
    const payload = JSON.parse(data);
    if (Date.now() - payload.ts > 7 * 24 * 60 * 60 * 1000) return null;
    return payload.username;
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const username = verifyToken(token);
  
  const requestedUser = sanitizeUsername(req.params.username || "");
  if (!username || username !== requestedUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  req.authUser = username;
  next();
}

// API: 유저 데이터 조회 (인증 필요)
app.get("/api/data/:username", async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured", message: "Set AZURE_STORAGE_CONNECTION_STRING in .env" });
  }
  
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authUser = verifyToken(token);
  
  if (!authUser || authUser !== username) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const data = await getUserData(username);
  if (data === null) {
    return res.status(500).json({ error: "Storage read failed" });
  }
  res.json(data);
});

// API: 유저 데이터 저장 (인증 필요)
app.post("/api/data/:username", async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured", message: "Set AZURE_STORAGE_CONNECTION_STRING in .env" });
  }
  
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authUser = verifyToken(token);
  
  if (!authUser || authUser !== username) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const { birthYear, filledWeeks, journal } = req.body || {};
  const success = await saveUserData(username, { birthYear, filledWeeks, journal });
  if (!success) {
    return res.status(500).json({ error: "Storage write failed" });
  }
  res.json({ ok: true });
});

// API: 모든 유저 목록 (관리용)
app.get("/api/users", async (req, res) => {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured" });
  }
  const users = await listAllUsers();
  res.json({ users });
});

// API: 관리자용 유저 데이터 조회 (인증 불필요)
app.get("/api/admin/data/:username", async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    return res.status(503).json({ error: "Storage not configured" });
  }
  
  const rawData = await getRawUserData(username);
  if (rawData === null) {
    return res.status(404).json({ error: "User not found" });
  }
  
  // 비밀번호 해시는 제외하고 반환
  const { passwordHash, ...userData } = rawData;
  res.json(userData);
});

// API: 유저 삭제 (관리용)
app.delete("/api/data/:username", async (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Invalid username" });
  }
  const success = await deleteUserData(username);
  if (!success) {
    return res.status(500).json({ error: "Delete failed" });
  }
  res.json({ ok: true });
});

function getChatUrl() {
  if (!AZURE_OPENAI_ENDPOINT) return null;
  const url = AZURE_OPENAI_ENDPOINT.trim();
  if (url.includes("/chat/completions") || url.includes("/responses")) {
    return url;
  }
  const base = url.replace(/\/$/, "");
  const apiVersion = "2024-02-15-preview";
  return `${base}/openai/deployments/${encodeURIComponent(AZURE_OPENAI_MODEL)}/chat/completions?api-version=${apiVersion}`;
}

function isResponsesAPI(url) {
  return url && url.includes("/responses");
}

// API: AI Comment 생성 (해당 주의 일기를 분석해서 한줄 요약/감상)
app.post("/api/comment", async (req, res) => {
  const { keywords = "", text = "", year, week } = req.body || {};
  const chatUrl = getChatUrl();

  if (!AZURE_OPENAI_API_KEY || !chatUrl) {
    return res.status(500).json({
      error: "Server not configured",
      message: "Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env",
    });
  }

  const journalText = (text || "").trim().slice(0, 1500);
  const keywordsText = (keywords || "").trim();
  
  if (!journalText && !keywordsText) {
    return res.json({ 
      comment: "No journal entry for this week." 
    });
  }
  
  let prompt;
  if (isResponsesAPI(chatUrl)) {
    const contextParts = [];
    if (keywordsText) contextParts.push(`Keywords: ${keywordsText}`);
    if (journalText) contextParts.push(`Journal entry: ${journalText}`);
    
    prompt = `You are reading a weekly journal entry from Week ${week}, ${year}. Read through the person's week and write a warm, emotional one-line summary or reflection. It should capture the feelings, mood, and essence of this week. Be empathetic, personal, and emotionally resonant. Like a friend who truly understands what this week meant to them. Keep it to ONE SENTENCE ONLY. Make it feel genuine and heartfelt.

${contextParts.join("\n\n")}

Reply with only the one-line emotional summary about this week, no extra text.`;
  } else {
    prompt = `You are reading a weekly journal entry from Week ${week}, ${year}. Read through the person's week and write a warm, emotional one-line summary or reflection. It should capture the feelings, mood, and essence of this week. Be empathetic, personal, and emotionally resonant. Like a friend who truly understands what this week meant to them. Keep it to ONE SENTENCE ONLY. Make it feel genuine and heartfelt.

Keywords: ${keywordsText}
Journal: ${journalText}

Reply with only the one-line emotional summary about this week, no extra text.`;
  }

  try {
    let body;
    if (isResponsesAPI(chatUrl)) {
      body = {
        model: AZURE_OPENAI_MODEL,
        input: prompt,
      };
    } else {
      body = {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      };
    }

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Azure OpenAI error:", response.status, errText);
      return res.status(response.status).json({
        error: "AI request failed",
        message: response.status === 401 ? "Invalid API key" : errText.slice(0, 200),
      });
    }

    const data = await response.json();
    let content = "";
    
    if (isResponsesAPI(chatUrl)) {
      const possiblePaths = [
        data.output?.choices?.[0]?.message?.content,
        data.choices?.[0]?.message?.content,
        data.output?.text,
        data.text,
        data.output?.content,
        data.content,
        data.output,
        data.response,
      ];
      
      for (const path of possiblePaths) {
        if (path && typeof path === "string") {
          content = path;
          break;
        }
      }
    } else {
      content = data.choices?.[0]?.message?.content ||
                data.choices?.[0]?.content ||
                "";
    }

    const comment = (typeof content === "string" ? content : String(content || "")).trim();
    res.json({ comment: comment || "A week captured in your memory." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// API: 다음 주 추천 생성 (현재 주 일기를 기반으로 다음 주에 할 일 추천)
app.post("/api/recommend", async (req, res) => {
  const { keywords = "", text = "" } = req.body || {};
  const chatUrl = getChatUrl();

  if (!AZURE_OPENAI_API_KEY || !chatUrl) {
    return res.status(500).json({
      error: "Server not configured",
      message: "Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env",
    });
  }

  const journalText = (text || "").trim().slice(0, 1500);
  const keywordsText = (keywords || "").trim();
  
  if (!journalText && !keywordsText) {
    return res.json({ 
      recommendation: "Please write something in your journal to get personalized recommendations." 
    });
  }
  
  let prompt;
  if (isResponsesAPI(chatUrl)) {
    const contextParts = [];
    if (keywordsText) contextParts.push(`Keywords from this week: ${keywordsText}`);
    if (journalText) contextParts.push(`Journal entry: ${journalText}`);
    
    prompt = `You are a warm, caring friend who reads weekly journals. A friend shared their week:

${contextParts.join("\n\n")}

Based on this week's journal, suggest ONE concrete action or challenge for NEXT WEEK. It should be something they can do next week. Be warm, personal, and specific. It must be ONE LINE ONLY (no line breaks).`;
  } else {
    prompt = `You are a warm, caring friend reading a weekly journal. Based on this week's journal, suggest ONE concrete action or challenge for NEXT WEEK. It should be something they can do next week. Be warm, personal, and specific. It must be ONE LINE ONLY.

Keywords: ${keywordsText}
Journal: ${journalText}

Reply with only ONE recommendation for next week, one line, no extra text.`;
  }

  try {
    let body;
    if (isResponsesAPI(chatUrl)) {
      // Responses API: input은 문자열 또는 배열이어야 함
      body = {
        model: AZURE_OPENAI_MODEL,
        input: prompt, // 문자열로 직접 전달
      };
    } else {
      // Chat Completions API: messages 필드 사용
      body = {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      };
    }

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Azure OpenAI error:", response.status, errText);
      return res.status(response.status).json({
        error: "AI request failed",
        message: response.status === 401 ? "Invalid API key" : errText.slice(0, 200),
      });
    }

    const data = await response.json();
    let content = "";
    
    if (isResponsesAPI(chatUrl)) {
      // Responses API 응답 형식: output 배열에서 message 타입 찾기
      if (data.output && Array.isArray(data.output)) {
        const messageItem = data.output.find(item => item.type === "message" && item.content);
        if (messageItem && Array.isArray(messageItem.content)) {
          const textItem = messageItem.content.find(item => item.type === "output_text" && item.text);
          if (textItem && textItem.text) {
            content = textItem.text;
          }
        }
      }
      
      // 디버깅용 로그 (필요시 주석 해제)
      // console.log("Responses API response:", JSON.stringify(data, null, 2));
    } else {
      // Chat Completions API 응답 형식
      content = data.choices?.[0]?.message?.content ||
                data.choices?.[0]?.content ||
                "";
    }

    // content를 문자열로 변환하고 trim 적용
    const recommendation = (typeof content === "string" ? content : String(content || "")).trim();
    res.json({ recommendation: recommendation || "No recommendation generated." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error", message: e.message });
  }
});

// 유저 페이지: /:username 라우트
app.get("/:username", (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 홈페이지 (유저네임 입력 페이지)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "landing.html"));
});

app.listen(PORT, () => {
  console.log(`LifeGrass server at http://localhost:${PORT}`);
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    console.warn("Warning: AZURE_OPENAI_API_KEY or AZURE_OPENAI_ENDPOINT missing in .env");
  }
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    console.warn("Warning: AZURE_STORAGE_CONNECTION_STRING missing in .env (cloud sync disabled)");
  }
});
