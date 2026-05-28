import type { PilotBrowserConfig, SurveySelectorConfig } from "@/lib/pilot/types";

export const DEFAULT_SELECTORS: SurveySelectorConfig = {
  storeCodeInputSelectors: [
    'input[name*="store" i]',
    'input[id*="store" i]',
    'input[placeholder*="store" i]',
    'input[name*="codigo" i]',
    'input[id*="codigo" i]',
    'input[type="text"]'
  ],
  validatorCodeInputSelectors: [
    'input[name*="validator" i]',
    'input[id*="validator" i]',
    'input[name*="valid" i]',
    'input[id*="valid" i]',
    'input[name*="folio" i]',
    'input[type="password"]',
    'input[type="text"]'
  ],
  entryButtonSelectors: [
    'button:has-text("Entrar")',
    'button:has-text("Ingresar")',
    'button:has-text("Acceder")',
    'button:has-text("Continuar")',
    'button[type="submit"]',
    'input[type="submit"]'
  ],
  startSurveyButtonSelectors: [
    'button:has-text("Iniciar encuesta")',
    'button:has-text("Iniciar")',
    'button:has-text("Comenzar")',
    'button:has-text("Empezar")',
    'button:has-text("Start survey")',
    'button[type="submit"]',
    'input[type="submit"]'
  ],
  nextButtonSelectors: [
    'button:has-text("Siguiente")',
    'button:has-text("Continuar")',
    'button:has-text("Next")',
    'input[type="submit"]',
    'button[type="submit"]',
    'button'
  ],
  imageSelectors: ["img", 'a[href$=".jpg"]', 'a[href$=".jpeg"]', 'a[href$=".png"]', 'a[href$=".webp"]'],
  usedImageCheckboxSelectors: ['input[type="checkbox"]', '[role="checkbox"]'],
  finalCodeSelectors: [
    '[data-final-code]',
    '[data-confirmation-code]',
    '[class*="code" i]',
    '[id*="code" i]'
  ],
  optionContainerSelectors: ['label:has(input[type="radio"])', 'label:has(input[type="checkbox"])', '[role="radio"]', 'label'],
  optionLabelSelectors: ["label", "[role='radio']", "button", "span", "p"]
};

export const DEFAULT_PILOT_BROWSER_CONFIG: PilotBrowserConfig = {
  headless: true,
  selectors: DEFAULT_SELECTORS
};

export function mergePilotBrowserConfig(
  input?: (Omit<Partial<PilotBrowserConfig>, "selectors"> & { selectors?: Partial<SurveySelectorConfig> }) | null
): PilotBrowserConfig {
  return {
    headless: input?.headless ?? DEFAULT_PILOT_BROWSER_CONFIG.headless,
    selectors: {
      ...DEFAULT_SELECTORS,
      ...(input?.selectors ?? {})
    }
  };
}
