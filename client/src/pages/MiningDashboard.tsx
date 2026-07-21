import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function MiningDashboard() {
  const { data: licenses, isLoading } = trpc.mining.listLicenses.useQuery({ limit: 50, page: 1 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Mining Licenses Dashboard</h1>
      {isLoading && <p>Loading licenses...</p>}
      {licenses && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">License Number</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Type</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">State</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {licenses?.items.map((license: any) => (
                <tr key={license.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-mono">{license.licenseNumber}</td>
                  <td className="px-4 py-2 text-sm">{license.type}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      license.status === "active" ? "bg-green-100 text-green-800" :
                      license.status === "expired" ? "bg-red-100 text-red-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {license.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm">{license.stateCode}</td>
                  <td className="px-4 py-2 text-sm">{license.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
