/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, targetLang, sourceLang } = body;

    // Basic validation
    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // MyMemory API expects language pairs like "en|fr" (English to French)
    // If source is 'auto', MyMemory usually handles just the target, but it's safer to default to 'en' if unknown.
    const source = sourceLang === "auto" ? "en" : sourceLang.split("-")[0];
    const target = targetLang.split("-")[0];
    const langPair = `${source}|${target}`;

    // Free API Endpoint (No Key Required)
    const url = `https://api.mymemory.translated.net/get`;

    const response = await axios.get(url, {
      params: {
        q: text,
        langpair: langPair,
      },
    });

    if (response.data.responseStatus !== 200) {
       throw new Error(response.data.responseDetails || "Translation Error");
    }

    // Extract the translated text
    const translatedText = response.data.responseData.translatedText;

    return NextResponse.json({ translatedText });
  } catch (error: any) {
    console.error("Translation Error:", error.message);
    return NextResponse.json({ 
      error: "Translation failed. The free API might be busy." 
    }, { status: 500 });
  }
}