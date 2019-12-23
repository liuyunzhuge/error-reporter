/* eslint-disable no-useless-escape */
function isOBJByType (o, type) {
    return Object.prototype.toString.call(o) === '[object ' + (type || 'Object') + ']'
}

function processStackMsg (error) {
    // 1. clean line separator
    // 2. replace 'at' with '@' in error source like 'at window.makeError (http://localhost:8080/test.js?a=1&b=2:3:5)'
    // 3. limit maximum stack lines
    // 4. clean query string in error source like 'http://localhost:8080/test.js?a=1&b=2'

    let stack = error.stack
        .replace(/\n/gi, '') // 1
        .split(/\bat\b/) // 2
        .slice(0, config.maximumStackLines) // 3
        .join('@')
        .replace(/\?[^:]+/gi, '') // 4
    let msg = error.toString()
    if (stack.indexOf(msg) < 0) {
        stack = msg + '@' + stack
    }
    return stack
}

function loadScript (src, callback) {
    let s,
        r,
        t
    r = false
    s = document.createElement('script')
    s.type = 'text/javascript'
    s.src = src
    s.onload = s.onreadystatechange = function () {
        if (!r && (!this.readyState || this.readyState === 'complete')) {
            r = true
            isOBJByType(callback, 'Function') && callback()
        }
    }
    t = document.getElementsByTagName('script')[0]
    t.parentNode.insertBefore(s, t)
}

function addProxyToConsole () {
    const consoleMethods = ['log', 'info', 'warn', 'debug', 'error']
    consoleMethods.forEach(function (methodName) {
        let method = console[methodName]
        console[methodName] = function () {
            cacheEnabled && logCache.push({
                logType: methodName,
                logs: arguments
            })

            return method.apply(console, arguments)
        }
    })
}

function showVConsole () {
    try {
        vConsole && vConsole.show()
    } catch (e) {
    }
}

function enableVConsole (show) {
    if (vConsole && show) {
        return showVConsole()
    }
    loadScript(config.vConsoleSrc, function () {
        if (!vConsole) {
            // eslint-disable-next-line no-undef
            vConsole = new VConsole({
                defaultPlugins: ['system', 'network', 'element', 'storage'],
                maxLogNumber: 5000,
                onReady () {
                    show && setTimeout(() => vConsole.show(), 0)
                }
            })
        }
        cacheEnabled = false

        let len = logCache.length
        for (let i = 0; i < len; i++) {
            // if use this, will make cached logs printed twice in the browser console panel
            // console[item.logType].apply(console, item.logs)

            // make cached logs printed only in the vConsolePanel
            // based on `noOrigin` property of vConsole log entry
            logCache[i].noOrigin = true
            vConsole.pluginList.default.printLog(logCache[i])
        }

        logCache = []
    })
}

function getSystemInfo () {
    let ua = navigator.userAgent

    // device & system
    let ipod = ua.match(/(ipod).*\s([\d_]+)/i)
    let ipad = ua.match(/(ipad).*\s([\d_]+)/i)
    let iphone = ua.match(/(iphone)\sos\s([\d_]+)/i)
    let android = ua.match(/(android)\s([\d\.]+)/i)

    let system = 'Unknown'
    let systemVersion = ''
    if (android) {
        system = 'Android'
        systemVersion = android[2]
    } else if (iphone) {
        system = 'iPhone'
        systemVersion = 'iOS' + iphone[2].replace(/_/g, '.')
    } else if (ipad) {
        system = 'iPad'
        systemVersion = 'iOS' + ipad[2].replace(/_/g, '.')
    } else if (ipod) {
        system = 'iPod'
        systemVersion = 'iOS' + ipod[2].replace(/_/g, '.')
    }
    // wechat client version
    let microMessenger = ua.match(/MicroMessenger\/([\d\.]+)/i)
    let wechat = false
    let wechatVersion = ''
    let wechatMini = false
    if (microMessenger && microMessenger[1]) {
        wechat = true
        wechatVersion = microMessenger[1]

        if (window.__wxjs_environment === 'miniprogram' || /miniProgram/i.test(ua)) {
            wechatMini = true
        }
    }

    // network type
    let network = ua.toLowerCase().match(/ nettype\/([^ ]+)/g)
    let netType = 'Unknown'
    if (network && network[0]) {
        network = network[0].split('/')
        netType = network[1]
    }

    return {
        system,
        systemVersion,
        netType,
        ua,
        wechat,
        wechatVersion,
        wechatMini
    }
}

