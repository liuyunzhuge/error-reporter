'use strict';

/* eslint-disable no-useless-escape */
function isObjectType(o, type) {
  return Object.prototype.toString.call(o) === '[object ' + (type || 'Object') + ']';
}

function processStackMsg(error) {
  // 1. clean line separator
  // 2. replace 'at' with '@' in error source like 'at window.makeError (http://localhost:8080/test.js?a=1&b=2:3:5)'
  // 3. limit maximum stack lines
  // 4. clean query string in error source like 'http://localhost:8080/test.js?a=1&b=2'
  var stack = error.stack.replace(/\n/gi, '') // 1
  .split(/\bat\b/) // 2
  .slice(0, config.maximumStackLines) // 3
  .join('@').replace(/\?[^:]+/gi, ''); // 4

  var msg = error.toString();

  if (stack.indexOf(msg) < 0) {
    stack = msg + '@' + stack;
  }

  return stack;
}

function loadScript(src, callback) {
  var s, r, t;
  r = false;
  s = document.createElement('script');
  s.type = 'text/javascript';
  s.src = src;

  s.onload = s.onreadystatechange = function () {
    if (!r && (!this.readyState || this.readyState === 'complete')) {
      r = true;
      isObjectType(callback, 'Function') && callback();
    }
  };

  t = document.getElementsByTagName('script')[0];
  t.parentNode.insertBefore(s, t);
}

function addConsoleProxy() {
  var consoleMethods = ['log', 'info', 'warn', 'debug', 'error'];
  consoleMethods.forEach(function (methodName) {
    var method = console[methodName];

    console[methodName] = function () {
      cacheEnabled && logCache.push({
        logType: methodName,
        logs: arguments
      });
      return method.apply(console, arguments);
    };
  });
}

function enableVConsole(show) {
  if (vConsole && show) {
    return vConsole.show();
  }

  loadScript(config.vConsoleSrc, function () {
    if (!vConsole) {
      // eslint-disable-next-line no-undef
      vConsole = new VConsole({
        defaultPlugins: ['system', 'network', 'element', 'storage'],
        maxLogNumber: 5000,
        onReady: function onReady() {
          show && setTimeout(function () {
            return vConsole.show();
          }, 0);
        }
      });
    }

    cacheEnabled = false;
    var len = logCache.length;

    for (var i = 0; i < len; i++) {
      // if use this, will make cached logs printed twice in the browser console panel
      // console[item.logType].apply(console, item.logs)
      // make cached logs printed only in the vConsolePanel
      // based on `noOrigin` property of vConsole log entry
      logCache[i].noOrigin = true;
      vConsole.pluginList["default"].printLog(logCache[i]);
    }

    logCache = [];
  });
}

function getSystemInfo() {
  var ua = navigator.userAgent; // device & system

  var ipod = ua.match(/(ipod).*\s([\d_]+)/i);
  var ipad = ua.match(/(ipad).*\s([\d_]+)/i);
  var iphone = ua.match(/(iphone)\sos\s([\d_]+)/i);
  var android = ua.match(/(android)\s([\d\.]+)/i);
  var system = 'Unknown';
  var systemVersion = '';

  if (android) {
    system = 'Android';
    systemVersion = android[2];
  } else if (iphone) {
    system = 'iPhone';
    systemVersion = 'iOS' + iphone[2].replace(/_/g, '.');
  } else if (ipad) {
    system = 'iPad';
    systemVersion = 'iOS' + ipad[2].replace(/_/g, '.');
  } else if (ipod) {
    system = 'iPod';
    systemVersion = 'iOS' + ipod[2].replace(/_/g, '.');
  } // wechat


  var microMessenger = ua.match(/MicroMessenger\/([\d\.]+)/i);
  var wechat = false;
  var wechatVersion = '';
  var wechatMini = false;

  if (microMessenger && microMessenger[1]) {
    wechat = true;
    wechatVersion = microMessenger[1];

    if (window.__wxjs_environment === 'miniprogram' || /miniProgram/i.test(ua)) {
      wechatMini = true;
    }
  } // network type


  var network = ua.toLowerCase().match(/ nettype\/([^ ]+)/g);
  var netType = 'Unknown';

  if (network && network[0]) {
    network = network[0].split('/');
    netType = network[1];
  }

  return {
    system: system,
    systemVersion: systemVersion,
    netType: netType,
    ua: ua,
    wechat: wechat,
    wechatVersion: wechatVersion,
    wechatMini: wechatMini
  };
}

function getCookie(name) {
  var sName = encodeURIComponent(name).replace(/[-.+*]/g, '\\$&');
  var regExp = new RegExp("(?:(?:^|.*;)\\s*".concat(sName, "\\s*\\=\\s*([^;]*).*$)|^.*$"));
  return decodeURIComponent(document.cookie.replace(regExp, '$1')) || null;
} // Feature 1. using window.onerror to collect javascript runtime error
// https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror


function tryRuntimeReport() {
  var oldOnerror = window.onerror;

  window.onerror = function (message, source, lineno, colno, error) {
    var newMessage = message;
    if (notToReport(error)) return;

    if (error && error.stack) {
      newMessage = config.processStack(error);
    }

    if (message.toLowerCase().indexOf('script error') > -1) {
      // this is caused by scripts of different origin
      // the details of the error are not reported to prevent leaking information
      // more details can be shown in https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror
      // you can use `crossorigin attribute on <script> tag` and `cors for script file` to make error details available
      console.error('Script Error: See Browser Console for Detail');
    } else {
      config.onReport.call(ErrorReporter, newMessage, REPORT_TYPE.RUNTIME);
    }

    return isObjectType(oldOnerror, 'Function') ? oldOnerror.apply(this, [message, source, lineno, colno, error]) : false;
  };
} // Feature 2. use capture phase of window `error` event to collect resource loading errors
// `error` event does not bubble, so `window.onerror` cannot known resource loading errors
// but you can catch such errors using the capture phase of `error` event


