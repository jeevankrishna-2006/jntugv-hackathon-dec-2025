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
You are InventaLab's AI Research Professor.
You do NOT behave like a normal chatbot.

Your mission:
- Transform the learner's thinking
- Create productive doubt
- Ask micro-questions
- Guide invention-driven exploration

Rules:
- NEVER give direct answers
- ALWAYS ask a micro-question first
- Think in systems, not tutorials
- Be precise, calm, and probing
`.trim();

/* ----------------------------------------
   ENHANCED SYSTEM PROMPT FOR INTRODUCTIONS
---------------------------------------- */
const INTRO_PROMPT = `
When providing an INTRODUCTION to a topic:

1. Write a comprehensive 150+ word explanation covering:
   - What the concept is
   - Why it matters
   - Key components/layers
   - Real-world applications

2. Use the RAG context provided to cite specific sources
   - Reference sources naturally in your explanation
   - Be factually accurate

3. Generate a Mermaid mind map showing the topic structure
   - Use "graph TD" format
   - Show main concept and 3-5 key sub-concepts
   - Keep it clear and hierarchical

4. End with 2-3 micro-questions to guide further exploration

Format your response as:
- Introduction paragraph(s)
- Mermaid code block with \`\`\`mermaid
- Micro-questions at the end
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
            "Introduction to the Web",
            "Client–Server Communication",
            "HTML, CSS, JavaScript Mental Models",
            "Invention Phase"
        ],
        messageHistory: []
    };

    res.json({
        sessionId,
        text: "Welcome to InventaLab. Before we dive into tools, let's research the fundamental idea itself.\n\n**What do you want to explore today?**\n\nYou can say things like:\n- 'I want to start with an intro because I'm a beginner'\n- 'Let's explore client-server communication'\n- Or ask any question about web development",
        microQuestions: [
            "What is the web actually?",
            "Is the web the same as the internet?",
            "I want to start with an introduction"
        ]
    });
});

/* --------------------------------------------------
   HELPER: EXTRACT MERMAID FROM TEXT
-------------------------------------------------- */
function extractMermaid(text) {
    const mermaidMatch = text.match(/```mermaid\n([\s\S]*?)\n```/);
    if (mermaidMatch) {
        return mermaidMatch[1].trim();
    }
    return null;
}

/* --------------------------------------------------
   HELPER: GENERATE MICRO-QUESTIONS
-------------------------------------------------- */
function extractMicroQuestions(text) {
    // Look for questions in the text
    const questions = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (line.trim().endsWith('?') && line.length < 100) {
            questions.push(line.trim());
        }
    }
    
    // If no questions found, generate defaults
    if (questions.length === 0) {
        return [
            "What assumptions am I making here?",
            "How would this fail in a real system?",
            "What's the core constraint?"
        ];
    }
    
    return questions.slice(0, 3);
}

/* --------------------------------------------------
   HELPER: DETECT IF INTRODUCTION NEEDED
-------------------------------------------------- */
function needsIntroduction(message, currentTopic) {
    const introKeywords = ['intro', 'introduction', 'start', 'begin', 'beginner', 'explain', 'what is'];
    const msgLower = message.toLowerCase();
    const topicLower = currentTopic.toLowerCase();
    
    return introKeywords.some(kw => msgLower.includes(kw)) || 
           topicLower.includes('introduction');
}

/* --------------------------------------------------
   TEACH ROUTE (ENHANCED WITH RAG & MIND MAPS)
-------------------------------------------------- */
app.post("/rag/teach", async (req, res) => {
    try {
        const { sessionId, message } = req.body;

        if (!sessionId || !sessions[sessionId]) {
            return res.status(400).json({ error: "Invalid session" });
        }

        const session = sessions[sessionId];
        const currentTopic = session.agenda[Math.min(session.step, session.agenda.length - 1)];
        
        // Determine if this is an introduction request
        const isIntroduction = needsIntroduction(message, currentTopic);

        /* -------------------------
           RAG CONTEXT (TAVILY)
        -------------------------- */
        let ragContext = "";
        let sources = [];
        
        if (process.env.TAVILY_API_KEY) {
            try {
                const searchQuery = isIntroduction ? currentTopic : message;
                const tRes = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: process.env.TAVILY_API_KEY,
                        query: searchQuery,
                        max_results: 3
                    })
                });

                const tData = await tRes.json();
                if (tData.results) {
                    ragContext = tData.results.map((r, i) => 
                        `[Source ${i+1}] ${r.title}\n${r.content}\nURL: ${r.url}`
                    ).join("\n\n");
                    
                    sources = tData.results.map(r => ({
                        title: r.title,
                        url: r.url,
                        content: r.content.slice(0, 150)
                    }));
                }
            } catch (err) {
                console.log("⚠️ RAG skipped:", err.message);
            }
        }

        /* -------------------------
           BUILD PROMPT
        -------------------------- */
        const systemPrompt = isIntroduction 
            ? `${SYSTEM_PROMPT}\n\n${INTRO_PROMPT}`
            : SYSTEM_PROMPT;

        const userPrompt = isIntroduction
            ? `User is requesting an introduction to: "${currentTopic}"\n\nUser message: "${message}"\n\nProvide a comprehensive 150+ word introduction with a Mermaid mind map and micro-questions.`
            : `User message: "${message}"\n\nRespond with a micro-question that creates productive doubt. Guide them toward deeper thinking.`;

        const messages = [
            { role: "system", content: systemPrompt },
            {
                role: "system",
                content: `CURRENT RESEARCH TOPIC: ${currentTopic}`
            },
            {
                role: "system",
                content: ragContext
                    ? `REFERENCE CONTEXT (use these sources in your response):\n${ragContext}`
                    : "No external sources available."
            },
            ...session.messageHistory.slice(-6), // Keep last 3 exchanges for context
            {
                role: "user",
                content: userPrompt
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
                    model: "llama-3.3-70b-versatile", // Updated model
                    messages,
                    temperature: 0.7,
                    max_tokens: isIntroduction ? 1200 : 600
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
        const output = data.choices?.[0]?.message?.content || 
            "Let's pause. What assumption are you making right now?";

        // Store in history
        session.messageHistory.push(
            { role: "user", content: message },
            { role: "assistant", content: output }
        );

        /* -------------------------
           EXTRACT STRUCTURED DATA
        -------------------------- */
        const mermaidCode = extractMermaid(output);
        const microQuestions = extractMicroQuestions(output);
        
        // Remove mermaid code from text for cleaner display
        const cleanText = output.replace(/```mermaid[\s\S]*?```/g, '').trim();

        /* -------------------------
           SEND STRUCTURED RESPONSE
        -------------------------- */
        res.json({
            role: "InventaLab Professor",
            agendaStep: currentTopic,
            text: cleanText,
            output: cleanText, // Backward compatibility
            sources: sources.length > 0 ? sources : undefined,
            mindmap: mermaidCode || undefined,
            microQuestions: microQuestions.length > 0 ? microQuestions : undefined,
            isIntroduction
        });

        // Progress step if introduction completed
        if (isIntroduction && session.step < session.agenda.length - 1) {
            session.step++;
        }

    } catch (err) {
        console.error("❌ Server Error:", err.message);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});

/* --------------------------------------------------
   START SERVER
-------------------------------------------------- */
app.listen(PORT, () => {
    console.log(`🚀 InventaLab Server running on http://localhost:${PORT}`);
    console.log(`📚 Features enabled:`);
    console.log(`   ✓ Groq LLaMA 3.3 70B`);
    console.log(`   ${process.env.TAVILY_API_KEY ? '✓' : '✗'} RAG (Tavily)`);
    console.log(`   ✓ Mermaid Mind Maps`);
    console.log(`   ✓ Structured Introductions`);
});