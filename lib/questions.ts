import type { LessonContent, LessonInput } from "@/lib/lessons";

export type LessonQuestion = {
  category: "diagnostico" | "compreensao" | "aplicacao" | "avaliacao" | "reflexao";
  prompt: string;
  answerGuide: string;
};

/**
 * Builds a question set from the saved lesson package. The current lesson
 * generator is deterministic, so these prompts stay grounded in its topic,
 * objective, activity evidence, and assessment rather than inventing facts.
 */
export function createLessonQuestions(input: LessonInput, content: LessonContent): LessonQuestion[] {
  const topic = input.topic.trim();
  const objective = input.goal.trim();
  const practice = content.activities[2];

  return [
    {
      category: "diagnostico",
      prompt: `Que ideias ou experiências você já tem sobre “${topic}”?`,
      answerGuide: "Considere respostas variadas e registre os conhecimentos prévios que podem ser retomados durante a aula.",
    },
    {
      category: "compreensao",
      prompt: `Explique com suas palavras o que você deverá aprender sobre “${topic}”: ${objective}`,
      answerGuide: `A resposta deve demonstrar compreensão do objetivo da aula: ${objective}`,
    },
    {
      category: "aplicacao",
      prompt: `Crie um exemplo de situação em que o conteúdo “${topic}” possa ser usado e explique sua escolha.`,
      answerGuide: "Aceite exemplos coerentes com o conteúdo estudado e com o nível da turma; peça que o estudante justifique a relação.",
    },
    {
      category: "avaliacao",
      prompt: `Na atividade “${practice?.title ?? "Prática colaborativa"}”, que evidência mostraria que você alcançou o objetivo da aula?`,
      answerGuide: practice?.evidence ?? content.assessment,
    },
    {
      category: "reflexao",
      prompt: `Depois de estudar “${topic}”, que dúvida ainda ficou ou que próximo passo você gostaria de explorar?`,
      answerGuide: "A resposta é pessoal. Use-a para identificar dúvidas recorrentes e planejar uma retomada ou uma atividade de aprofundamento.",
    },
  ];
}
