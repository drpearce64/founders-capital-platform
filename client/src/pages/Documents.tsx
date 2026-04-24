import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Upload, Download, Eye, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const DOC_TYPES = [
  "operating_agreement", "side_letter", "subscription_doc",
  "call_notice", "distribution_notice", "k1", "kyc", "other"
];

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function typeBadge(t: string) {
  const map: Record<string, string> = {
    operating_agreement: "bg-blue-100 text-blue-800",
    side_letter: "bg-purple-100 text-purple-800",
    subscription_doc: "bg-indigo-100 text-indigo-800",
    call_notice: "bg-orange-100 text-orange-800",
    distribution_notice: "bg-emerald-100 text-emerald-800",
    k1: "bg-yellow-100 text-yellow-800",
    kyc: "bg-rose-100 text-rose-800",
    other: "bg-gray-100 text-gray-700",
  };
  return map[t] || "bg-gray-100 text-gray-700";
}

function fmtSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterSpv, setFilterSpv] = useState("");
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState({
    entity_id: "",
    investor_id: "",
    document_type: "other",
    name: "",
    period: "",
    is_lp_visible: true,
  });
  const [file, setFile] = useState<File | null>(null);

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: investors = [] } = useQuery<any[]>({
    queryKey: ["/api/investors"],
    queryFn: () => apiRequest("GET", "/api/investors").then(r => r.json()),
  });

  const { data: documents = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/documents", filterSpv, filterType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterSpv) params.set("entity_id", filterSpv);
      if (filterType) params.set("document_type", filterType);
      return apiRequest("GET", `/api/documents?${params}`).then(r => r.json());
    },
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  const uploadDoc = useMutation({
    mutationFn: async (body: any) => {
      const fd = new FormData();
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== "") fd.append(k, v as any);
      });
      if (file) fd.append("file", file);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document uploaded successfully" });
      setShowForm(false);
      setFile(null);
      setForm({ entity_id: "", investor_id: "", document_type: "other", name: "", period: "", is_lp_visible: true });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/documents/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Document deleted" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Document Store</h1>
            <p className="text-sm text-gray-500">Operating agreements, sub docs, call notices, K-1s — centralised and LP-accessible</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterSpv}
          onChange={e => setFilterSpv(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Vectors</option>
          {spvs.map((spv: any) => {
            const label = spv.short_code?.replace("FC-", "") || spv.name;
            const inv = spv.investments?.[0]?.company_name;
            return <option key={spv.id} value={spv.id}>{label}{inv ? ` — ${inv}` : ""}</option>;
          })}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
      </div>

      {/* Upload Form */}
      {showForm && (
        <div className="bg-white border border-indigo-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Upload Document</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vector (SPV)</label>
              <select
                value={form.entity_id}
                onChange={e => setForm({ ...form, entity_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Fund-wide (not Vector-specific)</option>
                {spvs.map((spv: any) => {
                  const label = spv.short_code?.replace("FC-", "") || spv.name;
                  const inv = spv.investments?.[0]?.company_name;
                  return <option key={spv.id} value={spv.id}>{label}{inv ? ` — ${inv}` : ""}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">LP (leave blank for SPV-level)</label>
              <select
                value={form.investor_id}
                onChange={e => setForm({ ...form, investor_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All LPs in this Vector</option>
                {investors.map((inv: any) => (
                  <option key={inv.id} value={inv.id}>{inv.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Document Type *</label>
              <select
                value={form.document_type}
                onChange={e => setForm({ ...form, document_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DOC_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Vector III Operating Agreement v2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period (optional)</label>
              <input
                type="text"
                value={form.period}
                onChange={e => setForm({ ...form, period: e.target.value })}
                placeholder="e.g. Q1 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id="lp_visible"
                checked={form.is_lp_visible}
                onChange={e => setForm({ ...form, is_lp_visible: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="lp_visible" className="text-sm text-gray-700">Visible to LP in their portal</label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              >
                <Upload className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm text-indigo-700 font-medium">{file.name} ({fmtSize(file.size)})</p>
                ) : (
                  <p className="text-sm text-gray-500">Click to select PDF, DOCX, or other file</p>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => {
                  if (!form.name) { toast({ title: "Please enter a document name", variant: "destructive" }); return; }
                  if (!file) { toast({ title: "Please select a file", variant: "destructive" }); return; }
                  uploadDoc.mutate(form);
                }}
                disabled={uploadDoc.isPending}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploadDoc.isPending ? "Uploading…" : "Upload Document"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Documents {documents.length > 0 && <span className="text-gray-400 font-normal ml-1">({documents.length})</span>}
          </h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No documents uploaded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Vector</th>
                <th className="px-4 py-3 text-left">LP</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-left">Size</th>
                <th className="px-4 py-3 text-left">LP Visible</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: any) => (
                <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{doc.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(doc.document_type)}`}>
                      {typeLabel(doc.document_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {doc.entities ? (
                      <div>
                        <div className="font-medium text-gray-900">{doc.entities.short_code?.replace("FC-", "") || doc.entities.name}</div>
                        {doc.entities.investments?.[0]?.company_name && (
                          <div className="text-xs text-blue-600">{doc.entities.investments[0].company_name}</div>
                        )}
                      </div>
                    ) : <span className="text-gray-400">Fund-wide</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{doc.investors?.full_name || <span className="text-gray-400">All LPs</span>}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{doc.period || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtSize(doc.file_size_bytes)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${doc.is_lp_visible ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                      {doc.is_lp_visible ? "Yes" : "Admin only"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {doc.storage_path && (
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          className="text-gray-400 hover:text-indigo-600"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("Delete this document?")) deleteDoc.mutate(doc.id);
                        }}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
