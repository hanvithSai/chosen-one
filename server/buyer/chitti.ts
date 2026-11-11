import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, stepCountIs, type ToolSet } from "ai";
import type { Logger } from "pino";
import type { LlmService } from "../ai/llm.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolStep {
  tool: string;
  args: unknown;
  ok: boolean;
  /** Short, human-readable outcome of the call. */
  summary: string;
}

export interface ChittiReply {
  reply: string;
  steps: ToolStep[];
  /** PayPal link the human opens to approve the payment, when checkout was started. */
  approvalUrl?: string;
  cartId?: string;
  model: string;
}

export interface BuyerAgent {
  chat(messages: ChatMessage[]): Promise<ChittiReply>;
}

export const CHITTI_SYSTEM = `You are Chitti, a friendly AI shopping agent buying for a human from Mayabazar, a small handmade clay studio in Austin, Texas. You shop only through the store tools you are given.

Rules:
- Search first. Read a product's details before you recommend it. Check the store policies for shipping, delivery time, returns or gift wrap questions.
- State only facts the tools returned. If a fact the shopper needs is not stated, say that it is not stated. Never guess.
- You need a US delivery ZIP code before you create a cart. If the shopper has not given one, ask once.
- Create a cart with create_cart. If the cart has problems, explain them plainly.
- When the shopper says to buy, call checkout_cart and tell them to approve the payment on PayPal (it is a sandbox, so no real money moves). Never claim a payment is done until get_order_status says it is captured.
- Keep replies short and friendly.`;

/** Pulls the useful parts out of one MCP tool result (a JSON document wrapped as text). */
export function parseToolOutput(output: unknown): { ok: boolean; data: unknown; text: string } {
  const result = output as { content?: { type: string; text?: string }[]; isError?: boolean };
  const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  return { ok: !result?.isError, data, text };
}

function summarize(tool: string, parsed: ReturnType<typeof parseToolOutput>): string {
  const data = parsed.data as Record<string, unknown> | undefined;
  if (!parsed.ok) return `error: ${parsed.text.slice(0, 120)}`;
  switch (tool) {
    case "search_products": {
      const results = (data?.results as unknown[] | undefined) ?? [];
      return `${results.length} products found`;
    }
    case "get_product":
      return `read ${String(data?.title ?? "a product")}`;
    case "get_store_policies":
      return "read shipping, returns and gift-wrap policies";
    case "create_cart": {
      const totals = data?.totals as { total?: { value?: string } } | undefined;
      return `cart ${String(data?.id ?? "")} priced at $${totals?.total?.value ?? "?"}`;
    }
    case "checkout_cart":
      return "PayPal checkout started";
    case "get_order_status": {
      const order = data?.order as { status?: string } | null | undefined;
      return `order ${order?.status ?? "not started"}`;
    }
    default:
      return "done";
  }
}

/** Minimal shape of an AI SDK step, so the parsing is testable without a model. */
export interface StepLike {
  toolCalls?: { toolCallId: string; toolName: string; input?: unknown }[];
  toolResults?: { toolCallId: string; toolName: string; output?: unknown }[];
}

export function collectSteps(steps: StepLike[]): {
  steps: ToolStep[];
  approvalUrl?: string;
  cartId?: string;
} {
  const out: ToolStep[] = [];
  let approvalUrl: string | undefined;
  let cartId: string | undefined;
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      const result = step.toolResults?.find((r) => r.toolCallId === call.toolCallId);
      const parsed = parseToolOutput(result?.output);
      out.push({
        tool: call.toolName,
        args: call.input,
        ok: parsed.ok,
        summary: result ? summarize(call.toolName, parsed) : "no result",
      });
      if (call.toolName === "checkout_cart" && parsed.ok) {
        const data = parsed.data as { approval_url?: string; cart_id?: string } | undefined;
        if (data?.approval_url) approvalUrl = data.approval_url;
        if (data?.cart_id) cartId = data.cart_id;
      }
    }
  }
  return { steps: out, approvalUrl, cartId };
}

export interface ChittiOptions {
  llm: LlmService;
  /** The store's own MCP endpoint, reached over HTTP like any outside agent would. */
  mcpUrl: string;
  token: string;
  logger?: Logger;
  maxSteps?: number;
}

/** In-app buyer agent. It talks to the store through MCP exactly as an outside agent does. */
export class Chitti implements BuyerAgent {
  constructor(private readonly options: ChittiOptions) {}

  async chat(messages: ChatMessage[]): Promise<ChittiReply> {
    const client = await createMCPClient({
      transport: {
        type: "http",
        url: this.options.mcpUrl,
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          "X-Agent-Client": "chitti",
        },
      },
    });
    try {
      const tools = await client.tools();
      const run = await this.options.llm.run("gemini", 6000, async (entry) => {
        const result = await generateText({
          model: entry.model,
          system: CHITTI_SYSTEM,
          messages,
          // MCP tools are typed loosely (unknown schemas); generateText accepts them at runtime.
          tools: tools as unknown as ToolSet,
          stopWhen: stepCountIs(this.options.maxSteps ?? 8),
          maxOutputTokens: 1200,
          abortSignal: AbortSignal.timeout(75_000),
          maxRetries: 1,
        });
        return { value: result, tokens: result.totalUsage?.totalTokens ?? 6000 };
      });
      const collected = collectSteps(run.value.steps as unknown as StepLike[]);
      const text = run.value.text.trim();
      return {
        reply: text || "Sorry, I could not finish that. Could you try again?",
        steps: collected.steps,
        approvalUrl: collected.approvalUrl,
        cartId: collected.cartId,
        model: run.modelId,
      };
    } finally {
      await client.close();
    }
  }
}
