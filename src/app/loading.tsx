export default function Loading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1">
          <div
            className="h-2.5 w-2.5 border-2 border-border bg-cobalt animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2.5 w-2.5 border-2 border-border bg-tangerine animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2.5 w-2.5 border-2 border-border bg-lime animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-text-muted animate-pulse">
          Compiling workspace...
        </p>
      </div>
    </div>
  );
}
