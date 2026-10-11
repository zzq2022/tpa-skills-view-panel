/**
 * Self-Hosted SkillHub provider (skillhubserver)
 *
 * Connects to a self-hosted FastAPI instance running skillhubserver.
 * Integrates with /api/skillhub/* and /api/auth/* for public and private skills.
 */
import { type MarketProvider } from './types.ts';
export declare const selfhostedProvider: MarketProvider;
