/**
 * Build the Gemini image-generation prompt for a team.
 *
 * NOTE: The visual template is a work in progress. This file is the single
 * extension point for the prompt — update the STYLE_PRESETS, LAYOUT_PRESETS,
 * and buildPrompt() logic as the template evolves.
 */

export interface TeamMemberInfo {
  first_name: string;
  grade: string | null;
  gender: string | null;
  race: string | null;
  ethnicity: string | null;
  level_of_technology: string | null;
}

export interface BuildPromptInput {
  teamName: string;
  schoolName: string;
  members: TeamMemberInfo[];
  regenInstructions?: string | null;
  /** Arbitrary string used to seed the style randomizer — team name by default */
  seed?: string;
}

const STYLE_PRESETS = [
  'vibrant digital illustration with clean line art and flat colors',
  'cinematic cyberpunk neon aesthetic with subtle glow effects',
  'bold comic-book style with halftone shading and dynamic angles',
  'polished esports team poster look with dramatic lighting',
  'modern flat vector illustration with geometric shapes',
  'stylized anime-inspired illustration with soft shading',
  'retro 80s synthwave with grid horizon and sunset palette',
  'high-tech futuristic aesthetic with holographic elements',
];

const PALETTE_PRESETS = [
  'electric blue and magenta',
  'emerald green and gold',
  'deep navy and bright orange',
  'purple and cyan',
  'crimson red and silver',
  'teal and amber',
  'royal blue and white',
  'black with neon green accents',
];

const LAYOUT_PRESETS = [
  'group portrait with team standing confidently in a heroic pose',
  'action shot of team members gathered around glowing monitors and screens',
  'symmetrical formation with team name banner overhead',
  'dynamic composition with team in front of a stylized school emblem backdrop',
];

// Simple deterministic hash → integer for repeatable-but-varied seeding
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seedNum: number, offset: number): T {
  return arr[(seedNum + offset) % arr.length];
}

function describeMember(m: TeamMemberInfo): string {
  const parts: string[] = [];
  // Age/grade cue
  if (m.grade) parts.push(`grade ${m.grade}`);
  // Gender (best-effort)
  if (m.gender) parts.push(m.gender.toLowerCase());
  // Race/ethnicity - include to encourage representative avatars
  if (m.race && m.race.toLowerCase() !== 'prefer not to say') parts.push(m.race);
  if (m.ethnicity && m.ethnicity.toLowerCase() !== 'prefer not to say') parts.push(m.ethnicity);
  return `"${m.first_name}" (${parts.join(', ') || 'student'})`;
}

export interface BuiltPrompt {
  prompt: string;
  style: string;
  palette: string;
  layout: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const seedSource = input.seed ?? input.teamName;
  // Re-rolls happen via regenInstructions; when regen is empty we nudge the seed
  // with a timestamp so the same team produces a different style on regen.
  const seedSuffix = input.regenInstructions ? `|${input.regenInstructions}` : `|${Date.now()}`;
  const seed = hashSeed(seedSource + seedSuffix);

  const style = pick(STYLE_PRESETS, seed, 0);
  const palette = pick(PALETTE_PRESETS, seed, 1);
  const layout = pick(LAYOUT_PRESETS, seed, 2);

  const memberLines = input.members.length > 0
    ? input.members.map((m, i) => `  ${i + 1}. ${describeMember(m)}`).join('\n')
    : '  (no member info available — use diverse student avatars)';

  const parts = [
    `Generate a team photo-style illustration for a high school / middle school / college cybersecurity competition team.`,
    ``,
    `TEAM NAME: "${input.teamName}"`,
    `SCHOOL: "${input.schoolName}"`,
    ``,
    `TEAM MEMBERS (use as avatars, labeled with first name only, no other personal info):`,
    memberLines,
    ``,
    `STYLE: ${style}.`,
    `COLOR PALETTE: ${palette}.`,
    `LAYOUT: ${layout}.`,
    ``,
    `REQUIREMENTS:`,
    `- Render the team name "${input.teamName}" prominently as stylized text in the image.`,
    `- Render the school name "${input.schoolName}" as secondary text (smaller, clean).`,
    `- Each avatar should look like a student of the described age/grade, gender, and race/ethnicity.`,
    `- Only each student's first name appears near their avatar — no last names, ages, or other personal data.`,
    `- Do NOT include any real-world school logo, trademark, or copyrighted imagery.`,
    `- Aspect ratio: landscape (16:9) — wider than tall.`,
    `- Avoid text gibberish; keep rendered text limited to the team name and school name.`,
  ];

  if (input.regenInstructions && input.regenInstructions.trim()) {
    parts.push(``, `ADDITIONAL ADMIN INSTRUCTIONS (take precedence over above style choices):`, input.regenInstructions.trim());
  }

  return {
    prompt: parts.join('\n'),
    style,
    palette,
    layout,
  };
}
