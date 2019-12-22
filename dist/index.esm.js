/* eslint-disable no-useless-escape */
function isOBJByType(o, type) {
  return Object.prototype.toString.call(o) === '[object ' + (type || 'Object') + ']';
}

function processStackMsg(error) {
  var stack = error.stack.replace(/\n/gi, '') // clean line separator
  .split(/\bat\b/) // replace 'at' with '@' in error source like 'at window.makeError (http://localhost:8080/test.js?a=1&b=2:3:5)'
  .slice(0, config.maximumStackLines) // limit maximum stack lines
  .join('@').replace(/\?[^:]+/gi, ''); // clean query string in error source like 'http://localhost:8080/test.js?a=1&b=2'

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
    // console.log(this.readyState) // uncomment this line to see which ready states are called.
    if (!r && (!this.readyState || this.readyState === 'complete')) {
      r = true;
      isOBJByType(callback, 'Function') && callback();
    }
  };

  t = document.getElementsByTagName('script')[0];
  t.parentNode.insertBefore(s, t);
}

function addProxyToConsole() {
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

function showVConsole() {
  try {
    vConsole && vConsole.show();
  } catch (e) {}
}

function enableVConsole(show) {
  if (vConsole && show) {
    return showVConsole();
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
      // console[item.logType].apply(console, item.logs) // if use this, will make cached logs printed twice in the browser console panel
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
  } // wechat client version


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
}

addProxyToConsole();
var config = {
  vConsoleSrc: '//cdn.bootcss.com/vConsole/3.3.4/vconsole.min.js',
  maximumStackLines: 20,
  onReport: function onReport() {}
};
var vConsole = null; // VConsole instance

var logCache = [];
var cacheEnabled = true; // 1. using window.onerror to collect javascript runtime error
// https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror

var oldOnerror = window.onerror;

window.onerror = function (message, source, lineno, colno, error) {
  var newMessage = message;

  if (error && error.stack) {
    newMessage = processStackMsg(error);
  }

  if (message.toLowerCase().indexOf('script error') > -1) {
    // this is caused by scripts of different origin
    // the details of the error are not reported to prevent leaking information
    // more details can be shown in https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror
    // you can use `crossorigin attribute on <script> tag` and `cors for script file` to make error details available
    console.error('Script Error: See Browser Console for Detail');
  } else {
    config.onReport.call(ErrorReporter, newMessage);
  }

  return isOBJByType(oldOnerror, 'Function') ? oldOnerror.apply(this, [message, source, lineno, colno, error]) : false;
}; // 2. use capture phase of window `error` event to collect resource loading errors
// `error` event does not bubble, so `window.onerror` cannot known resource loading errors
// but you can catch such errors using the capture phase of `error` event


window.addEventListener('error', function (event) {
  if (isOBJByType(event, 'Event') && (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement || event.target instanceof HTMLImageElement)) {
    var message = event.type ? '--' + event.type + '--' + (event.target ? event.target.tagName.toLowerCase() + '::' + event.target.src : '') : '';
    config.onReport.call(ErrorReporter, message);
  }
}, true);

function setConfig(settings) {
  Object.assign(config, settings);
}

var ErrorReporter = {
  setConfig: setConfig,
  enableVConsole: enableVConsole,
  loadScript: loadScript,
  getSystemInfo: getSystemInfo,
  getCookie: getCookie
};

export default ErrorReporter;
