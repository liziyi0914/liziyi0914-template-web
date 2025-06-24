export const AppFonts = '"MiSans VF", NotoColorEmoji, system-ui, sans-serif';

export const FRONTEND_URL = import.meta.env.DEV
  ? 'http://localhost:8008'
  : 'https://sso.xubei.games';

export const BACKEND_URL = import.meta.env.DEV
  ? 'http://localhost:8080'
  : 'https://api.sso.xubei.games:9443';
