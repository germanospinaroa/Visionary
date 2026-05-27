export type PilotRunStatus =
  | "pending"
  | "running"
  | "extracting_images"
  | "answering_questions"
  | "selecting_used_images"
  | "completed"
  | "failed"
  | "paused";

export type SurveySelectorConfig = {
  storeCodeInputSelectors: string[];
  validatorCodeInputSelectors: string[];
  nextButtonSelectors: string[];
  imageSelectors: string[];
  usedImageCheckboxSelectors: string[];
  finalCodeSelectors: string[];
  optionContainerSelectors: string[];
  optionLabelSelectors: string[];
};

export type PilotBrowserConfig = {
  headless: boolean;
  selectors: SurveySelectorConfig;
};

export type StartPilotRunInput = {
  storeCode: string;
  surveyUrl: string;
  validatorCode: string;
  browserConfig?: Partial<PilotBrowserConfig>;
};

export type ExtractedSurveyImage = {
  sourceUrl: string;
  imageRecordId: string;
  storagePath: string;
  signedUrl: string;
};
