import { Logo } from "./brand";

export function BuiltByFooter() {
  return (
    <footer className="border-t border-subtle">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-[13px] sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <Logo />
          <p className="mt-3 max-w-[60ch] text-muted">
            An independent, open-source project. Not affiliated with SLT-Mobitel, Dialog, Hutch, Airtel, Starlink or any router maker. Provider names and logos belong to their owners.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a href="https://pramitha.lk" target="_blank" rel="noopener" className="group inline-flex items-center gap-2">
            <span className="text-muted">Designed &amp; built by</span>
            <span className="font-semibold underline decoration-[var(--border)] underline-offset-4 group-hover:decoration-[var(--text)]">Pramitha Jayasooriya</span>
          </a>
          <div className="flex gap-4 text-muted">
            <a href="https://pramitha.lk" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
              pramitha.lk
            </a>
            <a href="https://github.com/PramithaMJ/RouterDeck" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
              GitHub
            </a>
            <a href="https://github.com/PramithaMJ/RouterDeck/blob/main/SECURITY.md" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
              Security
            </a>
            <a href="https://github.com/PramithaMJ/RouterDeck/blob/main/LICENSE" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
              MIT License
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
