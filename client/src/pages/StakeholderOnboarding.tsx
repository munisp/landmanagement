import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const SECTORS = ["land", "mining", "oil_gas", "water", "forestry", "agriculture", "fisheries", "renewable_energy"];
const ROLES_BY_SECTOR: Record<string, string[]> = {
  land: ["citizen", "surveyor", "registrar", "admin"],
  mining: ["operator", "inspector", "registrar", "admin"],
  oil_gas: ["operator", "inspector", "registrar", "admin"],
  water: ["rights_holder", "inspector", "registrar", "admin"],
  forestry: ["operator", "inspector", "registrar", "admin"],
  agriculture: ["operator", "inspector", "registrar", "admin"],
  fisheries: ["operator", "inspector", "admin"],
  renewable_energy: ["operator", "inspector", "admin"],
};

export default function StakeholderOnboarding() {
  const [selectedSector, setSelectedSector] = useState("land");
  const { data: records, isLoading } = trpc.onboarding.listOnboardingRecords.useQuery({ limit: 50, page: 1 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Stakeholder Onboarding</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Filter by Sector</h2>
          <div className="space-y-2">
            {SECTORS.map((sector) => (
              <button
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  selectedSector === sector
                    ? "bg-blue-500 text-white"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {sector.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Onboarding Records</h2>
          {isLoading && <p>Loading...</p>}
          {records?.items
            ?.filter((r: any) => r.sector === selectedSector)
            .map((record: any) => (
              <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">User #{record.userId}</p>
                    <p className="text-sm text-gray-500">{record.sector} — {record.role}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    record.onboardingStatus === "active" ? "bg-green-100 text-green-800" :
                    record.onboardingStatus === "pending" ? "bg-yellow-100 text-yellow-800" :
                    "bg-blue-100 text-blue-800"
                  }`}>
                    {record.onboardingStatus}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: "NIN", value: record.ninVerified },
                    { label: "BVN", value: record.bvnVerified },
                    { label: "Docs", value: record.documentsVerified },
                    { label: "Keycloak", value: !!record.keycloakUserId },
                    { label: "Permify", value: record.permifyPoliciesApplied },
                    { label: "Training", value: record.trainingCompleted },
                  ].map(({ label, value }) => (
                    <div key={label} className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                      value ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"
                    }`}>
                      <span>{value ? "✓" : "○"}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
