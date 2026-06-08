import { ThemeToggle } from "./theme-toggle";

export function Header({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="font-display text-xl font-semibold text-ink md:hidden">
          Mess·Manage
        </span>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
