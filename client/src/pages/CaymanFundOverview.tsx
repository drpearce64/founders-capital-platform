import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const fundDetails = [
  {
    section: "General Partner",
    rows: [
      { label: "Full Name",       value: "FC Strat. Opps. Fund I GP Limited" },
      { label: "Type",            value: "Cayman Islands Exempted Company" },
      { label: "Incorporated",    value: "9 October 2025" },
      { label: "Sole Director",   value: "Richard Hadler" },
      { label: "Registered Agent",value: "Walkers Corporate Ltd, 190 Elgin Ave, George Town, Grand Cayman KY1-9008" },
    ],
  },
  {
    section: "Limited Partnership",
    rows: [
      { label: "Full Name",       value: "Founders Capital Strat. Opps. Fund I LP" },
      { label: "Type",            value: "Cayman Islands Exempted Limited Partnership" },
      { label: "Reg. No.",        value: "134092" },
      { label: "Registered",      value: "10 October 2025" },
      { label: "Regulator",       value: "CIMA — Exempted LP Register" },
      { label: "Base Currency",   value: "USD" },
      { label: "Governing Law",   value: "Cayman Islands" },
    ],
  },
  {
    section: "Investment Manager (AIFM)",
    rows: [
      { label: "Manager",         value: "Paxiot Limited" },
      { label: "Authorisation",   value: "FCA Authorised AIFM (UK)" },
      { label: "Co. No.",         value: "07455644" },
      { label: "Address",         value: "6 Kinghorn St, London EC1A 7HT" },
      { label: "Relationship",    value: "Management delegation (dashed line)" },
    ],
  },
  {
    section: "Fund Strategy",
    rows: [
      { label: "Focus",           value: "AI & Robotics" },
      { label: "Stage",           value: "Early stage & Late stage" },
      { label: "Target Size",     value: "15–20 portfolio positions" },
      { label: "Investor Type",   value: "Limited partnership interests" },
    ],
  },
  {
    section: "Group Chain",
    rows: [
      { label: "Ultimate Parent", value: "FC Group Holding Ltd. (England & Wales, Co. No. 14797242)" },
      { label: "Chain",           value: "FC Group Holding Ltd. → Paxiot / FC US Holdings LLC → GP Limited → Cayman LP" },
    ],
  },
];

export default function CaymanFundOverview() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🇰🇾</span>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Fund Overview
          </h1>
          <Badge variant="outline" className="text-xs">Cayman Islands</Badge>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Full legal and structural details for the Founders Capital Strategic Opportunities Fund I
        </p>
      </div>

      <div className="space-y-5">
        {fundDetails.map(block => (
          <Card key={block.section} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {block.section}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="space-y-2.5">
                {block.rows.map((row, i) => (
                  <div key={i} className="flex items-start gap-4 text-sm">
                    <span
                      className="w-40 flex-shrink-0 font-medium text-xs pt-0.5"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      {row.label}
                    </span>
                    <span className="text-xs" style={{ color: "hsl(var(--foreground))" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="mt-6 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        Information sourced from fc_group_structure.pptx and registered entity records.
        For legal purposes always refer to the fund's constitutional documents.
      </p>
    </div>
  );
}
