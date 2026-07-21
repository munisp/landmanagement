import React from "react";
import { trpc } from "@/lib/trpc";

export default function OilGasBlockMap() {
  const { data: blocks, isLoading } = trpc.oilGas.listBlocks.useQuery({ limit: 50, page: 1 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Oil & Gas Block Map</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-100 rounded-lg p-4 h-96 flex items-center justify-center">
          <p className="text-gray-500">Map visualization (AdvancedMapWorkbench integration)</p>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Block Registry</h2>
          {isLoading && <p>Loading blocks...</p>}
          {blocks?.items.map((block: any) => (
            <div key={block.id} className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{block.blockName}</h3>
                  <p className="text-sm text-gray-500">{block.basin} — {block.terrain}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  block.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                }`}>
                  {block.status}
                </span>
              </div>
              {block.estimatedReservesBarrels && (
                <p className="text-sm mt-2">
                  Estimated Reserves: <strong>{Number(block.estimatedReservesBarrels).toLocaleString()} bbl</strong>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
