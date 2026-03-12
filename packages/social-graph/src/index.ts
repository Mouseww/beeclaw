// ============================================================================
// @beeclaw/social-graph — 公共 API 导出
// ============================================================================

export { SocialGraph } from './SocialGraph.js';
export { calculatePropagation, getAgentAudience } from './Propagation.js';
export type { PropagationResult } from './Propagation.js';
export {
  detectCommunities,
  applyCommunityLabels,
  inferSocialRoles,
  applySocialRoles,
} from './CommunityDetection.js';
export type { CommunityDetectionResult } from './CommunityDetection.js';
