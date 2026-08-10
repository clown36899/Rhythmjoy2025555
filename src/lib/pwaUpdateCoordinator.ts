export const PWA_UPDATE_READY_EVENT = 'swingenjoy:pwa-update-ready';

type UpdateActivator = () => Promise<void>;

let updateActivator: UpdateActivator | null = null;
let updateWaiting = false;
let waitingGeneration = 0;
let activationPromise: Promise<boolean> | null = null;

export function registerPwaUpdateActivator(activator: UpdateActivator) {
  updateActivator = activator;
  return () => {
    if (updateActivator === activator) updateActivator = null;
  };
}

export function markPwaUpdateWaiting() {
  const wasWaiting = updateWaiting;
  updateWaiting = true;
  waitingGeneration += 1;
  if (!wasWaiting && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT));
  }
}

export function hasPendingPwaUpdate() {
  return updateWaiting;
}

export async function activatePendingPwaUpdate() {
  if (activationPromise) return activationPromise;
  if (!updateWaiting || !updateActivator) return false;

  const activator = updateActivator;
  const activationGeneration = waitingGeneration;
  updateWaiting = false;
  activationPromise = (async () => {
    try {
      await activator();
      // A second worker can become waiting while the first activation is in
      // flight. Keep that newer signal pending instead of losing it.
      if (waitingGeneration > activationGeneration) updateWaiting = true;
      return true;
    } catch (error) {
      updateWaiting = true;
      throw error;
    } finally {
      activationPromise = null;
    }
  })();
  return activationPromise;
}
