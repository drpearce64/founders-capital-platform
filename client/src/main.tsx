import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { checkClientEnv } from "./lib/env";
import { createRoot } from "react-dom/client";

checkClientEnv();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
