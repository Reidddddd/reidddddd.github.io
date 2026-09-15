window.MYHS_API_CONFIG = {
  // auto 会根据页面地址选择 local 或 production；测试环境可改为 test。
  environment: 'auto',
  environments: {
    local: {
      baseUrl: 'http://127.0.0.1:8888',
      headers: {},
    },
    test: {
      // 有测试服务时填写对应地址，并将上面的 environment 改为 test。
      baseUrl: '',
      headers: {},
    },
    production: {
      baseUrl: 'https://trimming-algebra-credible.ngrok-free.dev',
      headers: {'ngrok-skip-browser-warning': '1'},
    },
  },
};
