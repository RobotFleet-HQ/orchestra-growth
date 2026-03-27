import Anthropic from '@anthropic-ai/sdk';
import { getUnscoredLeads, updateScore } from './db';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a lead scoring agent for Security Orchestra, a SaaS platform with 54 AI agents for data center critical power infrastructure. Agents cover: generator sizing, NFPA 110 compliance, UPS/ATS sizing, PUE calculation, cooling load, ROI/TCO analysis, Tier certification, utility interconnect, and site scoring. Score this signal on purchase intent 1-10 where 10 = actively asking for exactly what Security Orchestra does, 1 = tangentially related. Return JSON only: {"score": number, "reason": string, "relevant_agents": string[]}`;

interface ScoreResponse {
  score: number;
  reason: string;
  relevant_agents: string[];
}

async function scoreOneLead(id: number, title: string, body: string): Promise<void> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Title: ${title}\n\nBody: ${body}` },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[scorer] No JSON in response for lead ${id}`);
      return;
    }

    const parsed: ScoreResponse = JSON.parse(jsonMatch[0]);
    const score = Math.min(10, Math.max(1, Math.round(parsed.score)));
    updateScore(id, score, parsed.reason, parsed.relevant_agents || []);
    console.log(`[scorer] Lead ${id} scored ${score}/10`);
  } catch (err) {
    console.error(`[scorer] Error scoring lead ${id}:`, err);
  }
}

export async function runScorer(): Promise<void> {
  const leads = getUnscoredLeads();
  if (leads.length === 0) {
    console.log('[scorer] No unscored leads.');
    return;
  }
  console.log(`[scorer] Scoring ${leads.length} leads...`);
  for (const lead of leads) {
    await scoreOneLead(lead.id, lead.title, lead.body);
  }
  console.log('[scorer] Scoring complete.');
}
