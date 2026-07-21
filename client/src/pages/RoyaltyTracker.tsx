import React from "react";
import { trpc } from "@/lib/trpc";

export default function RoyaltyTracker() {
  const { data: miningLicenses } = trpc.mining.listLicenses.useQuery({ limit: 50, page: 1 });
  const { data: petroleumLicenses } = trpc.oilGas.listLicenses.useQuery({ limit: 50, page: 1 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Royalty Tracker</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Mining Royalties</h2>
          <p className="text-sm text-gray-500">
            Active mining licenses: <strong>{miningLicenses?.total ?? 0}</strong>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            All royalty payments are processed through TigerBeetle for high-throughput ledger recording.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Petroleum Royalties</h2>
          <p className="text-sm text-gray-500">
            Active petroleum licenses: <strong>{petroleumLicenses?.total ?? 0}</strong>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Production metering data is verified by the Rust production-meter service.
          </p>
        </div>
      </div>
    </div>
  );
}
