// Pa'l Jangueo - Live scene relevance check for approval.
// Read-only. Never approves or publishes events.

const {
  evaluateCandidateSceneRelevance
} = require('./evaluateCandidateSceneRelevance');

const PILLARS = ['artist', 'venue', 'collective', 'promoter'];

async function checkSceneApprovalEligibility(db, candidate) {
  const assessment = await evaluateCandidateSceneRelevance(
    db,
    candidate
  );

  const confirmedPillars = PILLARS.filter(
    name => assessment.pillars?.[name] === true
  );

  const eligible =
    assessment.status === 'scene_relevance_documented' &&
    assessment.scene_relevance_documented === true &&
    assessment.musical_performance_detected === true &&
    confirmedPillars.length > 0;

  return {
    eligible,
    status: assessment.status,
    confirmed_pillars: confirmedPillars,
    safe_to_publish: false
  };
}

module.exports = { checkSceneApprovalEligibility };
