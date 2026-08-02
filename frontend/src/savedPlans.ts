export type SavedPlan = {
  id: string;
  title: string;
  planText: string;
  conditions?: Record<string, unknown>;
  savedAt: string;
  scheduleStartDate?: string;
  scheduleEndDate?: string;
  source?: 'travel' | 'group';
  meta?: {
    mode?: 'travel' | 'group';
    roomCode?: string;
    proposalTitle?: string;
    proposalId?: string;
  };
};

const SAVED_PLANS_KEY = 'travel-agent:saved-plans';

function readPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(SAVED_PLANS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

export function loadSavedPlans(): SavedPlan[] {
  return readPlans();
}

export function persistSavedPlans(plans: SavedPlan[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
}

export function savePlanToStorage(plan: SavedPlan): SavedPlan[] {
  const nextPlans = [plan, ...readPlans().filter(item => item.id !== plan.id)];
  persistSavedPlans(nextPlans);
  dispatchSavedPlansUpdated();
  return nextPlans;
}

export function deleteSavedPlan(id: string): SavedPlan[] {
  const nextPlans = readPlans().filter(item => item.id !== id);
  persistSavedPlans(nextPlans);
  dispatchSavedPlansUpdated();
  return nextPlans;
}

export function dispatchSavedPlansUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('travel-agent:saved-plans-updated'));
}
