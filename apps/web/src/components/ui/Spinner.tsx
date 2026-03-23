const SIZES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
} as const;

export function Spinner({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <div
      className={`animate-spin ${SIZES[size]} border-2 border-gray-300 border-t-gray-600 rounded-full`}
    />
  );
}
