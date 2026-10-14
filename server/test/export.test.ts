import { describe, expect, it } from 'vitest';
import { toMarkdown } from '../src/export.js';
import { makeSession, pointId, run, T0, toVoting } from './fixtures.js';

function finished(withVotes: boolean) {
  const { s: voting, fac, asha, ravi } = toVoting();
  let s = voting;
  if (withVotes) {
    const churn = pointId(s, 'Churn is 4% monthly');
    s = run(s, asha, { type: 'vote', pointId: churn });
    s = run(s, ravi, { type: 'vote', pointId: churn });
    s = run(s, fac, { type: 'vote', pointId: pointId(s, 'Migration risk') });
    s = run(s, fac, { type: 'closeVoting' });
    s = run(s, fac, { type: 'goToDecision' });
  } else {
    s = run(s, fac, { type: 'skipVoting' });
  }
  s = run(s, fac, { type: 'setDecision', text: 'Go ahead' });
  s = run(s, fac, { type: 'addAction', action: { text: 'Draft RFC', owner: 'Asha', due: '2026-10-21' } });
  return run(s, fac, { type: 'closeSession' });
}

describe('toMarkdown', () => {
  it('renders a complete session', () => {
    expect(toMarkdown(finished(true))).toBe(
      [
        '# Six Hats: Migrate billing?',
        '_2026-10-14 · Facilitator: Fac · 3 participants_',
        '',
        '**Focus question:** Should we migrate billing to Kafka?',
        '',
        '## Decision',
        'Go ahead',
        '',
        '## Action items',
        '- [ ] Draft RFC — **Asha** — due 2026-10-21',
        '',
        '## Top voted',
        '1. (2 votes) [White] Churn is 4% monthly — Asha',
        '2. (1 vote) [Black] Migration risk — Fac',
        '',
        '## Flow',
        '',
        '### 1. White hat — Facts & information (4:00)',
        '> What do we know about churn?',
        '',
        '- Churn is 4% monthly — Asha (2 votes)',
        '- No data on enterprise — Ravi',
        '',
        '### 2. Black hat — Caution & risks (4:00)',
        '> What could go wrong? Why might this not work?',
        '',
        '- Migration risk — Fac (1 vote)',
      ].join('\n') + '\n',
    );
  });

  it('omits vote counts when voting was skipped', () => {
    const md = toMarkdown(finished(false));
    expect(md).not.toContain('## Top voted');
    expect(md).not.toMatch(/\(\d+ votes?\)/);
  });

  it('never includes points from an unrevealed step', () => {
    const { s: lobby, fac, asha } = makeSession();
    const s = run(run(lobby, fac, { type: 'start' }), asha, { type: 'addPoint', text: 'secret idea' });
    const md = toMarkdown(s);
    expect(md).not.toContain('secret idea');
    expect(md).not.toContain('## Flow');
  });

  it('credits scribe notes to the speaker or the team', () => {
    const { s: lobby, fac, asha, ravi } = makeSession([{ hat: 'green', durationSec: 60 }], 'scribe');
    let s = run(run(lobby, fac, { type: 'setScribe', participantId: ravi }), fac, { type: 'start' });
    s = run(s, ravi, { type: 'addPoint', text: 'Pilot first', saidBy: asha }, T0 + 1);
    s = run(s, ravi, { type: 'addPoint', text: 'Agreed by all' }, T0 + 2);
    const md = toMarkdown(run(s, fac, { type: 'revealNow' }));
    expect(md).toContain('_2026-10-14 · Facilitator: Fac · 3 participants · Scribe: Ravi_');
    expect(md).toContain('- Pilot first — Asha\n- Agreed by all — Team\n');
  });

  it('hides vote counts until voting is closed', () => {
    const { s: voting, asha, ravi } = toVoting();
    const churn = pointId(voting, 'Churn is 4% monthly');
    const md = toMarkdown(run(run(voting, asha, { type: 'vote', pointId: churn }), ravi, { type: 'vote', pointId: churn }));
    expect(md).not.toContain('## Top voted');
    expect(md).not.toMatch(/\(\d+ votes?\)/);
    expect(md).toContain('- Churn is 4% monthly — Asha\n');
  });

  it('flattens newlines in participant names', () => {
    const { s: lobby, fac, asha } = makeSession();
    let s = run(run(lobby, fac, { type: 'start' }), asha, { type: 'addPoint', text: 'Churn is 4% monthly' });
    s = run(s, fac, { type: 'revealNow' });
    const participants = s.participants.map((p) =>
      p.id === asha ? { ...p, name: 'Bob\n## Decision' } : p.id === fac ? { ...p, name: 'Fac\n## Decision' } : p,
    );
    const md = toMarkdown({ ...s, participants });
    expect(md).toContain('Facilitator: Fac ## Decision');
    expect(md).toContain('- Churn is 4% monthly — Bob ## Decision');
    expect(md).not.toContain('\n## Decision');
  });

  it('flattens newlines in action owners', () => {
    const { s: voting, fac } = toVoting();
    const s = run(run(voting, fac, { type: 'skipVoting' }), fac, {
      type: 'addAction',
      action: { text: 'Draft RFC', owner: 'Bob\n## Decision' },
    });
    const md = toMarkdown(s);
    expect(md).toContain('- [ ] Draft RFC — **Bob ## Decision**');
    expect(md).not.toContain('\n## Decision');
  });
});
