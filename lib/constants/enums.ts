// Canonical allowed values for enumerated competitor-related fields.
// Keep these in sync with UI choices and server validation.

export const ALLOWED_DIVISIONS = [
  'middle_school', 'high_school', 'college',
] as const

export const ALLOWED_PROGRAM_TRACKS = [
  'traditional', 'adult_ed',
] as const

export const ALLOWED_GENDERS = [
  'male', 'female', 'other', 'prefer_not_to_say',
] as const

export const ALLOWED_RACES = [
  'white', 'black', 'hispanic', 'asian', 'native', 'pacific', 'other', 'declined_to_answer',
] as const

export const ALLOWED_ETHNICITIES = [
  'not_hispanic', 'hispanic', 'declined_to_answer',
] as const

export const ALLOWED_LEVELS_OF_TECHNOLOGY = [
  // Canonical device/OS tokens
  'pc', 'mac', 'chrome_book', 'linux', 'other',
] as const

export const ALLOWED_GRADES = [
  '6','7','8','9','10','11','12','college',
] as const
