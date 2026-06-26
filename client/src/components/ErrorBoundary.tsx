// client/src/components/ErrorBoundary.tsx
// Top-level React error boundary so one failing component can't white-screen the
// whole portal. Catches render/lifecycle errors and shows a reload fallback.
// (Module-load throws aren't catchable here — those are guarded at the source,
//  e.g. supabaseClient returns null instead of throwing.)
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a clear record in the console for diagnosis.
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    // Self-contained inline styles — no dependency on app components/CSS, which
    // may be exactly what failed.
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontFamily: "system-ui, sans-serif",
          color: "#1f2937",
          background: "#f9fafb",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
