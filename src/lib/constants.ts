export const AppFonts = '"MiSans VF", NotoColorEmoji, system-ui, sans-serif';

export const FRONTEND_URL = import.meta.env.DEV
  ? 'https://dev-frontend.home.liziyi0914.com:9443'
  // ? 'http://127.0.0.1:8000'
  : 'https://wanxunst.com';

// export const FRONTEND_URL = import.meta.env.DEV
//   ? 'http://localhost:8008'
//   : 'https://sso.xubei.games';

// export const BACKEND_URL = import.meta.env.DEV
//   ? 'http://localhost:8080'
//   : 'https://api.sso.xubei.games:9443';

export const BACKEND_URL = import.meta.env.DEV
  ? 'https://dev-backend.home.liziyi0914.com:9443'
  // ? 'http://127.0.0.1:8080'
  : 'https://api.wanxunst.com';

// export const OSS_URL = import.meta.env.DEV
//   ? 'https://ali-cdn-dev.xubei.games'
//   : 'https://';
export const OSS_URL = import.meta.env.DEV
  ? 'https://training.cdn.wanxunst.com'
  : 'https://training.cdn.wanxunst.com';

// export const ALIYUN_CAPTCHA = import.meta.env.DEV
//   ? {
//     prefix: '1wxi9h',
//     sceneId: 'b2lfho02',
//   }
//   : {
//     prefix: '1wxi9h',
//     sceneId: 'b2lfho02',
//   };

export const ALIYUN_CAPTCHA = import.meta.env.DEV
  ? {
    prefix: 'e2u6bt',
    sceneId: 'id1y5d75',
  }
  : {
    prefix: 'e2u6bt',
    sceneId: 'id1y5d75',
  };
