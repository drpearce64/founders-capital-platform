import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";

// Delaware pages
import Dashboard from "./pages/Dashboard";
import SPVs from "./pages/SPVs";
import LPOnboarding from "./pages/LPOnboarding";
import LPRegister from "./pages/LPRegister";
import CapitalCalls from "./pages/CapitalCalls";
import Waterfall from "./pages/Waterfall";
import AuditLog from "./pages/AuditLog";
import SeriesExpenses from "./pages/SeriesExpenses";
import LPPortfolio from "./pages/LPPortfolio";
import NAVMarks from "./pages/NAVMarks";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import QuarterlyStatements from "./pages/QuarterlyStatements";
import AirtableSync from "./pages/AirtableSync";
import PLModel from "./pages/PLModel";
import TaxAccounts from "./pages/TaxAccounts";
import AccountsPayable from "./pages/AccountsPayable";
import GroupStructure from "./pages/GroupStructure";
import ReportingCalendar from "./pages/ReportingCalendar";
import FCInvestments from "./pages/FCInvestments";
import OtherInvestments from "./pages/OtherInvestments";
import YCDashboard from "./pages/YCDashboard";
import InvestorRegister from "./pages/InvestorRegister";
import PortfolioSummary from "./pages/PortfolioSummary";

// Cayman pages
import CaymanDashboard from "./pages/CaymanDashboard";
import CaymanFundOverview from "./pages/CaymanFundOverview";
import CaymanLPRegister from "./pages/CaymanLPRegister";
import CaymanCapitalCalls from "./pages/CaymanCapitalCalls";
import CaymanNAV from "./pages/CaymanNAV";
import CaymanAccountsPayable from "./pages/CaymanAccountsPayable";

import NotFound from "./pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout>
          <Switch>
            {/* ── Delaware routes ─────────────────────────────── */}
            <Route path="/"                  component={Dashboard} />
            <Route path="/spvs"              component={SPVs} />
            <Route path="/lp-onboarding"     component={LPOnboarding} />
            <Route path="/lp-register"       component={LPRegister} />
            <Route path="/capital-calls"     component={CapitalCalls} />
            <Route path="/waterfall"         component={Waterfall} />
            <Route path="/audit-log"         component={AuditLog} />
            <Route path="/series-expenses"   component={SeriesExpenses} />
            <Route path="/lp-portfolio"      component={LPPortfolio} />
            <Route path="/nav-marks"         component={NAVMarks} />
            <Route path="/documents"         component={Documents} />
            <Route path="/settings"          component={Settings} />
            <Route path="/statements"        component={QuarterlyStatements} />
            <Route path="/airtable-sync"     component={AirtableSync} />
            <Route path="/pl-model"          component={PLModel} />
            <Route path="/tax-accounts"      component={TaxAccounts} />
            <Route path="/accounts-payable"  component={AccountsPayable} />
            <Route path="/group-structure"      component={GroupStructure} />
            <Route path="/reporting-calendar"   component={ReportingCalendar} />
            <Route path="/fc-investments"        component={FCInvestments} />
            <Route path="/other-investments"      component={OtherInvestments} />
            <Route path="/yc-portfolio"          component={YCDashboard} />
            <Route path="/investor-register"     component={InvestorRegister} />
            <Route path="/portfolio"             component={PortfolioSummary} />

            {/* ── Cayman routes ───────────────────────────────── */}
            <Route path="/cayman"                    component={CaymanDashboard} />
            <Route path="/cayman/fund-overview"      component={CaymanFundOverview} />
            <Route path="/cayman/lp-register"        component={CaymanLPRegister} />
            <Route path="/cayman/capital-calls"      component={CaymanCapitalCalls} />
            <Route path="/cayman/nav"                component={CaymanNAV} />
            <Route path="/cayman/accounts-payable"   component={CaymanAccountsPayable} />

            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
