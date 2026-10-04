type Listener = () => void;

/**
 * Whether the menu (deck editor and account) covers the game. While it does,
 * the keyboard belongs to the menu and the game ignores it.
 */
class MenuStore {
    private open: boolean = false;
    private listeners: Set<Listener> = new Set();

    public subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    };

    public isOpen = (): boolean => this.open;

    public setOpen(open: boolean): void {
        if (open === this.open) return;

        this.open = open;
        // The menu needs the mouse cursor back
        if (open) document.exitPointerLock();
        this.listeners.forEach((listener) => listener());
    }
}

export const menuStore = new MenuStore();
