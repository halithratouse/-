import { GoogleGenAI, Type } from "@google/genai";
import { Rating, BatchStats, GroupReport } from "../types";

// Using Gemini 3 Flash model for best performance/cost ratio for vision tasks
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Helper for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to resize image
const resizeAndEncodeImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1024;
        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("No context")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- VALIDATION ---

export const validateApiKey = async (apiKey: string): Promise<{ valid: boolean; error?: string }> => {
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: 'ping',
            config: { maxOutputTokens: 1 }
        });
        return { valid: true };
    } catch (e: any) {
        let msg = e.message || "连接失败";
        if (e.toString().includes("Failed to fetch")) msg = "网络错误：无法连接到 Google 服务器。请检查 VPN 是否开启全局模式。";
        if (e.toString().includes("403")) msg = "API Key 无效 (403)";
        return { valid: false, error: msg };
    }
};

// --- CORE RATING LOGIC ---

const PROMPT_TEXT = `
You are the Senior Art Director for "Elephant Principal" (象园长).
Grade this photo (S/A/B) based on Emotion, Storytelling, and Aesthetics.

Rubric:
S (Masterpiece): Peak emotion, cinematic light, perfect moment.
A (Excellent): Happy, clear, good composition, client favorite.
B (Standard): Stiff, messy background, average document.

Return strictly JSON: {"rating": "S"|"A"|"B", "reason": "Short critique under 15 words"}
`;

export const ratePhoto = async (file: File, apiKey: string): Promise<{ rating: Rating; reason: string; error?: boolean }> => {
    try {
        const base64Image = await resizeAndEncodeImage(file);
        const ai = new GoogleGenAI({ apiKey });

        // Retry logic for stability
        let attempts = 0;
        while (attempts < 3) {
            try {
                const response = await ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                            { text: PROMPT_TEXT }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                rating: { type: Type.STRING, enum: ['S', 'A', 'B'] },
                                reason: { type: Type.STRING }
                            }
                        }
                    }
                });
                const json = JSON.parse(response.text || "{}");
                return { rating: json.rating as Rating || Rating.B, reason: json.reason || "Processed" };
            } catch (e: any) {
                console.error("Gemini Error", e);
                // If it's a network error (fetch failed), fail immediately, don't retry as it likely won't fix itself
                if (e.toString().includes("Failed to fetch")) {
                    throw new Error("Network Error");
                }
                
                if (e.toString().includes("429") || e.toString().includes("503")) {
                    await wait(2000 * Math.pow(2, attempts)); // Exponential backoff
                    attempts++;
                    continue;
                }
                throw e;
            }
        }
        return { rating: Rating.B, reason: "请求超时", error: true };
    } catch (error: any) {
        let reason = "AI 处理失败";
        if (error.message === "Network Error" || error.toString().includes("Failed to fetch")) {
            reason = "网络连不上 (需VPN)";
        }
        return { rating: Rating.Unrated, reason: reason, error: true };
    }
};

// --- REPORT GENERATION ---

export const generateGroupReport = async (stats: BatchStats, sReasons: string[], bReasons: string[], apiKey: string): Promise<GroupReport> => {
    const prompt = `
      Evaluate photo batch.
      Stats: Total ${stats.total}, S ${stats.s_count}, A ${stats.a_count}, B ${stats.b_count}.
      Highlights: ${sReasons.slice(0,5).join('; ')}.
      Issues: ${bReasons.slice(0,5).join('; ')}.
      
      Return JSON:
      {
        "overallGrade": "S"|"A"|"B",
        "summary": "Chinese summary 2 sentences",
        "strengths": ["Chinese point 1", "Chinese point 2", "Chinese point 3"],
        "improvements": ["Chinese point 1", "Chinese point 2", "Chinese point 3"]
      }
    `;

    const ai = new GoogleGenAI({ apiKey });

    const res = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
    });
    return JSON.parse(res.text!) as GroupReport;
};