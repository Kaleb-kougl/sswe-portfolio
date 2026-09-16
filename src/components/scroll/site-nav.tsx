'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Scroll order. `hero` is observed but has no link — at the top, nothing is active. */
const SECTION_IDS = ['hero', 'work', 'career', 'process', 'contact'] as const;

const NAV_LINKS = [
  { id: 'work', label: 'Work' },
  { id: 'career', label: 'Experience' },
  { id: 'process', label: 'Process' },
  { id: 'contact', label: 'Contact' },
] as const;

const linkClass = (isActive: boolean) =>
  [
    'inline-flex min-h-[44px] items-center border-b-2 px-1 text-[15px] font-semibold transition-colors',
    isActive
      ? 'border-cta text-ink'
      : 'border-transparent text-muted hover:text-ink',
  ].join(' ');

/** ink / ink / lime-with-ink-inset-ring / cta — the site's 2x2 block mark. */
function BlockMark() {
  return (
    <span aria-hidden="true" className="grid grid-cols-2 gap-[2px]">
      <span className="size-[9px] rounded-[1px] bg-ink" />
      <span className="size-[9px] rounded-[1px] bg-ink" />
      <span className="size-[9px] rounded-[1px] bg-lime inset-ring inset-ring-ink" />
      <span className="size-[9px] rounded-[1px] bg-cta" />
    </span>
  );
}

export function SiteNav() {
  const [activeId, setActiveId] = useState<string>('hero');
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Scrollspy. One IntersectionObserver watching a thin band a fifth of the way
  // down the viewport — well clear of the fixed nav. Whichever section is
  // crossing that band owns the highlight. No scroll handler, so no per-frame
  // layout reads.
  useEffect(() => {
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Topmost section in document order wins; if the band is momentarily
        // empty (fast fling), keep the last answer rather than flickering off.
        const next = SECTION_IDS.find((id) => visible.has(id));
        if (next) setActiveId(next);
      },
      { rootMargin: '-20% 0px -75% 0px', threshold: 0 }
    );

    for (const id of SECTION_IDS) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Escape closes the mobile menu and hands focus back to the button that
  // opened it; opening moves focus into the panel so Tab walks the menu.
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector('a')?.focus();

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, closeMenu]);

  return (
    <header className="nav-surface fixed inset-x-0 top-0 z-[2]">
      {/* Tight gap/padding below 900px: at 375px the wordmark, the 44px toggle
          and the CTA together overflow `gap-6 px-6`, and flexbox resolves that
          by wrapping both the wordmark and the button onto two lines. */}
      <div className="flex h-[var(--nav-height)] items-center justify-between gap-3 px-4 min-[900px]:gap-6 min-[900px]:px-12">
        <a
          href="#hero"
          className="inline-flex min-h-[44px] items-center gap-3 whitespace-nowrap font-display text-[17px] tracking-[-0.03em] text-ink min-[900px]:text-[21px]"
        >
          <BlockMark />
          Kaleb Kougl
        </a>

        <nav aria-label="Sections" className="flex items-center gap-2">
          <ul className="hidden items-center gap-7 min-[900px]:flex">
            {NAV_LINKS.map((link) => {
              const isActive = activeId === link.id;
              return (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={linkClass(isActive)}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>

          <a
            // Relative path on purpose: an absolute URL to one deployment
            // breaks on every other origin and on local dev.
            href="/KalebK_Resume.pdf"
            download
            className="ml-5 hidden min-h-[44px] items-center px-1 text-[15px] font-semibold text-muted transition-colors hover:text-ink min-[900px]:inline-flex"
          >
            Résumé
          </a>

          <button
            ref={toggleRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-sm border border-control bg-surface text-ink min-[900px]:hidden"
          >
            <span className="sr-only">
              {menuOpen ? 'Close menu' : 'Open menu'}
            </span>
            <span aria-hidden="true" className="flex flex-col gap-[4px]">
              <span className="block h-[2px] w-[18px] bg-ink" />
              <span className="block h-[2px] w-[18px] bg-ink" />
              <span className="block h-[2px] w-[18px] bg-ink" />
            </span>
          </button>

          <a
            href="#contact"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-pill bg-cta px-4 text-center text-[15px] font-semibold text-cta-ink shadow-cta min-[900px]:px-5"
          >
            Get in touch
          </a>
        </nav>
      </div>

      {menuOpen ? (
        <div
          ref={panelRef}
          id="nav-menu"
          className="border-t border-hairline bg-paper px-6 pb-4 min-[900px]:hidden"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => {
              const isActive = activeId === link.id;
              return (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={closeMenu}
                    className={[
                      'flex min-h-[44px] items-center border-b border-hairline text-[16px] font-semibold',
                      isActive ? 'text-ink' : 'text-muted',
                    ].join(' ')}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
            <li>
              <a
                href="/KalebK_Resume.pdf"
                download
                onClick={closeMenu}
                className="flex min-h-[44px] items-center text-[16px] font-semibold text-muted"
              >
                Résumé
              </a>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
