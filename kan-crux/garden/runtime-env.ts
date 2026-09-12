export const env = (key: string) => (key === 'NEXT_PUBLIC_KAN_ENV' ? 'local' : undefined);
