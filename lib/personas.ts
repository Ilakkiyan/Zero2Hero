/**
 * Quick-pick personas. Zero2Hero is built for the solo first-time founder, but
 * the hackathon prompt's audience is "students, early professionals, or
 * creators" — these presets cover all three with one tap. Selecting one seeds
 * the workspace shared context that every interview + plan reads, so the whole
 * product instantly tailors to who you are. Shared by the Context modal and the
 * first-run nudge in the interview empty state.
 */
export interface Persona {
  label: string;
  text: string;
}

export const PERSONA_PRESETS: Persona[] = [
  {
    label: "Solo first-time founder",
    text: "Solo first-time founder — no cofounder, building nights and weekends. I want real evidence a few people actually care before I over-invest. Push back on me; I have no one else who will.",
  },
  {
    label: "Student / class project",
    text: "Student turning a class project or hackathon idea into something real. Limited time and budget. I need a working prototype and proof real people want it, fast.",
  },
  {
    label: "Early professional",
    text: "Early-career professional with a side idea I'd build evenings and weekends. Small budget, little runway. I want to know if it's worth pursuing before I commit serious time.",
  },
  {
    label: "Creator / indie maker",
    text: "Creator/indie maker launching a product to my own audience. I want to validate demand quickly and ship a first version people will pay for or use.",
  },
];
