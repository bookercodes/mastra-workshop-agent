import { LLMClassifierFromTemplate } from "autoevals";
import type { EvalScorer } from "braintrust";

export type ExpectedRubric = {
  must: string[];
  must_not: string[];
};

const judge = LLMClassifierFromTemplate<{ input: unknown }>({
  name: "Workshop topic coverage",
  model: "gpt-5.6-sol",
  promptTemplate: `You are evaluating a technical workshop description.

Input: {{input}}
Candidate description: {{output}}
Expected rubric: {{expected}}

The central "must" concepts should receive the description's attention. Lower-level or adjacent features should not displace them, even when those details are technically relevant.

Choose PASS if the description stays focused on the highest-impact required concepts without unnecessary implementation detail.
Choose PARTIAL if it only partially satisfies the rubric or gives noticeable space to lower-priority details.
Choose FAIL if it misses a central requirement, clearly violates a "must_not", or focuses on adjacent details instead of the required topic.

Judge the meaning, not exact wording. Evaluate only the supplied rubric.`,
  choiceScores: {
    PASS: 1,
    PARTIAL: 0.5,
    FAIL: 0,
  },
  useCoT: true,
});

export const workshopTopicScorer: EvalScorer<unknown, string, ExpectedRubric> = ({
  input,
  output,
  expected,
}) => judge({ input, output, expected: JSON.stringify(expected) });
