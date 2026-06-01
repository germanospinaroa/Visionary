import fs from "node:fs";
import path from "node:path";

export type ProjectQuestion = {
  id: string;
  prompt: string;
  intent: string;
  expectedEvidence: string[];
};

export type ProjectConfig = {
  projectId: string;
  projectName: string;
  surveyUrl: string;
  answerOptions: string[];
  globalInstructions: string;
  questionBank: ProjectQuestion[];
  visualChecklist: string[];
  productTaxonomy: Record<string, string[]>;
  rules: string[];
};

const PROJECTS_DIR = path.join(process.cwd(), "configs", "projects");
const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "Default Project";
const DEFAULT_SURVEY_URL = "";
const DEFAULT_ANSWER_OPTIONS = ["SI", "NO", "No puedo responder"];

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  projectId: DEFAULT_PROJECT_ID,
  projectName: DEFAULT_PROJECT_NAME,
  surveyUrl: DEFAULT_SURVEY_URL,
  answerOptions: DEFAULT_ANSWER_OPTIONS,
  globalInstructions: "",
  questionBank: [],
  visualChecklist: [],
  productTaxonomy: {},
  rules: []
};

function getProjectConfigPath(projectId: string) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

export function listAvailableProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/i, ""));
}

export function loadProjectConfig(projectId?: string): ProjectConfig {
  const normalizedProjectId = projectId?.trim() || DEFAULT_PROJECT_ID;

  if (!projectId?.trim()) {
    return DEFAULT_PROJECT_CONFIG;
  }

  const targetPath = getProjectConfigPath(normalizedProjectId);

  if (!fs.existsSync(targetPath)) {
    return {
      ...DEFAULT_PROJECT_CONFIG,
      projectId: normalizedProjectId
    };
  }

  const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8")) as Partial<ProjectConfig>;

  if (!parsed.projectId || !parsed.projectName) {
    return {
      ...DEFAULT_PROJECT_CONFIG,
      projectId: normalizedProjectId
    };
  }

  return {
    projectId: parsed.projectId ?? normalizedProjectId,
    projectName: parsed.projectName ?? DEFAULT_PROJECT_NAME,
    surveyUrl: parsed.surveyUrl ?? DEFAULT_SURVEY_URL,
    answerOptions: parsed.answerOptions ?? DEFAULT_ANSWER_OPTIONS,
    globalInstructions: parsed.globalInstructions ?? "",
    questionBank: parsed.questionBank ?? [],
    visualChecklist: parsed.visualChecklist ?? [],
    productTaxonomy: parsed.productTaxonomy ?? {},
    rules: parsed.rules ?? []
  };
}
