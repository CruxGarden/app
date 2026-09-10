export const isTauri = () => false;
export const openExternal = async (url: string) => {
  if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
};
