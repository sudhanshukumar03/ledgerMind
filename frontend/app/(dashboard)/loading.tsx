import { C } from '../../lib/tokens';

export default function Loading() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex justify-between items-end">
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 w-64 bg-gray-100 rounded"></div>
        </div>
        <div className="flex gap-4">
          <div className="h-10 w-24 bg-gray-200 rounded-md"></div>
          <div className="h-10 w-32 bg-gray-200 rounded-md"></div>
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-5 h-28 bg-gray-50 flex flex-col justify-between" style={{ borderColor: C.border }}>
            <div className="h-4 w-24 bg-gray-200 rounded"></div>
            <div className="h-8 w-32 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>

      {/* Main content split skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4"></div>
          <div className="card h-64 bg-gray-50" style={{ borderColor: C.border }}></div>
        </div>
        <div className="space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4"></div>
          <div className="card h-64 bg-gray-50" style={{ borderColor: C.border }}></div>
        </div>
      </div>
    </div>
  );
}
