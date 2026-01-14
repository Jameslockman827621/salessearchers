// ===========================================
// OpenAI Integration (Complete Implementation)
// ===========================================

import OpenAI from 'openai';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface ContentGenerationContext {
  contactName?: string;
  contactTitle?: string;
  companyName?: string;
  dealName?: string;
  dealValue?: number;
  meetingSummary?: string;
  actionItems?: string[];
  objections?: string[];
  previousEmails?: string[];
  customInstructions?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  tone: 'formal' | 'friendly' | 'urgent';
}

export interface OpenAIClient {
  generateMeetingSummary(transcript: string): Promise<string>;
  generateActionItems(transcript: string): Promise<Array<{ text: string; assignee?: string; dueDate?: string }>>;
  generateKeyTopics(transcript: string): Promise<Array<{ topic: string; mentions?: number }>>;
  generateObjections(transcript: string): Promise<Array<{ text: string; response?: string; resolved?: boolean }>>;
  generateCoachingTips(transcript: string): Promise<Array<{ tip: string; category?: string }>>;
  // Content generation
  generateFollowUpEmail(context: ContentGenerationContext): Promise<GeneratedEmail>;
  generateColdEmail(context: ContentGenerationContext, template?: string): Promise<GeneratedEmail>;
  generateLinkedInMessage(context: ContentGenerationContext, type: 'connection' | 'inmail' | 'reply'): Promise<string>;
  generateCallScript(context: ContentGenerationContext): Promise<{ opening: string; discovery: string[]; pitch: string; objectionHandlers: Record<string, string>; close: string }>;
  generateObjectionResponse(objection: string, context: ContentGenerationContext): Promise<string>;
  improveText(text: string, goal: 'shorter' | 'longer' | 'formal' | 'casual' | 'persuasive'): Promise<string>;
}

