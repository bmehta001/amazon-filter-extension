/** Onboarding state — tracks first-run welcome page and feature tour. */
export interface OnboardingState {
  hasSeenWelcome: boolean;
  hasSeenTour: boolean;
  installDate: number;
}

const STORAGE_KEY = "onboardingState";

const DEFAULT_STATE: OnboardingState = {
  hasSeenWelcome: false,
  hasSeenTour: false,
  installDate: 0,
};

/** Load onboarding state from chrome.storage.local (device-specific). */
export function loadOnboardingState(): Promise<OnboardingState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY] as Partial<OnboardingState> | undefined;
      resolve({ ...DEFAULT_STATE, ...stored });
    });
  });
}

function saveOnboardingState(state: OnboardingState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      resolve();
    });
  });
}

/** Mark the welcome page as seen. */
export async function markWelcomeSeen(): Promise<void> {
  const state = await loadOnboardingState();
  state.hasSeenWelcome = true;
  if (!state.installDate) state.installDate = Date.now();
  await saveOnboardingState(state);
}

/** Mark the in-page feature tour as seen. */
export async function markTourSeen(): Promise<void> {
  const state = await loadOnboardingState();
  state.hasSeenTour = true;
  await saveOnboardingState(state);
}

/** True if the user has completed welcome but not yet seen the tour. */
export async function shouldShowTour(): Promise<boolean> {
  const state = await loadOnboardingState();
  return state.hasSeenWelcome && !state.hasSeenTour;
}