function getCookie (name) {
    let sName = encodeURIComponent(name).replace(/[-.+*]/g, '\\$&')
    let regExp = new RegExp(`(?:(?:^|.*;)\\s*${sName}\\s*\\=\\s*([^;]*).*$)|^.*$`)
    return decodeURIComponent(document.cookie.replace(regExp, '$1')) || null
}

// Feature 1. using window.onerror to collect javascript runtime error
// https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror
function tryRuntimeReport () {
    let oldOnerror = window.onerror
    window.onerror = function (message, source, lineno, colno, error) {
        let newMessage = message

        if (error && error.stack) {
            newMessage = config.processStack(error)
        }

        if (message.toLowerCase().indexOf('script error') > -1) {
            // this is caused by scripts of different origin
            // the details of the error are not reported to prevent leaking information
            // more details can be shown in https://developer.mozilla.org/zh-CN/docs/Web/API/GlobalEventHandlers/onerror
            // you can use `crossorigin attribute on <script> tag` and `cors for script file` to make error details available
            console.error('Script Error: See Browser Console for Detail')
        } else {
            config.onReport.call(ErrorReporter, newMessage, REPORT_TYPE.RUNTIME)
        }

        return isOBJByType(oldOnerror, 'Function')
            ? oldOnerror.apply(this, [message, source, lineno, colno, error]) : false
    }
}

// Feature 2. use capture phase of window `error` event to collect resource loading errors
// `error` event does not bubble, so `window.onerror` cannot known resource loading errors
// but you can catch such errors using the capture phase of `error` event
function tryResourceReport () {
    config.resource && window.addEventListener('error', function (event) {
        if (event.target && (
            event.target instanceof HTMLScriptElement ||
            event.target instanceof HTMLLinkElement ||
            event.target instanceof HTMLImageElement
        )) {
            let message = '--' + event.type + '--' + event.target.tagName.toLowerCase() + '::' +
                (event.target.src || event.target.href)
            config.onResourceLoadError.call(ErrorReporter, event)
            config.onReport.call(ErrorReporter, message, REPORT_TYPE.RESOURCE)
        }
    }, true)
}

// Feature 3. handle errors for frameworks
function tryFrameWorksReport () {
    // handle errors for `vue`
    if (config.vue) {
        let oldVueErrorHandler = config.vue.config.errorHandler
        config.vue.config.errorHandler = function (err, vm, info) {
            console.error(err)
            config.onReport.call(ErrorReporter, config.processStack(err), REPORT_TYPE.VUE)
            return isOBJByType(oldVueErrorHandler, 'Function') &&
                oldVueErrorHandler(err, vm, info)
        }
    }
    // handle errors for vue router
    if (config.vueRouter) {
        config.vueRouter.onError(err => {
            console.error(err)
            config.onReport.call(ErrorReporter, config.processStack(err), REPORT_TYPE.VUE_ROUTER)
        })
    }

    // handle errors for axios
    if (config.axios) {
        // Add a request interceptor
        config.axios.interceptors.request.use(config => config, function (err) {
            console.error(err)
            config.onReport.call(ErrorReporter, config.processStack(err), REPORT_TYPE.AXIOS)
            return Promise.reject(err)
        })

        // Add a response interceptor
        config.axios.interceptors.response.use(resp => resp, function (err) {
            console.error(err)
            config.onReport.call(ErrorReporter, config.processStack(err), REPORT_TYPE.AXIOS)
            return Promise.reject(err)
        })
    }
}

function makeReport (err, reportType) {
    let error = err
    if (isOBJByType(err, 'String')) {
        error = new Error(err)
    }
    config.onReport.call(ErrorReporter, config.processStack(error), reportType || REPORT_TYPE.MANUAL)
}

function setConfig (settings) {
    Object.assign(config, settings)
    tryRuntimeReport()
    tryResourceReport()
    tryFrameWorksReport()
}

const REPORT_TYPE = {
    RUNTIME: 'runtime',
    RESOURCE: 'resource',
    VUE: 'vue',
    VUE_ROUTER: 'vue-router',
    MANUAL: 'manual',
    AXIOS: 'axios'
}

let noop = function () {
}
let config = {
    vConsoleSrc: '//cdn.bootcss.com/vConsole/3.3.4/vconsole.min.js',
    maximumStackLines: 20,
    resource: true,
    vue: null, // can be set to `Vue` class from outside
    vueRouter: null,
    axios: null,
    processStack: processStackMsg,
    onReport: noop,
    onResourceLoadError: noop
}

let vConsole = null // VConsole instance
let logCache = []
let cacheEnabled = true

let ErrorReporter = {
    setConfig,
    enableVConsole,
    loadScript,
    getSystemInfo,
    getCookie,
    makeReport
}

addProxyToConsole()
export { ErrorReporter as default }
