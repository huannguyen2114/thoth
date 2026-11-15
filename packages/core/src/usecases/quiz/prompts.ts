import type { QuizDifficulty, QuizQuestionType } from "../../domain/quiz";

const typeGuide: Record<QuizQuestionType, string> = {
  multiple_choice:
    'multiple_choice: 3-5 choices, exactly one correct, "correctIndex" is its 0-based position. Wrong choices are plausible misconceptions, not jokes.',
  multi_select:
    'multi_select: 4-6 choices, two or more correct but never all, "correctIndices" lists the 0-based positions.',
  true_false:
    'true_false: a statement that is clearly true or false from the source, "correct" is the boolean. Avoid trick wording.',
  fill_blank:
    'fill_blank: a sentence with one blank written as "_____". "acceptedAnswers" lists every spelling that is correct (singular and plural, common synonyms). The answer is one to three words.',
  free_response:
    'free_response: an open question answered in a few sentences. "rubric" holds a model answer and the key points a good answer must cover.',
};

const difficultyGuide: Record<QuizDifficulty, string> = {
  easy: "Easy: check that the learner understood the main ideas.",
  medium:
    "Medium: ask the learner to explain why, compare ideas, or apply a concept to a simple case.",
  hard: "Hard: ask the learner to apply ideas to a new situation, combine several parts of the topic, or find the flaw in a plausible claim.",
};

export function quizSystemPrompt(input: {
  topic: string;
  types: readonly QuizQuestionType[];
  difficulty: QuizDifficulty;
  count: number;
  focus: string;
  language: string;
}): string {
  return [
    "You write quiz questions that help a learner master study material. Use only the SOURCE provided.",
    "",
    `Topic: ${input.topic}`,
    `Write exactly ${input.count} questions in ${input.language}.`,
    `Difficulty. ${difficultyGuide[input.difficulty]}`,
    "",
    "Question types to use (mix them so each listed type appears, in this order of preference):",
    ...input.types.map((t) => `- ${typeGuide[t]}`),
    "",
    "Rules:",
    "- Test understanding and application, not word-for-word recall. Do not ask what page or minute something was said.",
    "- Each question stands alone: never write 'according to the text' or refer to the source by position.",
    "- Cover different parts of the topic. Do not repeat a question in another type.",
    '- "explanation" says why the answer is right and, where useful, why a tempting wrong answer is wrong. Two to four sentences.',
    '- "source" is the citation token (for example [p.3] or [03:21]) copied exactly from the SOURCE line that supports the answer. Use null only if no single line does.',
    input.focus ? `- Focus the questions on: ${input.focus}` : "",
    "",
    'Reply with JSON only: {"questions": [...]}. Each question has "type", "prompt", "explanation", "source" and the fields of its type.',
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

export function quizUserMessage(topic: string, count: number): string {
  return `Write ${count} questions about "${topic}" from the SOURCE.`;
}

export const GRADING_SYSTEM = [
  "You grade a learner's free-response answer against a rubric.",
  "Score from 0 to 1: 1 means every key point is covered correctly, 0.5 means about half, 0 means wrong or empty.",
  "Be fair: accept different wording and correct points that the rubric does not list. Do not reward vague or padded answers.",
  "Write feedback of one to three sentences addressed to the learner ('You ...'): say what was right, then what is missing or wrong.",
  'Reply with JSON only: {"score": number, "feedback": string}.',
].join("\n");

export function gradingUserMessage(input: {
  question: string;
  rubric: string;
  answer: string;
}): string {
  return `Question:\n${input.question}\n\nRubric (model answer and key points):\n${input.rubric}\n\nLearner's answer:\n${input.answer}`;
}
