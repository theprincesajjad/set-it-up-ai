/** Hands a scanned barcode from the camera screen back to the counter screen. */
type Listener = (data: string) => void;
const listeners = new Set<Listener>();

export const scanBus = {
  emit(data: string) {
    listeners.forEach((l) => l(data));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Manager PIN approvals (exit kiosk, exit counter mode on a shared device). */
const managerListeners = new Set<() => void>();
export const managerBus = {
  approve() {
    managerListeners.forEach((l) => l());
  },
  once(l: () => void): () => void {
    const wrapped = () => {
      managerListeners.delete(wrapped);
      l();
    };
    managerListeners.add(wrapped);
    return () => managerListeners.delete(wrapped);
  },
};
