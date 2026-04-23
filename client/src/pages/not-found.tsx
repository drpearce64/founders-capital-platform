export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2" style={{ color: "hsl(var(--foreground))" }}>404</h1>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Page not found</p>
      </div>
    </div>
  );
}
