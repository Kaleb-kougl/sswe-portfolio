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

/** ink / ink / lime-with-ink-inset-ring / cta — the site's 2x2 block mark. */
function BlockMark() {
  return (
    <span aria-hidden="true" className="site-nav__mark">
      <span className="site-nav__mark-cell" />
      <span className="site-nav__mark-cell" />
      <span className="site-nav__mark-cell site-nav__mark-cell--lime" />
      <span className="site-nav__mark-cell site-nav__mark-cell--cta" />
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
    <header className="site-nav nav-surface">
      {/* Tight gap/padding below 900px: at 375px the wordmark, the 44px toggle
          and the CTA together overflow `gap-6 px-6`, and flexbox resolves that
          by wrapping both the wordmark and the button onto two lines. */}
      <div className="flex h-[var(--nav-height)] items-center justify-between gap-3 px-4 min-[900px]:gap-6 min-[900px]:px-12">
        <a
          href="#hero"
          className="site-nav__brand"
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
                    className="site-nav__link"
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
            className="site-nav__resume ml-5"
          >
            Résumé
          </a>

          <button
            ref={toggleRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="button button--rounded button--outline size-[44px] shrink-0 justify-center min-[900px]:hidden"
          >
            <span className="sr-only">
              {menuOpen ? 'Close menu' : 'Open menu'}
            </span>
            <span aria-hidden="true" className="site-nav__burger">
              <span className="site-nav__burger-line" />
              <span className="site-nav__burger-line" />
              <span className="site-nav__burger-line" />
            </span>
          </button>

          <a
            href="#contact"
            className="button button--pill button--primary button--hero shrink-0 justify-center whitespace-nowrap px-4 text-center min-[900px]:px-5"
          >
            Get in touch
          </a>
        </nav>
      </div>

      {menuOpen ? (
        <div
          ref={panelRef}
          id="nav-menu"
          className="site-nav__menu"
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
                    className="site-nav__menu-link site-nav__menu-link--section"
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
                className="site-nav__menu-link"
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
