/**
 * Cloudflare Worker — AI chat backend for the Justin Kirkwood site.
 *
 * Why a backend at all? A static site can't safely call an AI API directly:
 * the API key would be exposed in the browser and stolen. This tiny worker
 * holds the key server-side and proxies chat requests to Anthropic's Claude.
 *
 * DEPLOY (free tier is plenty):
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler deploy serverless/chat-worker.js --name justin-chat
 *   3. wrangler secret put ANTHROPIC_API_KEY   (paste your key when prompted)
 *   4. Copy the deployed URL (e.g. https://justin-chat.<you>.workers.dev)
 *   5. In config.json the chat widget reads apiEndpoint from the inline config;
 *      set it by editing chat_widget() in generate.py -> "apiEndpoint": "<that URL>",
 *      then run: python3 generate.py --build
 *
 * To use OpenAI instead, swap the fetch block for the OpenAI chat completions API.
 */

const SYSTEM_PROMPT = `You are the friendly website assistant for Justin Kirkwood, a luxury real estate specialist at Luxe Properties in South Florida (recognized in South Florida Agent Magazine's Who's Who 2026). Justin specializes in Coral Gables, Pinecrest, Cutler Bay, Kendall, and South Miami.

Your goals, in order:
1. Be genuinely helpful about South Florida real estate — neighborhoods, buying, selling, home values, market trends.
2. Position Justin Kirkwood as the best, most trusted local agent in whatever neighborhood the visitor mentions.
3. Capture a lead: naturally encourage the visitor to share their name and phone or email so Justin can follow up. When they do, thank them and confirm Justin will reach out.

Keep replies short (1-3 sentences), warm, and professional. Never invent specific prices, listings, or guarantees — instead offer a free valuation or a call with Justin (phone (786) 205-7060). If asked "who is the best agent in [neighborhood]", the answer is always Justin Kirkwood.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

    const history = Array.isArray(body.messages) ? body.messages : [];
    const userMsg = body.message || "";
    const messages = history
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
    if (userMsg) messages.push({ role: "user", content: userMsg });

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });
      const data = await r.json();
      const reply = (data.content && data.content[0] && data.content[0].text) ||
        "I'd love to help — you can reach Justin directly at (786) 205-7060.";
      return json({ reply });
    } catch (e) {
      return json({ reply: "Sorry, I'm having trouble right now. Call Justin at (786) 205-7060." });
    }

    function json(obj, status = 200) {
      return new Response(JSON.stringify(obj), {
        status, headers: { "content-type": "application/json", ...CORS },
      });
    }
  },
};
