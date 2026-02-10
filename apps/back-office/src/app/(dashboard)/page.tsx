"use client";

import { useEffect, useState } from "react";
import { getDashboard, type DashboardData } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { formatPence, formatPercent } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-gray-500">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Today&apos;s performance &mdash; {data.date}
        </p>
      </div>

      {/* Key metrics */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatPence(data.totalRevenue)}
          sublabel={`${data.totalOrders} orders`}
        />
        <StatCard
          label="Avg Order Value"
          value={formatPence(data.averageOrderValue)}
        />
        <StatCard
          label="Gross Profit"
          value={formatPence(data.grossProfit)}
          sublabel={`${formatPercent(data.marginPercent)} margin`}
        />
        <StatCard
          label="Tax Collected"
          value={formatPence(data.totalTax)}
          sublabel={
            data.totalDiscount > 0
              ? `${formatPence(data.totalDiscount)} discounted`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Top selling items */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Top Selling Items
          </h2>
          {data.topItems.length === 0 ? (
            <p className="text-sm text-gray-500">No sales today yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-gray-900">
                      {item.name}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {item.quantitySold}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {formatPence(item.revenue)}
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {formatPercent(item.marginPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Payment methods */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Payment Breakdown
          </h2>
          {data.paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-500">No payments today yet</p>
          ) : (
            <div className="space-y-4">
              {data.paymentMethods.map((pm) => {
                const pct =
                  data.totalRevenue > 0
                    ? Math.round((pm.total / data.totalRevenue) * 100)
                    : 0;
                return (
                  <div key={pm.method}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium capitalize text-gray-700">
                        {pm.method}
                      </span>
                      <span className="text-gray-600">
                        {formatPence(pm.total)} ({pm.count} txns)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-slate-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
