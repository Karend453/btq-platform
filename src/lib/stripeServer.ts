import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import Stripe from "stripe";

/**
 * `vercel dev` injects `.env` into serverless handlers but often omits `.env.local`
 * (where Stripe keys commonly live). Production uses Vercel dashboard env; we skip
 * file loading when `STRIPE_SECRET_KEY` is already set.
 */
function loadStripeEnvFromLocalFiles(): void {
  if (process.env.STRIPE_SECRET_KEY) return;
  const root = process.cwd();
  const envPath = resolve(root, ".env");
  const localPath = resolve(root, ".env.local");
  if (existsSync(envPath)) config({ path: envPath });
  if (existsSync(localPath)) config({ path: localPath, override: true });
}

loadStripeEnvFromLocalFiles();

function cleanEnvValue(name: string, raw: string | undefined): string {
  if (!raw) {
    throw new Error(`Missing required env var: ${name}`);
  }

  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width + BOM
    .trim();

  const hasNonAscii = /[^\x20-\x7E]/.test(cleaned);
  if (hasNonAscii) {
    const badChars = [...cleaned]
      .map((ch, i) => ({ i, code: ch.charCodeAt(0) }))
      .filter(({ code }) => code < 32 || code > 126);

    throw new Error(
      `${name} still contains non-ASCII characters after cleanup: ${JSON.stringify(badChars)}`
    );
  }

  return cleaned;
}

function getStripeSecretKey(): string {
  const secret = cleanEnvValue("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);

  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_test_ or sk_live_");
  }

  return secret;
}

let stripeSingleton: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (stripeSingleton) return stripeSingleton;

  stripeSingleton = new Stripe(getStripeSecretKey(), {
    // keep your current apiVersion here if already set
  });

  return stripeSingleton;
}

export function isStripeLiveMode(): boolean {
  return getStripeSecretKey().startsWith("sk_live_");
}