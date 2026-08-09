import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { KarmaResponse } from '../../types';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const GROK_MODEL = 'grok-4.20-0309-non-reasoning';
const GROK_API_URL = 'https://api.x.ai/v1/responses';

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  usual: `Be your usual self, 
  you should evaluate how much karma to give or take away. 
  Don't give more karma than 50 and lower than -50.
  Respond like a normal conversational partner, but without swearing. 
  Always give a detailed answer. Respond in the user's language. 
  Only reply in JSON format:

("message": string, "value": number)`,

  business: `Be your usual self,
   you should assess how much karma to assign or deduct.
    Don't give more karma than 50 and lower than -50.
    Respond in a formal, business-like manner. 
    Always provide a detailed answer.
    Respond in the user's language.
    Only reply in JSON format:

("message": string, "value": number)`,

  bad_guy: `Be your usual self
   you should figure out how much karma to give or take away.
    Don't give more karma than 50 and lower than -50.
    Respond with swearing and humor.
    Always give a detailed answer.
    Respond in the user's language.
    Only reply in JSON format:

("message": string, "value": number)`,
};

interface GrokResponseOutput {
  type: string;
  role?: string;
  content?: Array<{ type: string; text: string }>;
}

interface GrokApiResponse {
  output: GrokResponseOutput[];
}

async function callGrokApi(
  personality: string,
  userText: string,
): Promise<{ message: string; value: number }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY is not set');
  }

  const instructions =
    SYSTEM_INSTRUCTIONS[personality] ?? SYSTEM_INSTRUCTIONS['usual'];

  const body = {
    model: GROK_MODEL,
    instructions,
    stream: false,
    input: [{ role: 'user', content: userText }],
  };

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GrokApiResponse;

  const messageOutput = data.output?.find(
    (o) => o.type === 'message' && o.role === 'assistant',
  );
  const rawText =
    messageOutput?.content?.find((c) => c.type === 'output_text')?.text ?? '';

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse JSON from Grok response: ${rawText}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as { message: string; value: number };
  return {
    message: String(parsed.message ?? ''),
    value: Math.max(-9999, Math.min(9999, Number(parsed.value ?? 0))),
  };
}

function toKarmaResponse(row: {
  id: number;
  karma: number;
  text: string;
  createdAt: Date;
}): KarmaResponse {
  return {
    id: row.id,
    karma: row.karma,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class KarmaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async getUserKarma(userId: string): Promise<KarmaResponse[]> {
    await this.usersService.requireById(userId);
    const rows = await this.prisma.karmaEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toKarmaResponse);
  }

  async addKarma(userId: string, text: string): Promise<KarmaResponse> {
    await this.usersService.checkResetAndDeductCoins(userId);

    const user = await this.usersService.requireById(userId);

    let message: string;
    let karma: number;

    try {
      const result = await callGrokApi(user.botPersonality, text.trim());
      message = result.message;
      karma = result.value;
    } catch (err) {
      throw new InternalServerErrorException(
        `AI service error: ${(err as Error).message}`,
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.karmaEntry.create({
        data: { userId, karma, text: message },
      });
      await tx.user.update({
        where: { id: userId },
        data: { karma: { increment: karma } },
      });
      return created;
    });

    return toKarmaResponse(row);
  }
}
