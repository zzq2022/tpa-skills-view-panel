/**
 * Self-Hosted SkillHub provider (skillhubserver)
 *
 * Connects to a self-hosted FastAPI instance running skillhubserver.
 * Integrates with /api/skillhub/* and /api/auth/* for public and private skills.
 */
import { type MarketProvider, type NormalizedSkill } from './types.ts';
export declare function recordSelfhostedSkills(skills: NormalizedSkill[]): void;
export declare function getSelfhostedCategories(): Array<{
    key: string;
    count: number;
}>;
export declare const selfhostedProvider: MarketProvider;
