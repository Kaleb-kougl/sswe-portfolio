import { IDELayoutWrapper } from '@/components/ide-layout-wrapper';
import { SpeedInsights } from "@vercel/speed-insights/next"

export default function Home() {
  return (
    <>
      {/* Skip link — first focusable element */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>
      <IDELayoutWrapper />
      <SpeedInsights />
    </>
  );
}
