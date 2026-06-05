import { IDELayoutWrapper } from '@/components/ide-layout-wrapper';

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
    </>
  );
}
