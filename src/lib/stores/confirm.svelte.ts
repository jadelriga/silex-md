export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

class ConfirmStore {
  request = $state<ConfirmRequest | null>(null);

  ask(req: ConfirmRequest) {
    this.request = req;
  }

  close() {
    this.request = null;
  }
}

export const confirm = new ConfirmStore();
