import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Rating, BatchStats, GroupReport } from "../types";

// Using Gemini 3 Flash model for better performance and multimodal capabilities
const MODEL_NAME = 'gemini-3-flash-preview';

// Helper function to safely get API Key from various environment configurations
const getApiKey = (): string | undefined => {
  // 0. Try LocalStorage (User entered manually in UI)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem("GEMINI_API_KEY");
    if (localKey) return localKey;
  }

  // 1. Try Vite standard (import.meta.env) - safely accessed
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  // 2. Try Create React App standard
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  
  return undefined;
};

// Helper function to get Base URL (for custom proxies)
// Note: This is currently unused as the SDK does not strictly support baseUrl in constructor options
const getBaseUrl = (): string | undefined => {
  if (typeof window !== 'undefined') {
    const url = localStorage.getItem("GEMINI_BASE_URL");
    if (url && url.trim().length > 0) return url.trim();
  }
  return undefined;
};

// Helper for delay
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to resize image before sending to save bandwidth and token limits
// Returns a base64 string without the prefix
const resizeAndEncodeImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize to max dimension of 1024 to speed up AI processing without losing critical detail
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
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as JPEG with 0.8 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        // Remove "data:image/jpeg;base64,"
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    rating: {
      type: Type.STRING,
      enum: ['S', 'A', 'B'],
      description: "The rating of the photo (S/A/B).",
    },
    reason: {
      type: Type.STRING,
      description: "Specific critique on emotion/composition (max 15 words).",
    },
  },
  required: ["rating", "reason"],
};

export const ratePhotoWithGemini = async (file: File): Promise<{ rating: Rating; reason: string }> => {
  const apiKey = getApiKey();
  // const baseUrl = getBaseUrl(); // Removed: baseUrl is not a property of GoogleGenAIOptions
  if (!apiKey) throw new Error("API Key not found");

  // Fix: Removed baseUrl from initialization options
  const ai = new GoogleGenAI({ apiKey });
  
  let base64Image: string;
  try {
      base64Image = await resizeAndEncodeImage(file);
  } catch (e) {
      console.error("Image processing error", e);
      return { rating: Rating.B, reason: "Image processing failed" };
  }

  const prompt = `
    You are the Senior Art Director for "Elephant Principal" (象园长), a high-end family travel photography service at Chimelong Safari Park.
    Your job is to curate photos based on **Emotion**, **Storytelling**, and **Aesthetics**.

    **Context:** 
    Amusement park, Safari, Parade, Parent-Child interaction, Couple romance.

    **Detailed Grading Rubric:**

    ### **S - THE MASTERPIECE (Top 10% - Ad Quality)**
    *   **Emotion (Crucial):** Peak emotional resonance. A burst of laughter, a look of pure wonder from a child, or a deeply affectionate moment. Unstaged and authentic.
    *   **Atmosphere:** Cinematic vibe. Good use of backlight, golden hour, or bubbles/smoke from the park environment.
    *   **Composition:** Clean background or meaningful background (e.g., a giraffe framing the family). Artistic depth of field.
    *   **Interaction:** The subject is engaging with the environment (pointing at animals) or each other, not just staring at the lens.
    *   *The "Wow" shot that goes on the poster.*

    ### **A - EXCELLENT (Top 30% - Client Favorite)**
    *   **Emotion:** Genuine, warm smiles. Everyone looks happy and flattering.
    *   **Composition:** Balanced and safe. Subject is clear, no awkward limb chops.
    *   **Technical:** Sharp focus on eyes, correct exposure.
    *   **Interaction:** Good group dynamic.
    *   *A beautiful, high-quality memory that the client will love to share.*

    ### **B - STANDARD (Deliverable - Documentation)**
    *   **Emotion:** Standard "Say Cheese" face, slightly stiff, or neutral expression.
    *   **Composition:** Average. Background might be slightly messy (passersby visible) but acceptable.
    *   **Technical:** Passable. Maybe slightly flat lighting.
    *   **Purpose:** Proof of attendance. "We were here."

    **Downgrade Rules (Force B):**
    *   Eyes closed (unintentionally).
    *   Motion blur on faces.
    *   Awkward facial expressions.
    *   Messy background that ruins the subject.

    **Output:**
    Return JSON with 'rating' and a short 'reason' (e.g., "Cinematic lighting, great joy", "Stiff pose, messy background").
  `;

  let attempts = 0;
  const maxAttempts = 6;
  const baseDelay = 2000; // Start with 2 seconds

  while (attempts < maxAttempts) {
    try {
        const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
            parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.3, // Lower temperature for more consistent strictness
        }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI");

        const json = JSON.parse(text);
        
        // Map string to Enum
        let ratingEnum = Rating.B;
        if (json.rating === 'S') ratingEnum = Rating.S;
        if (json.rating === 'A') ratingEnum = Rating.A;
        
        return {
        rating: ratingEnum,
        reason: json.reason || "Processed."
        };

    } catch (error: any) {
        // Check for 429 or quota errors
        const errStr = error.toString();
        const isQuotaError = errStr.includes("429") || 
                             errStr.includes("RESOURCE_EXHAUSTED") || 
                             errStr.includes("quota");
        
        if (isQuotaError && attempts < maxAttempts - 1) {
            // Exponential backoff
            const delayTime = baseDelay * Math.pow(2, attempts); 
            console.warn(`Rate limit hit (429). Retrying in ${delayTime}ms...`);
            await wait(delayTime);
            attempts++;
            continue;
        }

        console.error("Error analyzing photo:", error);
        return {
            rating: Rating.B, // Default to B on error to be safe
            reason: "AI unavailable (Limit reached)."
        };
    }
  }

  return { rating: Rating.B, reason: "Analysis Timeout" };
};

