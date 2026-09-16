export default function Loading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="flex flex-col items-center gap-4">
        {/*
          Live "engine is compiling" signal — this is exactly the `status` role,
          so all three ticks share the one status color instead of parading
          cobalt/tangerine/lime. They are 10px squares, not a large fill, and
          status is used as a fill here, never as text on the light background.
        */}
        <div className="flex gap-1" aria-hidden="true">
          <div
            className="h-2.5 w-2.5 animate-bounce border-2 border-border bg-status"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2.5 w-2.5 animate-bounce border-2 border-border bg-status"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2.5 w-2.5 animate-bounce border-2 border-border bg-status"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="animate-pulse font-mono text-sm font-bold uppercase tracking-[0.12em] text-text-muted">
          Compiling workspace...
        </p>
      </div>
    </div>
  );
}
