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
  /**
   * True when a reference logo image is being sent alongside the prompt. When
   * set, the "no real-world logo" rule is replaced with an instruction to
   * incorporate the provided reference.
   */
  hasReferenceLogo?: boolean;
}

const STYLE_PRESETS = [
  'cinematic cyberpunk neon aesthetic with subtle glow effects',
  'polished esports team poster look with dramatic lighting',
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
  // Experience level (drives posture/confidence cues, not age)
  if (m.level_of_technology && m.level_of_technology.toLowerCase() !== 'prefer not to say') {
    parts.push(`experience: ${m.level_of_technology}`);
  }
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

  const memberCount = input.members.length;
  const memberLines = input.members.map((m, i) => `  ${i + 1}. ${describeMember(m)}`).join('\n');

  const parts = [
    `Generate a team photo-style illustration for a high school / middle school / college cybersecurity competition team.`,
    ``,
    `TEAM NAME: "${input.teamName}"`,
    `SCHOOL: "${input.schoolName}"`,
    ``,
    `TEAM MEMBERS — exactly ${memberCount} avatar${memberCount === 1 ? '' : 's'}, labeled with first name only, no other personal info:`,
    memberLines,
    ``,
    `STYLE: ${style}.`,
    `COLOR PALETTE: ${palette}.`,
    `LAYOUT: ${layout}.`,
    ``,
    `REQUIREMENTS:`,
    `- SPELLING IS CRITICAL. Every piece of rendered text — team name, school name, and each member's first name — MUST appear character-for-character EXACTLY as shown below. Do NOT shorten, abbreviate, translate, pluralize, correct, or stylize the letters. Do NOT drop or add characters. Do NOT substitute similar-looking glyphs. Proofread each word against the source text before finalizing.`,
    `  • Team name (spell exactly): "${input.teamName}"`,
    `  • School name (spell exactly): "${input.schoolName}"`,
    `  • Member first names (spell each exactly): ${input.members.map((m) => `"${m.first_name}"`).join(', ')}`,
    `- Render the team name "${input.teamName}" prominently as stylized text in the image.`,
    `- Render the school name "${input.schoolName}" as secondary text (smaller, clean).`,
    `- Render EXACTLY ${memberCount} avatar${memberCount === 1 ? '' : 's'} — one per listed team member. Do NOT add extra people, background figures, bystanders, or crowd.`,
    `- Each avatar MUST match the real student: grade (age cue), gender, race/ethnicity, and experience level as listed. Do not homogenize the group — render the specific demographics given.`,
    `- Experience level should influence posture and confidence, not apparent age: beginners look curious/learning, intermediates engaged, advanced students confident/focused.`,
    `- Only each student's first name appears near their avatar — no last names, ages, or other personal data.`,
    `- Do NOT invent names. Use ONLY the first names listed above, spelled exactly.`,
    '- Name should be legible and readable and only appear once in the image.',
    '- Name font size should be half the size of the header font size.',
    `- All rendered text MUST have strong contrast against its background. Never place light text on a light background or dark text on a dark background. If the background in that region is light, the text must be dark (or have a dark outline/shadow); if dark, the text must be light.`,
    ...(input.hasReferenceLogo
      ? [
          `- A reference logo image is attached as an additional input. INCORPORATE IT into the design as a logo element — corner mark, banner flag, shoulder patch, or integrated background accent (use your judgment for placement). Preserve the logo's colors and shape faithfully; do not restyle it beyond minor recoloring needed for legibility. This attached logo OVERRIDES the "no real-world logo" rule.`,
        ]
      : [
          `- Do NOT include any real-world school logo, trademark, or copyrighted imagery.`,
        ]),
    `- Aspect ratio: landscape (16:9) — wider than tall.`,
    `- Avoid text gibberish; keep rendered text limited to the team name, school name, and the listed first names.`,
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
