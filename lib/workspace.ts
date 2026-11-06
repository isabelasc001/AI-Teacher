export type WorkspacePlan = "fast" | "full";
export type LessonGenerationMode = "fast" | "creative";

export type OutputFormat = "pdf" | "docx" | "slides";

export const MAX_CONTEXT_CHARACTERS = 4000;
export const MAX_REVISION_INSTRUCTION_CHARACTERS = 2000;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const WORKSPACE_PLAN_RULES: Record<WorkspacePlan, {
  maxFiles: number;
  canAddTextContext: boolean;
  maxCorrections: number;
}> = {
  fast: {
    maxFiles: 2,
    canAddTextContext: false,
    maxCorrections: 1,
  },
  full: {
    maxFiles: 4,
    canAddTextContext: true,
    maxCorrections: 2,
  },
};

export const ACCEPTED_INPUT_EXTENSIONS = [".pdf", ".docx", ".ppt", ".pptx", ".png", ".jpg", ".jpeg"] as const;

export const OUTPUT_FORMATS: Array<{ value: OutputFormat; label: string; description: string }> = [
  { value: "pdf", label: "PDF", description: "Pronto para compartilhar e imprimir" },
  { value: "docx", label: "DOCX", description: "Editável no Word ou equivalente" },
  { value: "slides", label: "Slides", description: "Apresentação para conduzir a aula" },
];

export function getWorkspacePlan(value: string | null | undefined): WorkspacePlan {
  return value === "full" ? "full" : "fast";
}

export function getFileExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot).toLowerCase();
}

export function isAcceptedInputFile(fileName: string) {
  return (ACCEPTED_INPUT_EXTENSIONS as readonly string[]).includes(getFileExtension(fileName));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".0", "")} MB`;
}
