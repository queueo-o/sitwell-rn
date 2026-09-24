/**
 * Optional OpenAI session analysis. Ported from lib/services/ai_analysis_service.dart.
 *
 * DELIBERATE CHANGE FROM THE FLUTTER APP: the bundled "trial" key is gone.
 *
 * The Flutter build shipped a shared key in a .env asset and rationed it to
 * three calls. Expo bundles assets the same way Flutter does, so that key is
 * extractable from any installed build — and a real one did end up committed
 * in the Flutter project. The Flutter code's own dialog conceded the point:
 * "a mobile app cannot completely protect a client-side API key."
 *
 * So this port supports ONE path: a key the user supplies themselves, held in
 * the device keychain/keystore via expo-secure-store, billed to their own
 * OpenAI account, never written to the repo. Nothing to leak.
 *
 * If this ever needs to work without each user holding a key, the answer is a
 * backend that holds it server-side — not a bundled secret.
 */
import { SessionRecord } from '../models/sessionRecord';

const KEY_STORE_ID = 'openai_personal_api_key';
const ENDPOINT = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_SESSIONS = 12;

const INSTRUCTIONS =
  'You are a concise posture-wellness coach. Analyze only the supplied session summaries. ' +
  'Give an overall pattern, one positive observation, and two practical next steps. ' +
  'Do not diagnose medical conditions. State that the analysis is general wellness guidance, ' +
  'not medical advice.';

export class AiAnalysisError extends Error {}

/** Lazily required so a missing module degrades instead of crashing launch. */
let store: any;
let storeLoadAttempted = false;

function secureStore(): any {
  if (storeLoadAttempted) return store;
  storeLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store = require('expo-secure-store');
  } catch {
    store = undefined;
    console.log('[ai] expo-secure-store unavailable — API key cannot be stored.');
  }
  return store;
}

export function isSecureStorageAvailable(): boolean {
  return !!secureStore();
}

export async function getApiKey(): Promise<string | null> {
  const s = secureStore();
  if (!s) return null;
  try {
    const value = await s.getItemAsync(KEY_STORE_ID);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function saveApiKey(key: string): Promise<void> {
  const clean = key.trim();
  if (!clean.startsWith('sk-') || clean.length < 24) {
    throw new AiAnalysisError('Enter a valid OpenAI API key beginning with sk-.');
  }
  const s = secureStore();
  if (!s) {
    throw new AiAnalysisError('This device cannot securely store an API key.');
  }
  try {
    await s.setItemAsync(KEY_STORE_ID, clean);
  } catch {
    throw new AiAnalysisError('This device could not securely save the API key.');
  }
}

export async function removeApiKey(): Promise<void> {
  const s = secureStore();
  if (!s) return;
  try {
    await s.deleteItemAsync(KEY_STORE_ID);
  } catch {
    // Nothing else to clear if secure storage is unavailable.
  }
}

/** The exact payload sent to OpenAI — surfaced so the UI can show it first. */
export function buildSessionPrompt(sessions: SessionRecord[]): string {
  const recent = [...sessions]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, MAX_SESSIONS);

  const lines = recent
    .map((s) => {
      const date = s.startedAt.toISOString().split('T')[0];
      const minutes = Math.floor(s.durationMs / 60000);
      return `- ${date}: duration ${minutes} minutes, posture score ${s.score}/100, slouches ${s.slouches}`;
    })
    .join('\n');

  return `Analyze these ${recent.length} posture session summaries:\n${lines}`;
}

/** Walk the Responses API shape: output[].content[].{output_text|refusal}. */
export function extractOutputText(decoded: unknown): string {
  if (!decoded || typeof decoded !== 'object') return '';
  const output = (decoded as any).output;
  if (!Array.isArray(output)) return '';

  const pieces: string[] = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        pieces.push(part.text);
      } else if (part?.type === 'refusal' && typeof part.refusal === 'string') {
        pieces.push(part.refusal);
      }
    }
  }
  return pieces.join('\n').trim();
}

function apiError(decoded: any, status: number): string {
  const message = decoded?.error?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return `OpenAI: ${message.trim()}`;
  }
  return `OpenAI request failed (HTTP ${status}).`;
}

export async function analyze(sessions: SessionRecord[]): Promise<string> {
  if (sessions.length === 0) {
    throw new AiAnalysisError('Complete a posture session before requesting an analysis.');
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new AiAnalysisError('Add your OpenAI API key to run an analysis.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // store:false asks OpenAI not to retain the request for model training.
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: 450,
        instructions: INSTRUCTIONS,
        input: buildSessionPrompt(sessions),
      }),
      signal: controller.signal,
    });

    const raw = await res.text();
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new AiAnalysisError('OpenAI returned an unreadable response. Please try again.');
    }

    if (!res.ok) throw new AiAnalysisError(apiError(decoded, res.status));

    const text = extractOutputText(decoded);
    if (!text) {
      throw new AiAnalysisError('OpenAI returned no analysis. Please try again.');
    }
    return text;
  } catch (e) {
    if (e instanceof AiAnalysisError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      throw new AiAnalysisError('The analysis request timed out. Please try again.');
    }
    throw new AiAnalysisError(
      'Could not reach OpenAI. Check your internet connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}
