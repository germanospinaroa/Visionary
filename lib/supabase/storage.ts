export const STORAGE_BUCKETS = {
  surveyImages: "survey-images",
  questionScreenshots: "question-screenshots",
  analysisArtifacts: "analysis-artifacts",
  errorScreenshots: "error-screenshots"
} as const;

export const STORAGE_BUCKET_CONFIG = [
  {
    id: STORAGE_BUCKETS.surveyImages,
    name: "Survey source images",
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
  },
  {
    id: STORAGE_BUCKETS.questionScreenshots,
    name: "Question screenshots",
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  },
  {
    id: STORAGE_BUCKETS.analysisArtifacts,
    name: "Analysis artifacts",
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["application/json", "image/jpeg", "image/png", "image/webp", "text/plain"]
  },
  {
    id: STORAGE_BUCKETS.errorScreenshots,
    name: "Error screenshots",
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  }
] as const;
