// OpenAI API Client for headline generation and image analysis

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

async function callOpenAI(messages: ChatMessage[], maxTokens: number = 150): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data: ChatResponse = await response.json();
  return data.choices[0].message.content;
}

// Generate a marketing headline for a product
export async function generateHeadline(
  title: string,
  description: string,
  locale: string
): Promise<string> {
  const languageNames: Record<string, string> = {
    en: "English",
    de: "German",
    et: "Estonian",
    fr: "French",
    ru: "Russian",
    pt: "Portuguese",
  };

  const language = languageNames[locale] || "English";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a marketing copywriter for an e-commerce store. Generate short, catchy product headlines (taglines) that are SEO-friendly and appealing to customers. The headline should be 5-10 words. Respond ONLY with the headline, no quotes or explanation.`,
    },
    {
      role: "user",
      content: `Generate a marketing headline in ${language} for this product:

Title: ${title}
Description: ${description}

The headline should highlight key benefits and be compelling for shoppers.`,
    },
  ];

  return callOpenAI(messages, 50);
}

// Analyze product image and generate enhanced description
export async function analyzeProductImage(
  imageUrl: string,
  existingDescription: string,
  locale: string
): Promise<string> {
  const languageNames: Record<string, string> = {
    en: "English",
    de: "German",
    et: "Estonian",
    fr: "French",
    ru: "Russian",
    pt: "Portuguese",
  };

  const language = languageNames[locale] || "English";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are an e-commerce product description writer. Analyze the product image and enhance the existing description with visual details you observe. Keep the enhanced description concise (2-3 sentences) and focus on features visible in the image that aren't mentioned in the original description.`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this product image and enhance the description in ${language}.

Existing description: ${existingDescription}

Add visual details you can see that would help customers understand the product better. Keep it brief and natural.`,
        },
        {
          type: "image_url",
          image_url: { url: imageUrl },
        },
      ],
    },
  ];

  return callOpenAI(messages, 200);
}

// Generate SEO-friendly slug from translated title
export async function generateSlug(title: string, locale: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You convert product titles into SEO-friendly URL slugs. Rules:
1. Use only lowercase letters, numbers, and hyphens
2. Remove special characters and accents
3. Keep it concise (3-5 words max)
4. Make it descriptive and readable
5. Respond ONLY with the slug, nothing else`,
    },
    {
      role: "user",
      content: `Convert this ${locale.toUpperCase()} product title to a URL slug: "${title}"`,
    },
  ];

  const slug = await callOpenAI(messages, 30);
  // Clean up any whitespace or quotes that might have been included
  return slug.trim().replace(/['"]/g, "").toLowerCase();
}

// Generate headlines for all locales at once
export async function generateHeadlinesForAllLocales(
  titles: Record<string, string>,
  descriptions: Record<string, string>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Process in parallel
  const locales = Object.keys(titles);
  const headlines = await Promise.all(
    locales.map(async (locale) => {
      const headline = await generateHeadline(
        titles[locale],
        descriptions[locale] || "",
        locale
      );
      return { locale, headline };
    })
  );

  headlines.forEach(({ locale, headline }) => {
    results[locale] = headline;
  });

  return results;
}
