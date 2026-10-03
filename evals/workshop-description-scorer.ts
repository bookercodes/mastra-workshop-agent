import { LLMClassifierFromTemplate } from "autoevals";
import type { EvalScorer } from "braintrust";

const judge = LLMClassifierFromTemplate({
  name: "Workshop description quality",
  model: "gpt-5.6-sol",
  promptTemplate: `You are evaluating copy for a technical workshop aimed at developers who build AI agents.

Candidate description: {{output}}

Judge the description on these priorities:
1. It opens with a compelling hook: a concrete problem, possibility, or outcome that immediately makes a builder want the capability. A title, generic definition, broad industry statement, or list of product capabilities is not a strong hook by itself.
2. It gives attendees one or two exciting, concrete outcomes: something valuable they will be equipped to understand, build, or do. Listing features or implementation topics without connecting them to attendee value does not satisfy this criterion.
3. It uses practical language that resonates with builders and calls the event a workshop, never a webinar. It should emphasize building, running, debugging, controlling, or shipping real systems when relevant.
4. It avoids marketing language: hype, vague promises, unsupported superlatives, buzzwords, and phrases such as "revolutionary", "game-changing", "cutting-edge", "unlock", or "supercharge". Excitement must come from credible outcomes, not promotional wording.

Choose STRONG when all four priorities are met.
Choose MIXED when the description is useful but the hook or attendee outcomes are not compelling, another priority is noticeably weak, or it contains minor promotional language.
Choose WEAK when it lacks meaningful attendee value, reads mainly as a feature inventory, frames the event as a webinar, or marketing language substantially weakens the copy.`,
  choiceScores: {
    STRONG: 1,
    MIXED: 0.5,
    WEAK: 0,
  },
  useCoT: true,
});

export const workshopDescriptionScorer: EvalScorer<unknown, string, unknown> = ({ output }) =>
  judge({ output });
