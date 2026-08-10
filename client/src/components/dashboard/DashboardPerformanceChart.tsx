import { useMemo, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { DashboardChartPoint } from './types';

type ChartType = 'bar' | 'line';
type Period = '7d' | '30d';

interface DashboardPerformanceChartProps {
  title?: string;
  score: number;
  changeLabel: string;
  subtitle?: string;
  data: DashboardChartPoint[];
}

const chartConfig = {
  value: { label: 'Performance', color: 'var(--foreground)' },
};

export function DashboardPerformanceChart({
  title = 'Performance',
  score,
  changeLabel,
  subtitle = 'Share of engagements currently active (active ÷ total engagements).',
  data,
}: DashboardPerformanceChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [period, setPeriod] = useState<Period>('7d');
  const [showGrid, setShowGrid] = useState(true);
  const [smoothCurve, setSmoothCurve] = useState(true);

  const chartData = useMemo(() => {
    const slice = period === '30d' && data.length > 6 ? data.slice(-6) : data.slice(-6);
    return slice.length > 0 ? slice : data;
  }, [data, period]);

  const barColors = useMemo(
    () =>
      chartData.map((entry) =>
        entry.isHighlight ? 'var(--foreground)' : 'var(--muted-foreground)'
      ),
    [chartData]
  );

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  const resetToDefault = () => {
    setChartType('bar');
    setPeriod('7d');
    setShowGrid(true);
    setSmoothCurve(true);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-border">
        <h3 className="font-medium text-base text-foreground">{title}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Chart Type</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setChartType('bar')}>
                  Bar Chart {chartType === 'bar' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setChartType('line')}>
                  Line Chart {chartType === 'line' && '✓'}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time Period</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setPeriod('7d')}>
                  Last 7 days {period === '7d' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod('30d')}>
                  Last 30 days {period === '30d' && '✓'}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showGrid}
              onCheckedChange={(value) => setShowGrid(!!value)}
            >
              Show Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={smoothCurve}
              onCheckedChange={(value) => setSmoothCurve(!!value)}
              disabled={chartType === 'bar'}
            >
              Smooth Curve
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={resetToDefault}>Reset to Default</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-4">
        <div className="mb-4 space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground">{score}%</span>
            <span className="text-sm text-muted-foreground">{changeLabel}</span>
          </div>
          {subtitle ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {chartData.length < 2 ? (
          <div className="h-[175px] flex items-center justify-center text-sm text-muted-foreground rounded-lg border border-dashed border-border">
            Not enough data yet
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[175px] w-full aspect-auto">
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                {showGrid && (
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                )}
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis hide domain={[0, maxVal * 1.1]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} strokeWidth={0}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.label} fill={barColors[index]} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                {showGrid && (
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                )}
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis hide domain={[0, maxVal * 1.1]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type={smoothCurve ? 'monotone' : 'linear'}
                  dataKey="value"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: 'var(--foreground)',
                    stroke: 'var(--card)',
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            )}
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
