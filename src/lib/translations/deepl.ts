// DeepL Pro API Client for translations
// Documentation: https://www.deepl.com/docs-api

const DEEPL_API_URL = "https://api.deepl.com/v2";

export type DeepLLanguage = "EN" | "DE" | "ET" | "FR" | "RU" | "PT-PT";

// Map our locale codes to DeepL language codes
export const localeToDeepL: Record<string, DeepLLanguage> = {
  en: "EN",
  de: "DE",
  et: "ET",
  fr: "FR",
  ru: "RU",
  pt: "PT-PT",
};

export const deepLToLocale: Record<DeepLLanguage, string> = {
  EN: "en",
  DE: "de",
  ET: "et",
  FR: "fr",
  RU: "ru",
  "PT-PT": "pt",
};

interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

export async function translateText(
  text: string,
  targetLang: DeepLLanguage,
  sourceLang?: DeepLLanguage
): Promise<string> {
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPL_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    text,
    target_lang: targetLang,
  });

  if (sourceLang) {
    params.append("source_lang", sourceLang);
  }

  const response = await fetch(`${DEEPL_API_URL}/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
  }

  const data: DeepLResponse = await response.json();
  return data.translations[0].text;
}

// Translate multiple texts at once (more efficient for batch operations)
export async function translateBatch(
  texts: string[],
  targetLang: DeepLLanguage,
  sourceLang?: DeepLLanguage
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPL_API_KEY is not configured");
  }

  const params = new URLSearchParams();
  texts.forEach((text) => params.append("text", text));
  params.append("target_lang", targetLang);

  if (sourceLang) {
    params.append("source_lang", sourceLang);
  }

  const response = await fetch(`${DEEPL_API_URL}/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
  }

  const data: DeepLResponse = await response.json();
  return data.translations.map((t) => t.text);
}

// Translate to all supported languages at once
export async function translateToAllLanguages(
  text: string,
  sourceLang: DeepLLanguage = "DE"
): Promise<Record<string, string>> {
  const targetLanguages: DeepLLanguage[] = ["EN", "DE", "ET", "FR", "RU", "PT-PT"];
  const results: Record<string, string> = {};

  // Translate in parallel for speed
  const translations = await Promise.all(
    targetLanguages.map(async (lang) => {
      // Skip if source and target are the same
      if (lang === sourceLang) {
        return { lang, text };
      }
      const translated = await translateText(text, lang, sourceLang);
      return { lang, text: translated };
    })
  );

  translations.forEach(({ lang, text }) => {
    const locale = deepLToLocale[lang];
    results[locale] = text;
  });

  return results;
}

// Check API usage
export async function getUsage(): Promise<{ character_count: number; character_limit: number }> {
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPL_API_KEY is not configured");
  }

  const response = await fetch(`${DEEPL_API_URL}/usage`, {
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status}`);
  }

  return response.json();
}
