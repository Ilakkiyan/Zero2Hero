/**
 * Input safety screen — a server-side backstop (defense-in-depth) on top of the
 * model-level refusal baked into the prompts. Intentionally CONSERVATIVE and
 * high-precision: it blocks only clearly harmful / illegal intent (an action
 * verb paired with a harmful target), so it won't false-positive on legitimate
 * ideas (e.g. a "Nerf gun marketplace" or a "malware-detection tool"). The
 * model handles nuance; this catches the egregious, unambiguous cases even if
 * the model were jailbroken.
 */
export interface SafetyResult {
  blocked: boolean;
  category?: string;
}

const RULES: { category: string; pattern: RegExp }[] = [
  {
    category: "child sexual exploitation",
    pattern: /\bcsam\b|child (sexual|porn|abuse)|\bminors?\b[^.]{0,40}\bsexual\b/i,
  },
  {
    // Inherently illegal/harmful weapon terms — block regardless of word order.
    category: "weapons or explosives",
    pattern:
      /\b(ghost guns?|untraceable (guns?|firearms?)|nerve agents?|bioweapons?|biological weapons?|chemical weapons?)\b/i,
  },
  {
    // Action + weapon ("build a bomb", "3d print a gun").
    category: "weapons or explosives",
    pattern:
      /\b(build|make|manufactur\w*|synthesi\w+|3d[- ]?print\w*)\b[^.]{0,60}\b(bombs?|explosives?|pipe ?bombs?|guns?|firearms?)\b/i,
  },
  {
    category: "illegal drug manufacture or trafficking",
    pattern:
      /\b(synthesi\w+|manufactur\w*|cook|produce|traffic\w*|smuggl\w+)\b[^.]{0,50}\b(meth|methamphetamine|fentanyl|cocaine|heroin|mdma|illegal drugs?|narcotics)\b/i,
  },
  {
    category: "malware or cyberattacks",
    pattern:
      /\b(create|build|writ\w+|develop|deploy|sell|spread)\b[^.]{0,50}\b(ransomware|botnets?|keyloggers?|spyware|stalkerware|computer virus(es)?|malware)\b/i,
  },
  {
    category: "fraud or theft",
    pattern:
      /\bphishing (kit|scam|campaign)|carding|credit[- ]card (fraud|skimm\w+)|ponzi scheme|steal (identit\w+|credit cards?|passwords?)/i,
  },
  {
    category: "violence against people",
    pattern:
      /\bhow to\b[^.]{0,30}\b(kill|murder|poison|assassinat\w+|harm|hurt)\b[^.]{0,20}\b(someone|people|a person|a human|him|her|them)\b/i,
  },
];

/** Screen free text for clearly harmful/illegal intent. Conservative by design. */
export function screenForHarm(text: string): SafetyResult {
  if (!text) return { blocked: false };
  for (const r of RULES) {
    if (r.pattern.test(text)) return { blocked: true, category: r.category };
  }
  return { blocked: false };
}

/**
 * Spam / flood screen. Catches the "wall of repeated text" abuse (e.g. SEO spam
 * floods) that wastes tokens and pollutes the interview/plan context — without
 * tripping on a normal idea or a thoughtful long answer. Like screenForHarm it's
 * conservative: it only fires on text that is overwhelmingly repetitive, in any
 * language. Two independent signals, either of which is conclusive:
 *   1. Unique-character ratio — a char/phrase flood reuses a tiny alphabet.
 *   2. Repeated-chunk ratio — a phrase repeated N times collapses to a handful
 *      of distinct overlapping shingles.
 */
export function screenForSpam(text: string): SafetyResult {
  const t = (text ?? "").trim();
  if (t.length < 80) return { blocked: false }; // short text is never flagged

  if (new Set(t).size / t.length < 0.03) {
    return { blocked: true, category: "spam or flooding" };
  }

  if (t.length >= 240) {
    const shingles = new Set<string>();
    const total = Math.floor((t.length - 10) / 5) + 1;
    for (let i = 0; i + 10 <= t.length; i += 5) shingles.add(t.slice(i, i + 10));
    if (shingles.size / total < 0.1) {
      return { blocked: true, category: "spam or flooding" };
    }
  }

  return { blocked: false };
}

/**
 * Single input gate: harmful intent first, then spam/flooding. Returns the
 * user-facing refusal message for whichever fired. Use this at every route that
 * accepts free user text.
 */
export interface ScreenResult {
  blocked: boolean;
  category?: string;
  message?: string;
}
export function screenInput(text: string): ScreenResult {
  const harm = screenForHarm(text);
  if (harm.blocked) return { ...harm, message: SAFETY_REFUSAL };
  const spam = screenForSpam(text);
  if (spam.blocked) return { ...spam, message: SPAM_REFUSAL };
  return { blocked: false };
}

/** Shown to the user (and returned by the API) when an idea is refused. */
export const SAFETY_REFUSAL =
  "I can't help with this — it looks like it involves harmful or illegal activity. Zero2Hero is here to help you build something useful and legitimate.";

/** Shown when input is repeated/spam text rather than a real idea or answer. */
export const SPAM_REFUSAL =
  "That looks like repeated or spam text rather than a real idea. Give me a sentence or two in your own words and I'll take it from there.";
