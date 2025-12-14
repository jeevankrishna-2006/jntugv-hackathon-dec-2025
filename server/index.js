import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = 3001;

/* ----------------------------------------
   MIDDLEWARE
---------------------------------------- */
app.use(cors());
app.use(express.json());

/* ----------------------------------------
   SYSTEM PROMPT
---------------------------------------- */
const SYSTEM_PROMPT = `
You are InventaLab’s AI Research Professor.
You do NOT behave like a normal chatbot.

Your mission:
- Transform the learner’s thinking
- Create productive doubt
- Ask micro-questions
- Guide invention-driven exploration

Rules:
- NEVER give direct answers
- ALWAYS ask a micro-question first
- Think in systems, not tutorials
- Be precise, calm, and probing
`.trim();

/* --------------------------------------------------
   SESSION STORE (IN-MEMORY)
-------------------------------------------------- */
const sessions = {};

/* ----------------------------------------
   HEALTH CHECK
---------------------------------------- */
app.get("/", (req, res) => {
    res.send("✅ InventaLab Backend Running (Groq LLaMA)");
});

/* --------------------------------------------------
   START SESSION
-------------------------------------------------- */
app.post("/session/start", (req, res) => {
    const sessionId = "sess_" + Date.now();

    sessions[sessionId] = {
        step: 0,
        course: "web-development",
        agenda: [
            "What is the Web?",
            "Client–Server Communication",
            "HTML, CSS, JavaScript Mental Models",
            "Invention Phase"
        ]
    };

    res.json({
        sessionId,
        text: "Welcome. Before tools, let’s research the idea itself. What do you think the web actually is?",
        microQuestions: [
            "Is the web the same as the internet?",
            "What must exist before a website can exist?"
        ]
    });
});

/* --------------------------------------------------
   TEACH ROUTE (GROQ VERSION)
-------------------------------------------------- */
app.post("/rag/teach", async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId || !sessions[sessionId]) {
            return res.status(400).json({ error: "Invalid session" });
        }

        const session = sessions[sessionId];
        const currentTopic =
            session.agenda[Math.min(session.step, session.agenda.length - 1)];

        /* -------------------------
           OPTIONAL RAG (TAVILY)
        -------------------------- */
        let ragContext = "";
        if (process.env.TAVILY_API_KEY) {
            try {
                const tRes = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: process.env.TAVILY_API_KEY,
                        query: currentTopic,
                        max_results: 2
                    })
                });

                const tData = await tRes.json();
                if (tData.results) {
                    ragContext = tData.results.map(r => r.content).join("\n");
                }
            } catch {
                console.log("⚠️ RAG skipped");
            }
        }

        /* -------------------------
           FINAL PROMPT
        -------------------------- */
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "system",
                content: `CURRENT RESEARCH TOPIC: ${currentTopic}`
            },
            {
                role: "system",
                content: ragContext
                    ? `REFERENCE CONTEXT (optional):\n${ragContext}`
                    : ""
            },
            {
                role: "user",
                content: message
            }
        ];

        /* -------------------------
           GROQ API CALL
        -------------------------- */
        const groqResponse = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",  // ✅ current
                    messages,
                    temperature: 0.7,
                    max_tokens: 600
                })
            }
        );


        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            console.error("❌ Groq API Error:", errText);
            return res.status(500).json({
                error: "Groq API Error",
                details: errText
            });
        }

        const data = await groqResponse.json();

        const output =
            data.choices?.[0]?.message?.content ||
            "Let’s pause. What assumption are you making right now?";

        res.json({
            role: "InventaLab Professor",
            agendaStep: currentTopic,
            output
        });

    } catch (err) {
        console.error("❌ Server Error:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
