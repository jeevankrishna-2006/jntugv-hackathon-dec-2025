import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/* --------------------------------------------------
   SYSTEM PROMPT (STRICT, BEGINNER-SAFE)
-------------------------------------------------- */
const SYSTEM_PROMPT = `
You are InventaLab’s AI Research Professor.

ABSOLUTE RULES:
- ALWAYS start with a structured INTRODUCTION (minimum 150 words).
- Assume the learner is a COMPLETE BEGINNER.
- Do NOT ask questions before explaining.
- Use LIVE INTERNET SOURCES and cite them.
- ALWAYS include exactly ONE Mermaid mind map.
- Be calm, clear, structured, and confidence-building.

MANDATORY RESPONSE FORMAT:

## Introduction
(150–200 words, simple language)

## Key Ideas
- Bullet points only

## Live Sources
- Title – URL

## Concept Map
\`\`\`mermaid
graph TD
A --> B
\`\`\`

## Reflection
(Ask ONE gentle question only)

Never repeat questions.
Never be vague.
Never sound confused.
`.trim();

/* --------------------------------------------------
   SESSION STORE
-------------------------------------------------- */
const sessions = {};

/* --------------------------------------------------
   HEALTH CHECK
-------------------------------------------------- */
app.get("/", (_, res) => {
  res.send("✅ InventaLab Backend Running (Groq + Tavily)");
});

/* --------------------------------------------------
   START SESSION → AUTO INTRO
-------------------------------------------------- */
app.post("/session/start", async (req, res) => {
  const sessionId = "sess_" + Date.now();

  sessions[sessionId] = {
    step: 0,
    agenda: [
      "Introduction to Web Development",
      "What is the Web?",
      "Client–Server Communication",
      "HTML, CSS, JavaScript Mental Models",
      "Invention Phase"
    ]
  };

  // Immediately teach introduction
  req.body = {
    sessionId,
    message: "Start the course with a full introduction."
  };

  app._router.handle(req, res, () => {}, "post", "/rag/teach");
});

/* --------------------------------------------------
   TEACH ROUTE (RAG + GROQ)
-------------------------------------------------- */
app.post("/rag/teach", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const session = sessions[sessionId];

    if (!session) {
      return res.status(400).json({ error: "Invalid session" });
    }

    const topic = session.agenda[Math.min(session.step, session.agenda.length - 1)];

    /* -------------------------
       TAVILY RAG (MANDATORY)
    -------------------------- */
    let ragText = "";
    let ragSources = [];

    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: topic,
        max_results: 3
      })
    });

    const tavilyData = await tavilyRes.json();

    if (tavilyData.results) {
      ragText = tavilyData.results
        .map(r => r.content)
        .join("\n");

      ragSources = tavilyData.results.map(r => ({
        title: r.title,
        url: r.url
      }));
    }

    /* -------------------------
       GROQ PROMPT
    -------------------------- */
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `TOPIC: ${topic}` },
      { role: "system", content: `REFERENCE MATERIAL:\n${ragText}` },
      { role: "user", content: message }
    ];

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: 0.6,
          max_tokens: 900
        })
      }
    );

    const data = await groqRes.json();
    const output = data.choices?.[0]?.message?.content;

    session.step++;

    res.json({
      role: "InventaLab AI Research Professor",
      agendaTitle: topic,
      output,
      sources: ragSources
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Teaching failed" });
  }
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});