export const generateGroupReport = async (stats: BatchStats, sReasons: string[], bReasons: string[]): Promise<GroupReport> => {
    const apiKey = getApiKey();
    // const baseUrl = getBaseUrl(); // Removed: baseUrl is not a property of GoogleGenAIOptions
    if (!apiKey) throw new Error("API Key not found");
    
    // Fix: Removed baseUrl from initialization options
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      You are the "Elephant Principal" (象园长), the manager of a photography team at Chimelong Safari Park.
      Evaluate the photographer's performance for this specific client set based on the stats below.
      
      **Statistics:**
      - Total Photos: ${stats.total}
      - S (Masterpiece): ${stats.s_count} (${Math.round(stats.s_count/stats.total*100)}%)
      - A (Excellent): ${stats.a_count}
      - B (Standard): ${stats.b_count}
      
      **Content Analysis:**
      - Highlights (from S-tier photos): ${sReasons.slice(0, 10).join('; ')}...
      - Issues (from B-tier photos): ${bReasons.slice(0, 10).join('; ')}...
      
      **Your Task:**
      Provide a constructive critique in JSON format.
      1. **overallGrade**: S (Outstanding), A (Solid), or B (Needs Improvement). 
         - S if S-tier > 15% and B-tier < 40%.
         - A if S-tier > 5% and mostly A.
         - B if mostly B.
      2. **summary**: A 2-sentence summary of the shoot's quality (in Chinese). Focus on emotion and variety.
      3. **strengths**: 3 bullet points (Chinese) on what they did well (e.g., "Captured great candid laughter", "Good use of park lighting").
      4. **improvements**: 3 bullet points (Chinese) on how to improve next time (e.g., "Watch out for messy backgrounds", "Try to interact more with kids for natural smiles").
    `;

    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
        try {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            overallGrade: { type: Type.STRING, enum: ["S", "A", "B"] },
                            summary: { type: Type.STRING },
                            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                            improvements: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["overallGrade", "summary", "strengths", "improvements"]
                    }
                }
            });

            const text = response.text;
            if (!text) throw new Error("No report generated");
            
            return JSON.parse(text) as GroupReport;
        } catch (error: any) {
            const errStr = error.toString();
            const isQuotaError = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED");
            
            if (isQuotaError && attempts < maxAttempts - 1) {
                const delayTime = 3000 * Math.pow(2, attempts);
                console.warn(`Rate limit generating report. Retrying in ${delayTime}ms...`);
                await wait(delayTime);
                attempts++;
                continue;
            }
            throw error;
        }
    }
    throw new Error("Failed to generate report after retries");
}