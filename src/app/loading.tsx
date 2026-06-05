export default function Loading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-bg-editor">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1">
          <div
            className="h-2 w-2 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2 w-2 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2 w-2 rounded-full bg-text-accent animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="font-mono text-sm text-text-muted animate-pulse">
          Compiling workspace...
        </p>
      </div>
    </div>
  );
}