function tryResourceReport() {
  config.resource && window.addEventListener('error', function (event) {
    if (event.target && (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement || event.target instanceof HTMLImageElement)) {
      var message = '--' + event.type + '--' + event.target.tagName.toLowerCase() + '::' + (event.target.src || event.target.href);
      config.onResourceLoadError.call(ErrorReporter, event);
      config.onReport.call(ErrorReporter, message, REPORT_TYPE.RESOURCE);
    }
  }, true);
} // Feature 3. handle errors for frameworks


function tryFrameWorksReport() {
  // handle errors for `vue`
  if (config.vue) {
    var oldVueErrorHandler = config.vue.config.errorHandler;

    config.vue.config.errorHandler = function (err, vm, info) {
      console.error(err);
      makeReport(err, REPORT_TYPE.VUE);
      return isObjectType(oldVueErrorHandler, 'Function') && oldVueErrorHandler(err, vm, info);
    };
  } // handle errors for vue router


  if (config.vueRouter) {
    config.vueRouter.onError(function (err) {
      console.error(err);
      makeReport(err, REPORT_TYPE.VUE_ROUTER);
    });
  } // handle errors for axios


  if (config.axios) {
    var resolveReportConfig = function resolveReportConfig(axiosConfig) {
      var ret = {};
      var reportConfig = config.axiosReportConfig || ['url', 'method', 'params', 'data', 'headers'];
      reportConfig.forEach(function (key) {
        ret[key] = axiosConfig[key];
      });
      return ret;
    };

    var handleErr = function handleErr(type, err) {
      console.error(err);
      var axiosIgnore = config.axiosIgnore;
      var axiosConfig = err.config;

      var reject = function reject(err) {
        // set `notToReport` to prevent other report task, such as `unhandledrejection`
        err.notToReport = true;
        return Promise.reject(err);
      };

      if (axiosIgnore) {
        if (isObjectType(axiosIgnore, 'Array') && axiosIgnore.some(function (i) {
          return new RegExp(i).test(axiosConfig.url);
        })) {
          return reject(err);
        } else if (isObjectType(axiosIgnore, 'Function') && axiosIgnore(err)) {
          return reject(err);
        }
      }

      var reportConfig = resolveReportConfig(axiosConfig);
      makeReport(err, type, reportConfig);
      return reject(err);
    };

    config.axios.interceptors.request.use(function (config) {
      return config;
    }, function (err) {
      return handleErr(REPORT_TYPE.AXIOS_REQUEST, err);
    });
    config.axios.interceptors.response.use(function (resp) {
      return resp;
    }, function (err) {
      return handleErr(REPORT_TYPE.AXIOS_RESPONSE, err);
    });
  }
} // Feature 4. handle unhandled rejection for promises


function tryUnhandledRejectionReport() {
  config.unhandledRejection && window.addEventListener('unhandledrejection', function (event) {
    if (event.reason === undefined) return;
    var err = event.reason instanceof Error ? event.reason : String(event.reason);
    makeReport(err, REPORT_TYPE.UNHANDLED_REJECTION);
  });
}

function notToReport(err) {
  if (!err) return false;

  if (err instanceof Error) {
    if (err.notToReport) {
      return true;
    }

    if (config.notReportErrors.some(function (errClass) {
      return err instanceof errClass;
    })) {
      return true;
    }
  }

  return false;
}

function wrapNotReport(err) {
  if (err instanceof Error) {
    err.notToReport = true;
  }

  return err;
}

function makeReport(err, reportType) {
  var extraData = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var error = err;

  if (isObjectType(err, 'String')) {
    error = new Error(err);
  }

  if (notToReport(error)) return;
  return config.onReport.call(ErrorReporter, config.processStack(error), reportType || REPORT_TYPE.MANUAL, extraData);
}

function setConfig(settings) {
  Object.assign(config, settings);
  tryRuntimeReport();
  tryResourceReport();
  tryFrameWorksReport();
  tryUnhandledRejectionReport();
}

var REPORT_TYPE = {
  RUNTIME: 'runtime',
  RESOURCE: 'resource',
  VUE: 'vue',
  VUE_ROUTER: 'vue-router',
  MANUAL: 'manual',
  AXIOS_REQUEST: 'axios-request',
  AXIOS_RESPONSE: 'axios-response',
  UNHANDLED_REJECTION: 'unhandledrejection'
};

var noop = function noop() {};

var config = {
  vConsoleSrc: '//cdn.bootcss.com/vConsole/3.3.4/vconsole.min.js',
  maximumStackLines: 20,
  resource: true,
  unhandledRejection: true,
  vue: null,
  vueRouter: null,
  axios: null,
  axiosReportConfig: null,
  axiosIgnore: null,
  notReportErrors: [],
  processStack: processStackMsg,
  onReport: noop,
  onResourceLoadError: noop
};
var vConsole = null;
var logCache = [];
var cacheEnabled = true;
var ErrorReporter = {
  setConfig: setConfig,
  enableVConsole: enableVConsole,
  loadScript: loadScript,
  getSystemInfo: getSystemInfo,
  getCookie: getCookie,
  makeReport: makeReport,
  wrapNotReport: wrapNotReport
};
addConsoleProxy();

module.exports = ErrorReporter;