export function createOpenAIClient(): OpenAIClient {
  return {
    async generateMeetingSummary(transcript: string): Promise<string> {
      const openai = getClient();
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales meeting analyst. Summarize the following sales meeting transcript.
Focus on:
- Key discussion points
- Decisions made
- Prospect/customer sentiment
- Deal status and next steps

Keep the summary concise (2-3 paragraphs) but comprehensive.`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 30000), // Limit transcript length
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content ?? 'Unable to generate summary.';
    },

    async generateActionItems(transcript: string): Promise<Array<{ text: string; assignee?: string; dueDate?: string }>> {
      const openai = getClient();
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales meeting analyst. Extract action items from the following sales meeting transcript.

For each action item, identify:
- The task that needs to be done
- Who should do it (if mentioned)
- When it should be done (if mentioned)

Return as JSON array with objects containing: text, assignee (optional), dueDate (optional in ISO format).
Return ONLY the JSON array, no other text.`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 30000),
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{"items":[]}';
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.actionItems ?? []);
      } catch {
        return [];
      }
    },

    async generateKeyTopics(transcript: string): Promise<Array<{ topic: string; mentions?: number }>> {
      const openai = getClient();
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales meeting analyst. Identify the key topics discussed in this sales meeting transcript.

For each topic, provide:
- The topic name (keep it concise, 2-4 words)
- Approximate number of mentions

Return as JSON array with objects containing: topic, mentions.
Return ONLY the JSON array, no other text. Maximum 8 topics.`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 30000),
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{"topics":[]}';
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.topics ?? parsed.keyTopics ?? []);
      } catch {
        return [];
      }
    },

    async generateObjections(transcript: string): Promise<Array<{ text: string; response?: string; resolved?: boolean }>> {
      const openai = getClient();
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales coach. Identify objections raised by the prospect/customer in this sales meeting transcript.

For each objection, provide:
- The objection text
- How the sales rep responded (if they did)
- Whether the objection was resolved

Return as JSON array with objects containing: text, response (optional), resolved (boolean, optional).
Return ONLY the JSON array, no other text.`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 30000),
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{"objections":[]}';
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.objections ?? []);
      } catch {
        return [];
      }
    },

    async generateCoachingTips(transcript: string): Promise<Array<{ tip: string; category?: string }>> {
      const openai = getClient();
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales coach. Analyze this sales meeting transcript and provide coaching tips for the sales rep.

Focus on:
- Discovery techniques
- Objection handling
- Presentation skills
- Next steps and follow-up
- Active listening
- Value communication

For each tip, provide:
- The coaching tip (actionable and specific)
- Category (discovery, objection_handling, presentation, follow_up, listening, value_prop)

Return as JSON array with objects containing: tip, category.
Return ONLY the JSON array, no other text. Maximum 5 tips.`,
          },
          {
            role: 'user',
            content: transcript.slice(0, 30000),
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{"tips":[]}';
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.tips ?? parsed.coachingTips ?? []);
      } catch {
        return [];
      }
    },

    // ===========================================
    // Content Generation Methods
    // ===========================================

    async generateFollowUpEmail(context: ContentGenerationContext): Promise<GeneratedEmail> {
      const openai = getClient();
      
      const contextStr = buildContextString(context);
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales copywriter. Generate a professional follow-up email based on the provided context.

The email should:
- Reference specific points from the meeting/conversation
- Include clear next steps
- Be personalized and genuine
- Be concise but comprehensive

${context.customInstructions ? `Additional instructions: ${context.customInstructions}` : ''}

Return JSON with: subject, body, tone (formal/friendly/urgent).`,
          },
          {
            role: 'user',
            content: contextStr,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content);
        return {
          subject: parsed.subject ?? 'Follow-up',
          body: parsed.body ?? '',
          tone: parsed.tone ?? 'friendly',
        };
      } catch {
        return { subject: 'Follow-up', body: '', tone: 'friendly' };
      }
    },

    async generateColdEmail(context: ContentGenerationContext, template?: string): Promise<GeneratedEmail> {
      const openai = getClient();
      
      const contextStr = buildContextString(context);
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales copywriter specializing in cold outreach. Generate a compelling cold email.

The email should:
- Have a compelling, curiosity-inducing subject line
- Open with personalization (not "I hope this finds you well")
- Focus on value for the recipient
- Include a soft CTA
- Be under 150 words

${template ? `Use this as a template/inspiration: ${template}` : ''}
${context.customInstructions ? `Additional instructions: ${context.customInstructions}` : ''}

Return JSON with: subject, body, tone (formal/friendly/urgent).`,
          },
          {
            role: 'user',
            content: contextStr,
          },
        ],
        temperature: 0.8,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content);
        return {
          subject: parsed.subject ?? 'Quick question',
          body: parsed.body ?? '',
          tone: parsed.tone ?? 'friendly',
        };
      } catch {
        return { subject: 'Quick question', body: '', tone: 'friendly' };
      }
    },

    async generateLinkedInMessage(context: ContentGenerationContext, type: 'connection' | 'inmail' | 'reply'): Promise<string> {
      const openai = getClient();
      
      const contextStr = buildContextString(context);
      
      const typeInstructions = {
        connection: 'Generate a LinkedIn connection request note (max 300 characters). Be personal, mention something specific about them.',
        inmail: 'Generate a LinkedIn InMail message. Be professional but warm, focus on value, include a clear CTA.',
        reply: 'Generate a reply to continue the conversation. Be helpful and move toward a meeting/call.',
      };
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert at LinkedIn outreach. ${typeInstructions[type]}

${context.customInstructions ? `Additional instructions: ${context.customInstructions}` : ''}

Return ONLY the message text, no JSON.`,
          },
          {
            role: 'user',
            content: contextStr,
          },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });

      return response.choices[0]?.message?.content ?? '';
    },

    async generateCallScript(context: ContentGenerationContext): Promise<{ opening: string; discovery: string[]; pitch: string; objectionHandlers: Record<string, string>; close: string }> {
      const openai = getClient();
      
      const contextStr = buildContextString(context);
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales coach. Generate a call script based on the context provided.

Include:
- Opening (personalized icebreaker)
- Discovery questions (5-7 questions to uncover needs)
- Value pitch (tailored to their likely pain points)
- Objection handlers (for common objections)
- Closing (clear next step)

${context.customInstructions ? `Additional instructions: ${context.customInstructions}` : ''}

Return JSON with: opening, discovery (array), pitch, objectionHandlers (object with objection as key, response as value), close.`,
          },
          {
            role: 'user',
            content: contextStr,
          },
        ],
        temperature: 0.6,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      try {
        const content = response.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content);
        return {
          opening: parsed.opening ?? '',
          discovery: parsed.discovery ?? [],
          pitch: parsed.pitch ?? '',
          objectionHandlers: parsed.objectionHandlers ?? {},
          close: parsed.close ?? '',
        };
      } catch {
        return { opening: '', discovery: [], pitch: '', objectionHandlers: {}, close: '' };
      }
    },

    async generateObjectionResponse(objection: string, context: ContentGenerationContext): Promise<string> {
      const openai = getClient();
      
      const contextStr = buildContextString(context);
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert sales coach. Generate a response to handle this objection professionally.

Use the "feel, felt, found" framework or similar proven objection handling techniques.
Be empathetic but confident.
End with a question to continue the conversation.

${context.customInstructions ? `Additional instructions: ${context.customInstructions}` : ''}

Return ONLY the response text, no JSON.`,
          },
          {
            role: 'user',
            content: `Objection: "${objection}"\n\nContext:\n${contextStr}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 400,
      });

      return response.choices[0]?.message?.content ?? '';
    },

    async improveText(text: string, goal: 'shorter' | 'longer' | 'formal' | 'casual' | 'persuasive'): Promise<string> {
      const openai = getClient();
      
      const goalInstructions = {
        shorter: 'Make this text more concise while keeping the key message. Remove filler words.',
        longer: 'Expand this text with more detail and context. Add supporting points.',
        formal: 'Rewrite in a more formal, professional tone.',
        casual: 'Rewrite in a more casual, friendly tone.',
        persuasive: 'Rewrite to be more persuasive and compelling. Add urgency.',
      };
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert editor. ${goalInstructions[goal]}

Return ONLY the improved text, no explanations.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content ?? text;
    },
  };
}

// Helper to build context string for AI prompts
function buildContextString(context: ContentGenerationContext): string {
  const parts: string[] = [];
  
  if (context.contactName) parts.push(`Contact: ${context.contactName}`);
  if (context.contactTitle) parts.push(`Title: ${context.contactTitle}`);
  if (context.companyName) parts.push(`Company: ${context.companyName}`);
  if (context.dealName) parts.push(`Deal: ${context.dealName}`);
  if (context.dealValue) parts.push(`Deal Value: $${context.dealValue.toLocaleString()}`);
  if (context.meetingSummary) parts.push(`Meeting Summary:\n${context.meetingSummary}`);
  if (context.actionItems?.length) parts.push(`Action Items:\n- ${context.actionItems.join('\n- ')}`);
  if (context.objections?.length) parts.push(`Objections Raised:\n- ${context.objections.join('\n- ')}`);
  if (context.previousEmails?.length) parts.push(`Previous Emails:\n${context.previousEmails.join('\n---\n')}`);
  
  return parts.join('\n\n');
}
