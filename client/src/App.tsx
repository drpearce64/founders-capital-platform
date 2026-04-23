import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import SPVs from "./pages/SPVs";
import LPOnboarding from "./pages/LPOnboarding";
import LPRegister from "./pages/LPRegister";
import CapitalCalls from "./pages/CapitalCalls";
import NotFound from "./pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/spvs" component={SPVs} />
            <Route path="/lp-onboarding" component={LPOnboarding} />
            <Route path="/lp-register" component={LPRegister} />
            <Route path="/capital-calls" component={CapitalCalls} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
