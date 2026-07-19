import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { TrendingUp, DollarSign, Briefcase, BarChart3, Search, Plus } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MortgageDashboardLayout } from "@/components/MortgageDashboardLayout";

export default function InvestorDashboard() {
  const [riskTierFilter, setRiskTierFilter] = useState<string>('');
  const [isInvestDialogOpen, setIsInvestDialogOpen] = useState(false);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [selectedPool, setSelectedPool] = useState<any>(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [maturityMonths, setMaturityMonths] = useState('12');
  const [registrationForm, setRegistrationForm] = useState({
    investorName: '',
    investorType: 'individual' as 'institutional' | 'individual' | 'fund' | 'bank',
    contactEmail: '',
    contactPhone: '',
    minInvestmentAmount: '100000',
    maxInvestmentAmount: '',
    preferredRiskTiers: ['a', 'aa'],
  });

  const { lastMessage } = useWebSocket({
    url: '/ws/mortgage-events',
    onMessage: (message) => {
      if (message.type === 'pool_created' || message.type === 'distribution_processed' || message.type === 'investment_created') {
        toast.info('Investment update received', {
          description: 'Your portfolio has been updated',
        });
      }
    },
  });

  const utils = trpc.useUtils();
  const { data: investor, isLoading: investorLoading } = trpc.secondaryMarket.getMyInvestorProfile.useQuery();
  const { data: performance } = trpc.secondaryMarket.getPerformanceReport.useQuery(
    { investorId: investor?.investorId || '' },
    { enabled: !!investor?.investorId },
  );
  const { data: availablePools = [] } = trpc.secondaryMarket.getAvailablePools.useQuery({
    riskTier: riskTierFilter ? (riskTierFilter as 'aaa' | 'aa' | 'a' | 'bbb' | 'bb' | 'b') : undefined,
  });
  const { data: investorDetails } = trpc.secondaryMarket.getInvestorDetails.useQuery(
    { investorId: investor?.investorId || '' },
    { enabled: !!investor?.investorId },
  );

  const registerInvestor = trpc.secondaryMarket.registerInvestor.useMutation({
    onSuccess: async () => {
      await utils.secondaryMarket.getMyInvestorProfile.invalidate();
      toast.success('Investor registration completed successfully');
      setIsRegisterDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to register investor');
    },
  });

  const createInvestment = trpc.secondaryMarket.createInvestment.useMutation({
    onSuccess: async () => {
      toast.success('Investment created successfully');
      setIsInvestDialogOpen(false);
      setSelectedPool(null);
      setInvestmentAmount('');
      await utils.secondaryMarket.getPerformanceReport.invalidate();
      await utils.secondaryMarket.getAvailablePools.invalidate();
      await utils.secondaryMarket.getInvestorDetails.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (investor) {
      setRegistrationForm((current) => ({
        ...current,
        investorName: current.investorName || investor.investorName || '',
        contactEmail: current.contactEmail || investor.contactEmail || '',
        contactPhone: current.contactPhone || investor.contactPhone || '',
      }));
    }
  }, [investor]);

  useEffect(() => {
    if (lastMessage && investor?.investorId) {
      utils.secondaryMarket.getPerformanceReport.invalidate();
      utils.secondaryMarket.getAvailablePools.invalidate();
      utils.secondaryMarket.getInvestorDetails.invalidate();
    }
  }, [lastMessage, investor?.investorId, utils]);

  const handleRegisterInvestor = () => {
    if (!registrationForm.investorName || !registrationForm.contactEmail || !registrationForm.contactPhone) {
      toast.error('Please complete all investor registration fields');
      return;
    }

    registerInvestor.mutate({
      investorName: registrationForm.investorName,
      investorType: registrationForm.investorType,
      contactEmail: registrationForm.contactEmail,
      contactPhone: registrationForm.contactPhone,
      minInvestmentAmount: Math.floor(Number(registrationForm.minInvestmentAmount) * 100),
      maxInvestmentAmount: registrationForm.maxInvestmentAmount ? Math.floor(Number(registrationForm.maxInvestmentAmount) * 100) : undefined,
      preferredRiskTiers: registrationForm.preferredRiskTiers,
    });
  };

  const handleInvest = () => {
    if (!investor?.investorId || !selectedPool) return;

    const amount = Math.floor(parseFloat(investmentAmount) * 100);
    const months = parseInt(maturityMonths);

    createInvestment.mutate({
      investorId: investor.investorId,
      poolId: selectedPool.poolId,
      investmentAmount: amount,
      expectedReturnRate: selectedPool.averageInterestRate,
      maturityMonths: months,
    });
  };

  if (investorLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading investor dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Investor Registration Required</CardTitle>
            <CardDescription>
              You need to register as an investor to access this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Complete your investor profile once to unlock pool browsing, portfolio tracking, and investment actions.
            </p>
            <Button onClick={() => setIsRegisterDialogOpen(true)}>Register as Investor</Button>
          </CardContent>
        </Card>

        <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Investor Profile</DialogTitle>
              <DialogDescription>Provide your investor details to access the marketplace and portfolio workflows.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="investor-name">Investor Name</Label>
                <Input id="investor-name" value={registrationForm.investorName} onChange={(e) => setRegistrationForm({ ...registrationForm, investorName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="investor-email">Contact Email</Label>
                <Input id="investor-email" type="email" value={registrationForm.contactEmail} onChange={(e) => setRegistrationForm({ ...registrationForm, contactEmail: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="investor-phone">Contact Phone</Label>
                <Input id="investor-phone" value={registrationForm.contactPhone} onChange={(e) => setRegistrationForm({ ...registrationForm, contactPhone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="investor-type">Investor Type</Label>
                <Select value={registrationForm.investorType} onValueChange={(value: 'institutional' | 'individual' | 'fund' | 'bank') => setRegistrationForm({ ...registrationForm, investorType: value })}>
                  <SelectTrigger id="investor-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="institutional">Institutional</SelectItem>
                    <SelectItem value="fund">Fund</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-investment">Minimum Investment (₦)</Label>
                  <Input id="min-investment" type="number" value={registrationForm.minInvestmentAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, minInvestmentAmount: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="max-investment">Maximum Investment (₦)</Label>
                  <Input id="max-investment" type="number" value={registrationForm.maxInvestmentAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, maxInvestmentAmount: e.target.value })} placeholder="Optional" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRegisterDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleRegisterInvestor} disabled={registerInvestor.isPending}>{registerInvestor.isPending ? 'Registering...' : 'Complete Registration'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500',
    inactive: 'bg-gray-500',
    suspended: 'bg-red-500',
  };

  const investmentStatusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    active: 'bg-green-500',
    matured: 'bg-blue-500',
    cancelled: 'bg-red-500',
  };

  const riskTierColors: Record<string, string> = {
    aaa: 'bg-green-600',
    aa: 'bg-green-500',
    a: 'bg-blue-500',
    bbb: 'bg-yellow-500',
    bb: 'bg-orange-500',
    b: 'bg-red-500',
  };

  return (
    <MortgageDashboardLayout>
      <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Investor Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Browse loan pools, manage investments, and track your portfolio performance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{((performance?.performance?.totalInvested || 0) / 100).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all investments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₦{((performance?.performance?.totalReturns || 0) / 100).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Lifetime earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance?.performance?.roi || 0}%</div>
            <p className="text-xs text-muted-foreground">Return on investment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Investments</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance?.performance?.activeInvestments || 0}</div>
            <p className="text-xs text-muted-foreground">Currently earning returns</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Available Loan Pools</CardTitle>
          <CardDescription>Browse and filter investment-ready pools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <Select value={riskTierFilter || 'all'} onValueChange={(value) => setRiskTierFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filter by risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk tiers</SelectItem>
                <SelectItem value="aaa">AAA</SelectItem>
                <SelectItem value="aa">AA</SelectItem>
                <SelectItem value="a">A</SelectItem>
                <SelectItem value="bbb">BBB</SelectItem>
                <SelectItem value="bb">BB</SelectItem>
                <SelectItem value="b">B</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {availablePools.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pools currently match the selected criteria.</div>
            ) : (
              availablePools.map((pool: any) => (
                <Card key={pool.poolId}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">{pool.poolName}</CardTitle>
                      <Badge className={riskTierColors[pool.riskTier] || 'bg-slate-500'}>{pool.riskTier?.toUpperCase()}</Badge>
                    </div>
                    <CardDescription>{pool.poolDescription || 'Loan pool available for secondary-market investment'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">Pool Size</div>
                    <div className="font-semibold">₦{(pool.totalLoanAmount / 100).toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Average Rate</div>
                    <div className="font-semibold">{(pool.averageInterestRate / 100).toFixed(2)}% APR</div>
                    <Button className="w-full" onClick={() => { setSelectedPool(pool); setIsInvestDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" /> Invest in Pool
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="distributions">Distributions</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle>My Investments</CardTitle>
              <CardDescription>Track all current and past investments.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Expected Return</TableHead>
                    <TableHead>Distributions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Maturity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!investorDetails?.investments || investorDetails.investments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">No investments yet</TableCell>
                    </TableRow>
                  ) : (
                    investorDetails.investments.map((investment: any) => (
                      <TableRow key={investment.id}>
                        <TableCell className="font-medium">{investment.pool?.poolName || 'Unknown Pool'}</TableCell>
                        <TableCell>₦{(investment.investmentAmount / 100).toLocaleString()}</TableCell>
                        <TableCell>
                          ₦{(investment.expectedReturn / 100).toLocaleString()}
                          <span className="text-muted-foreground text-xs ml-1">({(investment.expectedReturnRate / 100).toFixed(2)}%)</span>
                        </TableCell>
                        <TableCell>₦{(investment.totalDistributions / 100).toLocaleString()}</TableCell>
                        <TableCell><Badge className={investmentStatusColors[investment.status]}>{investment.status.toUpperCase()}</Badge></TableCell>
                        <TableCell>{new Date(investment.maturityDate).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distributions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribution History</CardTitle>
              <CardDescription>Track your investment returns</CardDescription>
            </CardHeader>
            <CardContent>
              {performance?.investments?.summary && performance.investments.summary.length > 0 ? (
                <div className="space-y-4">
                  {performance.investments.summary.map((item: any) => (
                    <div key={item.status} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Badge className={investmentStatusColors[item.status]}>{item.status.toUpperCase()}</Badge>
                        <div>
                          <p className="font-medium">{item.count} investment{item.count !== 1 ? 's' : ''}</p>
                          <p className="text-sm text-muted-foreground">Total distributions: ₦{((item.totalDistributions || 0) / 100).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg">₦{((item.totalAmount || 0) / 100).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Total invested</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No distribution history</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isInvestDialogOpen} onOpenChange={setIsInvestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invest in Loan Pool</DialogTitle>
            <DialogDescription>
              {selectedPool && (
                <>
                  <span className="font-medium">{selectedPool.poolName}</span>
                  <Badge className={`${riskTierColors[selectedPool.riskTier]} ml-2`}>{selectedPool.riskTier.toUpperCase()}</Badge>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedPool && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-sm">
                <div>
                  <p className="text-muted-foreground">Pool Size</p>
                  <p className="font-semibold">₦{(selectedPool.totalLoanAmount / 100).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expected Return</p>
                  <p className="font-semibold">{(selectedPool.averageInterestRate / 100).toFixed(2)}% APR</p>
                </div>
              </div>

              <div>
                <Label htmlFor="investmentAmount">Investment Amount (₦)</Label>
                <Input id="investmentAmount" type="number" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="Enter amount" min={investor.minInvestmentAmount / 100} max={investor.maxInvestmentAmount ? investor.maxInvestmentAmount / 100 : undefined} />
                <p className="text-xs text-muted-foreground mt-1">
                  Min: ₦{(investor.minInvestmentAmount / 100).toLocaleString()}
                  {investor.maxInvestmentAmount && ` | Max: ₦${(investor.maxInvestmentAmount / 100).toLocaleString()}`}
                </p>
              </div>

              <div>
                <Label htmlFor="maturityMonths">Investment Term (Months)</Label>
                <Select value={maturityMonths} onValueChange={setMaturityMonths}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                    <SelectItem value="36">36 months</SelectItem>
                    <SelectItem value="60">60 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {investmentAmount && (
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-sm font-medium mb-2">Estimated Returns</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₦{((parseFloat(investmentAmount) * (selectedPool.averageInterestRate / 10000) * parseInt(maturityMonths)) / 12).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Over {maturityMonths} months at {(selectedPool.averageInterestRate / 100).toFixed(2)}% APR</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInvestDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleInvest} disabled={createInvestment.isPending || !investmentAmount}>{createInvestment.isPending ? 'Processing...' : 'Confirm Investment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </MortgageDashboardLayout>
  );
}
