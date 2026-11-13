/**
 * The only module that names a model or calls the Anthropic API (CLAUDE.md section 6).
 *
 * Structured output uses the API's structured outputs (`output_config.format` with a JSON
 * schema derived from zod), then re-validates with zod. A forced tool call is not used:
 * `tool_choice: {type: "tool"}` returns HTTP 400 on claude-sonnet-5-5 and claude-opus-5-5.
 *
 * Runtime-neutral: no Deno globals here, so Vitest can import it. Edge functions pass
 * `env: (k) => Deno.env.get(k)` and a `logUsage` that inserts into `usage_log`.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
export const ALLOWED_MODEL_IDS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"] as const;
export type ModelId = (typeof ALLOWED_MODEL_IDS)[number];

const MAX_TOKENS = 16000;

export type ModelErrorCode = "model_error" | "schema_invalid" | "config_error";

export class ModelError extends Error {
  constructor(
    public readonly code: ModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export interface SendRequest {
  model: ModelId;
  system: string;
  content: ContentBlock[];
  name: string;
  schema: z.ZodType;
}

export interface SendResult {
  /** Parsed JSON output, or null if the model returned nothing parseable. */
  output: unknown;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

export type SendFn = (req: SendRequest) => Promise<SendResult>;

export interface UsageRow {
  function_name: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  prompt_version: string;
}

export interface CallStructuredArgs<S extends z.ZodType> {
  functionName: string;
  promptVersion: string;
  system: string;
  content: ContentBlock[];
  /** Name of the output object, used in logs. */
  name: string;
  schema: S;
}

export interface CallStructuredResult<T> {
  data: T;
  modelId: ModelId;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelClientDeps {
  env: (key: string) => string | undefined;
  logUsage: (row: UsageRow) => Promise<void>;
  /** Injected in tests; defaults to the Anthropic SDK. */
  send?: SendFn;
}

function resolveModelId(raw: string | undefined): ModelId {
  const id = (raw ?? "").trim() || DEFAULT_MODEL_ID;
  if (!(ALLOWED_MODEL_IDS as readonly string[]).includes(id)) {
    throw new ModelError("config_error", `MODEL_ID "${id}" is not allowed. Use one of: ${ALLOWED_MODEL_IDS.join(", ")}`);
  }
  return id as ModelId;
}

function sdkSend(apiKey: string): SendFn {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  return async (req) => {
    const response = await client.messages.parse({
      model: req.model,
      max_tokens: MAX_TOKENS,
      system: req.system,
      messages: [{ role: "user", content: req.content }],
      output_config: { format: zodOutputFormat(req.schema) },
    });
    return {
      output: response.stop_reason === "refusal" ? null : response.parsed_output,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}

export function createModelClient(deps: ModelClientDeps) {
  const apiKey = deps.env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new ModelError("config_error", "ANTHROPIC_API_KEY is not set");
  const modelId = resolveModelId(deps.env("MODEL_ID"));
  const send = deps.send ?? sdkSend(apiKey);

  async function callStructured<S extends z.ZodType>(args: CallStructuredArgs<S>): Promise<CallStructuredResult<z.infer<S>>> {
    const totals = { inputTokens: 0, outputTokens: 0 };
    let lastIssue = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      let result: SendResult;
      try {
        result = await send({ model: modelId, system: args.system, content: args.content, name: args.name, schema: args.schema });
      } catch (e) {
        throw new ModelError("model_error", `Model call failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      totals.inputTokens += result.inputTokens;
      totals.outputTokens += result.outputTokens;
      await deps.logUsage({
        function_name: args.functionName,
        model_id: modelId,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        prompt_version: args.promptVersion,
      });
      if (result.stopReason === "refusal") {
        throw new ModelError("model_error", "The model declined this request");
      }
      const parsed = args.schema.safeParse(result.output);
      if (parsed.success) return { data: parsed.data, modelId, usage: totals };
      lastIssue = parsed.error.message;
    }
    throw new ModelError("schema_invalid", `Model output failed validation twice: ${lastIssue}`);
  }

  return { modelId, callStructured };
}

/**
 * Wraps untrusted CV or JD text in labelled delimiters. Any closing delimiter inside the
 * text is broken so the text cannot end the block early. The system prompt states that
 * everything inside these blocks is data, never instructions.
 */
export function wrapUntrusted(label: "CV" | "JD", text: string): string {
  const safe = text.replace(new RegExp(`</?${label}>`, "gi"), (m) => m.replace("<", "&lt;"));
  return `<${label}>\n${safe}\n</${label}>`;
}
