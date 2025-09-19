#!/usr/bin/env node
require('dotenv/config');

const baseUrl = ((process.env.GAME_PLATFORM_API_BASE_URL || 'https://api.metactf.com/integrations/syned/v1').replace(/\/$/, '')) + '/';
const token = process.env.GAME_PLATFORM_API_TOKEN;

if (!token) {
  console.error('Missing GAME_PLATFORM_API_TOKEN');
  process.exit(1);
}

async function request(path, query) {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request to ${url.toString()} failed with ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('Game Platform smoke tests using base URL:', baseUrl);

  try {
    const scores = await request('/scores/get_odl_scores');
    console.log('ODL scores sample:', Array.isArray(scores) ? scores.slice(0, 2) : scores);
  } catch (error) {
    console.error('ODL scores sample failed:', error);
  }

  try {
    const assignments = await request('/users/get_team_assignments');
    console.log('Assignments sample:', assignments);
  } catch (error) {
    console.error('Team assignments sample failed:', error);
  }

  try {
    const flash = await request('/scores/get_flash_ctf_progress', { syned_user_id: 'sandbox-user-1' });
    console.log('Flash CTF sample:', flash);
  } catch (error) {
    console.error('Flash CTF sample failed (expected if user missing):', error.message);
  }
}

main().catch((error) => {
  console.error('Smoke script crashed', error);
  process.exit(1);
});
