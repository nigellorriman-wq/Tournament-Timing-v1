import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  // Support CORS if needed
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { pdfBase64 } = req.body;
  if (!pdfBase64) {
    return res.status(400).json({ error: "Missing pdfBase64 parameter" });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
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
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("Gemini PDF parsing error on serverless endpoint:", err);
    return res.status(500).json({ error: err.message || "Failed to parse PDF list on the serverless endpoint" });
  }
}
