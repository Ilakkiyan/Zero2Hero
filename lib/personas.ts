/**
 * Quick-pick personas. Zero2Hero is built for the student first-time builder
 * (the USAII Global AI Hackathon is a student competition), so the presets lead
 * with the student variants — class project, startup idea, creator/side project
 * — plus a general first-time builder. Selecting one seeds the workspace shared
 * context that every interview + plan reads, so the whole product instantly
 * tailors to who you are. Shared by the Context modal and the first-run nudge in
 * the interview empty state.
 */
export interface Persona {
  label: string;
  text: string;
}

export const PERSONA_PRESETS: Persona[] = [
  {
    label: "Student — class/hackathon project",
    text: "Student turning a class project or hackathon idea into something real. Limited time and budget. I need a working first version and proof real people want it, fast — and an honest read on whether it's worth my time.",
  },
  {
    label: "Student with a startup idea",
    text: "Student with a startup idea I want to build alongside classes. No cofounder, little money. I want real evidence a few people actually care before I sink my time in. Push back on me; I have no one else who will.",
  },
  {
    label: "Student creator / side project",
    text: "Student creator building a side project or product for my own audience. I want to validate demand quickly and ship a first version people will actually use.",
  },
  {
    label: "First-time builder",
    text: "First-time builder with an early-stage idea and limited time. I want to de-risk it with real evidence and get an honest go/no-go before I over-invest.",
  },
];
