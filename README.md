[![npm](https://img.shields.io/npm/dm/breif-error-reporter.svg)](https://www.npmjs.com/package/breif-error-reporter)
[![npm](https://img.shields.io/npm/v/breif-error-reporter.svg)](https://www.npmjs.com/package/breif-error-reporter)
[![npm](https://img.shields.io/npm/l/breif-error-reporter.svg)](https://www.npmjs.com/package/breif-error-reporter)


# error-reporter
利用window.onerror完成脚本错误收集，方便进行上报，以便排查未知的客户端问题。 参考自AlloyLever，在它的基础上有简化和调整使用方式。错误上报服务也可以使用商业方案：Sentry和Bugsnag。

这个库是基于[AlloyLever](https://github.com/AlloyTeam/AlloyLever)改的，实现思路和核心代码，都是它那边复制过来的。为什么不直接用它，而是再写一个？因为碰到了不一样的使用方式，而且它的一些逻辑，并不是每个项目都需要的，所以这个项目只保留了AlloyLever最核心的功能。

这个库提供两项服务能力：
* 动态激活vConsole
* 收集客户端脚本运行错误

## 使用方式
先介绍下error-reporter的使用方式。

安装：
```
npm install breif-error-reporter --save
```

使用：
```js
import ErrorReporter from 'breif-error-reporter'

/**
 * setConfig
 *  onReport {Function} 收集到错误之后的回调函数，在此进行错误上报
 *  maximumStackLines {Number|default:20} 最多收集多少行错误堆栈信息
 *  vConsoleSrc {String} 动态激活vConsole时，要提供的vConsole的脚本文件地址，默认值使用的是Bootcss提供的cdn地址
 */
// 错误上报
ErrorReporter.setConfig({
    onReport (message) {
        // message是可以进行上报的包含错误信息的字符串
    }
})


// 激活vConsole
let show = false
// 调用enableVConsole动态加载vConsole并实例化，如果show为true则在实例化完成后立即展示vConsole
ErrorReporter.enableVConsole(show)
```

如果你想在某个url参数下自动唤起vConsole，可以采用以下类似的做法：
```js
if(window.location.href.indexOf('vconsole') > -1) {
    ErrorReporter.enableVConsole()
}
```
当生产环境有用户反馈问题，不好排查原因时，可将带有`vconsole`参数的链接发给用户，让用户协助截图或录屏的方式，帮忙反馈vConsole收集的日志。

这个库并没有url参数唤起的方式，自动加入到库的实现里面去，只提供了动态唤起vConsole的方法，每个项目怎么用，由项目自己决定。


## VS. AlloyLever
* 本库不提供url参数唤起vConsole，以及`entry`机关唤起vConsole，只提供动态唤起vConsole的方法，每个项目可自行决定如何唤起。
* 本库不默认提供上报的逻辑，由每个项目自己通过回调函数决定如何上报。 AlloyLever内部是通过`new Image().src`的方式来进行上报的，我个人更喜欢用ajax来处理，绝对会比`new Image().src`灵活。
