/**
 * Analytics Charts
 * Reusable chart components for analytics dashboard
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TransactionTrendChartProps {
  data: {
    labels: string[];
    values: number[];
  };
}

export function TransactionTrendChart({ data }: TransactionTrendChartProps) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Transactions',
        data: data.values,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Transaction Volume Trend',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  return <Line data={chartData} options={options} />;
}

interface PropertyValueDistributionProps {
  data: {
    ranges: string[];
    counts: number[];
  };
}

export function PropertyValueDistribution({ data }: PropertyValueDistributionProps) {
  const chartData = {
    labels: data.ranges,
    datasets: [
      {
        label: 'Properties',
        data: data.counts,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      title: {
        display: true,
        text: 'Property Value Distribution',
      },
    },
  };

  return <Bar data={chartData} options={options} />;
}

interface TransactionTypeBreakdownProps {
  data: {
    types: string[];
    counts: number[];
  };
}

export function TransactionTypeBreakdown({ data }: TransactionTypeBreakdownProps) {
  const chartData = {
    labels: data.types,
    datasets: [
      {
        data: data.counts,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      title: {
        display: true,
        text: 'Transaction Type Breakdown',
      },
    },
  };

  return <Doughnut data={chartData} options={options} />;
}

interface RevenueChartProps {
  data: {
    labels: string[];
    revenue: number[];
    forecast?: number[];
  };
}

export function RevenueChart({ data }: RevenueChartProps) {
  const datasets = [
    {
      label: 'Actual Revenue',
      data: data.revenue,
      borderColor: 'rgb(16, 185, 129)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4,
    },
  ];

  if (data.forecast) {
    datasets.push({
      label: 'Forecasted Revenue',
      data: data.forecast,
      borderColor: 'rgb(251, 146, 60)',
      backgroundColor: 'rgba(251, 146, 60, 0.1)',
      borderDash: [5, 5] as number[],
      fill: true,
      tension: 0.4,
    } as any);
  }

  const chartData = {
    labels: data.labels,
    datasets,
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Revenue Trend & Forecast',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return '₦' + (value / 1000000).toFixed(1) + 'M';
          },
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
}

interface UserActivityChartProps {
  data: {
    labels: string[];
    activeUsers: number[];
    newUsers: number[];
  };
}

export function UserActivityChart({ data }: UserActivityChartProps) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Active Users',
        data: data.activeUsers,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'New Users',
        data: data.newUsers,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'User Activity',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  return <Bar data={chartData} options={options} />;
}
