import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCog, Plus, Trash2, Shield, Eye, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const ROLES = [
  { value: "admin", label: "Admin", description: "Full access — create, edit, delete across all Vectors", icon: Shield, color: "text-rose-600 bg-rose-50" },
  { value: "read_only", label: "Read Only", description: "View all data, no edits. Suitable for accountant or co-GP.", icon: Eye, color: "text-blue-600 bg-blue-50" },
  { value: "lp", label: "LP (Investor)", description: "Portal access only — sees own commitments and documents", icon: User, color: "text-emerald-600 bg-emerald-50" },
];

export default function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", role: "read_only", investor_id: "" });

  const { data: roles = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/user-roles"],
    queryFn: () => apiRequest("GET", "/api/user-roles").then(r => r.json()),
  });

  const { data: investors = [] } = useQuery<any[]>({
    queryKey: ["/api/investors"],
    queryFn: () => apiRequest("GET", "/api/investors").then(r => r.json()),
  });

  const addRole = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/user-roles", body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user-roles"] });
      toast({ title: "User role saved" });
      setShowForm(false);
      setForm({ email: "", role: "read_only", investor_id: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/user-roles/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user-roles"] });
      toast({ title: "Role removed" });
    },
  });

  function roleMeta(role: string) {
    return ROLES.find(r => r.value === role) || ROLES[1];
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <UserCog className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Users & Roles</h1>
            <p className="text-sm text-gray-500">Control who can access the portal and at what level</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ROLES.map(r => {
          const count = roles.filter(u => u.role === r.value).length;
          const RoleIcon = r.icon;
          return (
            <div key={r.value} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${r.color}`}>
                <RoleIcon className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{r.label}</p>
              <p className="text-xs text-gray-500 mt-1">{r.description}</p>
              <p className="text-xs font-medium text-gray-700 mt-3">{count} user{count !== 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>

      {/* Add User Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Add User Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {form.role === "lp" && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to LP Record</label>
                <select
                  value={form.investor_id}
                  onChange={e => setForm({ ...form, investor_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">Select LP…</option>
                  {investors.map((inv: any) => (
                    <option key={inv.id} value={inv.id}>{inv.full_name} ({inv.email})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => {
                  if (!form.email) { toast({ title: "Email required", variant: "destructive" }); return; }
                  addRole.mutate({
                    email: form.email,
                    role: form.role,
                    investor_id: form.investor_id || null,
                    user_id: crypto.randomUUID(),
                  });
                }}
                disabled={addRole.isPending}
                className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {addRole.isPending ? "Saving…" : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">All Users</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : roles.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No users configured — you are the only admin</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Linked LP</th>
                <th className="px-4 py-3 text-left">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((u: any) => {
                const meta = roleMeta(u.role);
                const RoleIcon = meta.icon;
                return (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                        <RoleIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.investors?.full_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm("Remove this user's access?")) deleteRole.mutate(u.id); }}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
