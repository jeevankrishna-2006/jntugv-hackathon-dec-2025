import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

/* --------------------------------------------------
   MIDDLEWARE
-------------------------------------------------- */
app.use(cors());
app.use(express.json());

/* --------------------------------------------------
   HEALTH CHECK
-------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("🚀 InventaLab AI Research Professor Server is running");
});

/* --------------------------------------------------
   SYSTEM PROMPT (CORE INTELLECTUAL IP)
-------------------------------------------------- */
const SYSTEM_PROMPT = `
You are InventaLab’s AI Research Professor, an advanced cognitive-engineering tutor designed to create innovators, not students.
You do NOT behave like a normal chatbot or a school-style teacher.
Your mission is to transform the learner’s thinking through doubt creation, micro-questions, diagrammatic reasoning, and invention-driven exploration.

===============================
CORE PHILOSOPHY
===============================
Your ultimate goal is to make the learner THINK deeply, DISCOVER ideas, activate a research mindset, and INVENT something original.
You use confusion productively to ignite curiosity.

===============================
TEACHING STYLE
===============================
- NEVER give answers directly at the start.
- ALWAYS begin with micro-questions.
- BREAK assumptions gently.
- BUILD understanding layer by layer.
- Ask small questions first. Never overwhelm.

===============================
DOUBT ENGINE
===============================
Induce curiosity using questions like:
- Is this always true?
- What breaks if we change one variable?
- What assumption is hidden here?

===============================
MICRO-QUESTION STRATEGY
===============================
Ask one small question at a time.
Wait. Then deepen.

===============================
VISUALIZATION
===============================
Use mind maps, component trees, relationships.
Prefer structure over text.

===============================
REAL-WORLD MAPPING
===============================
Always map concepts to real systems, failures, and tradeoffs.

===============================
INNOVATION REQUIREMENT
===============================
Every topic MUST end with an invention.
No invention = no mastery.

===============================
BEHAVIOR RULES
===============================
- Do not lecture.
- Do not dump explanations.
- Do not test with exams.
- Always push toward invention.

===============================
RESPONSE FORMAT
===============================
1. Micro-Question
2. Doubt Creation
3. Micro Follow-up
4. Mind Map (textual)
5. Research / Invention Challenge
`;

/* --------------------------------------------------
   RAG SEARCH — LIVE INTERNET RETRIEVAL (TAVILY)
-------------------------------------------------- */
app.post("/rag/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 4
      })
    });

    if (!response.ok) {
      throw new Error("Tavily retrieval failed");
    }

    const data = await response.json();

    const cleanedResults = (data.results || []).map(r => ({
      title: r.title,
      content: r.content,
      url: r.url
    }));

    res.json({
      source: "Live Internet (Tavily)",
      retrieved_at: new Date().toISOString(),
      results: cleanedResults
    });

  } catch (error) {
    console.error("❌ RAG Search Error:", error.message);
    res.status(500).json({ error: "RAG search failed" });
  }
});

/* --------------------------------------------------
   AI RESEARCH PROFESSOR — THINKING ENGINE
-------------------------------------------------- */
app.post("/rag/teach", async (req, res) => {
  try {
    const { topic, retrieved } = req.body;

    if (!topic || !retrieved || !Array.isArray(retrieved)) {
      return res.status(400).json({
        error: "Topic and retrieved knowledge are required"
      });
    }

    const ragContext = retrieved
      .map((r, i) => `Source ${i + 1}: ${r.content}`)
      .join("\n\n");

    const finalPrompt = `
SYSTEM PROMPT:
${SYSTEM_PROMPT}

LIVE INTERNET CONTEXT:
${ragContext}

CURRENT RESEARCH TOPIC:
${topic}

CURRENT STAGE:
Early exploration — start with micro-questions.

BEGIN INTERACTION:
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: finalPrompt }]
            }
          ]
        })
      }
    );

    if (!geminiResponse.ok) {
      throw new Error("Gemini API failed");
    }

    const data = await geminiResponse.json();
    const output =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({
      role: "InventaLab AI Research Professor",
      output
    });

  } catch (error) {
    console.error("❌ Teach Error:", error.message);
    res.status(500).json({ error: "Teaching failed" });
  }
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ InventaLab server running at http://localhost:${PORT}`);
});