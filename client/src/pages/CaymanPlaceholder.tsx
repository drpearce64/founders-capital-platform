import { Clock } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

export default function CaymanPlaceholder({ title, description }: Props) {
  return (
    <div
      className="min-h-screen p-6 flex flex-col items-center justify-center"
      style={{ background: "hsl(var(--background))" }}
    >
      <div className="text-center space-y-3 max-w-md">
        <Clock size={36} style={{ color: "hsl(var(--primary))", margin: "0 auto" }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--primary))" }}>
          Coming soon
        </p>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
          {title}
        </h1>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {description ?? "This section is pending Airtable data setup for the Cayman fund. It will be connected once the underlying tables are in place."}
        </p>
      </div>
    </div>
  );
}
