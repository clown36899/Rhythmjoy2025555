export const PWA_UPDATE_READY_EVENT = 'swingenjoy:pwa-update-ready';

type UpdateActivator = () => Promise<void>;

let updateActivator: UpdateActivator | null = null;
let updateWaiting = false;

export function registerPwaUpdateActivator(activator: UpdateActivator) {
  updateActivator = activator;
  return () => {
    if (updateActivator === activator) updateActivator = null;
  };
}

export function markPwaUpdateWaiting() {
  updateWaiting = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT));
  }
}

export async function activatePendingPwaUpdate() {
  if (!updateWaiting || !updateActivator) return false;
  updateWaiting = false;
  try {
    await updateActivator();
    return true;
  } catch (error) {
    updateWaiting = true;
    throw error;
  }
}
