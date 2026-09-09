import { fundingAccount, type Env as BackendEnv } from '@open-autonomy/backend';

// The open platform's environment: the backend's, plus its doors onto money in and the human giving page.
export interface Env extends BackendEnv {
  // GitHub Sponsors: one listing per organization, landing on this account (default: the funding account).
  DEFAULT_SPONSOR_ACCOUNT?: string;
  GITHUB_SPONSORS_WEBHOOK_SECRET?: string;
  // The human giving page uses a registered GitHub OAuth app. Its session secret is dedicated to browser
  // sessions and must not be the secret that signs agent keys.
  GITHUB_OAUTH_BASE?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  GIVE_SESSION_HMAC_SECRET?: string;
  // The share of credits a funder buys that the organization matches from its grants account as bonus credits for
  // other people's projects (percent, default 10; 0 turns matching off).
  GRANT_MATCH_PERCENT?: string;
  // Polar, the merchant of record for direct patronage. Absent: the page's tiers offer GitHub Sponsors alone.
  POLAR_API_BASE?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
}
export const sponsorAccount = (env: Env): string => env.DEFAULT_SPONSOR_ACCOUNT || fundingAccount(env);
