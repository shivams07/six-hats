import { HATS, formatDuration } from '../../shared/src/hats.js';
import { creditedName, isStepRevealed, rankByVotes } from '../../shared/src/rules.js';
import type { Point, Session } from './session.js';

const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function toMarkdown(s: Session): string {
  const names = new Map(s.participants.map((p) => [p.id, p.name]));
  const author = (id: string) => oneLine(names.get(id) ?? 'Someone');
  const credit = (p: Point) => creditedName(s.mode, author(p.authorId), p.saidBy ? author(p.saidBy) : undefined);
  const facilitator = oneLine(s.participants.find((p) => p.isFacilitator)?.name ?? 'Unknown');
  const scribe = s.mode === 'scribe' && s.scribeId ? ` · Scribe: ${author(s.scribeId)}` : '';
  const votes = new Map<string, number>();
  if (s.votingClosed) for (const v of s.votes) votes.set(v.pointId, (votes.get(v.pointId) ?? 0) + 1);
  const voteCount = (id: string) => votes.get(id) ?? 0;
  const visible = s.points.filter((p) => isStepRevealed(s, p.stepIndex));

  const out = [
    `# Six Hats: ${oneLine(s.title)}`,
    `_${new Date(s.createdAt).toISOString().slice(0, 10)} · Facilitator: ${facilitator} · ${plural(s.participants.length, 'participant')}${scribe}_`,
    '',
    `**Focus question:** ${oneLine(s.focus)}`,
  ];

  if (s.decision) out.push('', '## Decision', s.decision);

  if (s.actions.length) {
    out.push('', '## Action items');
    for (const a of s.actions) {
      out.push(`- [ ] ${oneLine(a.text)}${a.owner ? ` — **${oneLine(a.owner)}**` : ''}${a.due ? ` — due ${a.due}` : ''}`);
    }
  }

  const top = rankByVotes(visible, (p) => voteCount(p.id)).slice(0, 10);
  if (top.length) {
    out.push('', '## Top voted');
    top.forEach((p, i) => {
      const hat = HATS[s.steps[p.stepIndex]!.hat];
      out.push(`${i + 1}. (${plural(voteCount(p.id), 'vote')}) [${hat.label}] ${oneLine(p.text)} — ${credit(p)}`);
    });
  }

  const revealedSteps = s.steps.map((step, i) => ({ step, i })).filter(({ i }) => isStepRevealed(s, i));
  if (revealedSteps.length) {
    out.push('', '## Flow');
    for (const { step, i } of revealedSteps) {
      const hat = HATS[step.hat];
      out.push('', `### ${i + 1}. ${hat.name} — ${hat.focus} (${formatDuration(step.durationSec)})`, `> ${oneLine(step.prompt ?? hat.prompt)}`, '');
      const points = visible.filter((p) => p.stepIndex === i).sort((a, b) => a.createdAt - b.createdAt);
      if (!points.length) out.push('_No points._');
      for (const p of points) {
        const n = voteCount(p.id);
        out.push(`- ${oneLine(p.text)} — ${credit(p)}${n ? ` (${plural(n, 'vote')})` : ''}`);
      }
    }
  }

  return out.join('\n') + '\n';
}
