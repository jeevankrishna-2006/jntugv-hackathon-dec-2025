import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors());
app.use(express.json());

/* -------------------- HEALTH CHECK -------------------- */
app.get("/", (req, res) => {
  res.send("🚀 InventaLab RAG Server is running");
});

/* -------------------- RAG: INTERNET RETRIEVAL -------------------- */
/*
  This endpoint retrieves LIVE information from the internet
  using Tavily Search API (true RAG).
*/
app.post("/rag/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query is required for RAG search"
      });
    }

    const tavilyResponse = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: query,
          search_depth: "basic",
          max_results: 4
        })
      }
    );

    if (!tavilyResponse.ok) {
      throw new Error("Failed to retrieve data from Tavily");
    }

    const tavilyData = await tavilyResponse.json();

    // Clean and minimal response for LLM consumption
    const results = (tavilyData.results || []).map(item => ({
      title: item.title,
      content: item.content,
      url: item.url
    }));

    res.json({
      source: "Live Internet (Tavily)",
      retrieved_at: new Date().toISOString(),
      results
    });

  } catch (error) {
    console.error("❌ RAG Search Error:", error.message);
    res.status(500).json({
      error: "RAG retrieval failed"
    });
  }
});

/* -------------------- SERVER START -------------------- */
app.listen(PORT, () => {
  console.log(`✅ InventaLab RAG server running at http://localhost:${PORT}`);
});