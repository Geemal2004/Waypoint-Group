import { useQuery } from '@tanstack/react-query'
import { ClipboardList, PackageCheck, Truck, Store, ArrowRight } from 'lucide-react'

interface Network { name: string; implementationStage: string; brands: {code: string; name: string; outletCount: number}[]; depots: number }
async function getNetwork(): Promise<Network> {
  const response = await fetch('/api/v1/network')
  if (!response.ok) throw new Error('The core service is unavailable.')
  return response.json()
}
const roles = [
  {name: 'Dispatcher', icon: ClipboardList, description: 'Plan capacity, publish runs and resolve exceptions.'},
  {name: 'Loader', icon: PackageCheck, description: 'Verify the load in stop sequence before departure.'},
  {name: 'Driver', icon: Truck, description: 'Follow assigned stops and preserve delivery evidence.'},
  {name: 'Store manager', icon: Store, description: 'Place orders, prepare receiving and confirm receipt.'},
]

export function App() {
  const query = useQuery({queryKey: ['network'], queryFn: getNetwork})
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><span className="font-semibold tracking-tight">WAYPOINT <span className="text-primary">GROUP</span></span><span className="rounded-md bg-muted px-3 py-1 text-xs">Foundation milestone</span></div></header>
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">Connected delivery operations</p>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Every delivery begins<br/>with a promise.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">The application foundation is running. Role workflows, authentication, allocation and delivery sync are the next implementation milestones.</p>
      <section aria-label="Service connection" className="mt-8 rounded-lg border border-border bg-card p-5">
        {query.isPending ? <p role="status">Connecting to the core service…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button className="mt-3 min-h-12 text-primary underline" onClick={() => query.refetch()}>Retry connection</button></div> : <><p className="text-sm font-medium">Connected to PostgreSQL through the core API · {query.data.depots} depots</p><div className="mt-4 flex flex-wrap gap-3">{query.data.brands.map(brand => <span key={brand.code} className="rounded-md border border-border px-3 py-2 text-sm">{brand.name} · {brand.outletCount} outlets</span>)}</div></>}
      </section>
      <section aria-label="Implementation roles" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{roles.map(role => <article className="rounded-lg border border-border bg-card p-5" key={role.name}><role.icon className="mb-5 h-6 w-6 text-muted-foreground" aria-hidden/><h2 className="font-semibold">{role.name}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{role.description}</p><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">Workflow not implemented <ArrowRight className="h-3 w-3" aria-hidden/></p></article>)}</section>
    </main>
  </div>
}
