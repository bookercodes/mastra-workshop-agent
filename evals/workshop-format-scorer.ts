import type { EvalScorer } from "braintrust";

export const workshopFormatScorer: EvalScorer<unknown, string, unknown> = ({ output }) => {
  const wordCount = output.trim().split(/\s+/).filter(Boolean).length;
  const paragraphCount = output.trim().split(/\n\s*\n/).filter(Boolean).length;

  return [
    {
      name: "Description length",
      score: wordCount >= 120 && wordCount <= 200 ? 1 : 0,
      metadata: { wordCount, target: "120-200 words" },
    },
    {
      name: "Paragraph structure",
      score: paragraphCount >= 2 ? 1 : 0,
      metadata: { paragraphCount, target: "At least 2 paragraphs" },
    },
  ];
};
