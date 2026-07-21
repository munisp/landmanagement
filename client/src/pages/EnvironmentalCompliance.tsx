import React from "react";
import { trpc } from "@/lib/trpc";

export default function EnvironmentalCompliance() {
  const { data: records, isLoading } = trpc.environmental.listComplianceRecords.useQuery({ limit: 50, page: 1 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Environmental Compliance</h1>
      {isLoading && <p>Loading compliance records...</p>}
      {records && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Sector</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">EIA Category</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">EIA Status</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Risk Score</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Violations</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Next Audit</th>
              </tr>
            </thead>
            <tbody>
              {records?.items.map((record: any) => (
                <tr key={record.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{record.sectorType}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      record.eiaCategory === "A" ? "bg-red-100 text-red-800" :
                      record.eiaCategory === "B1" ? "bg-orange-100 text-orange-800" :
                      record.eiaCategory === "B2" ? "bg-yellow-100 text-yellow-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {record.eiaCategory}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">{record.eiaStatus}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${record.riskScore >= 75 ? "bg-red-500" : record.riskScore >= 50 ? "bg-orange-500" : "bg-green-500"}`}
                          style={{ width: `${record.riskScore}%` }}
                        />
                      </div>
                      <span className="text-sm">{record.riskScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm">{record.violationsCount}</td>
                  <td className="px-4 py-2 text-sm">{record.nextAuditDue ? new Date(record.nextAuditDue).toLocaleDateString() : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
