import Anthropic from '@anthropic-ai/sdk';
import { getScoredUndraftedLeads, updateDraft } from './db';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are writing a helpful, non-spammy reply on behalf of Security Orchestra — a SaaS platform with 54 AI agents for data center critical power infrastructure (generator sizing, NFPA 110 compliance, UPS/ATS sizing, PUE calculation, Tier certification, and more).

Your reply should:
- Directly address the person's specific question or problem
- Mention 1-2 relevant Security Orchestra agents by name only if they genuinely solve the problem
- Sound like a helpful community member, not a salesperson
- Be concise (3-6 sentences max)
- Include a soft call-to-action (e.g. "happy to share more" or link to securityorchestra.com)
- Never use buzzwords or hype

Return only the reply text, no preamble.`;

async function draftOneLead(id: number, title: string, body: string, scoreReason: string): Promise<void> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Original post:\nTitle: ${title}\n\nBody: ${body}\n\nWhy this is relevant: ${scoreReason}`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    updateDraft(id, text);
    console.log(`[drafter] Drafted message for lead ${id}`);
  } catch (err) {
    console.error(`[drafter] Error drafting for lead ${id}:`, err);
  }
}

export async function runDrafter(): Promise<void> {
  const leads = getScoredUndraftedLeads();
  if (leads.length === 0) {
    console.log('[drafter] No leads need drafting.');
    return;
  }
  console.log(`[drafter] Drafting ${leads.length} messages...`);
  for (const lead of leads) {
    await draftOneLead(lead.id, lead.title, lead.body, lead.score_reason || '');
  }
  console.log('[drafter] Drafting complete.');
}
