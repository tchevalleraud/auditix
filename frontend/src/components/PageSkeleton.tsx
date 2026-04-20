export default function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-96 rounded bg-slate-100 dark:bg-slate-900" />
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-9 w-64 rounded-md bg-slate-100 dark:bg-slate-900" />
        <div className="h-9 w-24 rounded-md bg-slate-100 dark:bg-slate-900" />
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="h-10 bg-slate-100 dark:bg-slate-900" />
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-white dark:bg-slate-950" />
          ))}
        </div>
      </div>
    </div>
  );
}
