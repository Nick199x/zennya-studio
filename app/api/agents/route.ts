import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ✨ LOAD ALL 9 KNOWLEDGE BASE FILES AT SERVER STARTUP
const KB_PATH = path.join(process.cwd(), 'knowledge-base');

const FULL_KNOWLEDGE_BASE = `
# ZENNYA ESSENTIALS COMPLETE KNOWLEDGE BASE

${fs.readFileSync(path.join(KB_PATH, '01-brand-book.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '02-essential-oils.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '03-fragrances.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '04-diffusers.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '05-video-creation.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '06-caption-creation.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '07-customer-avatars.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '08-static-ads.md'), 'utf-8')}

---

${fs.readFileSync(path.join(KB_PATH, '09-target-market.md'), 'utf-8')}
`;

console.log(`📚 Knowledge Base loaded: ${FULL_KNOWLEDGE_BASE.length} characters from 9 files`);

// Agent configurations
const promptsDir = path.join(process.cwd(), 'prompts');
const agent1Prompt = fs.readFileSync(path.join(promptsDir, 'agent1_studio.md'), 'utf-8');
const agent2Prompt = fs.readFileSync(path.join(promptsDir, 'agent2_studio.md'), 'utf-8');
const agent3Prompt = fs.readFileSync(path.join(promptsDir, 'agent3_studio.md'), 'utf-8');

const AGENT_CONFIGS = {
  BRIAN: {
    name: 'Brian',
    role: 'Campaign Strategist & Ideation Agent',
    systemPrompt: agent1Prompt,
  },
  LESTER: {
    name: 'Lester',
    role: 'Brand Safety & Quality Evaluation Agent',
    systemPrompt: agent3Prompt,
  },
  ALESSA: {
    name: 'Alessa',
    role: 'Prompt Engineer & Production Specialist',
    systemPrompt: agent2Prompt,
  },
};

async function callAgent(
  agentName: keyof typeof AGENT_CONFIGS,
  userMessage: string,
  context: string = ''
) {
  const agent = AGENT_CONFIGS[agentName];

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: context
        ? `${context}\n\n---\n\nUser Request: ${userMessage}`
        : userMessage,
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: [
      // ✨ CACHED KNOWLEDGE BASE - All 9 files, ~6,000-8,000 tokens
      {
        type: 'text',
        text: FULL_KNOWLEDGE_BASE,
        cache_control: { type: 'ephemeral' }, // 🔥 PROMPT CACHING MAGIC
      },
      // Agent-specific instructions (NOT cached, changes per agent)
      {
        type: 'text',
        text: agent.systemPrompt,
      },
    ],
    messages,
  });

  // Log cache usage for debugging
  const usage = (response as any).usage;
  if (usage) {
    console.log(`[${agentName}] Token usage:`, {
      input_tokens: usage.input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      output_tokens: usage.output_tokens,
    });
  }

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function POST(req: NextRequest) {
  try {
    const { message, mode } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const isPipelineMode = mode === 'pipeline';

    if (isPipelineMode) {
      // PIPELINE MODE: All 3 agents in sequence
      console.log('🔄 Starting pipeline mode...');
      const agents: Array<{ agent: string; response: string }> = [];

      // 1. Brian generates concepts
      console.log('1️⃣ Brian: Generating concepts...');
      const brianResponse = await callAgent('BRIAN', message);
      agents.push({ agent: 'BRIAN', response: brianResponse });

      // 2. Lester evaluates
      console.log('2️⃣ Lester: Evaluating concepts...');
      const lesterResponse = await callAgent(
        'LESTER',
        message,
        `Brian's Concepts:\n${brianResponse}\n\nPlease evaluate these concepts for brand compliance and quality.`
      );
      agents.push({ agent: 'LESTER', response: lesterResponse });

      // 3. Alessa creates production prompts
      console.log('3️⃣ Alessa: Creating production prompts...');
      const alessaResponse = await callAgent(
        'ALESSA',
        message,
        `Brian's Concepts:\n${brianResponse}\n\nLester's Evaluation:\n${lesterResponse}\n\nPlease create production-ready image generation prompts.`
      );
      agents.push({ agent: 'ALESSA', response: alessaResponse });

      console.log('✅ Pipeline complete!');
      return NextResponse.json({ agents });
    } else {
      // MANUAL MODE: Single agent (Brian only)
      console.log('👤 Manual mode: Brian only...');
      const response = await callAgent('BRIAN', message);
      return NextResponse.json({
        agents: [{ agent: 'BRIAN', response }],
      });
    }
  } catch (error: any) {
    console.error('❌ Agent API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
