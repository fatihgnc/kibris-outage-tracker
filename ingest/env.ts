/**
 * An environment override, treating "set but empty" as not set.
 *
 * GitHub Actions passes an unset repository variable through as the empty
 * string, so `process.env.X ?? fallback` keeps the empty string — `??` only
 * catches null and undefined. The first production run of the new parser sent
 * `model: ""` to OpenAI on every announcement and was answered "you must
 * provide a model parameter"; the job stayed green, because a failed reading is
 * a supported outcome that goes to the review queue.
 *
 * Whitespace counts as empty too: a value pasted into a secret with a stray
 * newline is not a value.
 */
export function envOr(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}
