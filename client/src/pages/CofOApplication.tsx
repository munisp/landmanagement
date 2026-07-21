import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STAGES = [
  { id: "submission", label: "Submission" },
  { id: "nin_verification", label: "NIN Verification" },
  { id: "document_review", label: "Document Review" },
  { id: "survey_verification", label: "Survey Verification" },
  { id: "site_inspection", label: "Site Inspection" },
  { id: "legal_review", label: "Legal Review" },
  { id: "governor_consent", label: "Governor Consent" },
  { id: "gazette_publication", label: "Gazette Publication" },
  { id: "issuance", label: "Certificate Issuance" },
];

export default function CofOApplication() {
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const { data: applications, isLoading } = trpc.cofoWorkflow.listApplications.useQuery({ limit: 50, page: 1 });
  const { data: stageLogs } = trpc.cofoWorkflow.getStageLogs.useQuery(
    { applicationId: selectedAppId! },
    { enabled: selectedAppId !== null }
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">C of O Applications</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Applications</h2>
          {isLoading && <p>Loading...</p>}
          {applications?.items.map((app: any) => (
            <div
              key={app.id}
              onClick={() => setSelectedAppId(app.id)}
              className={`bg-white border rounded-lg p-4 mb-3 cursor-pointer hover:border-blue-400 ${
                selectedAppId === app.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <p className="font-mono text-sm font-semibold">{app.applicationNumber}</p>
              <p className="text-sm text-gray-500 mt-1">Stage: <strong>{app.currentStage}</strong></p>
              <p className="text-sm text-gray-500">Status: <strong>{app.status}</strong></p>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2">
          {selectedAppId ? (
            <div>
              <h2 className="text-lg font-semibold mb-3">Workflow Progress</h2>
              <div className="space-y-2">
                {STAGES.map((stage, idx) => {
                  const log = stageLogs?.find((l: any) => l.toStage === stage.id);
                  const isCompleted = !!log;
                  return (
                    <div key={stage.id} className={`flex items-center gap-3 p-3 rounded-lg ${
                      isCompleted ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"
                    }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCompleted ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"
                      }`}>
                        {isCompleted ? "✓" : idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{stage.label}</p>
                        {log && (
                          <p className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-400">Select an application to view its workflow progress</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
