import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { GLYPH_CELLS } from '@/components/3d/morph-layouts';
import {
  HERO_EYEBROW,
  HERO_HEADLINE,
  HERO_STATS,
} from '@/components/scroll/hero-section';
import { CONTACT_INFO } from '@/data/resumeData';
import { SITE_URL } from '@/data/site';

/**
 * The social preview card, GENERATED — not a checked-in screenshot.
 *
 * This replaces `public/og-image.png`, which had rotted in three ways at once:
 * it was a JPEG wearing a `.png` extension (so it was served as
 * `Content-Type: image/png` with a JPEG body), it was 1024x1024 while
 * `layout.tsx` advertised it as 1200x630, and it pictured the retired IDE
 * version of the site. Generating the card from the same constants the page
 * renders means none of those can drift back.
 *
 * Next wires the `<head>` tags from the exports below — `og:image`,
 * `og:image:alt`, `og:image:type`, `og:image:width`, `og:image:height` — so
 * `layout.tsx` must NOT also list an `images` entry in `openGraph`, or the card
 * would be advertised twice. (`opengraph-image.md`, "Generate images using
 * code".) `twitter:image` is filled in from `og:image` by
 * `postProcessMetadata()` in `next/dist/lib/metadata/resolve-metadata.js`, so a
 * separate `twitter-image.tsx` would only duplicate this file.
 *
 * FONTS — the part that usually goes wrong. Satori cannot see CSS variables or
 * `next/font` output; it only draws with font data handed to it. The three
 * faces are therefore vendored as static TTFs in `assets/fonts/` (all three are
 * SIL OFL 1.1, which permits redistribution; the licences sit beside them).
 * They are read from disk, not fetched, so a build never depends on
 * fonts.googleapis.com being reachable. Anything not covered here would fall
 * back to @vercel/og's bundled Geist, which would be visibly wrong.
 */
export const alt = `${CONTACT_INFO.name} — ${CONTACT_INFO.title}. ${HERO_HEADLINE}`;

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

/* --- Design tokens, mirrored from globals.css ------------------------------
   Satori resolves no custom properties, so the literal values live here. Keep
   them in step with the `@theme` block in `src/app/globals.css`. */
const PAPER = '#FFFDF7';
const INK = '#161310';
const MUTED = '#5F584E';
const HAIRLINE = '#E6E0D2';
const ACCENT = '#C2410C'; // eyebrow terracotta — the one place it is allowed
const CTA = '#FF5E1A';
const LIME = '#BFF03A';

/** The KK stamp: 20px pitch, 16px block — the hero stage's own proportions. */
const CELL = 14;
const BLOCK = 11;

/** `morph-layouts` hero stage: the second K's stem (gx 12/13) is lime. */
const cellColor = (gx: number) => (gx === 12 || gx === 13 ? LIME : INK);

/** The nav's 2x2 mark: ink, ink, lime with an ink inset ring, cta orange. */
function BlockMark({ unit }: { unit: number }) {
  const square = {
    width: unit,
    height: unit,
    borderRadius: 2,
    display: 'flex',
  } as const;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', width: unit * 2 + 3 }}>
      <div style={{ ...square, background: INK, marginRight: 3 }} />
      <div style={{ ...square, background: INK }} />
      <div
        style={{
          ...square,
          background: LIME,
          border: `2px solid ${INK}`,
          marginTop: 3,
          marginRight: 3,
        }}
      />
      <div style={{ ...square, background: CTA, marginTop: 3 }} />
    </div>
  );
}

export default async function Image() {
  const fontDir = join(process.cwd(), 'assets', 'fonts');
  const [display, body, mono] = await Promise.all([
    readFile(join(fontDir, 'BricolageGrotesque-ExtraBold.ttf')),
    readFile(join(fontDir, 'Manrope-SemiBold.ttf')),
    readFile(join(fontDir, 'SpaceMono-Bold.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: PAPER,
          fontFamily: 'Manrope',
          color: INK,
        }}
      >
        {/* --- The nav, restated: mark + wordmark, hairline underneath ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 104,
            padding: '0 56px',
            borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BlockMark unit={17} />
            <div
              style={{
                fontFamily: 'Bricolage Grotesque',
                fontSize: 34,
                letterSpacing: '-0.03em',
                color: INK,
              }}
            >
              {CONTACT_INFO.name}
            </div>
          </div>
          <div
            style={{
              fontFamily: 'Space Mono',
              fontSize: 15,
              letterSpacing: '0.12em',
              color: MUTED,
            }}
          >
            {new URL(SITE_URL).host.toUpperCase()}
          </div>
        </div>

        {/* --- Hero: eyebrow + headline, with the KK stamp to its right --- */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 56px',
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', width: 680 }}
          >
            <div
              style={{
                fontFamily: 'Space Mono',
                fontSize: 17,
                letterSpacing: '0.12em',
                color: ACCENT,
              }}
            >
              {HERO_EYEBROW}
            </div>
            <div
              style={{
                marginTop: 26,
                fontFamily: 'Bricolage Grotesque',
                fontSize: 64,
                lineHeight: 1.02,
                letterSpacing: '-0.035em',
                color: INK,
              }}
            >
              {HERO_HEADLINE}
            </div>
          </div>

          {/* A flat stamp of the same KK the 3D backdrop spells at the top of
              the page — same glyph cells, same lime stem, no new geometry. */}
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: 22 * CELL,
              height: 14 * CELL,
            }}
          >
            {GLYPH_CELLS.map((cell) => (
              <div
                key={`${cell.gx}-${cell.gy}`}
                style={{
                  position: 'absolute',
                  left: cell.gx * CELL,
                  top: cell.gy * CELL,
                  width: BLOCK,
                  height: BLOCK,
                  borderRadius: 1,
                  background: cellColor(cell.gx),
                }}
              />
            ))}
          </div>
        </div>

        {/* --- The hero's stat row, verbatim ------------------------------ */}
        <div
          style={{
            display: 'flex',
            margin: '0 56px',
            paddingTop: 22,
            paddingBottom: 34,
            borderTop: `1px solid ${HAIRLINE}`,
          }}
        >
          {HERO_STATS.map((stat, index) => (
            <div
              key={stat.term}
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: index > 0 ? 28 : 0,
                paddingRight: 28,
                borderLeft: `${index > 0 ? 1 : 0}px solid ${HAIRLINE}`,
              }}
            >
              <div
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: 15,
                  letterSpacing: '0.12em',
                  color: MUTED,
                }}
              >
                {stat.term.toUpperCase()}
              </div>
              <div style={{ marginTop: 10, fontSize: 22, color: INK }}>
                {stat.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Bricolage Grotesque',
          data: display,
          style: 'normal',
          weight: 800,
        },
        { name: 'Manrope', data: body, style: 'normal', weight: 600 },
        { name: 'Space Mono', data: mono, style: 'normal', weight: 700 },
      ],
    }
  );
}
