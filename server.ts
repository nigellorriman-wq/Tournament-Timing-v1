import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ override: true });

function getGeminiApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && process.env.GEMINI_API_KEY.trim() !== "") {
    return process.env.GEMINI_API_KEY.trim();
  }
  for (const envFile of [".env", ".env.local", ".env.example"]) {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
      if (match && match[1] && match[1] !== "MY_GEMINI_API_KEY" && match[1].trim() !== "") {
        return match[1].trim();
      }
    }
  }
  return "AIzaSyB6yrXLUDq5kQcBYSyfYY9hB90mcTjXSzg";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
 
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Parse PDF schedule drawing and pace using Gemini
  app.post("/api/parse-pdf", async (req, res) => {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "Missing pdfBase64 parameter" });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY environment variable is not defined on the server" });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              text: "Extract tournament information from this golf start list. Include tournament name, round number, group numbers, start times, starting tees, players (full names), and pace of play (minutes per hole for holes 1-18)."
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              round: { type: Type.STRING },
              paceOfPlay: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hole: { type: Type.NUMBER },
                    minutes: { type: Type.NUMBER },
                  },
                  required: ["hole", "minutes"],
                },
              },
              groups: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    groupNumber: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    startingTee: { type: Type.NUMBER },
                    players: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ["groupNumber", "startTime", "players"],
                },
              },
            },
            required: ["name", "round", "paceOfPlay", "groups"],
          }
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini PDF parsing error on server:", err);
      res.status(500).json({ error: err.message || "Failed to parse PDF list on the server" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
