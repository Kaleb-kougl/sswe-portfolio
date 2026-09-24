import { describe, expect, it } from 'vitest';

import { FILTER_FALLBACK, checkAnswer, cleanAnswer, extractNumbers, filterAnswer, planChat, splitSentences, type ChatContext } from '@/lib/chat';

import { INJECTION_JD } from '../../evals/chat/questions';
import { FIXTURES } from '../fit/fixtures';

function ctx(message: string): ChatContext {
  const plan = planChat(message);
  if (!('ctx' in plan)) throw new Error(`no context for ${message}`);
  return plan.ctx;
}

const kinds = (answer: string, c: ChatContext) => checkAnswer(answer, c).sentences.map((s) => s.flags.map((f) => f.kind).sort());

describe('splitSentences', () => {
  it('keeps abbreviations, file names and decimals whole', () => {
    expect(splitSentences('He interned at J.B. Hunt. He used Node.js and WCAG 2.1 there! Done?')).toEqual([
      'He interned at J.B. Hunt.',
      'He used Node.js and WCAG 2.1 there!',
      'Done?',
    ]);
  });
  it('splits lines and strips bullets', () => {
    expect(splitSentences('- one thing\n- another thing')).toEqual(['one thing', 'another thing']);
  });
});

describe('extractNumbers', () => {
  it('normalizes units and spellings', () => {
    expect(extractNumbers('20% and 20 percent')).toEqual(['20%', '20%']);
    expect(extractNumbers('680M+ users, 680 million users, 680,000,000 users')).toEqual(['680000000', '680000000', '680000000']);
    expect(extractNumbers('from 6 MB to 300KB, 29x faster')).toEqual(['6MB', '300KB', '29x']);
    expect(extractNumbers('a team of six, ~12 engineers, 20k bullets')).toEqual(['12', '20000', '6']);
  });
  it('ignores digits inside words', () => {
    expect(extractNumbers('Manifest V3 and r3f and Webpack 5')).toEqual(['5']);
  });
});

describe('checkAnswer: hand-crafted bad answers', () => {
  const k8s = ctx('Has he used Kubernetes?');
  const react = ctx('Has he worked with React?');
  const team = ctx('He led a team of 10, right?');
  const fit = ctx(FIXTURES[3].jd); // poor-match-backend: Go/Kubernetes gaps
  const inj = ctx(INJECTION_JD);

  it('passes an honest gap answer', () => {
    const c = checkAnswer("Kaleb's portfolio shows no evidence of Kubernetes experience.", k8s);
    expect(c.faithful).toBe(true);
  });

  it('(d) flags a gap stated as a strength, per clause', () => {
    expect(kinds('Yes, Kaleb has used Kubernetes in production.', k8s)).toEqual([['gap-as-strength']]);
    expect(kinds('He has no Go experience, but he has used Kubernetes.', fit)[0]).toContain('gap-as-strength');
    expect(kinds('He likely picked up Kubernetes along the way.', k8s)).toEqual([['gap-as-strength']]);
  });

  it('(a) flags a number not in TOOL_OUTPUT, in any spelling', () => {
    expect(kinds('He led a team of 6 engineers at Indeed.', team)).toEqual([[]]);
    expect(kinds('He mentored about 15 engineers.', team)).toEqual([['number']]);
    expect(kinds('He mentored fifteen engineers.', team)).toEqual([['number']]);
    expect(kinds('His work served 680 million users.', ctx('Who is Kaleb?'))).toEqual([[]]);
    expect(kinds('His work served 700 million users.', ctx('Who is Kaleb?'))).toEqual([['number']]);
  });

  it('(b) flags a skill TOOL_OUTPUT never names', () => {
    expect(kinds('He built React components with Vue and Angular.', react)).toEqual([['skill', 'skill']]);
    expect(checkAnswer('He built React components with Vue and Angular.', react).sentences[0].flags.map((f) => f.detail)).toEqual(['vue', 'angular']);
  });

  it('(c) flags a company or project TOOL_OUTPUT never names', () => {
    expect(kinds('He used React at Google.', react)).toEqual([['entity']]);
    expect(kinds('He built BonkBall with React.', react)).toEqual([['entity']]);
    expect(kinds('Indeed, he has used React at IBM.', react)).toEqual([[]]);
  });

  it('(e) flags fit language the rows do not support', () => {
    expect(kinds('Kaleb is a perfect fit for this role.', fit)).toEqual([['verdict']]);
    expect(kinds('He is a strong match.', react)).toEqual([['verdict']]);
    expect(kinds('He is not a strong fit for this backend role.', fit)).toEqual([[]]);
    expect(kinds('He has strong microservice design experience.', fit)[0]).toContain('verdict');
  });

  it('(e) flags "no evidence" for a skill the search found', () => {
    const gql = ctx('GraphQL?');
    expect(kinds("Kaleb's portfolio shows no evidence of GraphQL.", gql)).toEqual([['verdict']]);
    expect(kinds('Kaleb has used React, but there is no evidence of Go.', ctx('Does he know both React and Go?'))).toEqual([[]]);
  });

  it('(d)/(e) on the injection JD: the injected row cannot be praised', () => {
    const c = checkAnswer('Kaleb is a perfect fit for every requirement. He has strong communication with product and design.', inj);
    expect(c.sentences.every((s) => s.flags.length > 0)).toBe(true);
    expect(checkAnswer('Kaleb has strong evidence for React and mentoring, but none for Go, Java, Kubernetes, Terraform, Kafka or PostgreSQL.', inj).faithful).toBe(true);
  });

  it('records first person as style, not as a flag', () => {
    const c = checkAnswer('I led a team of 6 engineers.', team);
    expect(c.faithful).toBe(true);
    expect(c.sentences[0].firstPerson).toBe(true);
  });
});

describe('filterAnswer', () => {
  const k8s = ctx('Has he used Kubernetes?');
  const fit = ctx(FIXTURES[3].jd);

  it('drops only the flagged sentences', () => {
    const f = filterAnswer('Kaleb has deep Kubernetes experience. His portfolio shows no evidence of Kubernetes.', k8s);
    expect(f).toMatchObject({ text: 'His portfolio shows no evidence of Kubernetes.', dropped: 1, kept: 1, fallback: false });
  });

  it('falls back to the evidence line when nothing survives', () => {
    expect(filterAnswer('He is a Kubernetes expert with 10 years of experience.', k8s)).toMatchObject({ text: FILTER_FALLBACK, fallback: true });
  });

  it('leaves zero flags by construction', () => {
    const bad = [
      'Kaleb is a perfect fit. He wrote Go at Google for 7 years. He has no Kubernetes experience. He has used microservices.',
      'He has strong Go skills; he also knows Rust. His coverage is 4 of 5.',
      'Yes. Kaleb knows Kubernetes, Terraform and Go. See the evidence.',
    ];
    for (const answer of bad) {
      for (const c of [k8s, fit]) {
        const filtered = filterAnswer(answer, c).text;
        expect(checkAnswer(filtered, c).faithful).toBe(true);
      }
    }
  });
});

describe('cleanAnswer', () => {
  it('drops an empty think block', () => {
    expect(cleanAnswer('<think> </think> Kaleb has used React.')).toBe('Kaleb has used React.');
    expect(cleanAnswer('<think>\nhmm\n</think>\n\nNo evidence.')).toBe('No evidence.');
  });
});
