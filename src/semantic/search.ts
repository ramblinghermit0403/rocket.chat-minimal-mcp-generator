export function semanticMatch(prompt: string): string[] {
  const text = prompt.toLowerCase();
  
  // A local, scoring-based phrase matcher to substitute true semantic search
  const scores: Record<string, number> = {
    provisionChannel: 0,
    broadcastMessage: 0,
    onboardUser: 0,
    communityAnnouncement: 0,
    kickUser: 0
  };

  // Score provisionChannel
  if (text.match(/channel|group|room|provision|create/g)) scores.provisionChannel += 1;
  if (text.match(/new channel|make a channel/g)) scores.provisionChannel += 2;

  // Score broadcastMessage
  if (text.match(/message|broadcast|send|chat/g)) scores.broadcastMessage += 1;
  if (text.match(/send a message|post/g)) scores.broadcastMessage += 2;

  // Score onboardUser
  if (text.match(/user|onboard|new member|invite/g)) scores.onboardUser += 1;
  if (text.match(/add user|invite user/g)) scores.onboardUser += 2;

  // Score communityAnnouncement
  if (text.match(/announce|community|update|official/g)) scores.communityAnnouncement += 1;
  if (text.match(/make an announcement/g)) scores.communityAnnouncement += 2;

  // Score kickUser
  if (text.match(/kick|remove|ban|boot/g)) scores.kickUser += 3; // high weight for aggressive verbs
  if (text.match(/kick user|remove user/g)) scores.kickUser += 2;

  // Find tools with score > 0
  let matched = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([workflow]) => workflow);

  return matched.length > 0 ? matched : ['broadcastMessage']; // fallback
}
