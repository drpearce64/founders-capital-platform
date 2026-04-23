// Types mirroring the Supabase schema
// These are hand-written since Supabase MCP doesn't auto-generate types

export interface Entity {
  id: string;
  name: string;
  short_code: string;
  entity_type: 'master' | 'series_spv' | 'management_company';
  parent_entity_id: string | null;
  jurisdiction: string;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_swift: string | null;
  hsbc_account_ref: string | null;
  base_currency: string;
  fiscal_year_end: string;
  status: 'forming' | 'active' | 'winding_down' | 'dissolved';
  formation_date: string | null;
  ein: string | null;
  created_at: string;
  updated_at: string;
}

export interface Investor {
  id: string;
  full_name: string;
  email: string | null;
  investor_type: 'individual' | 'entity' | 'trust' | 'family_office' | 'institutional';
  country_of_residence: string | null;
  tax_id: string | null;
  is_accredited: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected' | 'expired';
  us_person: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestorCommitment {
  id: string;
  entity_id: string;
  investor_id: string;
  committed_amount: number;
  called_amount: number;
  fee_rate: number;
  carry_rate: number;
  carried_interest_pct: number;
  management_fee_pct: number;
  status: 'pending' | 'active' | 'called' | 'fully_drawn' | 'exited' | 'transferred';
  commitment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Investment {
  id: string;
  entity_id: string;
  company_name: string;
  instrument_type: string;
  investment_date: string;
  cost_basis: number;
  shares_units: number | null;
  price_per_share: number | null;
  post_money_valuation: number | null;
  current_fair_value: number | null;
  moic: number | null;
  status: 'active' | 'partially_exited' | 'exited' | 'written_off';
  notes: string | null;
  created_at: string;
}

export interface CapitalCall {
  id: string;
  entity_id: string;
  call_number: number;
  call_date: string;
  due_date: string;
  purpose: string;
  total_call_amount: number;
  currency: string;
  status: 'draft' | 'issued' | 'partially_funded' | 'fully_funded' | 'cancelled';
  bank_name: string | null;
  account_name: string | null;
  account_no: string | null;
  routing_no: string | null;
  swift: string | null;
  reference_note: string | null;
  created_at: string;
}

export interface CapitalCallItem {
  id: string;
  capital_call_id: string;
  investor_id: string;
  commitment_id: string;
  call_amount: number;
  pro_rata_pct: number;
  funded_amount: number;
  funded_date: string | null;
  payment_ref: string | null;
  status: 'pending' | 'funded' | 'overdue' | 'waived';
}

// Insert types (omit auto-generated fields)
export type InsertEntity = Omit<Entity, 'id' | 'created_at' | 'updated_at'>;
export type InsertInvestor = Omit<Investor, 'id' | 'created_at' | 'updated_at'>;
export type InsertCommitment = Omit<InvestorCommitment, 'id' | 'created_at' | 'updated_at'>;
export type InsertCapitalCall = Omit<CapitalCall, 'id' | 'created_at'>;
