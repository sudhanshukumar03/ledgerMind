import { C } from '../../lib/tokens';

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex justify-between items-end">
        <div>
          <div className="h-8 w-48 rounded mb-2" style={{ backgroundColor: C.neutralTint }}></div>
          <div className="h-4 w-64 rounded" style={{ backgroundColor: C.neutralTint }}></div>
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 rounded-md" style={{ backgroundColor: C.neutralTint }}></div>
          <div className="h-10 w-32 rounded-md" style={{ backgroundColor: C.neutralTint }}></div>
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-5 h-28 flex flex-col justify-between" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <div className="h-4 w-24 rounded" style={{ backgroundColor: C.neutralTint }}></div>
            <div className="h-8 w-32 rounded" style={{ backgroundColor: C.neutralTint }}></div>
          </div>
        ))}
      </div>

      {/* Main content split skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-6 w-40 rounded mb-4" style={{ backgroundColor: C.neutralTint }}></div>
          <div className="card h-64" style={{ borderColor: C.border, backgroundColor: C.surface }}></div>
        </div>
        <div className="lg:col-span-1">
          <div className="h-6 w-40 rounded mb-4" style={{ backgroundColor: C.neutralTint }}></div>
          <div className="card h-64" style={{ borderColor: C.border, backgroundColor: C.surface }}></div>
        </div>
      </div>
    </div>
  );
}
