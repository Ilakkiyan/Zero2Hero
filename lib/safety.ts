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

/** Shown to the user (and returned by the API) when an idea is refused. */
export const SAFETY_REFUSAL =
  "I can't help with this — it looks like it involves harmful or illegal activity. Zero2Hero is here to help you build something useful and legitimate.";
