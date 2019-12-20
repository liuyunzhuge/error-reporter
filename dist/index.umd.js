(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.EventReporter = factory());
}(this, (function () { 'use strict';

    function noop() {}

    function isOBJByType(o, type) {
      return Object.prototype.toString.call(o) === '[object ' + (type || 'Object') + ']';
    }

    function processStackMsg(error) {
      var stack = error.stack.replace(/\n/gi, '') // replace line separator
      .split(/\bat\b/) // replace 'at' with '@' in error source like 'at window.makeError (http://localhost:8080/test.js?a=1&b=2:3:5)'
      .slice(0, config.maximumStackLines) // limit maximum stack lines
      .join('@').replace(/\?[^:]+/gi, ''); // clear query string in error source like 'http://localhost:8080/test.js?a=1&b=2'

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
      if (vConsole) {
        try {
          vConsole.show();
        } catch (e) {}
      }
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
          // console[item.logType].apply(console, item.logs) // this will make cached logs printed twice in the browser console panel
          // make cached logs printed only in the vConsolePanel
          // based on `noOrigin` property of vConsole log entry
          logCache[i].noOrigin = true;
          vConsole.pluginList["default"].printLog(logCache[i]);
        }

        logCache = [];
      });
    }

    addProxyToConsole();
    var config = {
      vConsoleSrc: '//cdn.bootcss.com/vConsole/3.3.4/vconsole.min.js',
      maximumStackLines: 20,
      onReport: noop
    };
    var vConsole = null; // VConsole instance

    var logCache = [];
    var cacheEnabled = true; // https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror

    window.onerror = function (message, source, lineno, colno, error) {
      var newMessage = message;

      if (error && error.stack) {
        newMessage = processStackMsg(error);
      } // there is a doubt: could this happen?


      if (isOBJByType(newMessage, 'Event')) {
        newMessage += newMessage.type ? '--' + newMessage.type + '--' + (newMessage.target ? newMessage.target.tagName + '::' + newMessage.target.src : '') : '';
      }

      if (message.toLowerCase().indexOf('script error') > -1) {
        // this is caused by scripts of different origin
        // the details of the error are not reported to prevent leaking information
        // more details can be shown in https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror
        // you can use `crossorigin attribute on <script> tag` and `cors for script file` to make error details available
        console.error('Script Error: See Browser Console for Detail');
      } else {
        config.onReport(newMessage);
      }

      return false;
    };

    var index = {
      setConfig: function setConfig(settings) {
        Object.assign(config, settings);
      },
      enableVConsole: enableVConsole,
      loadScript: loadScript
    };

    return index;

})));
